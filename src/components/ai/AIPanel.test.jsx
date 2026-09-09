// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AIPanel from './AIPanel.jsx'
import { AI_SETTINGS_KEY } from '../../utils/aiSettings.js'

const makeStore = () => {
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
})
