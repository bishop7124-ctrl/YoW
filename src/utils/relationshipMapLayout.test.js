// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearMapLayout, loadMapLayout, saveMapLayout } from './relationshipMapLayout.js'

const state = { ids: ['a', 'b'], x: [1.234, -50], y: [20, 99.99] }

describe('relationship map layout memory', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips positions and view per project', () => {
    saveMapLayout('p1', state, { scale: 0.8, x: 410, y: 195 }, { width: 800, height: 400 })
    const loaded = loadMapLayout('p1')
    expect(loaded.nodes.get('a')).toEqual({ x: 1.2, y: 20 })
    expect(loaded.nodes.get('b')).toEqual({ x: -50, y: 100 })
    // centre of a 800x400 canvas sits at map point ((400-410)/0.8, (200-195)/0.8)
    expect(loaded.view).toEqual({ scale: 0.8, cx: -12.5, cy: 6.3 })
    expect(loadMapLayout('p2')).toBeNull()
  })

  it('stores no view until the user has moved it', () => {
    saveMapLayout('p1', state, null)
    expect(loadMapLayout('p1').view).toBeNull()
  })

  it('keeps the stored view when only positions are saved', () => {
    saveMapLayout('p1', state, { scale: 2, x: 400, y: 200 }, { width: 800, height: 400 })
    saveMapLayout('p1', { ids: ['a'], x: [5], y: [6] }, undefined)
    expect(loadMapLayout('p1').view).toEqual({ scale: 2, cx: 0, cy: 0 })
    expect(loadMapLayout('p1').nodes.get('a')).toEqual({ x: 5, y: 6 })
  })

  it('ignores corrupt or foreign data and can be cleared', () => {
    localStorage.setItem('yow-relationship-map-layout:p1', '{nope')
    expect(loadMapLayout('p1')).toBeNull()
    localStorage.setItem('yow-relationship-map-layout:p1', JSON.stringify({ v: 1, nodes: { a: ['x', 1], b: [3, 4] }, view: { scale: 0, cx: 1, cy: 1 } }))
    const loaded = loadMapLayout('p1')
    expect([...loaded.nodes.keys()]).toEqual(['b'])
    expect(loaded.view).toBeNull()
    clearMapLayout('p1')
    expect(loadMapLayout('p1')).toBeNull()
  })
})
