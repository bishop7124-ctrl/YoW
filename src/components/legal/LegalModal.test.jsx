// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import LegalModal from './LegalModal'

afterEach(cleanup)
describe('Legal dialog keyboard access', () => {
  it('keeps focus inside, handles Escape and restores the opener', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const close = vi.fn()
    const view = render(<LegalModal page="privacy" onClose={close} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('not separately encrypted by YOW')
    expect(dialog.textContent).toContain('FileVault on Mac, BitLocker on Windows')
    expect(document.activeElement).toBe(dialog)
    const links = dialog.querySelectorAll('a[href],button:not([disabled])')
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(links[links.length - 1])
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(links[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
  it('names cookie switches and keeps focus when navigating policies', () => {
    const view = render(<LegalModal page="cookies" onClose={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Preferences' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Analytics' })).toBeTruthy()
    view.rerender(<LegalModal page="terms" onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })
})
