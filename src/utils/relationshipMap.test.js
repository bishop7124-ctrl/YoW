import { describe, expect, it } from 'vitest'
import { buildCharacterAliases, buildRelationshipIndex, getSocialRelationshipRows, RELATIONSHIP_MAP_DENSE_NODE_SIZE, RELATIONSHIP_MAP_FOCUS_SIZE, RELATIONSHIP_MAP_NODE_SIZE, relationshipMapLayout } from './relationshipMap.js'
import { getRelType } from '../constants/relationshipTypes.js'

describe('relationship index', () => {
  it('preserves types, both directions and family facts on one node per person', () => {
    const input = [
      { id: 'a', name: 'Ada', relationships: [{ targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'ally' }] },
      { id: 'b', name: 'Ben', parentIds: ['a'], relationships: [{ targetId: 'a', type: 'enemy' }] },
    ]
    const before = structuredClone(input)
    const index = buildRelationshipIndex(input)
    const connections = index.connectionsFor('a')
    expect(connections).toHaveLength(1)
    expect(connections[0].facts.map(fact => [fact.label, fact.direction])).toEqual([
      ['Ally', 'outgoing'], ['Child', 'family'], ['Enemy', 'incoming'], ['Friend', 'outgoing'],
    ])
    expect(index.connectionsFor('a')).toBe(connections)
    expect(index.connectionsFor('b')[0].labels).toContain('Parent')
    expect(input).toEqual(before)
  })

  it('accepts object-shaped legacy records, numeric names and custom types without calling them spouses', () => {
    const index = buildRelationshipIndex([null, { id: 'a', name: 0, relationships: { one: { targetId: 'b', type: 'mentor' }, two: null, three: { targetId: 'missing', type: 'friend' }, four: { targetId: 'a', type: 'enemy' } } }, { id: 'b', name: 42 }])
    expect(index.socialLinks).toHaveLength(1)
    expect(index.connectionsFor('a')[0].character.name).toBe('42')
    expect(index.connectionsFor('a')[0].labels).toEqual(['mentor'])
    expect(getRelType('mentor')).toEqual({ id: 'mentor', label: 'mentor', color: '#94a3b8' })
    expect(index.connectionsFor('missing')).toEqual([])
  })

  it('resolves old series IDs for social and family links without changing records', () => {
    const original = { id: 'b1', name: 'Ben', syncRootId: 'b1' }
    const prior = { ...original, id: 'b2', syncSourceId: 'b1' }
    const current = { ...original, id: 'b3', syncSourceId: 'b2' }
    const a = { id: 'a', name: 'Ada', parentIds: ['b2'], relationships: [{ targetId: 'b1', type: 'ally' }, { targetId: 'b2', type: 'ally' }] }
    const index = buildRelationshipIndex([a, current], [], [a, original, prior, current])
    expect(index.connectionsFor('a')).toHaveLength(1)
    expect(index.connectionsFor('a')[0].character.id).toBe('b3')
    expect(index.connectionsFor('a')[0].labels).toEqual(['Ally', 'Parent'])
    expect(index.socialLinks).toHaveLength(1)
    expect(a.parentIds).toEqual(['b2'])
    expect(buildRelationshipIndex([a], [], [a, original, prior, current]).connectionsFor('a')).toEqual([])
  })

  it('does not guess continuity from names or ambiguous roots', () => {
    const old = { id: 'old', name: 'Same name' }
    expect(buildCharacterAliases([{ id: 'new', name: 'Same name' }], [old]).get('old')).toBeUndefined()
    const aliases = buildCharacterAliases([{ id: 'a', syncRootId: 'root' }, { id: 'b', syncRootId: 'root' }])
    expect(aliases.get('root')).toBeUndefined()
    expect(aliases.get('a')).toBe('a')
  })

  it('keeps a social connection without exposing a private family fact on the same pair', () => {
    const index = buildRelationshipIndex([
      { id: 'a', name: 'Ada', childIds: ['b'], relationships: [{ targetId: 'b', type: 'friend' }], familyLinks: [{ id: 'secret', sourceCharacterId: 'a', targetCharacterId: 'b', kind: 'parent_child', type: 'adoptive', status: 'secret' }] },
      { id: 'b', name: 'Ben', parentIds: ['a'] },
    ])
    expect(index.connectionsFor('a')[0].labels).toEqual(['Friend'])
    expect(index.connectionsFor('b')[0].labels).toEqual(['Friend'])
  })

  it('exports each directed social fact once and excludes family, self and dangling links', () => {
    const rows = getSocialRelationshipRows([
      { id: 'a', name: 0, relationships: [{ targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'spouse' }, { targetId: 'a', type: 'friend' }, { targetId: 'gone', type: 'enemy' }] },
      { id: 'b', name: 'Ben', relationships: [{ targetId: 'a', type: 'friend' }] },
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map(row => [row.source, row.relationship, row.target])).toEqual([['0', 'Friend', 'Ben'], ['Ben', 'Friend', '0']])
  })
})

describe('bounded relationship layout', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 24])('keeps all %i nodes within the canvas and clear of one another and the focal card', count => {
    const { nodes, dense, size } = relationshipMapLayout(Array.from({ length: count }, (_, id) => ({ id })))
    const nodeSize = dense ? RELATIONSHIP_MAP_DENSE_NODE_SIZE : RELATIONSHIP_MAP_NODE_SIZE
    const lineLengths = nodes.map(node => Math.hypot(node.x - size.centerX, node.y - size.centerY))
    expect(nodes).toHaveLength(count)
    expect(Math.max(...lineLengths) - Math.min(...lineLengths)).toBeLessThan(0.001)
    nodes.forEach((node, i) => {
      expect(node.x - nodeSize.width / 2).toBeGreaterThanOrEqual(0)
      expect(node.x + nodeSize.width / 2).toBeLessThanOrEqual(size.width)
      expect(node.y - nodeSize.height / 2).toBeGreaterThanOrEqual(0)
      expect(node.y + nodeSize.height / 2).toBeLessThanOrEqual(size.height)
      expect(
        Math.abs(node.x - size.centerX) >= (nodeSize.width + RELATIONSHIP_MAP_FOCUS_SIZE.width) / 2
        || Math.abs(node.y - size.centerY) >= (nodeSize.height + RELATIONSHIP_MAP_FOCUS_SIZE.height) / 2,
      ).toBe(true)
      nodes.slice(i + 1).forEach(other => expect(
        Math.abs(node.x - other.x) >= nodeSize.width
        || Math.abs(node.y - other.y) >= nodeSize.height,
      ).toBe(true))
    })
  })

  it('expands very dense canvases instead of hiding connections', () => {
    const connections = Array.from({ length: 101 }, (_, id) => ({ id }))
    const layout = relationshipMapLayout(connections)
    expect(layout.nodes.map(node => node.id)).toEqual(connections.map(node => node.id))
    expect(layout.size.width).toBeGreaterThan(900)
    expect(layout.size.height).toBeGreaterThan(400)
    expect(relationshipMapLayout([]).nodes).toEqual([])
  })
})
