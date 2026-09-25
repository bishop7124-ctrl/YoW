// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ManuscriptReview from './ManuscriptReview.jsx'

afterEach(cleanup)

const labels = { level1: 'Act', level2: 'Chapter', level3: 'Scene' }
const props = {
  acts: [{ id: 'a1', title: 'Act One' }],
  chapters: [{ id: 'c1', actId: 'a1', title: 'Chapter One' }],
  labels,
  onAcceptChange: vi.fn(),
  onRejectChange: vi.fn(),
  onAcceptScene: vi.fn(),
  onRejectScene: vi.fn(),
  onReturnToWriting: vi.fn(),
}

describe('ManuscriptReview', () => {
  it('renders a redline and resolves individual changes', () => {
    const onAcceptChange = vi.fn()
    render(<ManuscriptReview
      {...props}
      onAcceptChange={onAcceptChange}
      scenes={[{
        id: 's1',
        chapterId: 'c1',
        title: 'The Crossing',
        trackedChanges: { baseContent: 'The old road.', proposedContent: 'The winding road.' },
      }]}
    />)

    expect(screen.getByRole('heading', { name: 'Review changes in the manuscript' })).toBeTruthy()
    expect(screen.getByText('old').tagName).toBe('DEL')
    expect(screen.getByText('winding').tagName).toBe('INS')
    expect(document.querySelector('.ms-review-changes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Accept change' }))
    expect(onAcceptChange).toHaveBeenCalledWith('s1', 0)
  })

  it('offers a clear completion state when nothing is pending', () => {
    const onReturnToWriting = vi.fn()
    render(<ManuscriptReview {...props} scenes={[]} onReturnToWriting={onReturnToWriting} />)
    expect(screen.getByRole('heading', { name: 'All changes reviewed' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Return to Writing' }))
    expect(onReturnToWriting).toHaveBeenCalledOnce()
  })

  it('moves through pending edits with previous and next controls', () => {
    render(<ManuscriptReview
      {...props}
      scenes={[{
        id: 's1',
        chapterId: 'c1',
        title: 'The Crossing',
        trackedChanges: { baseContent: 'The old road met the pale moon.', proposedContent: 'The winding road met the bright moon.' },
      }]}
    />)

    expect(screen.getByText('Change 1 of 2')).toBeTruthy()
    expect(document.querySelector('.ms-review-inline-change.is-active')?.textContent).toContain('old')
    expect(screen.getByRole('button', { name: 'Previous change' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Next change' }))

    expect(screen.getByText('Change 2 of 2')).toBeTruthy()
    expect(document.querySelector('.ms-review-inline-change.is-active')?.textContent).toContain('pale')
    expect(screen.getByRole('button', { name: 'Next change' }).disabled).toBe(true)
  })

  it('shows unchanged scenes and lets the writer activate a change directly in the document', () => {
    render(<ManuscriptReview
      {...props}
      scenes={[
        {
          id: 's0',
          chapterId: 'c1',
          title: 'Before the Crossing',
          content: 'This unchanged scene remains visible for document context.',
        },
        {
          id: 's1',
          chapterId: 'c1',
          title: 'The Crossing',
          trackedChanges: { baseContent: 'The old road met the pale moon.', proposedContent: 'The winding road met the bright moon.' },
        },
      ]}
    />)

    expect(screen.getByText('This unchanged scene remains visible for document context.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Review change 2 in The Crossing' }))
    expect(screen.getByText('Change 2 of 2')).toBeTruthy()
    expect(document.querySelector('.ms-review-inline-change.is-active')?.textContent).toContain('pale')
  })
})
