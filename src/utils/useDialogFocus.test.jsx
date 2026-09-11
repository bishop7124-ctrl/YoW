// @vitest-environment jsdom
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useDialogFocus } from './useDialogFocus'

afterEach(cleanup)

function Dialog({ onClose }) {
  const ref = useRef(null)
  useDialogFocus(ref, onClose)
  return <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>
    <button>First</button>
    <button>Last</button>
  </div>
}

function Harness() {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Open editor</button>
    {open && <Dialog onClose={() => setOpen(false)} />}
  </>
}

function NestedHarness() {
  const parentRef = useRef(null)
  const confirmationRef = useRef(null)
  const [confirming, setConfirming] = useState(false)
  useDialogFocus(parentRef, () => {})
  useDialogFocus(confirmationRef, () => setConfirming(false), confirming)
  return <div ref={parentRef} role="dialog" aria-modal="true" aria-label="Editor" tabIndex={-1}>
    <button onClick={() => setConfirming(true)}>Discard changes</button>
    {confirming && <div ref={confirmationRef} role="alertdialog" aria-modal="true" aria-label="Confirm discard" tabIndex={-1}>
      <button>Keep editing</button>
    </div>}
  </div>
}

describe('useDialogFocus', () => {
  it('contains tab focus, handles Escape, and restores the trigger', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open editor' })
    trigger.focus()
    fireEvent.click(trigger)
    const first = screen.getByRole('button', { name: 'First' })
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus from a nested confirmation to its parent control', () => {
    render(<NestedHarness />)
    const trigger = screen.getByRole('button', { name: 'Discard changes' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('alertdialog', { name: 'Confirm discard' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
