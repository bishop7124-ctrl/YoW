// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditingElsewhereWarning from './EditingElsewhereWarning.jsx'

vi.mock('./Modal.jsx', () => ({
  default: ({ title, children }) => <div aria-label={title}>{children}</div>,
}))

describe('EditingElsewhereWarning', () => {
  it('does not offer an unsafe simultaneous-edit override', () => {
    render(<EditingElsewhereWarning label="scene" onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Return to read-only' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit anyway' })).toBeNull()
    expect(screen.getByText(/protect both copies/i)).toBeTruthy()
  })
})
