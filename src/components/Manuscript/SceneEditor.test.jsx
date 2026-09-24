// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SceneEditor } from './SceneEditor.jsx'
import { DEFAULT_FORMAT } from './manuscriptUtils.js'

const presenceState = vi.hoisted(() => ({ count: 0 }))
vi.mock('../../utils/useTabPresence.js', () => ({
  useTabPresence: () => presenceState.count,
}))

// This file wasn't cleaning up the DOM between tests (each `render()` call left its
// output mounted), which every existing test tolerated only because it scopes its
// queries to its own returned `container`. Text-based getByText/queryByText queries
// below don't have that protection, so clean up for real between tests.
function noop() {}

function makeScene(content) {
  return { id: 's1', title: 'Scene', content, chapterId: 'c1', order: 0 }
}

function renderScene(content, overrides = {}) {
  return render(
    <SceneEditor
      scene={makeScene(content)}
      sceneIndex={0}
      onUpdate={noop}
      onUpdateScene={noop}
      onSplit={noop}
      onFocus={noop}
      entityMap={{}}
      onEntityClick={noop}
      onOpenNotes={noop}
      onNoteClick={noop}
      formatSettings={DEFAULT_FORMAT}
      characterNames={[]}
      locationNames={[]}
      onPersistDraft={noop}
      onLiveContentChange={noop}
      onOpenVersionHistory={noop}
      projectType="novel"
      scrollContainerRef={{ current: null }}
      {...overrides}
    />
  )
}

afterEach(() => {
  presenceState.count = 0
  cleanup()
})

describe('SceneEditor same-scene lease', () => {
  it('returns a later tab to read-only without flushing its draft', async () => {
    presenceState.count = 1
    const onPersistDraft = vi.fn()
    const onUpdate = vi.fn()
    const { container } = renderScene('Protected prose.', { onPersistDraft, onUpdate })

    fireEvent.click(container.querySelector('.ms-preview'))

    await waitFor(() => {
      expect(screen.getByText(/keep this tab read-only/i)).toBeTruthy()
      expect(container.querySelector('textarea.ms-textarea')).toBeNull()
    })
    expect(onPersistDraft).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Edit anyway' })).toBeNull()
  })
})

describe('SceneEditor content preview — mismatched markdown emphasis', () => {
  it('renders unbalanced bold/italic asterisks without crashing (regression: m[2] undefined on wrong-branch match)', () => {
    // "**bold*" — the regex's *italic* alternative (`\*(.+?)\*`) matches this whole
    // span since there's no closing "**", capturing "*bold" into group 3. The full
    // match text still starts with "**", which used to be (wrongly) read as "the
    // bold alternative matched" and crashed reading m[2].length (m[2] is undefined).
    expect(() => renderScene('Some text with **bold*a mismatch and more text.')).not.toThrow()
  })

  it('still renders proper bold text correctly', () => {
    const { container } = renderScene('This is **bold** text.')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
  })

  it('still renders proper italic text correctly', () => {
    const { container } = renderScene('This is *italic* text.')
    expect(container.querySelector('em')?.textContent).toBe('italic')
  })

  it('still renders proper underline text correctly', () => {
    const { container } = renderScene('This is _underlined_ text.')
    expect(container.querySelector('u')?.textContent).toBe('underlined')
  })
})

describe('SceneEditor manuscript references', () => {
  it('identifies every entity reference separately from tracked-edit markup', () => {
    const entityMap = {
      'the archive': {
        id: 'lore-1',
        section: 'lore',
        sectionLabel: 'Lore',
        name: 'The Archive',
        preview: 'A repository of forbidden records.',
      },
      cara: {
        id: 'character-1',
        section: 'characters',
        sectionLabel: 'Character',
        name: 'Cara',
        preview: 'The protagonist’s sister.',
      },
    }
    const { container } = renderScene('Cara entered The Archive beneath the city.', { entityMap })

    expect(container.querySelector('.ms-entity--lore')?.textContent).toBe('The Archive')
    expect(container.querySelector('.ms-entity--characters')?.textContent).toBe('Cara')
    expect(container.querySelectorAll('.ms-entity')).toHaveLength(2)
    expect(container.querySelector('.ms-entity--lore')?.classList.contains('ms-tracked-proposed')).toBe(false)
  })
})

describe('SceneEditor tracked editing presentation', () => {
  it('renders proposed prose inline in the tracked-change colour', () => {
    const scene = { ...makeScene('The winding road.'), trackedChanges: { baseContent: 'The old road.', proposedContent: 'The winding road.' } }
    const { container } = renderScene(scene.content, {
      scene,
      trackingChanges: true,
      trackingBaseContent: scene.trackedChanges.baseContent,
    })

    expect(container.querySelector('.ms-tracked-proposed')?.textContent).toContain('winding')
    expect(container.querySelector('.ms-tracked-deleted')?.textContent).toContain('old')
    expect(container.querySelector('.ms-tracking-summary')).toBeNull()
    expect(container.querySelector('.ms-tracking-chip')?.textContent).toBe('1 change tracked')
  })

  it('shows an appended sentence as an addition without a false paragraph deletion', () => {
    const baseContent = 'The bell rang in the square, and the crowd looked up.\n\nThe bell rang in the tower, and the guard looked down.'
    const appended = ' The bell rang once more, and nobody moved.'
    const content = `The bell rang in the square, and the crowd looked up.${appended}\n\nThe bell rang in the tower, and the guard looked down.`
    const scene = { ...makeScene(content), trackedChanges: { baseContent, proposedContent: content } }
    const { container } = renderScene(content, { scene, trackingChanges: true, trackingBaseContent: baseContent })

    expect(container.querySelector('.ms-tracked-proposed')?.textContent).toBe(appended)
    expect(container.querySelector('.ms-tracking-summary')).toBeNull()
  })

  it('keeps replaced sentences visible as crossed-out text beside the replacement', async () => {
    const baseContent = 'The lantern went dark. The watchman crossed the yard.'
    const content = 'The lantern burned brighter. The watchman crossed the yard.'
    const scene = { ...makeScene(content), trackedChanges: { baseContent, proposedContent: content } }
    const { container } = renderScene(content, { scene, trackingChanges: true, trackingBaseContent: baseContent })

    const deletedBlocks = [...container.querySelectorAll('.ms-tracked-deleted')]
    const proposedBlocks = [...container.querySelectorAll('.ms-tracked-proposed')]
    expect(deletedBlocks).toHaveLength(1)
    expect(deletedBlocks[0].textContent).toBe('went dark')
    expect(proposedBlocks).toHaveLength(1)
    expect(proposedBlocks[0].textContent).toBe('burned brighter')

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node).toBeTruthy()
      return node
    })
    expect(textarea.value).toBe(content)
    expect(textarea.value).not.toContain('went dark')
    const focusedDeletedBlocks = [...container.querySelectorAll('.ms-rich-preview .ms-tracked-deleted')]
    expect(focusedDeletedBlocks).toHaveLength(1)
    expect(focusedDeletedBlocks[0].textContent).toBe('went dark')
  })

  it('paints a textarea selection on the matching visible tracked text', async () => {
    const baseContent = 'First line.\nThe lantern went dark beside the gate.'
    const content = 'First line.\nThe lantern burned much brighter beside the gate.'
    const scene = { ...makeScene(content), trackedChanges: { baseContent, proposedContent: content } }
    const { container } = renderScene(content, { scene, trackingChanges: true, trackingBaseContent: baseContent })

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node).toBeTruthy()
      return node
    })
    const start = content.indexOf('burned much brighter')
    textarea.setSelectionRange(start, start + 'burned much brighter'.length)
    fireEvent.select(textarea)

    await waitFor(() => {
      const highlighted = [...container.querySelectorAll('.ms-tracked-selection')]
      expect(highlighted.map(node => node.textContent).join('')).toBe('burned much brighter')
    })
  })
})

describe('SceneEditor semantic paragraph indentation', () => {
  it('renders every explicit line without adding paragraph spacing', () => {
    const { container } = renderScene('First paragraph.\n\nSecond paragraph.')
    const paragraphs = [...container.querySelectorAll('.ms-prose-paragraph')]

    expect(paragraphs).toHaveLength(3)
    expect(paragraphs.map(paragraph => paragraph.textContent)).toEqual([
      'First paragraph.',
      '\u00a0',
      'Second paragraph.',
    ])
  })

  it('moves down exactly one line for each Enter press', async () => {
    const onPersistDraft = vi.fn()
    const onLiveContentChange = vi.fn()
    const { container } = renderScene('First paragraph.', { onPersistDraft, onLiveContentChange })

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node).toBeTruthy()
      return node
    })
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onPersistDraft).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1' }), 'First paragraph.\n')
    expect(onLiveContentChange).toHaveBeenLastCalledWith('s1', 'First paragraph.\n')

    const updatedTextarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node.value).toBe('First paragraph.\n')
      expect(node.selectionStart).toBe(node.value.length)
      expect(node.selectionEnd).toBe(node.value.length)
      return node
    })
    updatedTextarea.setSelectionRange(updatedTextarea.value.length, updatedTextarea.value.length)
    fireEvent.keyDown(updatedTextarea, { key: 'Enter' })

    expect(onPersistDraft).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1' }), 'First paragraph.\n\n')
    expect(onLiveContentChange).toHaveBeenLastCalledWith('s1', 'First paragraph.\n\n')
    expect(onPersistDraft.mock.lastCall[1]).not.toMatch(/\n +$/)
    await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node.selectionStart).toBe(node.value.length)
      expect(node.selectionEnd).toBe(node.value.length)
    })
    expect(fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })).toBe(true)
  })
})

describe('SceneEditor note-anchor store commits on keystroke', () => {
  // Regression guard for the 2026-09-12 "typing lags once a note is attached"
  // Bugs-table row (docs/ROADMAP.md): handleChange used to call onUpdateScene
  // (an un-debounced store commit, unlike the content path's debounced update)
  // on every keystroke whenever the scene had any notes, even when nothing
  // about a note's anchor actually changed. Fixed by only committing when the
  // recomputed anchor differs from the original.
  function makeNote(overrides = {}) {
    return { id: 'n1', seq: 1, title: '', text: 'A note', anchorOffset: 0, anchorEndOffset: 4, selectedText: 'Test', ...overrides }
  }

  it('does not call onUpdateScene when typing does not require any note to shift (edit mode)', async () => {
    // Edit mode's single textarea always reports the full document as the
    // edit span (data-ms-start=0, data-ms-end=content.length) — so a note
    // anchored anywhere before the document's current end never needs to
    // shift here. This is the exact scenario the original bug report hit:
    // typing normally in a large scene with an existing note.
    const onUpdateScene = vi.fn()
    const { container } = renderScene('Test scene content.', {
      onUpdateScene,
      scene: { id: 's1', title: 'Scene', content: 'Test scene content.', chapterId: 'c1', order: 0, notes: [makeNote()] },
    })

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node).toBeTruthy()
      return node
    })

    fireEvent.change(textarea, { target: { value: 'Test scene content. More.' } })

    expect(onUpdateScene).not.toHaveBeenCalledWith('s1', expect.objectContaining({ notes: expect.anything() }))
  })

  it('still shifts a note anchor and commits it when an edit genuinely precedes the note (write mode block editor)', async () => {
    // Write mode splits the textarea per note, with data-ms-start/data-ms-end
    // set to that block's real offsets — this is the path where an edit
    // actually located before a note's anchor is detectable, and the shift
    // must still be committed.
    const onUpdateScene = vi.fn()
    const note = makeNote({ anchorOffset: 5, anchorEndOffset: 9 }) // anchors "scene" in "Test scene content."
    const { container } = renderScene('Test scene content.', {
      onUpdateScene,
      mode: 'write',
      scene: { id: 's1', title: 'Scene', content: 'Test scene content.', chapterId: 'c1', order: 0, notes: [note] },
    })

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea[data-ms-start="0"]')
      expect(node).toBeTruthy()
      return node
    })

    // Insert "XX" at the very start of the block preceding the note — a genuine edit before the anchor.
    fireEvent.change(textarea, { target: { value: 'XXTest ' } })

    expect(onUpdateScene).toHaveBeenCalledWith('s1', {
      notes: [expect.objectContaining({ anchorOffset: 7, anchorEndOffset: 11 })],
    })
  })

  it('highlights a range-anchored note exactly once in write mode (regression: 2026-09-24 lost-highlight/duplicate-card bug)', async () => {
    // Writing mode (the redesigned default editor's `mode: 'write'` — see the
    // nf-manuscript-mode-v2 comment in Manuscript.jsx) used to lose a
    // range-anchored note's highlight entirely: buildWritingBlocks only ever
    // split at the note's *start* offset, so the anchored text itself fell
    // into the next plain block with no `.ms-note-highlight` at all (fixed by
    // giving the anchor range its own block). The first fix for that
    // regressed a different way in code review: passing the note through to
    // that block's own ContentPreview re-activated ContentPreview's
    // write-mode point-note-marker branch too, rendering a *second*
    // `.ms-inline-note` card for the same note stacked on top of the real one
    // buildWritingBlocks already renders. Assert both: the highlight exists
    // (with the anchored text, not lost) and the note's own editable card
    // renders exactly once (not duplicated).
    const note = makeNote({ anchorOffset: 5, anchorEndOffset: 10 }) // anchors "scene" in "Test scene content."
    const { container } = renderScene('Test scene content.', {
      mode: 'write',
      scene: { id: 's1', title: 'Scene', content: 'Test scene content.', chapterId: 'c1', order: 0, notes: [note] },
    })

    fireEvent.click(container.querySelector('.ms-preview'))
    await waitFor(() => {
      expect(container.querySelector('textarea.ms-textarea[data-ms-start="0"]')).toBeTruthy()
    })

    const highlights = container.querySelectorAll('.ms-note-highlight')
    expect(highlights).toHaveLength(1)
    expect(highlights[0].textContent).toBe('scene')
    expect(container.querySelectorAll('.ms-inline-note')).toHaveLength(1)
  })

  it('shifts a note anchor when an edit precedes it in edit mode (regression: 2026-09-15 anchor-drift bug)', async () => {
    // Edit mode's single textarea always reports the whole document as the edit
    // span (data-ms-start=0, data-ms-end=content.length), so handleChange must
    // recover where the edit actually happened — this is the exact repro that
    // used to silently leave the note anchored to the wrong text: typing at the
    // very start of a scene that already had a note anchored later in it.
    // selectionStart/selectionEnd are set explicitly to the real post-typing
    // cursor position (2, right after "XX") — jsdom otherwise moves a
    // programmatically-set textarea value's cursor to the end, unlike a real
    // browser typing at the start, which would give a false signal here.
    const onUpdateScene = vi.fn()
    const note = makeNote({ anchorOffset: 5, anchorEndOffset: 9 }) // anchors "scene" in "Test scene content."
    const { container } = renderScene('Test scene content.', {
      onUpdateScene,
      scene: { id: 's1', title: 'Scene', content: 'Test scene content.', chapterId: 'c1', order: 0, notes: [note] },
    })

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node).toBeTruthy()
      return node
    })

    // Insert "XX" at the very start of the document, before the note's anchor.
    fireEvent.change(textarea, { target: { value: 'XXTest scene content.', selectionStart: 2, selectionEnd: 2 } })

    expect(onUpdateScene).toHaveBeenCalledWith('s1', {
      notes: [expect.objectContaining({ anchorOffset: 7, anchorEndOffset: 11 })],
    })
  })

  it('shifts a note anchor correctly in edit mode even when a repeated character makes the raw text diff ambiguous', async () => {
    // Regression guard (found in code review of the fix above): a pure
    // old/new string diff can't tell "inserted 'a' at position 0" apart from
    // "inserted 'a' at position 3" when editing "aaab" -> "aaaab" — both
    // produce byte-identical results. Left unresolved, this silently
    // corrupts a note's span (not just "fails to shift") whenever a repeated
    // character/word sits next to the note's anchor. The real post-edit
    // cursor position (selectionStart/selectionEnd) disambiguates it.
    const onUpdateScene = vi.fn()
    const note = makeNote({ anchorOffset: 3, anchorEndOffset: 4 }) // anchors "b" in "aaab"
    const { container } = renderScene('aaab', {
      onUpdateScene,
      scene: { id: 's1', title: 'Scene', content: 'aaab', chapterId: 'c1', order: 0, notes: [note] },
    })

    fireEvent.click(container.querySelector('.ms-preview'))
    const textarea = await waitFor(() => {
      const node = container.querySelector('textarea.ms-textarea')
      expect(node).toBeTruthy()
      return node
    })

    // Type "a" at the very start: "aaab" -> "aaaab", cursor lands at index 1.
    fireEvent.change(textarea, { target: { value: 'aaaab', selectionStart: 1, selectionEnd: 1 } })

    // The note must still point at exactly "b" (now at index 4), not a
    // corrupted span like [3,5) ("ab") that a naive diff would produce.
    expect(onUpdateScene).toHaveBeenCalledWith('s1', {
      notes: [expect.objectContaining({ anchorOffset: 4, anchorEndOffset: 5 })],
    })
  })
})

describe('SceneEditor visual caret', () => {
  it('uses a font-height preview caret instead of the textarea line-height caret', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects')
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ left: 42, right: 42, top: 20, bottom: 58, width: 0, height: 38 }],
    })

    try {
      const { container } = renderScene('A manuscript line.')
      fireEvent.click(container.querySelector('.ms-preview'))
      const textarea = await waitFor(() => {
        const node = container.querySelector('textarea.ms-textarea')
        expect(node).toBeTruthy()
        return node
      })

      textarea.focus()
      textarea.setSelectionRange(3, 3)
      fireEvent.select(textarea)

      await waitFor(() => {
        const caret = container.querySelector('.ms-editor-caret')
        expect(caret.classList.contains('is-visible')).toBe(true)
        expect(caret.style.height).toBe(`${DEFAULT_FORMAT.fontSize}px`)
        expect(textarea.classList.contains('ms-textarea--custom-caret')).toBe(true)
      })

      textarea.setSelectionRange(1, 4)
      fireEvent.select(textarea)
      await waitFor(() => {
        expect(container.querySelector('.ms-editor-caret').classList.contains('is-visible')).toBe(false)
        expect(textarea.classList.contains('ms-textarea--custom-caret')).toBe(false)
      })
    } finally {
      if (originalDescriptor) Object.defineProperty(Range.prototype, 'getClientRects', originalDescriptor)
      else delete Range.prototype.getClientRects
    }
  })
})
