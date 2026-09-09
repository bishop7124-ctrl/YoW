import { describe, expect, it } from 'vitest'
import { MAP_TYPE_TOOLS, TOOLS } from './mapConstants.js'
import { getObjectBounds, isMapObjectExportable } from './mapUtils.js'

describe('map builder invariants', () => {
  it('keeps the implemented Note tool available on world and region maps only', () => {
    expect(TOOLS.some(tool => tool.id === 'note')).toBe(true)
    expect(MAP_TYPE_TOOLS.world).toContain('note')
    expect(MAP_TYPE_TOOLS.region).toContain('note')
    expect(MAP_TYPE_TOOLS.local).not.toContain('note')
    expect(MAP_TYPE_TOOLS.interior).not.toContain('note')
  })

  it('calculates geometry bounds in one pass', () => {
    expect(getObjectBounds({
      geometry: {
        type: 'path',
        points: [
          { x: 12, y: -4 },
          { x: -8, y: 20 },
          { x: 5, y: 7 },
        ],
      },
    })).toEqual({ x: -8, y: -4, width: 20, height: 24 })
  })

  it('supports dense freehand paths without argument-spread limits', () => {
    const points = Array.from({ length: 200_000 }, (_, index) => ({
      x: index - 100_000,
      y: 100_000 - index,
    }))

    expect(getObjectBounds({ geometry: { type: 'path', points } })).toEqual({
      x: -100_000,
      y: -99_999,
      width: 199_999,
      height: 199_999,
    })
  })

  it('keeps private and GM-only note markers out of PNG exports', () => {
    expect(isMapObjectExportable({ type: 'shape', properties: {} })).toBe(true)
    expect(isMapObjectExportable({ type: 'note', properties: {} })).toBe(false)
    expect(isMapObjectExportable({ type: 'note', properties: { visibility: 'private' } })).toBe(false)
    expect(isMapObjectExportable({ type: 'note', properties: { visibility: 'public' } })).toBe(true)
    expect(isMapObjectExportable({ type: 'note', properties: { visibility: 'public', gmOnly: true } })).toBe(false)
  })
})
