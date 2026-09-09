import { describe, expect, it } from 'vitest'
import { organicInkPath } from './atlasOrganicInk.js'
import { INK_ARTWORK } from './atlasInkArtwork.js'

describe('organic ink contours', () => {
  it('keeps equivalent relative/absolute contours aligned across layers', () => {
    expect(organicInkPath('M0 0h20v20h-20z', 2)).toBe(organicInkPath('M0 0L20 0L20 20L0 20Z', 2))
  })
  it('preserves quadratic shorthand and separate pen lifts', () => {
    expect(organicInkPath('M0 0q5 10 10 0t10 0m5 5l4 0')).toBe(organicInkPath('M0 0Q5 10 10 0Q15-10 20 0M25 5L29 5'))
  })
  it('renders all artwork as stable finite curves with filled ink intact', () => {
    expect(Object.keys(INK_ARTWORK)).toHaveLength(30)
    for (const layers of Object.values(INK_ARTWORK)) {
      expect(layers.some(layer => layer.fill === 'ink')).toBe(true)
      for (const layer of layers) {
        expect(layer.d).not.toMatch(/NaN|undefined|Infinity/)
        expect(layer.d).toContain('C')
      }
    }
    expect(organicInkPath('M0 0L30 0', 1)).toBe(organicInkPath('M0 0L30 0', 1))
  })
})
