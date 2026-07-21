// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import FindingCard from './FindingCard.jsx'

afterEach(cleanup)

const baseFinding = {
  _id: 'f1',
  severity: 'high',
  status: 'unresolved',
  title: 'Gandalf disappears without explanation',
  location: 'Chapter 1, Scene: The Ambush',
  affectedRefs: ['Gandalf', 'Someone Not In The Story'],
}

describe('FindingCard', () => {
  it('renders location and refs as plain text when no resolver is given', () => {
    render(<FindingCard finding={baseFinding} />)
    expect(screen.getByText(baseFinding.location)).toBeTruthy()
  })

  it('renders a matched location/ref as a clickable link and calls onNavigate on click', () => {
    const resolveRef = vi.fn(text => {
      if (text === baseFinding.location) return { type: 'scene', id: 'scene-1', name: 'The Ambush' }
      if (text === 'Gandalf') return { type: 'character', id: 'char-1', name: 'Gandalf' }
      return null
    })
    const onNavigate = vi.fn()
    render(<FindingCard finding={baseFinding} resolveRef={resolveRef} onNavigate={onNavigate} />)

    // Expand the card to reveal affectedRefs
    fireEvent.click(screen.getByLabelText('Expand'))

    const locationLink = screen.getByTitle('Open scene: The Ambush')
    fireEvent.click(locationLink)
    expect(onNavigate).toHaveBeenCalledWith({ type: 'scene', id: 'scene-1', name: 'The Ambush' })

    const gandalfLink = screen.getByTitle('Open character: Gandalf')
    fireEvent.click(gandalfLink)
    expect(onNavigate).toHaveBeenCalledWith({ type: 'character', id: 'char-1', name: 'Gandalf' })

    // Unmatched ref stays plain text, not a button
    expect(screen.queryByRole('button', { name: /Someone Not In The Story/ })).toBeNull()
    expect(screen.getByText('Someone Not In The Story')).toBeTruthy()
  })
})
