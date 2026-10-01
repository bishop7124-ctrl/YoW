export const OPENAI_QUICK_CHOICES = [
  {
    id: 'gpt-6-astra',
    label: 'Astra',
    badge: 'Best quality',
    description: 'Most capable for difficult analysis, extraction, and complex story work.',
  },
  {
    id: 'gpt-6-sol',
    label: 'Sol',
    badge: 'Best balance',
    description: 'Strong default for regular YOW use, balancing capability and cost.',
  },
  {
    id: 'gpt-6-luna',
    label: 'Luna',
    badge: 'Lowest cost',
    description: 'Efficient for focused drafting and lightweight tasks at higher volume.',
  },
]

const SPECIALIST_MODEL_PATTERN = /(embedding|moderation|image|tts|audio|transcri|realtime|whisper|search)/i

export function isOfficialOpenAiEndpoint(baseUrl = '') {
  return !baseUrl || String(baseUrl).replace(/\/$/, '') === 'https://api.openai.com/v1'
}

export function getAvailableOpenAiQuickChoices(liveModels) {
  if (!Array.isArray(liveModels)) return OPENAI_QUICK_CHOICES
  const availableIds = new Set(liveModels.map(model => model?.id).filter(Boolean))
  return OPENAI_QUICK_CHOICES.filter(choice => availableIds.has(choice.id))
}

export function getAiModelGuidance({ provider, model, baseUrl = '' } = {}) {
  const id = String(model || '').trim()
  if (!id) {
    return {
      kind: 'empty',
      title: 'Choose a general-purpose text model',
      description: 'YOW uses the selected model for AI Import, chat, suggestions, and AI tools.',
    }
  }

  const quickChoice = OPENAI_QUICK_CHOICES.find(choice => choice.id === id)
  if (provider === 'openai' && isOfficialOpenAiEndpoint(baseUrl) && quickChoice) {
    return { kind: 'recommended', title: quickChoice.badge, description: quickChoice.description }
  }

  if (SPECIALIST_MODEL_PATTERN.test(id)) {
    return {
      kind: 'warning',
      title: 'Specialist model',
      description: 'This model appears intended for a specialist API rather than text chat. YOW AI features may reject it; choose a general-purpose text model instead.',
    }
  }

  if (/(astra|pro|opus|large|reason)/i.test(id)) {
    return { kind: 'capable', title: 'Higher capability', description: 'Usually best for complex analysis and extraction, with a higher cost or slower response than smaller models.' }
  }
  if (/(luna|nano|mini|haiku|flash-lite|small)/i.test(id)) {
    return { kind: 'efficient', title: 'Faster / lower cost', description: 'Usually suited to focused tasks and drafting; difficult imports or deep analysis may be less reliable.' }
  }
  if (/(sol|sonnet|flash)/i.test(id)) {
    return { kind: 'balanced', title: 'Balanced', description: 'A practical middle ground for everyday writing help, capability, speed, and cost.' }
  }

  return {
    kind: 'unknown',
    title: 'Provider-defined model',
    description: 'YOW cannot reliably identify this model’s tradeoffs. Check the provider’s model page for capability, context window, speed, and price.',
  }
}
