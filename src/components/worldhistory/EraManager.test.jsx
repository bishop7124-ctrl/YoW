// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import EraManager from './EraManager'

afterEach(cleanup)
const eras = [{ id: 'a', name: 'First', startYear: -10, endYear: 0 }, { id: 'b', name: 'Second', startYear: 1 }]

describe('Era Manager', () => {
  it('keeps one form open, preserving its draft until save or cancel', () => {
    render(<EraManager eras={eras} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByRole('button', { name: '+ Add Era' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Edit' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Era name *'), { target: { value: 'Draft' } })
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add Era' }))
    expect(screen.getByLabelText('Era name *').value).toBe('')
  })

  it('validates backwards years and keeps refused-save drafts with accessible fields', () => {
    const addEra = vi.fn().mockReturnValue(null)
    render(<EraManager eras={[]} addEra={addEra} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add Era' }))
    for (const [label, value] of [['Era name *', 'Age'], ['Start year', '5'], ['End year', '0']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(addEra).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('End year')
    fireEvent.change(screen.getByLabelText('End year'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(addEra).toHaveBeenCalledWith({ name: 'Age', startYear: 5, endYear: null })
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
    expect(screen.getByLabelText('Era name *').value).toBe('Age')
  })

  it('recovers when the era being edited is removed externally', () => {
    const { rerender } = render(<EraManager eras={eras} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    rerender(<EraManager eras={[eras[1]]} />)
    expect(screen.getByRole('button', { name: '+ Add Era' }).disabled).toBe(false)
    expect(screen.queryByLabelText('Era name *')).toBeNull()
  })
})
