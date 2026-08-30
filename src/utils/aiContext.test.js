import { describe, expect, it } from 'vitest'
import { buildAIContext, normalizeAiContextMode } from './aiContext'
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
    expect(noScene.warnings.join(' ')).toContain('No current chapter')

    const noCharacter = buildAIContext({ store: makeStore({ selectedCharacterId: null }), mode: 'current_character' })
    expect(noCharacter.includedSources.mode).toBe('smart')
    expect(noCharacter.warnings.join(' ')).toContain('No current character')
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
})
