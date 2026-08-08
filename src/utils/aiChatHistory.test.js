import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendAiBarExchange, appendAiBarExchangeToSessions, getAiChatStorageKey, loadAiChatSessions, mergeAiChatSessions } from './aiChatHistory'

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

  it('can append bottom-bar exchanges to project-backed sessions without localStorage', () => {
    const { nextSession, nextSessions } = appendAiBarExchangeToSessions([], {
      novelId: 'project-1',
      section: 'characters',
      userText: 'Help me name the mentor',
      assistantText: 'Try Mara Vale.',
    })

    expect(nextSession.id).toBe('ai_bar_project-1')
    expect(nextSessions).toHaveLength(1)
    expect(nextSessions[0].messages.map(message => message.content)).toEqual([
      'Help me name the mentor',
      'Try Mara Vale.',
    ])
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('merges legacy local-only chats behind project-backed chats', () => {
    const legacy = [{ id: 'chat-1', novelId: 'project-1', title: 'Legacy', messages: [{ role: 'user', content: 'old' }], updatedAt: 1 }]
    const project = [{ id: 'chat-1', novelId: 'project-1', title: 'Project copy', messages: [{ role: 'user', content: 'new' }], updatedAt: 2 }]

    expect(mergeAiChatSessions(project, legacy, 'project-1')).toEqual([
      expect.objectContaining({ id: 'chat-1', title: 'Project copy' }),
    ])
  })
})
