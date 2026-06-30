import { useState, useRef, useCallback } from 'react'
import { streamMessage } from '../../utils/aiApi'
import { getActiveAiConfig } from '../../utils/aiSettings'

const QUICK_PROMPTS = [
  { label: 'Continue', text: "Continue writing this scene naturally from where it ends. Match the author's existing style, voice, tone, and POV. Write 2-3 paragraphs." },
  { label: "What's next?", text: 'Give 3-5 brief ideas (1 sentence each) for what could happen next in this scene or story.' },
  { label: 'Improve', text: "Rewrite the last paragraph to be more vivid and specific. Keep the same events, POV, and the author's voice." },
  { label: 'Add dialogue', text: 'Write a short, natural dialogue exchange that fits the current scene context and characters.' },
]

function loadAIConfig(userId) {
  const cfg = getActiveAiConfig(userId)
  if (!cfg.apiKey?.trim()) return null
  return cfg
}

function buildSystemPrompt(activeNovel, activeScene, characters, locations) {
  const lines = [
    `You are a creative writing assistant for "${activeNovel?.title || 'Untitled'}".`,
    activeNovel?.description ? `Premise: ${activeNovel.description}` : null,
    "Help the author with suggestions and continuations. Always match their existing style.",
    "Be concise. Never rewrite existing author content unless explicitly asked.",
  ].filter(Boolean)

  if (characters?.length) {
    lines.push('\nCharacters: ' + characters.slice(0, 8).map(c => c.name + (c.role ? ` (${c.role})` : '')).join(', '))
  }
  if (locations?.length) {
    lines.push('Locations: ' + locations.slice(0, 5).map(l => l.name).join(', '))
  }
  if (activeScene?.content?.trim()) {
    const text = activeScene.content.trim()
    const excerpt = text.length > 1800 ? '…' + text.slice(-1800) : text
    lines.push('\n--- CURRENT SCENE ---')
    if (activeScene.pov) lines.push(`POV: ${activeScene.pov}`)
    if (activeScene.locationTag) lines.push(`Location: ${activeScene.locationTag}`)
    lines.push(excerpt)
    lines.push('--- END SCENE ---')
  }
  return lines.join('\n')
}

export default function AISuggestionPanel({ activeScene, activeNovel, characters, locations, onAppendToScene, userId = null }) {
  const [prompt, setPrompt] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(false)

  const configured = !!loadAIConfig(userId)

  const generate = useCallback((overridePrompt) => {
    const config = loadAIConfig(userId)
    if (!config) { setError('No AI provider configured. Add an API key in AI Settings.'); return }
    const userText = (overridePrompt || prompt).trim()
    if (!userText) return

    setError('')
    setSuggestion('')
    setStreaming(true)
    abortRef.current = false

    let buf = ''
    streamMessage({
      ...config,
      systemPrompt: buildSystemPrompt(activeNovel, activeScene, characters, locations),
      messages: [{ role: 'user', content: userText }],
      maxTokens: 800,
      onChunk: c => { if (!abortRef.current) { buf += c; setSuggestion(buf) } },
      onDone:  ()  => { if (!abortRef.current) setStreaming(false) },
      onError: e   => { if (!abortRef.current) { setError(e); setStreaming(false) } },
    })
  }, [prompt, activeScene, activeNovel, characters, locations, userId])

  const handleStop = () => { abortRef.current = true; setStreaming(false) }

  const handleAppend = () => {
    if (!suggestion.trim() || !activeScene) return
    onAppendToScene(activeScene.id, suggestion.trim())
    setSuggestion('')
  }

  const handleCopy = () => {
    if (suggestion.trim()) navigator.clipboard.writeText(suggestion).catch(() => {})
  }

  return (
    <div className="ms-panel-scroll ai-panel">
      {!configured && (
        <div className="ai-no-config">
          No AI provider configured.{' '}
          Open <strong>AI Settings</strong> to add an API key.
        </div>
      )}

      {/* Quick actions */}
      <div className="ms-panel-section-header" style={{ marginTop: 12 }}>Quick actions</div>
      <div className="ai-chips">
        {QUICK_PROMPTS.map(q => (
          <button
            key={q.label}
            className="ai-chip"
            disabled={streaming || !configured}
            onClick={() => { setPrompt(''); generate(q.text) }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Custom prompt */}
      <div className="ms-panel-section-header" style={{ marginTop: 14 }}>Custom prompt</div>
      <div className="ai-prompt-wrap">
        <textarea
          className="ai-prompt-textarea"
          rows={3}
          placeholder="Describe what you need… (Ctrl+Enter to generate)"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={streaming}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate() }
          }}
        />
        <div className="ai-generate-row">
          {streaming ? (
            <button className="ai-stop-btn" onClick={handleStop}>Stop</button>
          ) : (
            <button className="ai-generate-btn" disabled={!prompt.trim() || !configured} onClick={() => generate()}>
              Generate
            </button>
          )}
          {!streaming && <span className="ai-hint">or Ctrl+Enter</span>}
        </div>
      </div>

      {/* Error */}
      {error && <div className="ai-error">{error}</div>}

      {/* Streaming output */}
      {suggestion && (
        <>
          <div className="ms-panel-section-header" style={{ marginTop: 14 }}>Suggestion</div>
          <div className="ai-output">
            {suggestion}
            {streaming && <span className="ai-cursor" />}
          </div>
          {!streaming && (
            <div className="ai-output-actions">
              <button
                className="ai-btn ai-btn--primary"
                onClick={handleAppend}
                disabled={!activeScene}
                title={activeScene ? undefined : 'Focus a scene first'}
              >
                Append to scene
              </button>
              <button className="ai-btn" onClick={handleCopy}>Copy</button>
              <button className="ai-btn ai-btn--muted" onClick={() => setSuggestion('')}>Discard</button>
            </div>
          )}
        </>
      )}

      {/* No scene focused */}
      {!activeScene && !error && !suggestion && (
        <p className="ai-no-scene">Focus a scene to get context-aware suggestions.</p>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}
