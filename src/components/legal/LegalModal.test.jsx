// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import LegalModal from './LegalModal'
import { GRACE_DAYS, FREE_INACTIVITY_MONTHS } from '../../utils/cloudLifecycle'

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
  it('states the cloud-expiry and inactivity rules the lifecycle engine enforces', () => {
    const privacy = render(<LegalModal page="privacy" onClose={() => {}} />)
    const privacyText = screen.getByRole('dialog').textContent
    expect(privacyText).toContain(`${FREE_INACTIVITY_MONTHS} months`)
    expect(privacyText).toContain(`${GRACE_DAYS}-day grace period`)
    expect(privacyText).not.toContain('within 30 days')
    privacy.unmount()
    render(<LegalModal page="terms" onClose={() => {}} />)
    const termsText = screen.getByRole('dialog').textContent
    expect(termsText).toContain(`${GRACE_DAYS}-day grace period`)
    expect(termsText).toContain('archived rather than deleted')
  })
})
