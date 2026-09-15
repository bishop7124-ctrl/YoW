// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AISuggestionPanel from './AISuggestionPanel.jsx'

const aiConfig = vi.hoisted(() => ({ current: {} }))

vi.mock('../../utils/aiSettings.js', () => ({
  getActiveAiConfig: () => aiConfig.current,
}))

vi.mock('../../utils/aiApi.js', () => ({
  streamMessage: vi.fn(),
}))

const props = {
  activeScene: { id: 'scene-1', title: 'Opening', content: 'Once upon a time.' },
  activeNovel: { id: 'novel-1', type: 'novel', title: 'Test novel' },
  characters: [],
  locations: [],
  onAppendToScene: vi.fn(),
  onReplaceSelection: vi.fn(),
  userId: 'user-1',
  membership: { isFree: false },
}

afterEach(() => {
  aiConfig.current = {}
  cleanup()
})

describe('AISuggestionPanel hierarchy', () => {
  it('shows one focused setup state instead of an unusable disabled workspace', () => {
    const openSettings = vi.fn()
    window.addEventListener('open-account-settings', openSettings, { once: true })

    render(<AISuggestionPanel {...props} />)

    expect(screen.getByText('Connect AI to begin')).toBeTruthy()
    expect(screen.queryByText('Quick actions')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open AI settings' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
  })

  it('puts the custom prompt first and keeps rewrite controls in a disclosure', () => {
    aiConfig.current = { provider: 'openai', apiKey: 'test-key', model: 'test-model' }
    const { container } = render(<AISuggestionPanel {...props} />)

    const askHeading = screen.getByText('Ask AI')
    const quickHeading = screen.getByText('Quick actions')
    expect(askHeading.compareDocumentPosition(quickHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()

    const disclosure = container.querySelector('.ai-rewrite-disclosure')
    expect(disclosure).toBeTruthy()
    expect(disclosure.open).toBe(false)
    expect(screen.getByText('Rewrite point of view or tense')).toBeTruthy()
  })
})
