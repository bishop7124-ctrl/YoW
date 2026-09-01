// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SceneEditor } from './SceneEditor.jsx'
import { DEFAULT_FORMAT } from './manuscriptUtils.js'

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
  cleanup()
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

describe('SceneEditor semantic paragraph indentation', () => {
  it('renders each stored paragraph with a visual first-line indent', () => {
    const { container } = renderScene('First paragraph.\n\nSecond paragraph.')
    const paragraphs = [...container.querySelectorAll('.ms-prose-paragraph')]

    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.map(paragraph => paragraph.textContent)).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ])
  })

  it('starts a new paragraph with a semantic break instead of literal spaces', async () => {
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

    expect(onPersistDraft).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1' }), 'First paragraph.\n\n')
    expect(onLiveContentChange).toHaveBeenLastCalledWith('s1', 'First paragraph.\n\n')
    expect(onPersistDraft.mock.lastCall[1]).not.toMatch(/\n +$/)
    expect(fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })).toBe(true)
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
