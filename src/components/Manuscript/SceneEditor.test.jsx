// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { SceneEditor } from './SceneEditor.jsx'
import { DEFAULT_FORMAT, LARGE_SCENE_CHAR_THRESHOLD } from './manuscriptUtils.js'

// This file wasn't cleaning up the DOM between tests (each `render()` call left its
// output mounted), which every existing test tolerated only because it scopes its
// queries to its own returned `container`. Text-based getByText/queryByText queries
// below don't have that protection, so clean up for real between tests.
afterEach(cleanup)

function noop() {}

function makeScene(content) {
  return { id: 's1', title: 'Scene', content, chapterId: 'c1', order: 0 }
}

function renderScene(content) {
  return render(
    <SceneEditor
      scene={makeScene(content)}
      sceneIndex={0}
      onUpdate={noop}
      onUpdateScene={noop}
      onSplit={noop}
      entityMap={{}}
      onEntityClick={noop}
      onOpenNotes={noop}
      onNoteClick={noop}
      formatSettings={DEFAULT_FORMAT}
      characterNames={[]}
      locationNames={[]}
      onPersistDraft={noop}
      onOpenVersionHistory={noop}
      projectType="novel"
    />
  )
}

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

describe('SceneEditor — very large scene copy action (2026-08-08 Phase 4(a))', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not show a copy-whole-scene action for an ordinary-sized scene', () => {
    const { queryByText } = renderScene('A short scene, well under the threshold.')
    expect(queryByText('Copy whole scene')).toBeNull()
  })

  it('shows a copy-whole-scene action once scene content exceeds the large-scene threshold', () => {
    const bigContent = 'x'.repeat(LARGE_SCENE_CHAR_THRESHOLD + 1)
    const { getByText } = renderScene(bigContent)
    expect(getByText('Copy whole scene')).toBeTruthy()
  })

  it('copies the full scene content to the clipboard and confirms it, without relying on DOM selection', async () => {
    const bigContent = 'y'.repeat(LARGE_SCENE_CHAR_THRESHOLD + 500)
    const { getByText } = renderScene(bigContent)
    fireEvent.click(getByText('Copy whole scene'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(bigContent)
    await waitFor(() => expect(getByText('Copied!')).toBeTruthy())
  })

  it('surfaces a failure rather than silently doing nothing when the clipboard write fails', async () => {
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
    const bigContent = 'z'.repeat(LARGE_SCENE_CHAR_THRESHOLD + 500)
    const { getByText } = renderScene(bigContent)
    fireEvent.click(getByText('Copy whole scene'))
    await waitFor(() => expect(getByText('Copy failed')).toBeTruthy())
  })
})
