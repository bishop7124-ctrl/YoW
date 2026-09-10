// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CatalogueTab } from './ManuscriptInspector'

afterEach(cleanup)

describe('Manuscript Catalogue', () => {
  it('makes every large-collection entry reachable and searchable', () => {
    const characters = Array.from({ length: 125 }, (_, index) => ({
      id: `character-${index + 1}`,
      name: `Archivist ${String(index + 1).padStart(3, '0')}`,
      bio: index === 124 ? 'Keeps the final winter chronicle.' : 'Keeps the archive.',
      notes: 'Portrait-generation note that should not replace the biography.',
    }))

    render(<CatalogueTab characters={characters} onEntityClick={vi.fn()} />)

    expect(screen.getByText('1–40 of 125')).toBeTruthy()
    expect(screen.queryByText('Archivist 125')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('121–125 of 125')).toBeTruthy()
    expect(screen.getByText('Archivist 125')).toBeTruthy()
    expect(screen.getByText('Keeps the final winter chronicle.')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search characters' }), { target: { value: 'Archivist 125' } })
    expect(screen.getByText('1–1 of 1')).toBeTruthy()
    expect(screen.getByText('Archivist 125')).toBeTruthy()
  })

  it('exposes every promised reference category', () => {
    render(<CatalogueTab
      factions={[{ id: 'f', name: 'Wardens' }]}
      timeline={[{ id: 't', title: 'The Thaw' }]}
      ideaEntries={[{ id: 'i', title: 'A secret bargain' }]}
      storySchedule={[{ id: 's', title: 'Session zero' }]}
      rpgCharacters={[{ id: 'p', name: 'Mara' }]}
      onEntityClick={vi.fn()}
    />)

    for (const name of ['Factions', 'Timeline', 'Ideas', 'Schedule', 'Party']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy()
    }
  })
})
