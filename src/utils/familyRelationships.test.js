import { describe, expect, it } from 'vitest'
import {
  deriveFamilyRelationships,
  familyRelationshipMapEdges,
  getFamilyLinks,
  groupFamilyRelationships,
  validateFamilyLink,
} from './familyRelationships'

const c = (id, name, extra = {}) => ({ id, novelId: 'n1', name, ...extra })
const labelsFor = (characters, id, toId) => deriveFamilyRelationships(characters, id, { showHidden: true })
  .filter(relationship => relationship.toCharacterId === toId)
  .map(relationship => relationship.label)

describe('family relationship inference', () => {
  it('normalizes legacy parent and spouse fields into direct family links', () => {
    const characters = [
      c('parent', 'Noora'),
      c('child', 'Cara', { parentIds: ['parent'], spouseIds: ['partner'] }),
      c('partner', 'Tavin', { spouseIds: ['child'] }),
    ]

    const links = getFamilyLinks(characters)
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceCharacterId: 'parent', targetCharacterId: 'child', kind: 'parent_child' }),
      expect.objectContaining({ kind: 'partner' }),
    ]))
  })

  it('derives grandparents and grandchildren', () => {
    const characters = [
      c('isolde', 'Isolde'),
      c('noora', 'Noora', { parentIds: ['isolde'] }),
      c('cara', 'Cara', { parentIds: ['noora'] }),
    ]

    expect(labelsFor(characters, 'cara', 'isolde')).toContain('Grandparent')
    expect(labelsFor(characters, 'isolde', 'cara')).toContain('Grandchild')
  })

  it('derives parent siblings and sibling children', () => {
    const characters = [
      c('tavin', 'Tavin'),
      c('ponticas', 'Ponticas', { familyLinks: [{ sourceCharacterId: 'ponticas', targetCharacterId: 'tavin', kind: 'sibling', type: 'biological', status: 'active' }] }),
      c('cara', 'Cara', { parentIds: ['tavin'] }),
    ]

    expect(labelsFor(characters, 'cara', 'ponticas')).toContain("Parent's sibling")
    expect(labelsFor(characters, 'ponticas', 'cara')).toContain("Sibling's child")
  })

  it('derives first cousins', () => {
    const characters = [
      c('tavin', 'Tavin'),
      c('ponticas', 'Ponticas', { familyLinks: [{ sourceCharacterId: 'ponticas', targetCharacterId: 'tavin', kind: 'sibling', type: 'biological', status: 'active' }] }),
      c('cara', 'Cara', { parentIds: ['tavin'] }),
      c('elian', 'Elian', { parentIds: ['ponticas'] }),
    ]

    expect(labelsFor(characters, 'cara', 'elian')).toContain('First cousin')
  })

  it('distinguishes half-siblings from siblings when one biological parent is shared', () => {
    const characters = [
      c('tavin', 'Tavin'),
      c('noora', 'Noora'),
      c('mira', 'Mira'),
      c('cara', 'Cara', { parentIds: ['tavin', 'noora'] }),
      c('elian', 'Elian', { parentIds: ['tavin', 'mira'] }),
    ]

    expect(labelsFor(characters, 'cara', 'elian')).toContain('Half-sibling')
  })

  it('derives step-siblings through parent partnerships', () => {
    const characters = [
      c('tavin', 'Tavin', { spouseIds: ['mira'] }),
      c('mira', 'Mira', { spouseIds: ['tavin'] }),
      c('cara', 'Cara', { parentIds: ['tavin'] }),
      c('elian', 'Elian', { parentIds: ['mira'] }),
    ]

    expect(labelsFor(characters, 'cara', 'elian')).toContain('Step-sibling')
  })

  it('preserves adoptive and secret relationship filters', () => {
    const characters = [
      c('tavin', 'Tavin', {
        familyLinks: [
          { sourceCharacterId: 'tavin', targetCharacterId: 'cara', kind: 'parent_child', direction: 'source_is_parent', type: 'adoptive', status: 'secret', knownPublicly: false },
        ],
      }),
      c('cara', 'Cara'),
    ]

    expect(labelsFor(characters, 'cara', 'tavin')).toContain('Adoptive Parent')
    expect(deriveFamilyRelationships(characters, 'cara', { showHidden: false })).toHaveLength(0)
  })

  it('groups relationship summaries for character panels', () => {
    const characters = [
      c('parent', 'Parent'),
      c('child', 'Child', { parentIds: ['parent'] }),
      c('sibling', 'Sibling', { parentIds: ['parent'] }),
    ]

    const grouped = groupFamilyRelationships(characters, 'child', { showHidden: true })
    expect(grouped.parents).toHaveLength(1)
    expect(grouped.siblings).toHaveLength(1)
  })

  it('exports direct family facts as relationship-map edges', () => {
    const characters = [
      c('parent', 'Parent'),
      c('child', 'Child', { parentIds: ['parent'] }),
    ]

    expect(familyRelationshipMapEdges(characters, 'child')).toEqual([
      expect.objectContaining({ targetId: 'parent', type: 'relative', family: true, label: 'Parent' }),
    ])
  })

  it('warns before creating obvious contradictions', () => {
    const characters = [
      c('parent', 'Parent'),
      c('child', 'Child', { parentIds: ['parent'] }),
    ]

    expect(validateFamilyLink(characters, {
      sourceCharacterId: 'parent',
      targetCharacterId: 'child',
      kind: 'sibling',
      type: 'biological',
      status: 'active',
    })).toContain("One character is already marked as the other character's parent.")
  })
})
