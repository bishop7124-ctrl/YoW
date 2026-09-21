// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AIPanel from './AIPanel.jsx'
import { AI_SETTINGS_KEY } from '../../utils/aiSettings.js'

const makeStore = (overrides = {}) => {
  const projectData = {
    activeNovelId: 'project-1',
    activeNovel: { id: 'project-1', title: 'Test Project', type: 'novel' },
    selectedCharacterId: null,
    writingSceneId: null,
    characters: [],
    locations: [],
    loreEntries: [],
    timeline: [],
    worldHistory: [],
    ideaEntries: [],
    acts: [],
    chapters: [],
    scenes: [],
    ...overrides,
  }
  return {
    ...projectData,
    novels: [{ id: 'project-1', title: 'Test Project', type: 'novel', aiChatSessions: [] }],
    getProjectContextData: () => projectData,
    updateNovel: () => {},
  }
}

describe('AIPanel', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = () => {}
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({
      activeProvider: 'openrouter',
      openrouter: { apiKey: 'test-key', model: 'google/gemma-3-27b-it' },
    }))
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('opens the new-chat Context selector without requiring a passed aiSettings prop', () => {
    render(<AIPanel store={makeStore()} open membership={{ isFree: false }} />)
    fireEvent.click(screen.getByText('+ New chat'))
    expect(screen.getByText('Context')).toBeTruthy()
    expect(screen.getByText('Smart Context')).toBeTruthy()
    expect(screen.getByText(/Estimated context/)).toBeTruthy()
  })

  const richProject = {
    characters: [
      { id: 'c1', name: 'Mira Vale', role: 'Botanist', bio: 'Studies silver trees. '.repeat(40), relationships: [] },
      { id: 'c2', name: 'Orren Pike', role: 'Cartographer', bio: 'Maps roads.', relationships: [] },
    ],
    acts: [{ id: 'a1', title: 'Act One', novelId: 'project-1', order: 1 }],
    chapters: [{ id: 'ch1', title: 'The Silver Gate', novelId: 'project-1', actId: 'a1', order: 1 }],
    scenes: [{ id: 's1', title: 'Gate', novelId: 'project-1', chapterId: 'ch1', order: 1, content: 'Mira enters the orchard.' }],
  }

  it('lets you hand-pick records and see the token estimate change', () => {
    render(<AIPanel store={makeStore(richProject)} open membership={{ isFree: false }} />)
    fireEvent.click(screen.getByText('+ New chat'))
    fireEvent.click(screen.getByText('Choose Records'))

    const estimate = () => screen.getByTestId('ai-context-estimate').textContent
    expect(estimate()).toMatch(/Nothing is selected/)
    const before = estimate().match(/~(\S+) tokens/)[1]

    fireEvent.click(screen.getByText('Characters').closest('summary'))
    fireEvent.click(screen.getByLabelText(/Mira Vale/))
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(estimate()).not.toMatch(/Nothing is selected/)
    expect(estimate().match(/~(\S+) tokens/)[1]).not.toBe(before)

    fireEvent.click(screen.getByText('Start Chat'))
    expect(screen.getByTitle('Change what the AI can see in this chat').textContent).toMatch(/Choose Records/)
  })

  it('shows a chapter picker for Current Chapter that follows the open scene by default', () => {
    render(<AIPanel store={{ ...makeStore(richProject), writingSceneId: 's1' }} open membership={{ isFree: false }} />)
    fireEvent.click(screen.getByText('+ New chat'))
    fireEvent.click(screen.getByText('Current Chapter'))

    const picker = screen.getByLabelText('Which chapter?')
    expect(picker.value).toBe('')
    expect(screen.getByText(/Follow the editor \(now: The Silver Gate\)/)).toBeTruthy()
    fireEvent.change(picker, { target: { value: 'ch1' } })
    expect(screen.getByLabelText('Which chapter?').value).toBe('ch1')
  })

  it('reopens the context dialog from inside a chat', () => {
    render(<AIPanel store={makeStore(richProject)} open membership={{ isFree: false }} />)
    fireEvent.click(screen.getByText('+ New chat'))
    fireEvent.click(screen.getByText('Start Chat'))
    fireEvent.click(screen.getByTitle('Change what the AI can see in this chat'))
    expect(screen.getByText('Chat context')).toBeTruthy()
    fireEvent.click(screen.getByText('Choose Records'))
    fireEvent.click(screen.getByText('Save context'))
    expect(screen.queryByText('Chat context')).toBeNull()
    expect(screen.getByTitle('Change what the AI can see in this chat').textContent).toMatch(/Choose Records/)
  })
})
