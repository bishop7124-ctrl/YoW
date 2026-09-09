import { describe, expect, it } from 'vitest'
import { buildFamilyLookups } from './familyRelationships'
import { getFamilyGenerations } from './familyTreeLayout'

const rank = characters => getFamilyGenerations(characters, buildFamilyLookups(characters))

describe('family tree generation layout', () => {
  it('aligns partners before ranking their children', () => {
    const generations = rank([
      { id: 'grand' }, { id: 'parent', parentIds: ['grand'], spouseIds: ['partner'] },
      { id: 'partner' }, { id: 'child', parentIds: ['partner'] }, { id: 'standalone' },
    ])
    expect(Object.fromEntries(generations)).toEqual({ grand: 0, parent: 1, partner: 1, child: 2, standalone: 0 })
  })

  it('places children below the deepest parent and ignores absent parents', () => {
    expect(Object.fromEntries(rank([
      { id: 'grand' }, { id: 'parent', parentIds: ['grand'] },
      { id: 'child', parentIds: ['grand', 'parent', 'missing'] },
    ]))).toEqual({ grand: 0, parent: 1, child: 2 })
  })

  it.each([false, true])('terminates on a family cycle (reachable from root: %s)', (rooted) => {
    const characters = [
      ...(rooted ? [{ id: 'root' }] : []),
      { id: 'a', parentIds: rooted ? ['c', 'root'] : ['c'] },
      { id: 'b', parentIds: ['a'] }, { id: 'c', parentIds: ['b'] },
      { id: 'descendant', parentIds: ['c'] },
    ]
    const generations = rank(characters)
    expect(generations.size).toBe(characters.length)
    expect([...generations.values()].every(value => value >= 0 && value < characters.length)).toBe(true)
    expect(rank(characters)).toEqual(generations)
  })

  it('handles a long lineage without recursive stack growth', () => {
    const characters = Array.from({ length: 10000 }, (_, index) => ({ id: `c${index}`, parentIds: index ? [`c${index - 1}`] : [] }))
    expect(rank(characters).get('c9999')).toBe(9999)
  })
})
