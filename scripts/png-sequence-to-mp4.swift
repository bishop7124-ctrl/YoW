import AVFoundation
import AppKit
import CoreGraphics
import Foundation

struct EncodeError: Error, CustomStringConvertible {
  let description: String
}

func fail(_ message: String) throws -> Never {
  throw EncodeError(description: message)
}

func pixelBuffer(from image: NSImage, width: Int, height: Int, pool: CVPixelBufferPool) throws -> CVPixelBuffer {
  var maybeBuffer: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, pool, &maybeBuffer)
  guard let buffer = maybeBuffer else { try fail("Could not create pixel buffer") }

  CVPixelBufferLockBaseAddress(buffer, [])
  defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

  guard
    let baseAddress = CVPixelBufferGetBaseAddress(buffer),
    let context = CGContext(
      data: baseAddress,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    )
  else {
    try fail("Could not create drawing context")
  }

  context.setFillColor(NSColor.black.cgColor)
  context.fill(CGRect(x: 0, y: 0, width: width, height: height))

  guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    try fail("Could not decode image frame")
  }

  context.interpolationQuality = .high
  context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
  return buffer
}

func encode(inputDir: URL, output: URL, fps: Int32) throws {
  let frameUrls = try FileManager.default.contentsOfDirectory(
    at: inputDir,
    includingPropertiesForKeys: nil,
    options: [.skipsHiddenFiles]
  )
    .filter { $0.pathExtension.lowercased() == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

  guard !frameUrls.isEmpty else { try fail("No PNG frames found in \(inputDir.path)") }

  guard let firstImage = NSImage(contentsOf: frameUrls[0]) else {
    try fail("Could not open first frame")
  }

  let width = Int(firstImage.size.width)
  let height = Int(firstImage.size.height)
  try? FileManager.default.removeItem(at: output)

  let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
  let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: 5_000_000,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
  ]
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
  input.expectsMediaDataInRealTime = false

  let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
    ]
  )

  guard writer.canAdd(input) else { try fail("Cannot add video input") }
  writer.add(input)
  guard writer.startWriting() else { try fail(writer.error?.localizedDescription ?? "Could not start writer") }
  writer.startSession(atSourceTime: .zero)

  let queue = DispatchQueue(label: "yow.mp4.encoder")
  let group = DispatchGroup()
  var frameIndex: Int64 = 0
  var encodeError: Error?

  group.enter()
  input.requestMediaDataWhenReady(on: queue) {
    while input.isReadyForMoreMediaData && frameIndex < Int64(frameUrls.count) {
      let url = frameUrls[Int(frameIndex)]
      guard let image = NSImage(contentsOf: url) else {
        encodeError = EncodeError(description: "Could not open frame \(url.lastPathComponent)")
        input.markAsFinished()
        group.leave()
        return
      }

      do {
        guard let pool = adaptor.pixelBufferPool else { try fail("Missing pixel buffer pool") }
        let buffer = try pixelBuffer(from: image, width: width, height: height, pool: pool)
        let time = CMTime(value: frameIndex, timescale: fps)
        if !adaptor.append(buffer, withPresentationTime: time) {
          try fail(writer.error?.localizedDescription ?? "Could not append frame \(url.lastPathComponent)")
        }
      } catch {
        encodeError = error
        input.markAsFinished()
        group.leave()
        return
      }

      frameIndex += 1
    }

    if frameIndex >= Int64(frameUrls.count) {
      input.markAsFinished()
      group.leave()
    }
  }

  group.wait()
  if let encodeError { throw encodeError }

  let finishGroup = DispatchGroup()
  finishGroup.enter()
  writer.finishWriting {
    finishGroup.leave()
  }
  finishGroup.wait()

  if writer.status != .completed {
    try fail(writer.error?.localizedDescription ?? "Writer failed")
  }
}

do {
  let args = CommandLine.arguments
  guard args.count >= 4 else {
    try fail("Usage: swift png-sequence-to-mp4.swift <frames-dir> <output.mp4> <fps>")
  }
  guard let fps = Int32(args[3]), fps > 0 else {
    try fail("FPS must be a positive integer")
  }
  try encode(inputDir: URL(fileURLWithPath: args[1]), output: URL(fileURLWithPath: args[2]), fps: fps)
} catch {
  fputs("\(error)\n", stderr)
  exit(1)
}
