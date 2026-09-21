// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildAIContext, fingerprintText, getActiveContextTargets, normalizeAiContextMode, saveAiContextMode, loadAiContextMode } from './aiContext'
import { getSafeInputBudget } from './aiModelCapabilities'

const makeStore = (overrides = {}) => ({
  activeNovelId: 'novel-1',
  activeNovel: { id: 'novel-1', title: 'Moon Orchard', type: 'novel', description: 'A mystery about a cursed orchard.' },
  selectedCharacterId: 'char-1',
  writingSceneId: 'scene-1',
  characters: [
    { id: 'char-1', name: 'Mira Vale', role: 'Botanist', bio: 'Mira studies the silver trees.', relationships: [{ targetId: 'char-2', type: 'ally' }] },
    { id: 'char-2', name: 'Orren Pike', role: 'Cartographer', bio: 'Orren maps the old roads.', relationships: [] },
    { id: 'char-3', name: 'Lena Moss', role: 'Rival', bio: 'Lena wants the orchard sealed.', relationships: [] },
  ],
  locations: [
    { id: 'loc-1', name: 'Silver Orchard', category: 'Forest', description: 'A moonlit orchard tied to Mira.', characterIds: ['char-1'] },
  ],
  loreEntries: [
    { id: 'lore-1', title: 'Moon Sap', category: 'Magic', content: 'The sap remembers every broken promise.', characterIds: ['char-1'] },
  ],
  timeline: [
    { id: 'time-1', title: 'Mira finds the first silver leaf', date: 'Year 1', description: 'The orchard wakes.', linkedCharacters: ['char-1'] },
  ],
  worldHistory: [
    { id: 'hist-1', title: 'The Orchard Pact', era: 'Founding', content: 'The first families swore an oath.', linkedCharacters: ['char-1'] },
  ],
  ideaEntries: [
    { id: 'idea-1', title: 'Orchard clue', body: 'Mira should discover a hidden root map.', tags: ['mira'] },
  ],
  acts: [{ id: 'act-1', title: 'Act One', novelId: 'novel-1', order: 1 }],
  chapters: [
    { id: 'chapter-1', title: 'The Silver Gate', novelId: 'novel-1', actId: 'act-1', order: 1 },
    { id: 'chapter-2', title: 'The Dry Road', novelId: 'novel-1', actId: 'act-1', order: 2 },
  ],
  scenes: [
    { id: 'scene-1', title: 'Gate scene', novelId: 'novel-1', chapterId: 'chapter-1', order: 1, content: 'Mira Vale enters the Silver Orchard with Orren Pike.', synopsis: 'Mira reaches the orchard.' },
    { id: 'scene-2', title: 'Road scene', novelId: 'novel-1', chapterId: 'chapter-2', order: 2, content: 'Lena Moss blocks the dry road.', synopsis: 'Lena interferes.' },
  ],
  ...overrides,
})

describe('buildAIContext', () => {
  it('uses Smart Context as the default mode', () => {
    expect(normalizeAiContextMode()).toBe('smart')
    const result = buildAIContext({ store: makeStore(), userPrompt: 'What does Mira know about the orchard?' })
    expect(result.includedSources.mode).toBe('smart')
    expect(result.context).toContain('Mira Vale')
    expect(result.estimatedTokens).toBeGreaterThan(0)
  })

  it('Current Chapter includes the active chapter and its scene', () => {
    const result = buildAIContext({ store: makeStore(), mode: 'current_chapter', userPrompt: 'Help with this chapter' })
    expect(result.includedSources.chapters).toContain('chapter-1')
    expect(result.includedSources.scenes).toContain('scene-1')
    expect(result.context).toContain('The Silver Gate')
  })

  it('Current Character includes the active character and relationships', () => {
    const result = buildAIContext({ store: makeStore(), mode: 'current_character', userPrompt: 'Develop Mira' })
    expect(result.includedSources.characters).toContain('char-1')
    expect(result.context).toContain('Mira Vale -> Orren Pike: ally')
  })

  it('falls back safely when a chapter or character is missing', () => {
    const noScene = buildAIContext({ store: makeStore({ writingSceneId: null }), mode: 'current_chapter' })
    expect(noScene.includedSources.mode).toBe('smart')
    expect(noScene.warnings.join(' ')).toContain('No chapter is chosen')

    const noCharacter = buildAIContext({ store: makeStore({ selectedCharacterId: null }), mode: 'current_character' })
    expect(noCharacter.includedSources.mode).toBe('smart')
    expect(noCharacter.warnings.join(' ')).toContain('No character is chosen')
  })

  it('Entire Project respects model context limits and flags truncation', () => {
    const hugeContent = 'Mira discovers a secret. '.repeat(5000)
    const result = buildAIContext({
      store: makeStore({
        scenes: Array.from({ length: 300 }, (_, index) => ({
          id: `scene-${index}`,
          title: `Scene ${index}`,
          novelId: 'novel-1',
          chapterId: 'chapter-1',
          order: index,
          content: hugeContent,
        })),
      }),
      mode: 'entire_project',
      provider: 'openrouter',
      model: 'deepseek/deepseek-r1',
    })
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.safeInputBudget)
    expect(result.truncated).toBe(true)
  })

  it('changing model changes the available context budget', () => {
    const small = getSafeInputBudget('openrouter', 'deepseek/deepseek-r1').safeInputBudget
    const large = getSafeInputBudget('anthropic', 'claude-sonnet-4-6').safeInputBudget
    expect(large).toBeGreaterThan(small)
  })

  it('orders stable project context before request-specific context', () => {
    const result = buildAIContext({ store: makeStore(), userPrompt: 'What does Mira know about the orchard?' })
    expect(result.stableFirst).toBe(true)
    expect(result.context.indexOf('PROJECT SUMMARY')).toBeLessThan(result.context.indexOf('RELEVANT CHARACTERS'))
  })

  it('produces identical fingerprints for identical context', () => {
    const first = buildAIContext({ store: makeStore(), userPrompt: 'Mira orchard' })
    const second = buildAIContext({ store: makeStore(), userPrompt: 'Mira orchard' })
    expect(first.contextFingerprint).toBe(second.contextFingerprint)
    expect(first.stableFingerprint).toBe(second.stableFingerprint)
  })

  it('changes fingerprints when relevant context changes', () => {
    const first = buildAIContext({ store: makeStore(), userPrompt: 'Mira orchard' })
    const second = buildAIContext({
      store: makeStore({ characters: [{ id: 'char-1', name: 'Mira Vale', bio: 'A changed biography about the orchard.' }] }),
      userPrompt: 'Mira orchard',
    })
    expect(first.contextFingerprint).not.toBe(second.contextFingerprint)
  })

  it('hashes deterministic context without exposing the context itself', () => {
    expect(fingerprintText('secret manuscript text')).toBe(fingerprintText('secret manuscript text'))
    expect(fingerprintText('secret manuscript text')).not.toContain('secret')
  })
})

// The live store keeps the editor's open scene/character OUTSIDE the
// project-scoped snapshot getProjectContextData returns. Mirror that shape.
const makeLiveStore = (overrides = {}) => {
  const { writingSceneId = 'scene-2', selectedCharacterId = 'char-2', ...rest } = overrides
  const { selectedCharacterId: _c, writingSceneId: _w, ...records } = makeStore(rest)
  return { writingSceneId, selectedSceneId: null, selectedCharacterId, getProjectContextData: () => records }
}

describe('active chapter and character from the live store', () => {
  it('resolves the open chapter even though the scoped snapshot has no writingSceneId', () => {
    const store = makeLiveStore()
    expect(getActiveContextTargets(store, 'novel-1')).toEqual({ chapterId: 'chapter-2', characterId: 'char-2' })
    const result = buildAIContext({ store, projectId: 'novel-1', mode: 'current_chapter' })
    expect(result.includedSources.mode).toBe('current_chapter')
    expect(result.includedSources.chapters).toEqual(['chapter-2'])
    expect(result.context).toContain('Lena Moss blocks the dry road.')
  })

  it('an explicitly chosen chapter/character beats whatever is open in the editor', () => {
    const store = makeLiveStore()
    const chapter = buildAIContext({ store, projectId: 'novel-1', mode: 'current_chapter', activeChapterId: 'chapter-1' })
    expect(chapter.includedSources.chapters).toEqual(['chapter-1'])
    const character = buildAIContext({ store, projectId: 'novel-1', mode: 'current_character', activeCharacterId: 'char-3' })
    expect(character.includedSources.characters).toContain('char-3')
  })

  it('Smart Context ranks the open chapter\'s scenes first even with an unrelated prompt', () => {
    const result = buildAIContext({ store: makeLiveStore(), projectId: 'novel-1', mode: 'smart', userPrompt: 'hello' })
    expect(result.includedSources.scenes).toContain('scene-2')
  })
})

describe('Choose Records (custom) mode', () => {
  const longText = 'The orchard remembers. '.repeat(400)
  const store = () => makeStore({
    scenes: [
      { id: 'scene-1', title: 'Gate scene', novelId: 'novel-1', chapterId: 'chapter-1', order: 1, content: longText },
      { id: 'scene-2', title: 'Road scene', novelId: 'novel-1', chapterId: 'chapter-2', order: 1, content: 'Lena Moss blocks the dry road.' },
    ],
    characters: [
      { id: 'char-1', name: 'Mira Vale', role: 'Botanist', bio: 'Studies silver trees.', traits: { internalGoal: 'Seal the orchard', fears: 'Fire' }, background: { hometown: 'Ashford' }, relationships: [{ targetId: 'char-2', type: 'ally', notes: 'Since childhood' }] },
      { id: 'char-2', name: 'Orren Pike', role: 'Cartographer', bio: 'Maps roads.', relationships: [] },
      { id: 'char-3', name: 'Lena Moss', role: 'Rival', bio: 'Wants it sealed.', relationships: [] },
    ],
  })

  it('includes exactly the chosen records and nothing else', () => {
    const result = buildAIContext({ store: store(), mode: 'custom', selection: { characterIds: ['char-3'], loreEntryIds: ['lore-1'] } })
    expect(result.includedSources.mode).toBe('custom')
    expect(result.includedSources.characters).toEqual(['char-3'])
    expect(result.includedSources.lore).toEqual(['lore-1'])
    expect(result.includedSources.locations).toEqual([])
    expect(result.includedSources.scenes).toEqual([])
    expect(result.context).toContain('Lena Moss')
    expect(result.context).not.toContain('Orren Pike')
    expect(result.context).not.toContain('Mira Vale')
  })

  it('sends chosen chapters as full text, unclipped', () => {
    const result = buildAIContext({ store: store(), mode: 'custom', selection: { chapterIds: ['chapter-1'] } })
    expect(result.includedSources.chapters).toEqual(['chapter-1'])
    expect(result.includedSources.scenes).toEqual(['scene-1'])
    expect(result.context).toContain(longText.trim())
    expect(result.context).not.toContain('...')
  })

  it('orders chosen chapters by act then chapter, not by raw order values', () => {
    const result = buildAIContext({
      store: makeStore({
        acts: [{ id: 'act-1', order: 1 }, { id: 'act-2', order: 2 }],
        chapters: [
          { id: 'late', title: 'Late', novelId: 'novel-1', actId: 'act-2', order: 1 },
          { id: 'early', title: 'Early', novelId: 'novel-1', actId: 'act-1', order: 5 },
        ],
        scenes: [
          { id: 's-late', title: 'Late scene', novelId: 'novel-1', chapterId: 'late', order: 1, content: 'LATE TEXT' },
          { id: 's-early', title: 'Early scene', novelId: 'novel-1', chapterId: 'early', order: 1, content: 'EARLY TEXT' },
        ],
      }),
      mode: 'custom',
      selection: { chapterIds: ['late', 'early'] },
    })
    expect(result.context.indexOf('EARLY TEXT')).toBeLessThan(result.context.indexOf('LATE TEXT'))
  })

  it('includes the full character profile: traits, goals, background, and relationship notes', () => {
    const result = buildAIContext({ store: store(), mode: 'custom', selection: { characterIds: ['char-1', 'char-2'] } })
    expect(result.context).toContain('Internal Goal: Seal the orchard')
    expect(result.context).toContain('Fears: Fire')
    expect(result.context).toContain('Hometown: Ashford')
    expect(result.context).toContain('Mira Vale -> Orren Pike: ally (Since childhood)')
  })

  it('uses the de-duplicated history list so mirrored timeline/history entries are not doubled', () => {
    const result = buildAIContext({
      store: makeStore({
        timeline: [{ id: 't1', title: 'Pact signed', worldHistoryEntryId: 'h1' }],
        worldHistory: [{ id: 'h1', title: 'Pact signed', timelineEventId: 't1' }, { id: 'h2', title: 'Old war' }],
      }),
      mode: 'custom',
      selection: { worldHistoryIds: ['t1', 'h1', 'h2'] },
    })
    expect(result.includedSources.timeline.sort()).toEqual(['h2', 't1'])
  })

  it('warns that the end will be cut off when the selection exceeds the model budget', () => {
    const huge = makeStore({
      scenes: [{ id: 'scene-1', title: 'Gate scene', novelId: 'novel-1', chapterId: 'chapter-1', order: 1, content: 'word '.repeat(200000) }],
    })
    const result = buildAIContext({ store: huge, mode: 'custom', selection: { chapterIds: ['chapter-1'] }, provider: 'openrouter', model: 'deepseek/deepseek-r1' })
    expect(result.truncated).toBe(true)
    expect(result.warnings.join(' ')).toContain('deselect some records')
  })

  it('an empty selection yields just the project summary and a real token estimate', () => {
    const result = buildAIContext({ store: store(), mode: 'custom' })
    expect(result.context).toContain('PROJECT SUMMARY')
    expect(result.estimatedTokens).toBeGreaterThan(0)
    expect(result.includedSources.characters).toEqual([])
  })

  it('is never remembered as the default mode for new chats', () => {
    localStorage.clear()
    saveAiContextMode('current_chapter')
    saveAiContextMode('custom')
    expect(loadAiContextMode()).toBe('current_chapter')
  })
})
