// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Factions from './Factions'
import { deleteUserMedia } from '../../utils/uploadUserMedia'

vi.mock('../../utils/uploadUserMedia', () => ({ deleteUserMedia: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./FactionLogo', () => ({ default: () => null }))
// Stands in for the logo editor: one button that swaps the logo for a new image.
vi.mock('./LogoEditorModal', () => ({
  default: ({ onChange, onClose }) => (
    <button type="button" onClick={() => { onChange({ image: 'yow-media:user/new-logo.webp' }); onClose() }}>Pick new logo</button>
  ),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const faction = { id: 'f1', name: 'Guild', logo: { image: 'yow-media:user/old-logo.webp' }, description: '' }
const storeWith = (saveFaction) => ({
  factions: [faction],
  saveFaction,
  deleteFaction: vi.fn(),
  characters: [],
  setSelectedCharacterId: vi.fn(),
  refreshStorageUsedBytes: vi.fn().mockResolvedValue(0),
})

const replaceLogoAndSave = () => {
  fireEvent.click(screen.getAllByText('Edit')[0])
  fireEvent.click(screen.getByText('Edit Logo'))
  fireEvent.click(screen.getByText('Pick new logo'))
  fireEvent.click(screen.getByText('Save Faction'))
}

describe('faction logo replacement (audit YOW-15)', () => {
  it('keeps the old logo when the save is refused', () => {
    render(<Factions store={storeWith(vi.fn(() => null))} />)
    replaceLogoAndSave()
    expect(deleteUserMedia).not.toHaveBeenCalled()
  })

  it('leaves cleanup of the replaced logo to the store, which only runs it after a successful save', () => {
    const saveFaction = vi.fn((data, id) => ({ id, ...data }))
    render(<Factions store={storeWith(saveFaction)} />)
    replaceLogoAndSave()
    expect(saveFaction).toHaveBeenCalled()
    expect(deleteUserMedia).not.toHaveBeenCalled()
  })
})
