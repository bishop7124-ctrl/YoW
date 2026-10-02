// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import CharacterBuilder from './CharacterBuilder.jsx'
import NeutralCharacterSheet from './NeutralCharacterSheet.jsx'
import { isNeutralSheet, makeNeutralCharacter, normalizeRpgCharacter, getRpgCharacterSummary } from './rpgData'

afterEach(cleanup)

describe('neutral character data', () => {
  it('flags neutral sheets and leaves 5E characters untouched', () => {
    const neutral = makeNeutralCharacter('p1', { name: 'Vex', concept: 'Smuggler', system: 'Homebrew', preset: 'simple' })
    expect(isNeutralSheet(neutral)).toBe(true)
    expect(neutral.neutral.stats.map(s => s.name)).toEqual(['Body', 'Mind', 'Spirit'])
    expect(neutral.neutral.resources[0]).toMatchObject({ name: 'Health', current: 10, max: 10 })
    expect(getRpgCharacterSummary(neutral)).toBe('Smuggler · Homebrew')
    // A legacy record without sheetType is the original 5E sheet and gains no neutral block.
    const legacy = normalizeRpgCharacter({ id: 'c1', novelId: 'p1', name: 'Old', class: 'wizard', level: 3 })
    expect(isNeutralSheet(legacy)).toBe(false)
    expect(legacy.neutral).toBeUndefined()
    expect(getRpgCharacterSummary(legacy)).toBe('Lvl 3 Wizard')
  })

  it('backfills missing neutral arrays on partial records', () => {
    const out = normalizeRpgCharacter({ id: 'n1', novelId: 'p1', sheetType: 'neutral', neutral: { concept: 'Spy' } })
    expect(out.neutral).toMatchObject({ concept: 'Spy', stats: [], resources: [], traits: [], tags: [] })
  })
})

describe('NeutralCharacterSheet', () => {
  it('adds a stat and a tracker without any 5E fields', () => {
    const onUpdate = vi.fn()
    const character = { ...makeNeutralCharacter('p1', { name: 'Vex' }), id: 'n1' }
    render(<NeutralCharacterSheet character={character} onUpdate={onUpdate} onBack={() => {}} store={{}} />)
    expect(screen.queryByText(/Level Up/i)).toBeNull()
    expect(screen.queryByText(/Hit Points/i)).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('New stat name…'), { target: { value: 'Grit' } })
    fireEvent.click(screen.getByText('Add Stat'))
    expect(onUpdate.mock.calls[0][0].neutral.stats[0]).toMatchObject({ name: 'Grit' })
    fireEvent.change(screen.getByPlaceholderText('New tracker name…'), { target: { value: 'Stress' } })
    fireEvent.click(screen.getByText('Add Tracker'))
    expect(onUpdate.mock.calls[1][0].neutral.resources[0]).toMatchObject({ name: 'Stress', current: 10, max: 10 })
  })
})

describe('CharacterBuilder sheet selection', () => {
  function Harness({ type, initial = [] }) {
    const [chars, setChars] = useState(initial)
    const store = {
      activeNovelId: 'p1', activeNovel: { id: 'p1', type }, rpgCharacters: chars,
      saveRpgCharacter: (data, id) => {
        const cid = id || 'new-1'
        setChars(prev => id ? prev.map(c => c.id === id ? { ...c, ...data } : c) : [...prev, { ...data, id: cid }])
        return cid
      },
      deleteRpgCharacter: () => {},
      refreshStorageUsedBytes: () => Promise.resolve(),
    }
    return <CharacterBuilder store={store} />
  }

  it('Tabletop Campaign creates a neutral sheet', () => {
    render(<Harness type="tabletop_rpg" />)
    fireEvent.click(screen.getAllByText(/New Character|Create First Character/)[0])
    expect(screen.getByRole('dialog', { name: 'New character' })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Character name'), { target: { value: 'Vex' } })
    fireEvent.click(screen.getByText('Create Character'))
    expect(screen.getByLabelText('Role or concept')).toBeTruthy()
  })

  it('opens an existing 5E-style character in a tabletop project with the 5E sheet', () => {
    const legacy = normalizeRpgCharacter({ id: 'c1', novelId: 'p1', name: 'Old Hero', class: 'fighter', level: 2 })
    render(<Harness type="tabletop_rpg" initial={[legacy]} />)
    fireEvent.click(screen.getByLabelText('Open Old Hero sheet'))
    expect(screen.getByText(/Level Up/)).toBeTruthy()
  })
})
