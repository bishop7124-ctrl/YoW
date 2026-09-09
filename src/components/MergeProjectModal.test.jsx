// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import MergeProjectModal from './MergeProjectModal.jsx'

afterEach(cleanup)

// Minimal store double — only what MergeProjectModal reads (novels,
// getProjectExportData, activeNovelId) is exercised in these render-level
// tests. The actual populate-on-merge commit (which needs activeNovelId to
// settle across a re-render, mirroring AIImportModal's own phase-2 pattern)
// is covered live by tests/e2e/import-into-existing-project.spec.js-style
// browser coverage rather than simulated here, matching how AIImportModal
// itself is tested — see AIImportModal.test.js.
function mockStore(novels, overrides = {}) {
  return {
    novels,
    activeNovelId: overrides.activeNovelId ?? novels[0]?.id ?? null,
    setActiveNovelId: () => {},
    getProjectExportData: (id) => {
      const found = novels.find(n => n.id === id)
      if (!found) return null
      return {
        project: found,
        characters: found.characters || [],
        factions: [], locations: [], loreEntries: [], worldHistory: [], timeline: [],
        acts: [], chapters: [], scenes: [], rpgCharacters: [], ideaEntries: [], maps: [], storySchedule: [],
        ...(found.type === 'comic' ? { comicPages: [], comicPanels: [] } : {}),
      }
    },
    ...overrides,
  }
}

describe('MergeProjectModal', () => {
  it('shows an empty state when there is no other compatible project to merge from', () => {
    const store = mockStore([{ id: 'dest-1', type: 'novel', title: 'Destination' }])
    render(<MergeProjectModal store={store} project={store.novels[0]} onClose={() => {}} />)
    expect(screen.getByText(/don't have another project of a compatible type/i)).toBeTruthy()
  })

  it('lists other same-comic-ness projects as merge sources, excluding the destination itself', () => {
    const novels = [
      { id: 'dest-1', type: 'novel', title: 'Destination' },
      { id: 'src-1', type: 'novel', title: 'Source Novel' },
      { id: 'src-2', type: 'dnd_campaign', title: 'Source Campaign' },
      { id: 'comic-1', type: 'comic', title: 'A Comic' },
    ]
    const store = mockStore(novels)
    render(<MergeProjectModal store={store} project={novels[0]} onClose={() => {}} />)

    const select = screen.getByLabelText(/merge from/i)
    const optionLabels = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    expect(optionLabels).toContain('Source Novel')
    expect(optionLabels).toContain('Source Campaign')
    expect(optionLabels).not.toContain('A Comic')
    expect(optionLabels).not.toContain('Destination')
  })

  it('only offers comic sources when the destination is itself a comic project', () => {
    const novels = [
      { id: 'dest-1', type: 'comic', title: 'Destination Comic' },
      { id: 'src-1', type: 'novel', title: 'Source Novel' },
      { id: 'comic-1', type: 'comic', title: 'Other Comic' },
    ]
    const store = mockStore(novels)
    render(<MergeProjectModal store={store} project={novels[0]} onClose={() => {}} />)

    const select = screen.getByLabelText(/merge from/i)
    const optionLabels = Array.from(select.querySelectorAll('option')).map(o => o.textContent)
    expect(optionLabels).toContain('Other Comic')
    expect(optionLabels).not.toContain('Source Novel')
  })

  it('shows a content checklist once a source is picked, and the Merge in button stays disabled until then', () => {
    const novels = [
      { id: 'dest-1', type: 'novel', title: 'Destination' },
      { id: 'src-1', type: 'novel', title: 'Source Novel', characters: [{ id: 'c1', name: 'Ada' }] },
    ]
    const store = mockStore(novels)
    render(<MergeProjectModal store={store} project={novels[0]} onClose={() => {}} />)

    const mergeButton = screen.getByRole('button', { name: /merge in/i })
    expect(mergeButton.disabled).toBe(true)

    const select = screen.getByLabelText(/merge from/i)
    fireEvent.change(select, { target: { value: 'src-1' } })

    expect(screen.getByText(/1 character/i)).toBeTruthy()
    expect(mergeButton.disabled).toBe(false)
  })

  it('disables Merge in again if every content checkbox is unchecked', () => {
    const novels = [
      { id: 'dest-1', type: 'novel', title: 'Destination' },
      { id: 'src-1', type: 'novel', title: 'Source Novel', characters: [{ id: 'c1', name: 'Ada' }] },
    ]
    const store = mockStore(novels)
    render(<MergeProjectModal store={store} project={novels[0]} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText(/merge from/i), { target: { value: 'src-1' } })
    const mergeButton = screen.getByRole('button', { name: /merge in/i })
    expect(mergeButton.disabled).toBe(false)

    fireEvent.click(screen.getByRole('checkbox'))
    expect(mergeButton.disabled).toBe(true)
  })
})
