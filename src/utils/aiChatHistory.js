const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const AI_CHAT_HISTORY_EVENT = 'nf-ai-chat-history-updated'
export const AI_BAR_SESSION_PREFIX = 'ai_bar'

const cleanChatText = value => String(value || '').replace(/\r\n/g, '\n').trim()

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

export function normalizeAiChatSessions(sessions, novelId) {
  if (!Array.isArray(sessions)) return []
  return sessions
    .filter(session => session && typeof session === 'object')
    .map(session => ({
      ...session,
      novelId: session.novelId ?? novelId,
      context: { mode: 'smart', ...(session.context || {}) },
      messages: Array.isArray(session.messages) ? session.messages : [],
    }))
}

export function mergeAiChatSessions(primarySessions, fallbackSessions, novelId) {
  const merged = new Map()
  normalizeAiChatSessions(fallbackSessions, novelId).forEach(session => merged.set(session.id, session))
  normalizeAiChatSessions(primarySessions, novelId).forEach(session => merged.set(session.id, session))
  return [...merged.values()]
    .sort((a, b) => Number(b.pinned || false) - Number(a.pinned || false) || Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
}

export function appendAiBarExchangeToSessions(sessions, { novelId, section, userText, assistantText }) {
  const now = Date.now()
  const normalizedSessions = normalizeAiChatSessions(sessions, novelId)
  const sessionId = `${AI_BAR_SESSION_PREFIX}_${novelId ?? 'library'}`
  const userMessage = { id: uid(), role: 'user', content: userText, createdAt: now }
  const assistantMessage = { id: uid(), role: 'assistant', content: assistantText, createdAt: now }
  const context = {
    mode: 'smart',
    customInstruction: `Saved from the bottom AI bar${section ? ` in ${section}` : ''}.`,
  }

  const existing = normalizedSessions.find(s => s.id === sessionId)
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
    ? normalizedSessions.map(s => s.id === sessionId ? nextSession : s)
    : [...normalizedSessions, nextSession]

  return { nextSession, nextSessions }
}

export function appendAiBarExchange({ novelId, section, userText, assistantText }) {
  const storageKey = getAiChatStorageKey(novelId)
  const { nextSession, nextSessions } = appendAiBarExchangeToSessions(loadAiChatSessions(novelId), {
    novelId,
    section,
    userText,
    assistantText,
  })
  saveAiChatSessions(novelId, nextSessions)
  window.dispatchEvent(new CustomEvent(AI_CHAT_HISTORY_EVENT, { detail: { storageKey, novelId } }))
  return nextSession
}

export async function createAiChatDocxBlob(session) {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx
  const messages = Array.isArray(session?.messages) ? session.messages : []
  const children = [
    new Paragraph({
      children: [new TextRun({ text: session?.title || 'AI Chat', bold: true, size: 42 })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 320 },
    }),
  ]

  messages.forEach(message => {
    const speaker = message.role === 'user' ? 'You' : 'AI'
    children.push(new Paragraph({
      children: [new TextRun({ text: speaker, bold: true, size: 24 })],
      spacing: { before: 180, after: 80 },
    }))
    const blocks = cleanChatText(message.content).split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
    if (!blocks.length) {
      children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
      return
    }
    blocks.forEach(block => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
      children.push(new Paragraph({
        children: lines.map((line, index) => new TextRun({
          text: line,
          size: 22,
          ...(index > 0 ? { break: 1 } : {}),
        })),
        spacing: { after: 120 },
      }))
    })
  })

  return Packer.toBlob(new Document({ sections: [{ properties: {}, children }] }))
}
