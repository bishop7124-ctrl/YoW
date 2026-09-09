import { describe, expect, it } from 'vitest'
import {
  buildFamilyLookups,
  deriveFamilyRelationships,
  familyRelationshipMapEdges,
  getDirectFamilyRelationshipRows,
  getFamilyLinks,
  getFamilyScopeCharacterIds,
  groupFamilyRelationships,
  isDuplicateFamilyLink,
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

describe('family fact normalization', () => {
  const fact = { id: 'fact', sourceCharacterId: 'parent', targetCharacterId: 'child', kind: 'parent_child', type: 'biological', status: 'active' }

  it('deduplicates reciprocal legacy and explicit facts with stable IDs', () => {
    const characters = [
      c('parent', 'Parent', { childIds: ['child'], familyLinks: [{ ...fact, id: undefined }] }),
      c('child', 'Child', { parentIds: ['parent'], familyLinks: [{ ...fact, id: 'reversed', sourceCharacterId: 'child', targetCharacterId: 'parent', direction: 'target_is_parent' }] }),
    ]
    expect(getFamilyLinks(characters)).toHaveLength(1)
    expect(getFamilyLinks(characters)).toEqual(getFamilyLinks(characters))
    expect(isDuplicateFamilyLink(characters, fact)).toBe(true)
    expect(buildFamilyLookups(characters).parentsByChild.get('child')).toHaveLength(1)
  })

  it('does not let untyped legacy arrays expose or contradict structured facts', () => {
    const characters = [
      c('parent', 'Parent', { childIds: ['child'], familyLinks: [{ ...fact, type: 'adoptive', status: 'secret' }] }),
      c('child', 'Child', { parentIds: ['parent'] }),
    ]
    expect(getFamilyLinks(characters)).toHaveLength(1)
    expect(getDirectFamilyRelationshipRows(characters)).toEqual([])
    expect(getDirectFamilyRelationshipRows(characters, { showHidden: true })).toEqual([
      expect.objectContaining({ sourceName: 'Parent', sourceLabel: 'Adoptive Parent', targetName: 'Child', targetLabel: 'Adoptive Child' }),
    ])
  })

  it('keeps the restrictive visibility when same-ID records are repeated', () => {
    const characters = [c('parent', 'Parent', { familyLinks: [fact, { ...fact, knownPublicly: false }] }), c('child', 'Child')]
    expect(getFamilyLinks(characters)).toHaveLength(1)
    expect(getDirectFamilyRelationshipRows(characters)).toEqual([])
  })

  it('detects a conflicting type even when endpoints are reversed', () => {
    const characters = [c('parent', 'Parent', { familyLinks: [fact] }), c('child', 'Child')]
    expect(validateFamilyLink(characters, { ...fact, id: 'new', sourceCharacterId: 'child', targetCharacterId: 'parent', direction: 'target_is_parent', type: 'adoptive' }))
      .toContain('A different relationship type already exists for this pair; mark it disputed or allow an unusual structure.')
  })

  it('ignores self-links and missing endpoints without mutating saved data', () => {
    const characters = [c('parent', 'Parent', { childIds: ['parent', 'missing'], familyLinks: [{ ...fact, kind: 'invalid' }] })]
    const before = JSON.stringify(characters)
    expect(getFamilyLinks(characters)).toEqual([])
    expect(JSON.stringify(characters)).toBe(before)
  })

  it('preserves distinct facts with colliding imported IDs and delimiter-like character IDs', () => {
    const characters = [
      c('a-b', 'One', { childIds: ['c'], familyLinks: [
        { id: 'reused', sourceCharacterId: 'a-b', targetCharacterId: 'c', kind: 'guardian' },
        { id: 'reused', sourceCharacterId: 'a-b', targetCharacterId: 'b-c', kind: 'sibling' },
      ] }),
      c('a', 'Two', { childIds: ['b-c'] }), c('c', 'Three'), c('b-c', 'Four'),
    ]
    const links = getFamilyLinks(characters)
    expect(links).toHaveLength(4)
    expect(new Set(links.map(link => link.id)).size).toBe(4)
    expect(getFamilyLinks(characters)).toEqual(links)
  })
})

describe('family scope and summaries', () => {
  const characters = [
    c('great', 'Great'),
    c('grand', 'Grand', { parentIds: ['great'], deathDate: '100' }),
    c('parent', 'Parent', { parentIds: ['grand'] }),
    c('aunt', 'Aunt', { parentIds: ['grand'] }),
    c('cousin', 'Cousin', { parentIds: ['aunt'] }),
    c('focus', 'Focus', { parentIds: ['parent'], spouseIds: ['partner'] }),
    c('partner', 'Partner'),
    c('sibling', 'Sibling', { parentIds: ['parent'] }),
    c('nephew', 'Nephew', { parentIds: ['sibling'] }),
    c('child', 'Child', { parentIds: ['focus'] }),
    c('grandchild', 'Grandchild', { parentIds: ['child'] }),
    c('greatchild', 'Greatchild', { parentIds: ['grandchild'] }),
    c('distant', 'Distant', { parentIds: ['greatchild'] }),
    c('standalone', 'Standalone'),
  ]
  const lookup = buildFamilyLookups(characters)

  it('keeps direct lineage separate from sibling and cousin branches', () => {
    expect([...getFamilyScopeCharacterIds(lookup, 'focus', 'direct')].sort())
      .toEqual(['focus', 'parent', 'grand', 'great', 'child', 'grandchild', 'greatchild', 'distant'].sort())
    expect(deriveFamilyRelationships(characters, 'focus', { scope: 'direct' }).map(row => row.toCharacterId).sort())
      .toEqual(['parent', 'grand', 'great', 'child', 'grandchild', 'greatchild', 'distant'].sort())
  })

  it('limits immediate relatives, expands extended family, and reaches the full dynasty', () => {
    expect([...getFamilyScopeCharacterIds(lookup, 'focus', 'immediate')].sort())
      .toEqual(['focus', 'parent', 'sibling', 'partner', 'child'].sort())
    const extended = getFamilyScopeCharacterIds(lookup, 'focus', 'extended')
    expect(extended.has('cousin')).toBe(true)
    expect(extended.has('distant')).toBe(false)
    const full = getFamilyScopeCharacterIds(lookup, 'focus', 'full')
    expect(full.has('distant')).toBe(true)
    expect(full.has('standalone')).toBe(false)
    expect(getFamilyScopeCharacterIds(lookup, '', 'full').size).toBe(0)
  })

  it('omits deceased targets without cutting off their living descendants', () => {
    const rows = deriveFamilyRelationships(characters, 'focus', { includeDeceased: false })
    expect(rows.some(row => row.toCharacterId === 'grand')).toBe(false)
    expect(rows.some(row => row.toCharacterId === 'great')).toBe(true)
  })

  it('includes parent siblings and sibling children in the extended summary', () => {
    const grouped = groupFamilyRelationships(characters, 'focus')
    expect(grouped.extended.map(row => row.toCharacterId)).toEqual(expect.arrayContaining(['aunt', 'nephew', 'cousin', 'grand']))
    expect(grouped.extended.some(row => row.toCharacterId === 'sibling')).toBe(false)
  })

  it('marks inferred siblings as derived and keeps real source facts for extended metadata', () => {
    const rows = deriveFamilyRelationships(characters, 'focus')
    const sibling = rows.find(row => row.toCharacterId === 'sibling')
    expect(sibling).toMatchObject({ label: 'Sibling', confidence: 'derived' })
    for (const row of rows) {
      expect(row.sourceLinkIds.every(id => lookup.linksById.has(id))).toBe(true)
    }
  })

  it('honors the step-family filter for inferred as well as explicit links', () => {
    const stepFamily = [
      c('parent', 'Parent', { spouseIds: ['stepParent'] }), c('stepParent', 'Step parent'),
      c('focus', 'Focus', { parentIds: ['parent'] }), c('stepSibling', 'Step sibling', { parentIds: ['stepParent'] }),
    ]
    expect(groupFamilyRelationships(stepFamily, 'focus').extended.map(row => row.label)).toContain('Step-sibling')
    expect(deriveFamilyRelationships(stepFamily, 'focus', { includeStep: false }).map(row => row.label)).not.toContain('Step-sibling')
  })
})
