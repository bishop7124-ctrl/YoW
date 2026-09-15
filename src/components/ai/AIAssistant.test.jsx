// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AIAssistant from './AIAssistant.jsx'

// Regression coverage for a real bug found during 2026-09-15 browser QA of the
// "AI chats not durable" fix: when the assistant's raw reply is NOT valid JSON
// (the normal case for any provider/model that doesn't strictly follow the
// app's internal {action,...} schema — including VITE_OFFLINE_MODE's own
// canned response), the bottom AI bar's exchange must still be saved to the
// active project's `aiChatSessions`, not silently dropped. A prior version of
// this fallback path called the shared `recordAiBarExchange(args)` helper
// with a single argument instead of `(store, args)`, which threw inside its
// own try/catch and only logged a console.warn — the exchange was never
// persisted anywhere.
vi.mock('../../utils/aiApi', () => ({
  PROVIDERS: { openrouter: { defaultModel: 'test-model' } },
  streamMessage: vi.fn(({ onDone }) => {
    // Simulate a plain-text (non-JSON) assistant reply, exactly like
    // offlineMock.js's canned response or any real model that doesn't emit
    // the app's internal JSON action schema.
    onDone()
  }),
}))

vi.mock('../../utils/aiSettings', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    loadAiSettings: vi.fn(() => ({
      activeProvider: 'openrouter',
      openrouter: { apiKey: 'test-key', model: 'test-model' },
    })),
  }
})

import { streamMessage } from '../../utils/aiApi'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeStore(overrides = {}) {
  const activeNovel = { id: 'novel-1', aiChatSessions: [], ...overrides.activeNovel }
  return {
    activeNovelId: 'novel-1',
    activeNovel,
    updateNovel: vi.fn(),
    characters: [], locations: [], factions: [], timeline: [], worldHistory: [], ideaEntries: [],
    ...overrides,
  }
}

describe('AIAssistant bottom bar — chat history persistence', () => {
  it('saves the exchange to aiChatSessions even when the reply is not valid JSON', async () => {
    // Accumulate some plain, non-JSON text via onChunk before onDone fires.
    streamMessage.mockImplementation(({ onChunk, onDone }) => {
      onChunk('This is a plain-text canned reply, not JSON.')
      onDone()
    })

    const store = makeStore()
    render(<AIAssistant store={store} section="dashboard" />)

    const input = screen.getByPlaceholderText('Ask about your project…')
    fireEvent.change(input, { target: { value: 'Tell me about my project' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(store.updateNovel).toHaveBeenCalled())

    const [novelId, patch] = store.updateNovel.mock.calls[0]
    expect(novelId).toBe('novel-1')
    expect(Array.isArray(patch.aiChatSessions)).toBe(true)
    expect(patch.aiChatSessions.length).toBeGreaterThan(0)

    const session = patch.aiChatSessions[0]
    expect(session.messages.some(m => m.role === 'user' && m.content === 'Tell me about my project')).toBe(true)
    expect(session.messages.some(m => m.role === 'assistant' && m.content.includes('plain-text canned reply'))).toBe(true)
  })

  it('still saves the exchange when the reply IS valid JSON (existing success path, unaffected)', async () => {
    streamMessage.mockImplementation(({ onChunk, onDone }) => {
      onChunk(JSON.stringify({ action: 'answer', message: 'A structured JSON answer.' }))
      onDone()
    })

    const store = makeStore()
    render(<AIAssistant store={store} section="dashboard" />)

    const input = screen.getByPlaceholderText('Ask about your project…')
    fireEvent.change(input, { target: { value: 'What should I work on next?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(store.updateNovel).toHaveBeenCalled())

    const [, patch] = store.updateNovel.mock.calls[0]
    const session = patch.aiChatSessions[0]
    expect(session.messages.some(m => m.role === 'assistant' && m.content === 'A structured JSON answer.')).toBe(true)
  })
})
