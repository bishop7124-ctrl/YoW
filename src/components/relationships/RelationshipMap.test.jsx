// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import RelationshipMap from './RelationshipMap.jsx'

afterEach(cleanup)

const renderMap = (store = {}) => render(<RelationshipMap store={{
  characters: [
    {
      id: 'kael',
      name: 'Kael Morven',
      relationships: [{ targetId: 'petra', type: 'friend' }],
    },
    {
      id: 'petra',
      name: 'Petra Solace',
      relationships: [],
    },
    {
      id: 'mira',
      name: 'Mira Morven',
      parentIds: ['kael'],
      relationships: [],
    },
  ],
  factions: [],
  selectedCharacterId: 'kael',
  setSelectedCharacterId: vi.fn(),
  saveCharacter: vi.fn(),
  ...store,
}} />)

describe('RelationshipMap', () => {
  it('renders mixed social and read-only family connections without crashing', () => {
    renderMap()

    expect(screen.getAllByText('Kael Morven').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Petra Solace').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mira Morven').length).toBeGreaterThan(0)
    expect(screen.getByText('from family tree')).toBeTruthy()
  })
})
