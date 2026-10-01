// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  FLOATING_SUPPORT_MINIMIZED_KEY,
  FloatingSupportLink,
  KOFI_SUPPORT_URL,
} from './SupportDevelopmentLink'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('FloatingSupportLink', () => {
  it('links to Ko-fi and persists its minimized state', () => {
    const view = render(<FloatingSupportLink />)
    const link = screen.getByRole('link', { name: 'Buy me a coffee' })
    expect(link.getAttribute('href')).toBe(KOFI_SUPPORT_URL)

    fireEvent.click(screen.getByRole('button', { name: 'Minimise Buy me a coffee link' }))
    expect(localStorage.getItem(FLOATING_SUPPORT_MINIMIZED_KEY)).toBe('1')
    const compactButton = screen.getByRole('button', { name: 'Expand Buy me a coffee link' })
    expect(compactButton.querySelector('.floating-support-coffee-icon')).toBeTruthy()
    expect(compactButton.textContent).toBe('')

    view.unmount()
    render(<FloatingSupportLink />)
    expect(screen.getByRole('button', { name: 'Expand Buy me a coffee link' })).toBeTruthy()
  })

  it('can restore the full link from its compact icon', () => {
    localStorage.setItem(FLOATING_SUPPORT_MINIMIZED_KEY, '1')
    render(<FloatingSupportLink />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand Buy me a coffee link' }))

    expect(localStorage.getItem(FLOATING_SUPPORT_MINIMIZED_KEY)).toBe('0')
    expect(screen.getByRole('link', { name: 'Buy me a coffee' })).toBeTruthy()
  })
})
