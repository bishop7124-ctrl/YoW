// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AIAssistant from './AIAssistant.jsx'
import { AI_SETTINGS_KEY } from '../../utils/aiSettings.js'
import { streamMessage } from '../../utils/aiApi.js'

vi.mock('../../utils/aiApi.js', () => ({
  PROVIDERS: {
    openrouter: { name: 'OpenRouter', defaultModel: 'test-model' },
  },
  streamMessage: vi.fn(),
}))

const renderAssistant = ({ section = 'dashboard', store = {
  activeNovelId: 'project-1',
  activeNovel: { id: 'project-1', title: 'Project One' },
} } = {}) => render(
  <AIAssistant
    section={section}
    store={store}
  />
)

describe('AIAssistant', () => {
  beforeEach(() => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({
      activeProvider: 'openrouter',
      openrouter: { apiKey: 'test-key', model: 'test-model' },
    }))
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('restores the submitted chat bar message when the AI request fails', async () => {
    streamMessage.mockImplementation(({ onError }) => {
      onError('The provider is temporarily unavailable.')
    })

    renderAssistant()

    const input = screen.getByPlaceholderText(/Ask about your project/)
    fireEvent.change(input, { target: { value: 'Help me fix chapter two' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Help me fix chapter two')).toBeTruthy()
    })
    expect(screen.getByText('The provider is temporarily unavailable.')).toBeTruthy()
  })

  it('keeps generated scene synopsis and content when the action is confirmed', async () => {
    streamMessage.mockImplementation(({ onChunk, onDone }) => {
      onChunk(JSON.stringify({ action: 'create', type: 'scene', data: { title: 'Arrival', synopsis: 'They reach the gate.', content: 'Rain hit the road.' } }))
      onDone()
    })
    const addScene = vi.fn(() => ({ id: 'scene-new' }))
    const updateScene = vi.fn()
    renderAssistant({
      section: 'manuscript',
      store: {
        activeNovelId: 'project-1',
        activeNovel: { id: 'project-1', title: 'Project One', aiChatSessions: [] },
        chapters: [{ id: 'chapter-1', title: 'Chapter One' }],
        addScene,
        updateScene,
        updateNovel: vi.fn(),
      },
    })
    const input = screen.getByPlaceholderText(/Ask about your story/)
    fireEvent.change(input, { target: { value: 'Add an arrival scene' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add scene' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    expect(addScene).toHaveBeenCalledWith('chapter-1', 'Arrival')
    expect(updateScene).toHaveBeenCalledWith('scene-new', { synopsis: 'They reach the gate.', content: 'Rain hit the road.' })
  })

  // Regression: recordAiBarExchange(store, args) has two call sites in
  // send()'s onDone — the JSON.parse-succeeded branch above, and this
  // non-JSON-response catch branch (exactly what a real provider/model that
  // doesn't return strict JSON produces, and what src/utils/offlineMock.js's
  // canned response always produces). The catch branch previously called
  // recordAiBarExchange({ novelId, ... }) with only one argument — `store`
  // silently received the args object and the real `args` was `undefined`,
  // so the exchange was silently dropped (a caught, logged exception) instead
  // of being saved via store.updateNovel, contradicting the "AI chats were
  // not saving as durable project entries" Bugs-table row's "Fixed" claim
  // for any non-JSON response. Found live via a real browser QA pass
  // (docs/ROADMAP.md, 2026-09-10) using the OFFLINE_MODE mock, which returns
  // exactly this kind of plain-text response.
  it('saves a non-JSON response to the project aiChatSessions via store.updateNovel', async () => {
    streamMessage.mockImplementation(({ onChunk, onDone }) => {
      onChunk('This is a plain-text answer, not JSON.')
      onDone()
    })
    const updateNovel = vi.fn()
    renderAssistant({
      store: {
        activeNovelId: 'project-1',
        activeNovel: { id: 'project-1', title: 'Project One', aiChatSessions: [] },
        updateNovel,
      },
    })
    const input = screen.getByPlaceholderText(/Ask about your project/)
    fireEvent.change(input, { target: { value: 'What should happen next?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(updateNovel).toHaveBeenCalled())
    const [novelId, patch] = updateNovel.mock.calls[0]
    expect(novelId).toBe('project-1')
    const messages = patch.aiChatSessions[0].messages
    expect(messages.some(m => m.role === 'user' && m.content === 'What should happen next?')).toBe(true)
    expect(messages.some(m => m.role === 'assistant' && m.content === 'This is a plain-text answer, not JSON.')).toBe(true)
  })
})
