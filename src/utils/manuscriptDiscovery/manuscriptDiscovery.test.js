import { describe, expect, it, vi } from 'vitest'
import { buildManuscriptDocument, discoverManuscript, normalizeDiscoveryName } from './index.js'
import { annotateExistingMatches, createDiscoveryProject, importDiscoveries } from './importer.js'

const manuscript = [{
  title: 'Act I',
  chapters: [
    { title: 'Chapter 1 — Cara', scenes: [{ title: 'Arrival', content: `Cara Ardryn entered Moonfall Castle. "Wait," Cara said. Ria, Cara's older sister, followed her into Moonfall Castle. Twenty years ago, the Aurethi Grounding destroyed the old city. The Azure Order guarded Aurethi magic.` }] },
    { title: 'Chapter 2', scenes: [{ title: 'Return', content: `Lady Cara watched Ria in Moonfall Castle. Cara asked Ria about the Aurethi Grounding. In 1842 the Azure Order was founded. Aurethi magic stirred beneath Moonfall Castle.` }] },
  ],
}]

describe('manuscript discovery', () => {
  it('preserves structure, paragraphs, sentences, scenes, and source positions', () => {
    const document = buildManuscriptDocument(manuscript, 'fixture')
    expect(document.chapters).toHaveLength(2)
    expect(document.chapters[0].scenes[0].title).toBe('Arrival')
    expect(document.chapters[0].paragraphs.length).toBeGreaterThan(0)
    expect(document.chapters[0].sentences[0].start).toBe(0)
    expect(document.wordCount).toBeGreaterThan(20)
  })

  it('finds evidence-backed characters, aliases, locations, factions, relationships, timeline, and lore locally', async () => {
    const result = await discoverManuscript(manuscript, { manuscriptId: 'fixture' })
    const allEvidence = Object.values(result.candidates).flat().flatMap(item => item.evidence)
    expect(result.candidates.characters.some(item => item.name.includes('Cara'))).toBe(true)
    expect(result.candidates.locations.some(item => item.name.includes('Moonfall Castle'))).toBe(true)
    expect(result.candidates.factions.some(item => item.name.includes('Order'))).toBe(true)
    expect(result.candidates.relationships.some(item => item.relationshipType === 'sister')).toBe(true)
    expect(result.candidates.timeline.some(item => /twenty years ago|1842/i.test(item.name))).toBe(true)
    expect(result.candidates.lore.some(item => /Aurethi|Grounding/i.test(item.name))).toBe(true)
    expect(allEvidence.every(item => item.chapterId && item.excerpt && Number.isInteger(item.start))).toBe(true)
  })

  it('normalises possessives and case for existing entity matching', () => {
    expect(normalizeDiscoveryName("CARA'S")).toBe('cara')
    const groups = annotateExistingMatches({ characters: [{ id: 'candidate', type: 'character', name: 'cara arddryn' }] }, { characters: [{ id: 'existing', name: 'Cara Arddryn' }] })
    expect(groups.characters[0].existingMatch.id).toBe('existing')
    expect(groups.characters[0].existingAction).toBe('keep')
  })

  it('detects explicit parent and spouse phrases without inventing exact chronology', async () => {
    const relationships = [{ title: 'Act', chapters: [{ title: 'Chapter 1', scenes: [{ content: `Alessia said hello. Nora replied softly. Alessia's mother Nora waited. Jon asked a question. Mara answered. Jon was married to Mara. Twenty years ago the war began. Before the war, the city stood. After the king died, they escaped.` }] }] }]
    const result = await discoverManuscript(relationships)
    expect(result.candidates.relationships.some(item => item.relationshipType === 'mother' && item.sourceName === 'Alessia' && item.targetName === 'Nora')).toBe(true)
    expect(result.candidates.relationships.some(item => item.relationshipType === 'spouse' && item.sourceName === 'Jon' && item.targetName === 'Mara')).toBe(true)
    expect(result.candidates.timeline.map(item => item.dateLabel)).toEqual(expect.arrayContaining(['Twenty years ago', 'Before the war', 'After the king died']))
    expect(result.candidates.timeline.some(item => /^-?\d+$/.test(item.dateLabel) && !/\d/.test(item.name))).toBe(false)
  })

  it('ranks a repeated named location as a location rather than a character', async () => {
    const ambiguous = [{ title: 'Act', chapters: [{ title: 'One', scenes: [{ content: 'Cara said she entered Moonfall Castle. Cara left Moonfall Castle.' }] }, { title: 'Two', scenes: [{ content: 'Cara asked to return to Moonfall Castle.' }] }] }]
    const result = await discoverManuscript(ambiguous)
    expect(result.candidates.locations.some(item => item.name === 'Moonfall Castle')).toBe(true)
    expect(result.candidates.characters.some(item => item.name === 'Moonfall Castle')).toBe(false)
  })

  it('drops capitalised sentence starters from person candidates', async () => {
    const sentenceStarts = [{ title: 'Act', chapters: [{ title: 'One', scenes: [{ content: `Whenever Harry returned, the room fell silent. When Hermione arrived, Harry smiled. After Ron entered, Harry said hello. However Harry answered, Hermione said nothing. With Dumbledore watching, Harry waited. Dumbledore replied softly. Harry's wand trembled.` }] }] }]
    const result = await discoverManuscript(sentenceStarts)
    const names = result.candidates.characters.map(item => item.name)
    expect(names).toEqual(expect.arrayContaining(['Harry', 'Hermione', 'Dumbledore']))
    expect(names.some(name => /Whenever|When|After|However|With/.test(name))).toBe(false)
  })

  it('does not treat repeated capitalised subjects as people without a person signal', async () => {
    const schoolTerms = [{ title: 'Act', chapters: [
      { title: 'One', scenes: [{ content: "Potions Class filled the timetable. Potions Class took place below ground. Hogwarts's towers rose nearby." }] },
      { title: 'Two', scenes: [{ content: 'Potions Class began at noon. Potions Class required careful study. Quidditch filled the stands.' }] },
    ] }]
    const result = await discoverManuscript(schoolTerms)
    const names = result.candidates.characters.map(item => item.name)
    expect(names.some(name => name.includes('Potions'))).toBe(false)
    expect(names).not.toContain('Quidditch')
    expect(names).not.toContain('Hogwarts')
  })

  it('never emits lowercase grammar words as character names', async () => {
    const grammarTrap = [{ title: 'Act', chapters: [{ title: 'One', scenes: [{ content: 'Harry said hello. His friend and enemy waited nearby. Hermione replied softly. The mother and father watched them.' }] }] }]
    const result = await discoverManuscript(grammarTrap)
    const names = result.candidates.characters.map(item => item.name)
    expect(names).toEqual(expect.arrayContaining(['Harry', 'Hermione']))
    expect(names.map(name => name.toLowerCase())).not.toEqual(expect.arrayContaining(['and', 'the', 'his']))
    expect(names.every(name => /^\p{Lu}/u.test(name))).toBe(true)
  })

  it('does not extend a supported person backwards into an imperative or bare title', async () => {
    const commands = [{ title: 'Act', chapters: [{ title: 'One', scenes: [{ content: 'Make Harry wait, someone ordered. Harry said no. Make Dumbledore move, the voice demanded. Dumbledore replied. Mrs Next in line, please. Mrs. Next in line, please.' }] }] }]
    const result = await discoverManuscript(commands)
    const names = result.candidates.characters.map(item => item.name)
    expect(names).toEqual(expect.arrayContaining(['Harry', 'Dumbledore']))
    expect(names.some(name => /^(?:Make|Mrs|Next)\b/.test(name))).toBe(false)
  })

  it('does not call fetch during analysis', async () => {
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn(() => { throw new Error('network call') })
      await expect(discoverManuscript(manuscript)).resolves.toBeTruthy()
      expect(globalThis.fetch).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('discovery importer', () => {
  it('starts a full project import without a duplicate starter manuscript', () => {
    const addNovel = vi.fn(() => ({ id: 'project-1' }))
    expect(createDiscoveryProject({ addNovel }, { title: '  The Moonfall  ', type: 'novel' })).toEqual({ id: 'project-1' })
    expect(addNovel).toHaveBeenCalledWith({
      title: 'The Moonfall',
      description: 'Created from local Manuscript Discovery',
      type: 'novel',
    }, { seedManuscript: false })
  })

  it('retries safely by honoring discovery import keys', async () => {
    const created = []
    const store = {
      characters: [], locations: [], factions: [], loreEntries: [], timeline: [], acts: [], chapters: [],
      saveCharacter: vi.fn(data => { const item = { ...data, id: 'character-1' }; created.push(item); store.characters.push(item); return item.id }),
      saveLocation: vi.fn(), saveFaction: vi.fn(), addLoreEntry: vi.fn(), updateLoreEntry: vi.fn(), addEvent: vi.fn(), updateEvent: vi.fn(), saveRelationship: vi.fn(),
      addAct: vi.fn(), updateAct: vi.fn(), addChapter: vi.fn(), addScene: vi.fn(), updateSceneContent: vi.fn(),
    }
    const document = buildManuscriptDocument([], 'retry-fixture')
    const candidateGroups = { characters: [{ id: 'character:cara', type: 'character', name: 'Cara', selected: true, evidence: [] }], locations: [], factions: [], relationships: [], timeline: [], lore: [], outline: [] }
    await importDiscoveries({ acts: [], document, candidateGroups, store, importId: 'retry-fixture' })
    await importDiscoveries({ acts: [], document, candidateGroups, store, importId: 'retry-fixture' })
    expect(store.saveCharacter).toHaveBeenCalledTimes(1)
  })
})
