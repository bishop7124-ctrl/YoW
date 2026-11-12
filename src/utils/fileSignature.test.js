// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sniffImageType, verifyImageFile } from './fileSignature'

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const jpg = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]
const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0]
const webp = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]
const ALL = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

describe('sniffImageType', () => {
  it('recognises the four image types from their bytes', () => {
    expect(sniffImageType(new Uint8Array(png))).toBe('image/png')
    expect(sniffImageType(new Uint8Array(jpg))).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array(gif))).toBe('image/gif')
    expect(sniffImageType(new Uint8Array(webp))).toBe('image/webp')
    expect(sniffImageType(new Uint8Array(png).buffer)).toBe('image/png')
  })
  it('returns null for anything else, including scripts, SVG, PDF and empty input', () => {
    const text = s => new TextEncoder().encode(s)
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImageType(text('<script>alert(1)</script>'))).toBeNull()
    expect(sniffImageType(text('%PDF-1.7 ....'))).toBeNull()
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull() // WAV, not WebP
    expect(sniffImageType(new Uint8Array(0))).toBeNull()
    expect(sniffImageType(undefined)).toBeNull()
  })
})

describe('verifyImageFile', () => {
  it('accepts a real image and reports the type found in the bytes', async () => {
    const file = new File([new Uint8Array(png)], 'a.jpg', { type: 'image/jpeg' }) // wrong name and declared type
    expect(await verifyImageFile(file, ALL)).toEqual({ ok: true, type: 'image/png' })
  })
  it('refuses a mislabelled file and a real image of a type the field does not allow', async () => {
    expect(await verifyImageFile(new File(['<script>x</script>'], 'a.png', { type: 'image/png' }), ALL)).toEqual({ ok: false, reason: 'not-allowed' })
    expect(await verifyImageFile(new File([new Uint8Array(gif)], 'a.gif', { type: 'image/gif' }), ['image/png'])).toEqual({ ok: false, reason: 'not-allowed' })
  })
})
