// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))

import AliasesField from './AliasesField'

const data = {
  characters: [{ id: 'c1', name: 'Mira Vale' }],
  locations: [{ id: 'l1', name: 'Ashport', aliases: ['the Harbour'] }],
}

function Harness({ initial = [], ownName = 'Tomas', self = { list: 'characters', id: 'c2' }, onChangeSpy }) {
  const [aliases, setAliases] = useState(initial)
  return <AliasesField value={aliases} ownName={ownName} data={data} self={self} onChange={next => { setAliases(next); onChangeSpy?.(next) }} />
}

describe('AliasesField', () => {
  beforeEach(() => { flag.on = true })
  afterEach(cleanup)

  it('renders nothing while the flag is off', () => {
    flag.on = false
    const { container } = render(<Harness />)
    expect(container.innerHTML).toBe('')
  })

  it('adds an alias on Enter and on comma, and removes it again', () => {
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} />)
    const input = screen.getByLabelText('Other names')
    fireEvent.change(input, { target: { value: 'the Smith' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'Old Tom' } })
    fireEvent.keyDown(input, { key: ',' })
    expect(spy).toHaveBeenLastCalledWith(['the Smith', 'Old Tom'])
    fireEvent.click(screen.getByLabelText('Remove other name the Smith'))
    expect(spy).toHaveBeenLastCalledWith(['Old Tom'])
  })

  it('adds a pending alias when the field loses focus, and ignores the record\'s own name and duplicates', () => {
    const spy = vi.fn()
    render(<Harness onChangeSpy={spy} initial={['Old Tom']} />)
    const input = screen.getByLabelText('Other names')
    fireEvent.change(input, { target: { value: 'tomas, old tom, Wren' } })
    fireEvent.blur(input)
    expect(spy).toHaveBeenLastCalledWith(['Old Tom', 'Wren'])
  })

  it('warns, without blocking, when a name or alias is used by another record', () => {
    render(<Harness initial={['the Harbour', 'Mira Vale', 'Fresh']} />)
    const notes = screen.getAllByRole('status').map(n => n.textContent)
    expect(notes).toHaveLength(2)
    expect(notes[0]).toMatch(/“the Harbour” is also used by Ashport \(location\)/)
    expect(notes[1]).toMatch(/“Mira Vale” is also used by Mira Vale \(character\)/)
  })

  it('does not submit a surrounding form when Enter is pressed in it', () => {
    const submit = vi.fn(e => e.preventDefault())
    render(<form onSubmit={submit}><Harness /></form>)
    const input = screen.getByLabelText('Other names')
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'x1' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(submit).not.toHaveBeenCalled()
  })
})
