import { estimateTokens } from './aiModelCapabilities'

export function summarizeOlderConversation(messages, maxRecentMessages = 10) {
  if ((messages || []).length <= maxRecentMessages) return messages || []
  const older = messages.slice(0, -maxRecentMessages)
  const recent = messages.slice(-maxRecentMessages)
  const summaryLines = older
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-12)
    .map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${String(message.content || '').replace(/\s+/g, ' ').slice(0, 180)}`)
  return [
    { role: 'user', content: `Earlier conversation summary for continuity only:\n${summaryLines.join('\n')}` },
    ...recent,
  ]
}

export function fitMessagesToInputBudget(messages, systemPrompt, safeInputBudget) {
  const budget = Math.max(1000, safeInputBudget || 48000)
  let used = estimateTokens(systemPrompt)
  const kept = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const cost = estimateTokens(message.content) + 8
    if (kept.length > 0 && used + cost > budget) continue
    kept.unshift(message)
    used += cost
  }
  return kept.length ? kept : messages.slice(-1)
}

export function estimatePromptTokens(systemPrompt, messages = []) {
  return estimateTokens(systemPrompt) + messages.reduce((sum, message) => sum + estimateTokens(message.content) + 8, 0)
}
