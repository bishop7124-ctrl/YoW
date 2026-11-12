// Real file-type check from a file's own first bytes (its "magic number"), not from the name or the type the
// browser or a caller declares. A file called photo.png whose bytes are not a PNG is refused.
//
// This is a type check only. It is NOT a malware scan: YOW has no antivirus step (owner decision 2026-11-12,
// ROADMAP Security row "Upload scanning and validation"). It exists so mislabelled files never get stored as images.

const startsWith = (bytes, signature, offset = 0) => signature.every((value, index) => bytes[offset + index] === value)

// Returns 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null for the given bytes (first 12 are enough).
export function sniffImageType(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0)
  if (bytes.length < 4) return null
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) return 'image/gif'
  if (bytes.length >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
  return null
}

const readHead = file => {
  const head = file.slice(0, 16)
  if (typeof head.arrayBuffer === 'function') return head.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(head)
  })
}

// Checks a chosen file against the types a field allows. Resolves to { ok: true, type } with the type found in the
// bytes (use it, not file.type), or { ok: false, reason: 'unreadable' | 'not-allowed' }.
export async function verifyImageFile(file, allowedTypes) {
  let type
  try { type = sniffImageType(await readHead(file)) } catch { return { ok: false, reason: 'unreadable' } }
  if (!type || !allowedTypes.includes(type)) return { ok: false, reason: 'not-allowed' }
  return { ok: true, type }
}
