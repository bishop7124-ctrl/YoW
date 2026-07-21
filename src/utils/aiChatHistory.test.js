import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendAiBarExchange, getAiChatStorageKey, loadAiChatSessions } from './aiChatHistory'

describe('AI chat history helpers', () => {
  beforeEach(() => {
    const storage = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => storage.get(key) ?? null),
      setItem: vi.fn((key, value) => { storage.set(key, value) }),
    })
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
    })
    vi.stubGlobal('CustomEvent', class {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    })
  })

  it('saves bottom-bar exchanges into a reusable project chat thread', () => {
    appendAiBarExchange({
      novelId: 'project-1',
      section: 'manuscript',
      userText: 'Add an encounter hook',
      assistantText: 'Suggested creating scene: Ambush at the bridge',
    })
    appendAiBarExchange({
      novelId: 'project-1',
      section: 'manuscript',
      userText: 'Give me fallout',
      assistantText: 'The patron demands answers.',
    })

    const sessions = loadAiChatSessions('project-1')

    expect(localStorage.setItem).toHaveBeenCalledWith(getAiChatStorageKey('project-1'), expect.any(String))
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      id: 'ai_bar_project-1',
      title: 'AI bar',
      category: 'AI bar',
      novelId: 'project-1',
    })
    expect(sessions[0].messages.map(m => m.content)).toEqual([
      'Add an encounter hook',
      'Suggested creating scene: Ambush at the bridge',
      'Give me fallout',
      'The patron demands answers.',
    ])
    expect(window.dispatchEvent).toHaveBeenCalledTimes(2)
  })
})
