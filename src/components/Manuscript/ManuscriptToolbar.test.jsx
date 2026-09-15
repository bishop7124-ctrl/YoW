// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { NotesPanel } from './ManuscriptToolbar.jsx'

afterEach(cleanup)

describe('NotesPanel', () => {
  it('contains and pads note text inside the editor field', () => {
    render(
      <NotesPanel
        scene={{
          id: 'scene-1',
          notes: [{ id: 'note-1', seq: 1, text: 'A very long note that needs to wrap inside its field.' }],
        }}
        onUpdateScene={vi.fn()}
      />,
    )

    const textarea = screen.getByPlaceholderText('Write your note here…')
    expect(textarea.getAttribute('wrap')).toBe('soft')
    expect(textarea.className).toContain('min-w-0')
    expect(textarea.className).toContain('overflow-x-hidden')
    expect(textarea.className).toContain('break-words')
    expect(textarea.className).toContain('px-3')
    expect(textarea.className).toContain('py-2')
  })
})
