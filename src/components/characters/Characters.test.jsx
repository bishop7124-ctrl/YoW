// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Characters from './Characters.jsx'

const baseStore = (overrides = {}) => ({
  characters: [],
  saveCharacter: vi.fn(),
  saveCharacterJourney: vi.fn(),
  deleteCharacter: vi.fn(),
  selectedCharacterId: null,
  setSelectedCharacterId: vi.fn(),
  factions: [],
  currentYear: 0,
  loreEntries: [],
  timeline: [],
  chapters: [],
  scenes: [],
  setSelectedLoreEntryId: vi.fn(),
  ...overrides,
})

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('Characters', () => {
  it('repairs a stale selected character id instead of leaving the profile blank', async () => {
    const setSelectedCharacterId = vi.fn()

    render(<Characters store={baseStore({
      characters: [
        { id: 'char-1', novelId: 'novel-1', name: 'Rowan Vale', role: 'Protagonist' },
        { id: 'char-2', novelId: 'novel-1', name: 'Elia Marent', role: 'Princess' },
      ],
      selectedCharacterId: 'missing-character',
      setSelectedCharacterId,
    })} />)

    await waitFor(() => {
      expect(setSelectedCharacterId).toHaveBeenCalledWith('char-2')
    })
  })
})
