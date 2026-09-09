import { describe, expect, it } from 'vitest'
import {
  buildOutlineModel,
  formatOutlineChapterTitle,
  normalizeOutlineItem,
  outlinePatch,
  outlineSynopsis,
  outlineWordCount,
  sortOutlineItems,
} from './outlineDisplay.js'

describe('outline display model', () => {
  it('sorts duplicate and malformed positions deterministically without mutating records', () => {
    const source = [{ id: 'z', title: '10', order: 1 }, { id: 'a', title: '2', order: 1 }, { id: 'bad', title: 3, order: 'nope' }]
    expect(sortOutlineItems(source).map(item => item.id)).toEqual(['a', 'z', 'bad'])
    expect(source.map(item => item.id)).toEqual(['z', 'a', 'bad'])
  })

  it('keeps custom titles beginning with the structure noun', () => {
    expect(formatOutlineChapterTitle({ title: 'Chapterhouse Escape' }, 'Chapter', 2)).toBe('Chapter 2: Chapterhouse Escape')
    expect(formatOutlineChapterTitle({ title: 'Chapter 9' }, 'Chapter', 2)).toBe('Chapter 2')
  })

  it('normalizes malformed editor fields while preserving explicit clears', () => {
    const item = { title: 42, synopsis: '', summary: 'Old summary', storyEvent: 7, sessionPlan: { hooks: 9 }, sessionRecap: null }
    expect(normalizeOutlineItem(item, 'chapter')).toMatchObject({ title: '42', synopsis: '', storyEvent: '7', sessionPlan: { hooks: '9' }, sessionRecap: {} })
    expect(outlineSynopsis(item)).toBe('')
    expect(outlinePatch({ title: 8, sessionPlan: { hooks: 3 } }, 'chapter')).toMatchObject({ title: '8', sessionPlan: { hooks: '3' } })
  })

  it('counts text safely and excludes markup', () => {
    expect(outlineWordCount('<p>one two</p><br>three')).toBe(3)
    expect(outlineWordCount(12345)).toBe(1)
    expect(outlineWordCount(null)).toBe(0)
  })

  it('indexes the hierarchy once and retains unavailable-parent records', () => {
    const model = buildOutlineModel({
      acts: [{ id: 'a', title: 'Act', order: 0 }],
      chapters: [{ id: 'c', actId: 'a', order: 0 }, { id: 'orphan-c', actId: 'missing', order: 0 }],
      scenes: [
        { id: 's', chapterId: 'c', content: 'one two', order: 0 },
        { id: 'nested', chapterId: 'orphan-c', content: 'three', order: 0 },
        { id: 'orphan-s', chapterId: 'missing', content: 'four', order: 0 },
      ],
    })
    expect(model.acts[0]).toMatchObject({ sceneCount: 1, words: 2 })
    expect(model.unplacedChapters[0].scenes.map(scene => scene.id)).toEqual(['nested'])
    expect(model.unplacedScenes.map(scene => scene.id)).toEqual(['orphan-s'])
    expect(model.totals).toEqual({ acts: 1, chapters: 2, scenes: 3, words: 4 })
  })
})
