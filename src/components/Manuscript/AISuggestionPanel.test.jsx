// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { streamMessage } from '../../utils/aiApi.js'
import AISuggestionPanel from './AISuggestionPanel.jsx'
import { REWRITE_CHUNK_CHAR_LIMIT, splitRewriteText } from './aiRewriteChunks.js'

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
  onReplaceScene: vi.fn(),
  userId: 'user-1',
  membership: { isFree: false },
}

afterEach(() => {
  aiConfig.current = {}
  vi.clearAllMocks()
  cleanup()
})

describe('rewrite chunking', () => {
  it('splits on paragraph boundaries where possible and never exceeds the request limit', () => {
    const first = 'A'.repeat(3200)
    const second = 'B'.repeat(2500)
    const chunks = splitRewriteText(`${first}\n\n${second}`)

    expect(chunks).toHaveLength(2)
    expect(chunks.every(chunk => chunk.text.length <= REWRITE_CHUNK_CHAR_LIMIT)).toBe(true)
    expect(chunks[0]).toEqual({ text: first, joiner: '' })
    expect(chunks[1]).toEqual({ text: second, joiner: '\n\n' })
  })

  it('prompts for each next chunk, preserves accumulated output, and only then allows replacement', () => {
    aiConfig.current = { provider: 'openai', apiKey: 'test-key', model: 'test-model' }
    const first = 'The rain fell. '.repeat(260)
    const second = 'The sun rose. '.repeat(180)
    const content = `${first}\n\n${second}`
    const onReplaceScene = vi.fn()
    const requests = []
    vi.mocked(streamMessage).mockImplementation(request => { requests.push(request) })

    const { container } = render(
      <AISuggestionPanel {...props} activeScene={{ ...props.activeScene, content }} onReplaceScene={onReplaceScene} />,
    )

    fireEvent.click(screen.getByText('Rewrite point of view or tense'))
    expect(screen.getByText(`Rewrites use up to ${REWRITE_CHUNK_CHAR_LIMIT.toLocaleString()} characters per request. Longer text is split at paragraph or word boundaries.`)).toBeTruthy()

    const tenseField = screen.getByText('Tense').closest('label')
    fireEvent.click(tenseField.querySelector('button'))
    expect(requests).toHaveLength(1)
    expect(requests[0].maxTokens).toBe(2400)
    expect(requests[0].systemPrompt).toContain('--- TEXT TO REWRITE ---')
    expect(requests[0].systemPrompt).not.toContain(second.trim())

    act(() => {
      requests[0].onChunk('Chunk one rewritten.')
      requests[0].onDone()
    })

    expect(screen.getByText('Chunk 1 of 2 is ready. Review it, then continue.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace scene' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with chunk 2 of 2' }))
    expect(requests).toHaveLength(2)
    expect(requests[1].systemPrompt).toContain(second.trim())

    act(() => {
      requests[1].onChunk('Chunk two rewritten.')
      requests[1].onDone()
    })

    expect(screen.getByText('All 2 chunks complete.')).toBeTruthy()
    expect(container.querySelector('.ai-output').textContent).toContain('Chunk one rewritten.\n\nChunk two rewritten.')
    fireEvent.click(screen.getByRole('button', { name: 'Replace scene' }))
    expect(onReplaceScene).toHaveBeenCalledWith('scene-1', 'Chunk one rewritten.\n\nChunk two rewritten.')
  })
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
