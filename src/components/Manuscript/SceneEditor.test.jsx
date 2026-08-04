// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SceneEditor } from './SceneEditor.jsx'
import { DEFAULT_FORMAT } from './manuscriptUtils.js'

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
