import { describe, expect, it } from 'vitest'
import { createForceState, forceBounds, reheatForce, settleForce, stepForce } from './relationshipForce.js'

const cast = n => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }))
const hub = n => cast(n).slice(1).map(node => ({ sourceId: 'c0', targetId: node.id }))
const dist = (s, a, b) => Math.hypot(s.x[s.index.get(a)] - s.x[s.index.get(b)], s.y[s.index.get(a)] - s.y[s.index.get(b)])

describe('relationship force layout', () => {
  it('is deterministic', () => {
    const run = () => settleForce(createForceState(cast(12), hub(12)))
    const a = run(); const b = run()
    expect([...a.x]).toEqual([...b.x])
    expect([...a.y]).toEqual([...b.y])
  })

  it('keeps every character apart, including a 110-character cast', () => {
    for (const n of [2, 10, 110]) {
      const s = settleForce(createForceState(cast(n), hub(n)))
      let min = Infinity
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) min = Math.min(min, dist(s, `c${i}`, `c${j}`))
      expect(min).toBeGreaterThan(60)
      expect([...s.x, ...s.y].every(Number.isFinite)).toBe(true)
    }
  })

  it('pulls connected characters closer than unconnected ones', () => {
    const nodes = cast(8)
    const s = settleForce(createForceState(nodes, [{ sourceId: 'c0', targetId: 'c1' }, { sourceId: 'c2', targetId: 'c3' }]))
    expect(dist(s, 'c0', 'c1')).toBeLessThan(dist(s, 'c0', 'c5'))
    expect(dist(s, 'c2', 'c3')).toBeLessThan(dist(s, 'c2', 'c6'))
  })

  it('keeps a pinned (dragged) node under the pointer while neighbours follow it', () => {
    const s = settleForce(createForceState(cast(5), hub(5)))
    const hubIndex = s.index.get('c0')
    const before = dist(s, 'c0', 'c1')
    s.pinned.set(hubIndex, { x: 900, y: -700 })
    reheatForce(s, 0.6)
    for (let i = 0; i < 160; i += 1) stepForce(s)
    expect(s.x[hubIndex]).toBe(900)
    expect(s.y[hubIndex]).toBe(-700)
    expect(Math.abs(s.x[s.index.get('c1')] - 900) + Math.abs(s.y[s.index.get('c1')] + 700)).toBeLessThan(before * 3)
  })

  it('keeps known positions when the cast changes and places a newcomer next to its link', () => {
    const first = settleForce(createForceState(cast(4), hub(4)))
    const seeds = new Map(first.ids.map((id, i) => [id, { x: first.x[i], y: first.y[i] }]))
    const next = createForceState([...cast(4), { id: 'new' }], [...hub(4), { sourceId: 'c2', targetId: 'new' }], seeds)
    expect(next.x[0]).toBe(first.x[0])
    expect(Math.hypot(next.x[4] - first.x[2], next.y[4] - first.y[2])).toBeLessThan(200)
  })

  it('reports bounds and copes with an empty cast', () => {
    const s = settleForce(createForceState(cast(6), hub(6)))
    const b = forceBounds(s)
    expect(b.width).toBeGreaterThan(200)
    expect(forceBounds(createForceState([], [])).width).toBeGreaterThan(0)
  })
})
