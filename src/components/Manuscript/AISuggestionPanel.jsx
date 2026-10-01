import { useState, useRef, useCallback } from 'react'
import { streamMessage } from '../../utils/aiApi'
import { getActiveAiConfig } from '../../utils/aiSettings'
import { getProjectType } from '../../constants/projectTypes'
import { buildProjectTypePromptContext } from '../../utils/aiToolPrompts'
import { AI_CONFIG_REQUIRED_TEXT, AiUpgradeRequiredNotice, openAiSettings } from '../ai/AiConfigRequired'
import { REWRITE_CHUNK_CHAR_LIMIT, REWRITE_MAX_OUTPUT_TOKENS, splitRewriteText } from './aiRewriteChunks.js'

const QUICK_PROMPTS = [
  { label: 'Continue', text: "Continue writing this scene naturally from where it ends. Match the author's existing style, voice, tone, and POV. Write 2-3 paragraphs." },
  { label: "What's next?", text: 'Give 3-5 brief ideas (1 sentence each) for what could happen next in this scene or story.' },
  { label: 'Improve', text: "Rewrite the last paragraph to be more vivid and specific. Keep the same events, POV, and the author's voice." },
  { label: 'Add dialogue', text: 'Write a short, natural dialogue exchange that fits the current scene context and characters.' },
]

const POV_OPTIONS = [
  { value: 'first person', label: 'First person' },
  { value: 'second person', label: 'Second person' },
  { value: 'third person limited', label: 'Third limited' },
  { value: 'third person omniscient', label: 'Third omniscient' },
]

const TENSE_OPTIONS = [
  { value: 'past tense', label: 'Past tense' },
  { value: 'present tense', label: 'Present tense' },
  { value: 'future tense', label: 'Future tense' },
]

function loadAIConfig(userId) {
  const cfg = getActiveAiConfig(userId)
  if (!cfg.apiKey?.trim()) return null
  return cfg
}

function buildRewritePrompt(kind, target, itemLabel, hasSelectedText) {
  const scope = hasSelectedText ? 'the highlighted text' : `the focused ${itemLabel.toLowerCase()}`
  const instruction = kind === 'pov'
    ? `Rewrite ${scope} in ${target} point of view.`
    : `Rewrite ${scope} in ${target}.`

  return [
    instruction,
    'Preserve the original events, meaning, character intent, continuity, and authorial voice.',
    'Adjust pronouns, verb forms, interiority, and narration only as needed for the requested change.',
    'Return only the rewritten prose, with no explanation or markdown.',
  ].join(' ')
}

function buildSystemPrompt(activeNovel, activeScene, characters, locations, selectedText = '', contextOverride) {
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
  const hasContextOverride = typeof contextOverride === 'string'
  const highlighted = (hasContextOverride ? contextOverride : selectedText).trim()
  const sceneText = hasContextOverride ? '' : (activeScene?.content?.trim() || '')
  if (highlighted || sceneText) {
    const contextLabel = hasContextOverride ? 'TEXT TO REWRITE' : (highlighted ? 'HIGHLIGHTED TEXT' : `CURRENT ${itemLabel.toUpperCase()}`)
    lines.push(`\n--- ${contextLabel} ---`)
    if (activeScene?.pov) lines.push(`POV: ${activeScene.pov}`)
    if (activeScene?.locationTag) lines.push(`Location: ${activeScene.locationTag}`)
    lines.push(highlighted || sceneText)
    lines.push(`--- END ${contextLabel} ---`)
  }
  return lines.join('\n')
}

export default function AISuggestionPanel({ activeScene, activeNovel, characters, locations, selectedText = '', onAppendToScene, onReplaceSelection, onReplaceScene, userId = null, membership = null }) {
  const [prompt, setPrompt] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [targetPov, setTargetPov] = useState(POV_OPTIONS[0].value)
  const [targetTense, setTargetTense] = useState(TENSE_OPTIONS[0].value)
  const [rewriteProgress, setRewriteProgress] = useState(null)
  const abortRef = useRef(false)
  const suggestionRef = useRef('')

  const configured = !!loadAIConfig(userId)
  const activeType = getProjectType(activeNovel?.type)
  const itemLabel = activeType.structure?.level3 || 'Scene'
  const hasSelectedText = !!selectedText.trim()
  const quickPrompts = QUICK_PROMPTS.map(q => ({
    ...q,
    text: q.text.replaceAll('scene', itemLabel.toLowerCase()).replaceAll('Scene', itemLabel),
  }))

  const generate = useCallback((overridePrompt, options = {}) => {
    const config = loadAIConfig(userId)
    if (!config) { setError(AI_CONFIG_REQUIRED_TEXT); return }
    const userText = (overridePrompt || prompt).trim()
    if (!userText) return

    setError('')
    const baseSuggestion = options.append ? suggestionRef.current.trimEnd() : ''
    if (!options.append) {
      suggestionRef.current = ''
      setSuggestion('')
      if (!options.rewrite) setRewriteProgress(null)
    }
    setStreaming(true)
    abortRef.current = false

    let buf = ''
    const joiner = options.joiner || ''
    streamMessage({
	      ...config,
	      systemPrompt: buildSystemPrompt(activeNovel, activeScene, characters, locations, selectedText, options.contextText),
      messages: [{ role: 'user', content: userText }],
      maxTokens: options.rewrite ? REWRITE_MAX_OUTPUT_TOKENS : 800,
      onChunk: c => {
        if (abortRef.current) return
        buf += c
        const combined = `${baseSuggestion}${baseSuggestion ? joiner : ''}${buf}`
        suggestionRef.current = combined
        setSuggestion(combined)
      },
      onDone:  ()  => {
        if (abortRef.current) return
        setStreaming(false)
        if (!buf.trim()) {
          setError('The AI returned no rewritten text. Try this chunk again.')
          return
        }
        if (options.rewrite) {
          setRewriteProgress(current => current ? { ...current, completedChunks: options.chunkIndex + 1 } : current)
        }
      },
      onError: e   => {
        if (abortRef.current) return
        // A provider can fail after streaming part of a later chunk. Roll that
        // incomplete fragment back so Retry/Continue cannot duplicate it.
        if (options.rewrite) {
          suggestionRef.current = baseSuggestion
          setSuggestion(baseSuggestion)
        }
        setError(e)
        setStreaming(false)
      },
    })
	  }, [prompt, activeScene, activeNovel, characters, locations, selectedText, userId])

  const startRewrite = (kind, target) => {
    if (!activeScene) return
    const source = selectedText.trim() || activeScene.content?.trim() || ''
    const chunks = splitRewriteText(source)
    if (!chunks.length) return
    const rewrite = { kind, target, chunks, completedChunks: 0, sourceCharacters: source.length }
    setPrompt('')
    setRewriteProgress(rewrite)
    generate(buildRewritePrompt(kind, target, itemLabel, hasSelectedText), {
      rewrite: true,
      contextText: chunks[0].text,
      chunkIndex: 0,
      joiner: chunks[0].joiner,
    })
  }

  const continueRewrite = () => {
    if (!rewriteProgress || streaming) return
    const chunkIndex = rewriteProgress.completedChunks
    const chunk = rewriteProgress.chunks[chunkIndex]
    if (!chunk) return
    generate(buildRewritePrompt(rewriteProgress.kind, rewriteProgress.target, itemLabel, hasSelectedText), {
      rewrite: true,
      append: true,
      contextText: chunk.text,
      chunkIndex,
      joiner: chunk.joiner,
    })
  }

  const handleStop = () => { abortRef.current = true; setStreaming(false) }

  const handleAppend = () => {
    if (!suggestion.trim() || !activeScene) return
    onAppendToScene(activeScene.id, suggestion.trim())
    setSuggestion('')
    suggestionRef.current = ''
    setRewriteProgress(null)
  }

  const handleReplace = () => {
    if (!suggestion.trim() || !activeScene) return
    if (hasSelectedText) onReplaceSelection(activeScene.id, suggestion.trim())
    else onReplaceScene?.(activeScene.id, suggestion.trim())
    setSuggestion('')
    suggestionRef.current = ''
    setRewriteProgress(null)
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

  if (!configured) {
    return (
      <div className="ms-panel-scroll ai-panel ai-panel-setup">
        <div className="ai-setup-card">
          <span className="ai-setup-eyebrow">One-time setup</span>
          <strong>Connect AI to begin</strong>
          <p>Add your preferred provider and API key, then return here to use suggestions, rewrites, and custom prompts.</p>
          <button type="button" className="ai-setup-button" onClick={openAiSettings}>Open AI settings</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ms-panel-scroll ai-panel">
	      {/* The open-ended request is the primary task; presets and mechanical
	          rewrites are supporting shortcuts below it. */}
	      <div className="ms-panel-section-header">Ask AI</div>
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

      <div className="ms-panel-section-header">Quick actions</div>
      <div className="ai-chips">
        {quickPrompts.map(q => (
          <button
            key={q.label}
            className="ai-chip"
            disabled={streaming}
            onClick={() => { setPrompt(''); generate(q.text) }}
          >
            {q.label}
          </button>
        ))}
      </div>

      <details className="ai-rewrite-disclosure">
        <summary>Rewrite point of view or tense</summary>
        <div className="ai-rewrite-tools">
          <label className="ai-rewrite-field">
            <span>Point of view</span>
            <div className="ai-rewrite-row">
              <select
                value={targetPov}
                onChange={e => setTargetPov(e.target.value)}
                disabled={streaming}
                className="ai-rewrite-select"
              >
                {POV_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                className="ai-chip ai-rewrite-btn"
                disabled={streaming || !activeScene}
                title={activeScene ? undefined : `Focus a ${itemLabel.toLowerCase()} first`}
                onClick={() => {
                  startRewrite('pov', targetPov)
                }}
              >
                Change
              </button>
            </div>
          </label>

          <label className="ai-rewrite-field">
            <span>Tense</span>
            <div className="ai-rewrite-row">
              <select
                value={targetTense}
                onChange={e => setTargetTense(e.target.value)}
                disabled={streaming}
                className="ai-rewrite-select"
              >
                {TENSE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                className="ai-chip ai-rewrite-btn"
                disabled={streaming || !activeScene}
                title={activeScene ? undefined : `Focus a ${itemLabel.toLowerCase()} first`}
                onClick={() => {
                  startRewrite('tense', targetTense)
                }}
              >
                Change
              </button>
            </div>
          </label>
          <p className="ai-rewrite-limit">
            Rewrites use up to {REWRITE_CHUNK_CHAR_LIMIT.toLocaleString()} characters per request. Longer text is split at paragraph or word boundaries.
          </p>
        </div>
      </details>

      {/* Error */}
      {error && <div className="ai-error">{error}</div>}

      {/* Streaming output */}
      {suggestion && (
        <>
          <div className="ms-panel-section-header" style={{ marginTop: 14 }}>
            {rewriteProgress ? 'Rewritten prose' : 'Suggestion'}
          </div>
          {rewriteProgress && (
            <div className="ai-rewrite-progress" role="status" aria-live="polite">
              {streaming
                ? `Rewriting chunk ${rewriteProgress.completedChunks + 1} of ${rewriteProgress.chunks.length}…`
                : rewriteProgress.completedChunks < rewriteProgress.chunks.length
                  ? `Chunk ${rewriteProgress.completedChunks} of ${rewriteProgress.chunks.length} is ready. Review it, then continue.`
                  : `All ${rewriteProgress.chunks.length} ${rewriteProgress.chunks.length === 1 ? 'chunk' : 'chunks'} complete.`}
            </div>
          )}
          <div className="ai-output">
            {suggestion}
            {streaming && <span className="ai-cursor" />}
          </div>
          {!streaming && (
            <div className="ai-output-actions">
              {rewriteProgress && rewriteProgress.completedChunks < rewriteProgress.chunks.length && (
                <button className="ai-btn ai-btn--primary" onClick={continueRewrite}>
                  Continue with chunk {rewriteProgress.completedChunks + 1} of {rewriteProgress.chunks.length}
                </button>
              )}
              <button
                className={`ai-btn${rewriteProgress && rewriteProgress.completedChunks < rewriteProgress.chunks.length ? '' : ' ai-btn--primary'}`}
                onClick={handleAppend}
                disabled={!activeScene || (rewriteProgress && rewriteProgress.completedChunks < rewriteProgress.chunks.length)}
                title={rewriteProgress && rewriteProgress.completedChunks < rewriteProgress.chunks.length ? 'Finish every chunk before inserting the rewrite' : (activeScene ? undefined : 'Focus a scene first')}
              >
	                Insert at cursor
              </button>
              <button
                className="ai-btn"
                onClick={handleReplace}
                disabled={!activeScene || (!hasSelectedText && !onReplaceScene) || (rewriteProgress && rewriteProgress.completedChunks < rewriteProgress.chunks.length)}
                title={rewriteProgress && rewriteProgress.completedChunks < rewriteProgress.chunks.length ? 'Finish every chunk before replacing text' : (hasSelectedText ? 'Replace the highlighted text' : 'Replace the focused scene')}
              >
                {hasSelectedText ? 'Replace selection' : 'Replace scene'}
              </button>
              <button className="ai-btn" onClick={handleCopy}>Copy</button>
              <button className="ai-btn ai-btn--muted" onClick={() => { setSuggestion(''); suggestionRef.current = ''; setRewriteProgress(null) }}>Discard</button>
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
