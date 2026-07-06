import { describe, expect, it } from 'vitest'
import { buildSaveSummary, countWordsFromScenes, formatSaveSummary, pruneSaveDataToProjects } from './syncSummary.js'

describe('sync summary', () => {
  it('counts words in saved scene content', () => {
    expect(countWordsFromScenes([
      { content: '<p>One two three</p>' },
      { content: 'Four' },
    ])).toBe(4)
  })

  it('builds the project, word, and saved-entry overview used for sync warnings', () => {
    const summary = buildSaveSummary({
      novels: [{ id: 'novel-1' }],
      scenes: [{ id: 'scene-1', novelId: 'novel-1', content: 'A quiet opening line.' }],
      characters: [{ id: 'character-1', novelId: 'novel-1' }, { id: 'character-2', novelId: 'novel-1' }],
      loreEntries: [{ id: 'lore-1', novelId: 'novel-1' }],
    })

    expect(summary).toEqual({
      projects: 1,
      words: 4,
      entries: 4,
    })
  })

  it('ignores orphaned records that are not attached to a current project', () => {
    const data = {
      novels: [{ id: 'current-project' }],
      activeNovelId: 'deleted-project',
      activeMapByNovel: {
        'current-project': 'map-1',
        'deleted-project': 'map-old',
      },
      scenes: [
        { id: 'scene-current', novelId: 'current-project', content: 'Hello' },
        { id: 'scene-old', novelId: 'deleted-project', content: Array.from({ length: 125000 }, () => 'old').join(' ') },
      ],
      characters: [
        { id: 'character-current', novelId: 'current-project' },
        { id: 'character-old', novelId: 'deleted-project' },
      ],
      loreEntries: [{ id: 'lore-old', novelId: 'missing-project' }],
    }

    expect(buildSaveSummary(data)).toEqual({
      projects: 1,
      words: 1,
      entries: 2,
    })
    expect(pruneSaveDataToProjects(data).activeNovelId).toBe('current-project')
    expect(pruneSaveDataToProjects(data).activeMapByNovel).toEqual({ 'current-project': 'map-1' })
  })

  it('formats the summary for confirmation dialogs', () => {
    expect(formatSaveSummary({ projects: 1, words: 2, entries: 3 }))
      .toBe('1 project, 2 written words, 3 saved entries')
  })
})
