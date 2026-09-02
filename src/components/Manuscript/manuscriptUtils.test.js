// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildFinalizedDraft,
  copyTextToClipboard,
  dailyWordsForScenes,
  decodeHtmlEntities,
  getFinalizedContentBlocks,
  subtractDays,
} from './manuscriptUtils.js'

describe('writing progress dates', () => {
  it('moves across calendar boundaries without using UTC date conversion', () => {
    expect(subtractDays('2026-03-01', 1)).toBe('2026-02-28')
    expect(subtractDays('2024-03-01', 1)).toBe('2024-02-29')
  })

  it('combines cumulative scene histories into daily net word totals', () => {
    const scenes = [
      { wordHistory: [
        { date: '2026-08-31', words: 300, timestamp: 1 },
        { date: '2026-09-01', words: 800, timestamp: 2 },
      ] },
      { wordHistory: [
        { date: '2026-09-01', words: 200, timestamp: 3 },
        { date: '2026-09-02', words: 550, timestamp: 4 },
      ] },
    ]

    expect(dailyWordsForScenes(scenes)).toEqual({
      '2026-08-31': 300,
      '2026-09-01': 700,
      '2026-09-02': 350,
    })
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes named entities like apostrophes and ampersands', () => {
    expect(decodeHtmlEntities("don&apos;t")).toBe("don't")
    expect(decodeHtmlEntities('salt &amp; pepper')).toBe('salt & pepper')
    expect(decodeHtmlEntities('&#39;quoted&#39;')).toBe("'quoted'")
  })

  it('leaves plain text unchanged', () => {
    expect(decodeHtmlEntities("don't touch this")).toBe("don't touch this")
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('passes through non-string input unchanged', () => {
    expect(decodeHtmlEntities(null)).toBe(null)
    expect(decodeHtmlEntities(undefined)).toBe(undefined)
  })
})

describe('buildFinalizedDraft', () => {
  const labels = { level1: 'Act', level2: 'Chapter', level3: 'Scene' }

  it('decodes HTML entities baked into scene content and titles', () => {
    const acts = [{ id: 'a1', title: 'Act &amp; One', order: 0 }]
    const chapters = [{ id: 'c1', actId: 'a1', title: 'Chapter &apos;1&apos;', order: 0 }]
    const scenes = [{ id: 's1', chapterId: 'c1', title: 'The Beginning', content: "She said, &quot;I won&apos;t.&quot;", order: 0 }]

    const draft = buildFinalizedDraft({ novel: { title: 'My Novel &amp; Friends' }, acts, chapters, scenes, labels, title: 'Draft 1' })

    expect(draft.projectTitle).toBe('My Novel & Friends')
    expect(draft.acts[0].title).toBe('Act & One')
    expect(draft.acts[0].chapters[0].title).toBe("Chapter '1'")
    expect(draft.acts[0].chapters[0].scenes[0].content).toBe('She said, "I won\'t."')
  })

  it('keeps semantic paragraph breaks as separate finalized paragraphs', () => {
    const acts = [{ id: 'a1', title: 'Act One', order: 0 }]
    const chapters = [{ id: 'c1', actId: 'a1', title: 'Chapter One', order: 0 }]
    const scenes = [{ id: 's1', chapterId: 'c1', title: 'Opening', content: 'First paragraph.\n\nSecond paragraph.', order: 0 }]
    const draft = buildFinalizedDraft({ novel: { title: 'Paragraph Test' }, acts, chapters, scenes, labels, title: 'Draft 1' })

    expect(getFinalizedContentBlocks(draft).filter(block => block.type === 'paragraph').map(block => block.text)).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ])
  })
})

// copyTextToClipboard backs the "Copy scene" action (SceneEditor.jsx's header
// toolbar) — the accepted product decision for the single-very-large-scene
// typing-lag case (docs/ROADMAP.md, 2026-08-08): copy the full in-memory
// content directly instead of relying on native `<textarea>` selection, which
// can get slow or unreliable once a scene is big enough. These tests cover
// both the primary Clipboard API path and the execCommand fallback used when
// it's unavailable or rejected — exactly the "very long scene, real content"
// shape this decision targets, at a small scale for speed.
describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard
  const originalExecCommand = document.execCommand

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
    document.execCommand = originalExecCommand
    vi.restoreAllMocks()
  })

  it('returns false without touching the clipboard for empty content', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    expect(await copyTextToClipboard('')).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('uses the async Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const content = 'A '.repeat(60000) + 'final paragraph past a very long scene.'

    expect(await copyTextToClipboard(content)).toBe(true)
    expect(writeText).toHaveBeenCalledWith(content)
  })

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    document.execCommand = vi.fn(() => true)

    expect(await copyTextToClipboard('scene content')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back to execCommand when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = vi.fn(() => true)

    expect(await copyTextToClipboard('scene content')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('returns false when every copy path fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    document.execCommand = vi.fn(() => false)

    expect(await copyTextToClipboard('scene content')).toBe(false)
  })
})
