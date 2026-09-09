// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ChronicleEntryForm from './ChronicleEntryForm'

afterEach(cleanup)
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const eras = [{ id: 'old', name: 'Old', startYear: -10, endYear: 0 }, { id: 'new', name: 'New', startYear: 1, endYear: 1000 }]

describe('ChronicleEntryForm', () => {
  it('edits numeric dates and preserves range endpoints on unrelated edits', () => {
    const onSave = vi.fn()
    render(<ChronicleEntryForm initial={{ title: 'Range', date: 0, startYear: 0, endYear: 20 }} onSave={onSave} />)
    expect(screen.getByLabelText('Date / Time').value).toBe('0 – 20')
    change('Description', 'New text')
    save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startYear: 0, endYear: 20, description: 'New text' }))
  })

  it('infers an era from the same BCE/year parser used in the timeline, then honors explicit None', () => {
    const onSave = vi.fn()
    render(<ChronicleEntryForm eras={eras} onSave={onSave} />)
    change('Title *', 'Founding')
    change('Date / Time', '5 BCE')
    expect(screen.getByLabelText('Era').value).toBe('old')
    change('Era', '')
    change('Date / Time', 'Year 55')
    expect(screen.getByLabelText('Era').value).toBe('')
    save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ eraId: null, era: '', startYear: 55 }))
  })

  it('does not let date text overwrite the history start-year era assignment', () => {
    render(<ChronicleEntryForm kind="worldhistory" initial={{ title: 'Range', startYear: -5, date: 'Year 50' }} eras={eras} onSave={vi.fn()} />)
    expect(screen.getByLabelText('Era').value).toBe('old')
  })

  it('preserves a precise timeline date when editing its description from History', () => {
    const onSave = vi.fn()
    render(<ChronicleEntryForm kind="worldhistory" initial={{ title: 'Dated', startYear: 12, date: 'Year 12, First Month' }} onSave={onSave} />)
    change('Content', 'Changed')
    save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ date: 'Year 12, First Month', dateRange: 'Year 12, First Month' }))
  })

  it('validates year ranges and saves exponent notation without truncation', () => {
    const onSave = vi.fn()
    render(<ChronicleEntryForm kind="worldhistory" onSave={onSave} />)
    change('Title *', 'Age')
    change('Start year', '1e3')
    change('End year', '999')
    save()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('End year')
    change('End year', '1001')
    save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startYear: 1000, endYear: 1001 }))
  })

  it('keeps a refused-save draft and includes a pending tag on submission', () => {
    const onSave = vi.fn().mockReturnValue(false)
    render(<ChronicleEntryForm initial={{ title: 'Draft' }} onSave={onSave} />)
    change('Tags', 'pending')
    save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tags: ['pending'] }))
    expect(screen.getByRole('alert').textContent).toContain('could not be saved')
    expect(screen.getByLabelText('Title *').value).toBe('Draft')
  })

  it.each(['', 'Before time'])('allows an undated history edit without inventing a year for "%s"', dateRange => {
    const onSave = vi.fn()
    render(<ChronicleEntryForm kind="worldhistory" initial={{ title: 'Myth', dateRange, content: 'Old' }} onSave={onSave} />)
    change('Content', 'New')
    save()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ content: 'New', startYear: null, endYear: null, dateRange }))
  })

  it('requires a start year when an end year is supplied', () => {
    const onSave = vi.fn()
    render(<ChronicleEntryForm kind="worldhistory" initial={{ title: 'Range' }} onSave={onSave} />)
    change('End year', '9')
    save()
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Enter a start year')
  })
})
