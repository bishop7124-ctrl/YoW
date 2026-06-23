import { describe, expect, it } from 'vitest'
import { normalizeFactionLogo } from './logoData'

describe('normalizeFactionLogo', () => {
  it('keeps legacy shape arrays compatible with the builder', () => {
    const shapes = [{ id: 'one', type: 'circle' }]

    expect(normalizeFactionLogo(shapes)).toMatchObject({ source: 'builder', image: '', shapes })
  })

  it('preserves an uploaded image as the active logo source', () => {
    const image = 'data:image/webp;base64,logo'

    expect(normalizeFactionLogo({ source: 'image', image, shapes: [] })).toMatchObject({
      source: 'image',
      image,
      shapes: [],
    })
  })

  it('falls back to the builder when an image source has no image', () => {
    expect(normalizeFactionLogo({ source: 'image', image: '', shapes: [] }).source).toBe('builder')
  })
})
