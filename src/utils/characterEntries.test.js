import { describe, expect, it } from 'vitest'
import { buildCharacterIndex, characterDetailFields, characterReferences, filterCharacters, normalizeCharacter } from './characterEntries'

describe('character entries', () => {
  it('normalizes legacy values without changing source records or resurrecting cleared fields', () => {
    const source = { id: 'c', name: 0, familyGroup: 12, bio: '', description: 'Old bio', titleJob: '', title: 'Old job', keywords: [' Raven ', 'raven', 0, null], deathDate: 0, traits: { strengths: '', custom: 'keep' }, strengths: 'Old strength', relationships: [null, { targetId: 'c', type: 'friend' }, { targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'friend' }, { targetId: 'b', type: 'rival' }], extraAbilities: [null, { name: 0, description: 12 }], imageZoom: '2' }
    const copy = structuredClone(source)
    const result = normalizeCharacter(source)
    expect(result).toMatchObject({ name: '0', familyGroup: '12', bio: '', titleJob: '', keywords: ['Raven', '0'], status: 'dead', imageZoom: 2, traits: { strengths: '', custom: 'keep' }, extraAbilities: [{ name: '0', description: '12' }] })
    expect(result.relationships).toHaveLength(2)
    expect(source).toEqual(copy)
  })

  it('sorts factions by their names, breaks ties by name, and safely searches aliases and numeric fields', () => {
    const index = buildCharacterIndex([
      { id: 'c', name: 'Charlie', role: 'Mage', factionId: 'a', keywords: ['Raven'] },
      { id: 'b', name: 'Bravo', role: 'Mage', factionId: '__none__' },
      { id: 'a', name: 42, factionId: 'missing', familyGroup: 12 },
    ], [{ id: 'a', name: 'Zulu' }, { id: '__none__', name: 'Alpha' }])
    expect(filterCharacters(index, { sortBy: 'faction' }).map(c => c.id)).toEqual(['a', 'b', 'c'])
    expect(filterCharacters(index, { faction: 'none' }).map(c => c.id)).toEqual(['a'])
    expect(filterCharacters(index, { faction: 'id:__none__' }).map(c => c.id)).toEqual(['b'])
    expect(filterCharacters(index, { search: ' raven ' }).map(c => c.id)).toEqual(['c'])
    expect(filterCharacters(index, { search: '42', family: '12' }).map(c => c.id)).toEqual(['a'])
    expect(filterCharacters(index, { sortBy: 'role' }).map(c => c.id)).toEqual(['a', 'b', 'c'])
    expect(filterCharacters(index, { sortBy: 'name-desc' }).map(c => c.id)).toEqual(['c', 'b', 'a'])
    expect(index.entries.map(c => c.id)).toEqual(['c', 'b', 'a'])
  })

  it('uses only typed character links and includes independent History records', () => {
    const sources = { loreEntries: [{ id: 'wrong', loreIds: ['c'], locationIds: ['c'] }, { id: 'l', characterIds: ['c'] }], timeline: [{ id: 'wrong', linkedLocations: ['c'] }, { id: 't', linkedCharacters: ['c'] }], worldHistory: [{ id: 'h', linkedCharacters: ['c'] }] }
    expect(characterReferences('c', sources)).toEqual({ lore: [sources.loreEntries[1]], timeline: [sources.timeline[1]], history: sources.worldHistory })
  })

  it('includes all current dossier fields and calculated age in export data', () => {
    const fields = Object.fromEntries(characterDetailFields({ birthDate: 'Year -20', deathDate: 0, traits: { disabilities: 'Limited sight', qualifications: 'Scholar', talents: 'Music' }, background: { language: 'Elvish' }, extraAbilities: [{ name: 'Flight', description: 'Wings' }] }, 100))
    expect(fields).toMatchObject({ Age: '20 at death', Death: '0', Disabilities: 'Limited sight', Qualifications: 'Scholar', Talents: 'Music', 'Primary Language': 'Elvish', 'Ability: Flight': 'Wings' })
  })
})
