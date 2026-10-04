import { describe, expect, it, vi } from 'vitest'
import { mergeImportedManuscript } from './manuscriptImport.js'

const labels = { level1: 'Act', level2: 'Chapter', level3: 'Scene' }
const imported = [{
  title: 'Act 1',
  chapters: [{
    title: 'Chapter 1',
    scenes: [{ title: 'Arrival', content: 'The rain came down.' }],
  }],
}]

describe('mergeImportedManuscript', () => {
  it('fills an empty scene in a matching chapter instead of duplicating the outline', () => {
    const addAct = vi.fn()
    const addChapter = vi.fn()
    const addScene = vi.fn()
    const updateScene = vi.fn()
    const updateSceneContent = vi.fn()

    const summary = mergeImportedManuscript({
      importedActs: imported,
      acts: [{ id: 'a1', title: 'Act 1', order: 0 }],
      chapters: [{ id: 'c1', actId: 'a1', title: 'Chapter 1', order: 0 }],
      scenes: [{ id: 's1', chapterId: 'c1', title: 'Scene', content: '', order: 0 }],
      labels, addAct, addChapter, addScene, updateScene, updateSceneContent,
    })

    expect(addAct).not.toHaveBeenCalled()
    expect(addChapter).not.toHaveBeenCalled()
    expect(addScene).not.toHaveBeenCalled()
    expect(updateScene).toHaveBeenCalledWith('s1', { title: 'Arrival' })
    expect(updateSceneContent).toHaveBeenCalledWith('s1', 'The rain came down.')
    expect(summary).toEqual({ actsCreated: 0, chaptersCreated: 0, scenesCreated: 0, scenesFilled: 1 })
  })

  it('never overwrites existing prose and appends the imported scene inside the matched chapter', () => {
    const addScene = vi.fn(() => ({ id: 's2', chapterId: 'c1', title: 'Arrival', content: '', order: 1 }))
    const updateSceneContent = vi.fn()

    const summary = mergeImportedManuscript({
      importedActs: imported,
      acts: [{ id: 'a1', title: 'Act 1', order: 0 }],
      chapters: [{ id: 'c1', actId: 'a1', title: 'Chapter 1', order: 0 }],
      scenes: [{ id: 's1', chapterId: 'c1', title: 'Existing', content: 'Keep this text.', order: 0 }],
      labels,
      addAct: vi.fn(), addChapter: vi.fn(), addScene,
      updateScene: vi.fn(), updateSceneContent,
    })

    expect(addScene).toHaveBeenCalledWith('c1', 'Arrival')
    expect(updateSceneContent).toHaveBeenCalledWith('s2', 'The rain came down.')
    expect(updateSceneContent).not.toHaveBeenCalledWith('s1', expect.anything())
    expect(summary.scenesCreated).toBe(1)
  })

  it('matches generic chapter headings by position when their numbering style differs', () => {
    const updateSceneContent = vi.fn()
    mergeImportedManuscript({
      importedActs: [{ title: 'Part One', chapters: [{ title: 'Chapter One', scenes: imported[0].chapters[0].scenes }] }],
      acts: [{ id: 'a1', title: 'Act 1', order: 0 }],
      chapters: [{ id: 'c1', actId: 'a1', title: 'Chapter 1', order: 0 }],
      scenes: [{ id: 's1', chapterId: 'c1', title: 'Scene', content: '', order: 0 }],
      labels,
      addAct: vi.fn(), addChapter: vi.fn(), addScene: vi.fn(),
      updateScene: vi.fn(), updateSceneContent,
    })

    expect(updateSceneContent).toHaveBeenCalledWith('s1', 'The rain came down.')
  })
})

