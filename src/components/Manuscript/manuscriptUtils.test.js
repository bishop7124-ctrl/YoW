// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeHtmlEntities, buildFinalizedDraft, copyTextToClipboard } from './manuscriptUtils.js'

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
