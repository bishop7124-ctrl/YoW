import { useState, useRef, useCallback } from 'react'
import { streamMessage } from '../../utils/aiApi'
import { getActiveAiConfig } from '../../utils/aiSettings'
import { getProjectType } from '../../constants/projectTypes'
import { buildProjectTypePromptContext } from '../../utils/aiToolPrompts'
import { AI_CONFIG_REQUIRED_TEXT, AiConfigRequiredNotice, AiUpgradeRequiredNotice } from '../ai/AiConfigRequired'

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

function buildSystemPrompt(activeNovel, activeScene, characters, locations, selectedText = '') {
  const typeCfg = getProjectType(activeNovel?.type)
  const itemLabel = typeCfg.structure?.level3 || 'Scene'
  const lines = [
    'You are a creative writing assistant embedded in Your Own World.',
    buildProjectTypePromptContext(activeNovel),
    "Help the author with suggestions and continuations. Always match their existing style.",
    "Be concise. Never rewrite existing author content unless explicitly asked.",
  ].filter(Boolean)

  if (characters?.length) {
    lines.push('\nCharacters: ' + characters.slice(0, 8).map(c => c.name + (c.role ? ` (${c.role})` : '')).join(', '))
  }
  if (locations?.length) {
    lines.push('Locations: ' + locations.slice(0, 5).map(l => l.name).join(', '))
  }
  const highlighted = selectedText.trim()
  const sceneText = activeScene?.content?.trim() || ''
  if (highlighted || sceneText) {
    lines.push(`\n--- ${highlighted ? 'HIGHLIGHTED TEXT' : `CURRENT ${itemLabel.toUpperCase()}`} ---`)
    if (activeScene?.pov) lines.push(`POV: ${activeScene.pov}`)
    if (activeScene?.locationTag) lines.push(`Location: ${activeScene.locationTag}`)
    lines.push(highlighted || sceneText)
    lines.push(`--- END ${highlighted ? 'HIGHLIGHTED TEXT' : itemLabel.toUpperCase()} ---`)
  }
  return lines.join('\n')
}

export default function AISuggestionPanel({ activeScene, activeNovel, characters, locations, selectedText = '', onAppendToScene, userId = null, membership = null }) {
  const [prompt, setPrompt] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(false)

  const configured = !!loadAIConfig(userId)
  const activeType = getProjectType(activeNovel?.type)
  const itemLabel = activeType.structure?.level3 || 'Scene'
  const quickPrompts = QUICK_PROMPTS.map(q => ({
    ...q,
    text: q.text.replaceAll('scene', itemLabel.toLowerCase()).replaceAll('Scene', itemLabel),
  }))

  const generate = useCallback((overridePrompt) => {
    const config = loadAIConfig(userId)
    if (!config) { setError(AI_CONFIG_REQUIRED_TEXT); return }
    const userText = (overridePrompt || prompt).trim()
    if (!userText) return

    setError('')
    setSuggestion('')
    setStreaming(true)
    abortRef.current = false

    let buf = ''
    streamMessage({
	      ...config,
	      systemPrompt: buildSystemPrompt(activeNovel, activeScene, characters, locations, selectedText),
      messages: [{ role: 'user', content: userText }],
      maxTokens: 800,
      onChunk: c => { if (!abortRef.current) { buf += c; setSuggestion(buf) } },
      onDone:  ()  => { if (!abortRef.current) setStreaming(false) },
      onError: e   => { if (!abortRef.current) { setError(e); setStreaming(false) } },
    })
	  }, [prompt, activeScene, activeNovel, characters, locations, selectedText, userId])

  const handleStop = () => { abortRef.current = true; setStreaming(false) }

  const handleAppend = () => {
    if (!suggestion.trim() || !activeScene) return
    onAppendToScene(activeScene.id, suggestion.trim())
    setSuggestion('')
  }

  const handleCopy = () => {
    if (suggestion.trim()) navigator.clipboard.writeText(suggestion).catch(() => {})
  }

  if (membership?.isFree) {
    return (
      <div className="ms-panel-scroll ai-panel">
        <AiUpgradeRequiredNotice>
          Upgrade to access manuscript AI suggestions, continuations, and rewrite help.
        </AiUpgradeRequiredNotice>
      </div>
    )
  }

  return (
    <div className="ms-panel-scroll ai-panel">
      {!configured && (
        <AiConfigRequiredNotice style={{ marginBottom: 12 }} />
      )}

      {/* Quick actions */}
      <div className="ms-panel-section-header" style={{ marginTop: 12 }}>Quick actions</div>
      <div className="ai-chips">
        {quickPrompts.map(q => (
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
	      {activeScene && (
	        <div className="ai-context-scope">
	          {selectedText.trim()
	            ? `Using highlighted text (${selectedText.trim().split(/\s+/).filter(Boolean).length} words)`
	            : `Using full ${itemLabel.toLowerCase()} context`}
	        </div>
	      )}
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
	                Insert at cursor
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
