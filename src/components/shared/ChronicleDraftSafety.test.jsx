// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import Modal from './Modal'
import ChronicleEntryForm from './ChronicleEntryForm'
import EraManager from '../worldhistory/EraManager'

afterEach(cleanup)

describe('Chronicle draft safety in the real sheet', () => {
  it('still asks before discarding after a refused save, including a retry from the prompt', () => {
    const onClose = vi.fn()
    const onSave = vi.fn().mockReturnValue(false)
    render(<Modal title="History" onClose={onClose}><ChronicleEntryForm kind="worldhistory" initial={{ title: 'Draft' }} onSave={onSave} /></Modal>)
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Unsaved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not flag a successfully saved era as an unsaved draft', () => {
    const onClose = vi.fn()
    render(<Modal title="Eras" onClose={onClose}><EraManager eras={[]} addEra={vi.fn().mockReturnValue({ id: 'saved' })} /></Modal>)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Era' }))
    fireEvent.change(screen.getByLabelText('Era name *'), { target: { value: 'Era' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
