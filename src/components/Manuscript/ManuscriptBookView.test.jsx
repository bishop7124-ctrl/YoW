// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ManuscriptBookView from './ManuscriptBookView.jsx'

const draft = {
  acts: [{
    id: 'act-1',
    chapters: [{
      id: 'chapter-1',
      title: 'Chapter One',
      scenes: [{ id: 'scene-1', content: 'The first paragraph.\n\nThe second paragraph.' }],
    }],
  }],
}

describe('ManuscriptBookView', () => {
  it('reserves an unnumbered cover and starts chapter one on the first numbered page', () => {
    const { container } = render(<ManuscriptBookView draft={draft} projectTitle="The Last Ember" />)

    expect(screen.getByRole('heading', { name: 'The Last Ember' }).closest('.ms-book-cover')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Chapter One' }).classList.contains('is-first')).toBe(true)
    expect(container.querySelectorAll('.ms-book-page-sheet')).toHaveLength(2)
    expect(container.querySelectorAll('.ms-book-page-number')).toHaveLength(1)
    expect(container.querySelector('.ms-book-page-number')?.textContent).toBe('1')
    expect(screen.getByText('Cover · Page 1 of 1')).toBeTruthy()
  })
})
