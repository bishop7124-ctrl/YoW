const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const AI_CHAT_HISTORY_EVENT = 'nf-ai-chat-history-updated'
export const AI_BAR_SESSION_PREFIX = 'ai_bar'

export function getAiChatStorageKey(novelId) {
  return `nf_chats_${novelId ?? 'library'}`
}

export function loadAiChatSessions(novelId) {
  try {
    return JSON.parse(localStorage.getItem(getAiChatStorageKey(novelId))) ?? []
  } catch {
    return []
  }
}

export function saveAiChatSessions(novelId, sessions) {
  localStorage.setItem(getAiChatStorageKey(novelId), JSON.stringify(sessions))
}

export function appendAiBarExchange({ novelId, section, userText, assistantText }) {
  const now = Date.now()
  const storageKey = getAiChatStorageKey(novelId)
  const sessions = loadAiChatSessions(novelId)
  const sessionId = `${AI_BAR_SESSION_PREFIX}_${novelId ?? 'library'}`
  const userMessage = { id: uid(), role: 'user', content: userText, createdAt: now }
  const assistantMessage = { id: uid(), role: 'assistant', content: assistantText, createdAt: now }
  const context = {
    characterIds: [],
    locationIds: [],
    loreEntryIds: [],
    worldHistoryIds: [],
    chapterIds: [],
    customInstruction: `Saved from the bottom AI bar${section ? ` in ${section}` : ''}.`,
  }

  const existing = sessions.find(s => s.id === sessionId)
  const nextSession = existing
    ? {
        ...existing,
        context: existing.context || context,
        messages: [...(existing.messages || []), userMessage, assistantMessage],
        updatedAt: now,
      }
    : {
        id: sessionId,
        novelId,
        title: 'AI bar',
        context,
        messages: [userMessage, assistantMessage],
        createdAt: now,
        updatedAt: now,
        pinned: false,
        category: 'AI bar',
      }

  const nextSessions = existing
    ? sessions.map(s => s.id === sessionId ? nextSession : s)
    : [...sessions, nextSession]

  saveAiChatSessions(novelId, nextSessions)
  window.dispatchEvent(new CustomEvent(AI_CHAT_HISTORY_EVENT, { detail: { storageKey, novelId } }))
  return nextSession
}
