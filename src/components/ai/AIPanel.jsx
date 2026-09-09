import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { streamMessage, buildSystemPrompt, PROVIDERS } from '../../utils/aiApi'
import { AI_SETTINGS_EVENT, DEFAULT_AI_SETTINGS, loadAiSettings } from '../../utils/aiSettings'
import { AI_CHAT_HISTORY_EVENT, createAiChatDocxBlob, getAiChatStorageKey, loadAiChatSessions, mergeAiChatSessions, normalizeAiChatSessions } from '../../utils/aiChatHistory'
import { AI_AGENTS, AI_FREEDOM_LEVELS, DEFAULT_AGENT_ID, DEFAULT_AI_FREEDOM_LEVEL, buildAiBehaviorDirective, getAgent, getFreedomLevel } from '../../utils/aiAgents'
import { AI_CHAT_CONTEXT_MODES, buildAIContext, loadAiContextMode, normalizeAiContextMode, saveAiContextMode } from '../../utils/aiContext'
import { addAiUsage, emptyAiUsageTotals } from '../../utils/aiUsage'
import { fitMessagesToInputBudget, summarizeOlderConversation } from '../../utils/aiConversation'
import { AI_CONFIG_REQUIRED_TEXT, AiConfigRequiredNotice, openAiPlans, openAiSettings } from './AiConfigRequired'
import AIStar from './AIStar'
import Modal from '../shared/Modal'
import { downloadBlob, sanitizeFilename } from '../../utils/projectExportHelpers'

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val))
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const AI_PANEL_FRAME_KEY = 'nf_aiPanelFrame'
const MIN_PANEL_WIDTH = 380
const MIN_PANEL_HEIGHT = 430
const PANEL_MARGIN = 12

const getDefaultPanelFrame = () => {
  const width = Math.min(560, Math.max(MIN_PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2))
  const height = Math.min(760, Math.max(MIN_PANEL_HEIGHT, window.innerHeight - 92))
  return {
    width,
    height,
    left: Math.max(PANEL_MARGIN, window.innerWidth - width - 24),
    top: Math.max(PANEL_MARGIN, window.innerHeight - height - 24),
  }
}

const clampPanelFrame = (frame) => {
  const maxWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - PANEL_MARGIN * 2)
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - PANEL_MARGIN * 2)
  const width = Math.min(Math.max(frame.width || MIN_PANEL_WIDTH, MIN_PANEL_WIDTH), maxWidth)
  const height = Math.min(Math.max(frame.height || MIN_PANEL_HEIGHT, MIN_PANEL_HEIGHT), maxHeight)
  return {
    width,
    height,
    left: Math.min(Math.max(frame.left ?? PANEL_MARGIN, PANEL_MARGIN), Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)),
    top: Math.min(Math.max(frame.top ?? PANEL_MARGIN, PANEL_MARGIN), Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN)),
  }
}

const DEFAULT_SETTINGS = DEFAULT_AI_SETTINGS

// ── Context Selector ──────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)] bg-[var(--bg-main)] transition-colors"
      >
        {title}
        <span className="text-[var(--accent)] text-base leading-none">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="p-3 bg-[var(--bg-nav)] space-y-1">{children}</div>}
    </div>
  )
}

function AgentCard({ agent, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-fade)]'
          : 'border-[var(--border)] bg-[var(--bg-nav)] hover:border-[var(--accent)]/50'
      }`}
    >
      <div className={`text-xs font-bold ${selected ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>{agent.label}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{agent.blurb}</div>
    </button>
  )
}

function FreedomCard({ level, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-fade)]'
          : 'border-[var(--border)] bg-[var(--bg-nav)] hover:border-[var(--accent)]/50'
      }`}
    >
      <div className={`text-xs font-bold ${selected ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>{level.label}</div>
      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">{level.blurb}</div>
    </button>
  )
}

function ContextModeCard({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`text-left rounded-lg border px-3 py-2 transition-colors ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-fade)]'
          : 'border-[var(--border)] bg-[var(--bg-nav)] hover:border-[var(--accent)]/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold ${selected ? 'text-[var(--accent)]' : 'text-[var(--text-main)]'}`}>
          <span aria-hidden="true">{option.icon}</span> {option.label}
        </span>
        {option.badge && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] border border-[var(--accent)]/30 rounded px-1.5 py-0.5">
            {option.badge}
          </span>
        )}
      </div>
      <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{option.helper}</div>
    </button>
  )
}

function formatCompactTokens(value) {
  if (!value) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return String(value)
}

function formatCost(cost) {
  if (!cost) return ''
  const amount = typeof cost === 'number' ? cost : cost.amount
  if (!Number.isFinite(amount)) return ''
  return `~$${amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`
}

function ContextLevelBadge({ level }) {
  const cfg = {
    low: { dot: '🟢', label: 'Low context' },
    moderate: { dot: '🟡', label: 'Moderate context' },
    high: { dot: '🟠', label: 'High context' },
    very_high: { dot: '🔴', label: 'Very high context' },
  }[level?.level || level] || { dot: '🟢', label: 'Low context' }
  return <span className="text-[11px] text-[var(--text-muted)]">{cfg.dot} {cfg.label}</span>
}

function ContextSelector({ store, aiSettings, onStart, onCancel, initialContext, initialAgentId, initialFreedomLevel }) {
  const defaultContext = {
    mode: loadAiContextMode(), customInstruction: '',
  }
  const [ctx, setCtx] = useState({ ...defaultContext, ...(initialContext || {}) })
  const [agentId, setAgentId] = useState(initialAgentId || DEFAULT_AGENT_ID)
  const [freedomLevel, setFreedomLevel] = useState(initialFreedomLevel || DEFAULT_AI_FREEDOM_LEVEL)
  const mode = normalizeAiContextMode(ctx.mode)
  const safeAiSettings = aiSettings || DEFAULT_SETTINGS
  const provider = safeAiSettings.activeProvider || DEFAULT_SETTINGS.activeProvider
  const model = safeAiSettings[provider]?.model || PROVIDERS[provider]?.defaultModel
  const preview = useMemo(() => buildAIContext({
    projectId: store.activeNovelId || store.activeNovel?.id,
    mode,
    userPrompt: '',
    activeCharacterId: store.selectedCharacterId,
    provider,
    model,
    store,
    customInstruction: ctx.customInstruction,
  }), [store, mode, provider, model, ctx.customInstruction])

  const selectMode = nextMode => {
    const normalized = normalizeAiContextMode(nextMode)
    saveAiContextMode(normalized)
    setCtx(prev => ({ ...prev, mode: normalized }))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="ai-panel-subheader px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <h3 className="font-bold text-[var(--text-main)] text-sm">Start a new chat</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Pick a support style and what the AI should know.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div>
          <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Behavior mode</label>
          <div className="grid grid-cols-2 gap-2">
            {AI_AGENTS.map(agent => (
              <AgentCard key={agent.id} agent={agent} selected={agentId === agent.id} onSelect={() => setAgentId(agent.id)} />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Creative freedom</label>
          <div className="grid grid-cols-2 gap-2">
            {AI_FREEDOM_LEVELS.map(level => (
              <FreedomCard key={level.id} level={level} selected={freedomLevel === level.id} onSelect={() => setFreedomLevel(level.id)} />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Context</label>
          <div className="grid gap-2">
            {AI_CHAT_CONTEXT_MODES.map(option => (
              <ContextModeCard
                key={option.id}
                option={option}
                selected={mode === option.id}
                onSelect={() => selectMode(option.id)}
              />
            ))}
          </div>
          <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2">
            <div className="text-xs font-bold text-[var(--text-main)]">
              Estimated context: ~{formatCompactTokens(preview.estimatedTokens)} tokens
              {preview.limitsKnown && preview.contextWindow ? (
                <span className="text-[var(--text-muted)] font-semibold"> / {formatCompactTokens(preview.contextWindow)}</span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <ContextLevelBadge level={preview.contextLevel} />
              {preview.estimatedInputCost && <span className="text-[11px] text-[var(--text-muted)]">Estimated input: {formatCost(preview.estimatedInputCost)}</span>}
            </div>
            {preview.includedSources.labels.length > 0 && (
              <details className="mt-2">
                <summary className="text-[11px] font-bold text-[var(--accent)] cursor-pointer">Context included</summary>
                <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--text-muted)]">
                  {preview.includedSources.labels.slice(0, 10).map(label => <li key={label}>- {label}</li>)}
                </ul>
              </details>
            )}
            {preview.warnings.length > 0 && (
              <div className="mt-1 space-y-1">
                {preview.warnings.map(warning => (
                  <p key={warning} className="text-[11px] text-amber-400 leading-snug">{warning}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        <Section title="Custom instruction" defaultOpen={!!ctx.customInstruction}>
          <textarea
            value={ctx.customInstruction}
            onChange={e => setCtx(prev => ({ ...prev, customInstruction: e.target.value }))}
            placeholder="Tell the AI anything extra — tone, style, what you're working on…"
            rows={4}
            className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-base text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
          />
        </Section>
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
        <button
          onClick={() => onStart(ctx, agentId, freedomLevel)}
          className="flex-1 bg-[var(--accent)] text-[var(--bg-main)] font-bold py-2 rounded text-sm hover:opacity-90"
        >
          Start Chat
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] text-sm hover:text-[var(--text-main)]">Cancel</button>
      </div>
    </div>
  )
}

// ── Chat View ─────────────────────────────────────────────────────────────────

function responseTitle(content, fallback = 'AI response') {
  const firstLine = (content || '').split('\n').map(line => line.trim()).find(Boolean) || fallback
  return firstLine
    .replace(/^#+\s*/, '')
    .replace(/^[-*]+\s*/, '')
    .slice(0, 72)
}

function UsageDetails({ usage, contextStats }) {
  if (!usage && !contextStats) return null
  return (
    <details className="mt-2 text-[10px] text-[var(--text-muted)]">
      <summary className="cursor-pointer hover:text-[var(--text-main)]">AI usage</summary>
      <div className="mt-1 leading-relaxed">
        {usage ? (
          <>
            <div>{formatCompactTokens(usage.inputTokens)} input · {formatCompactTokens(usage.cachedInputTokens)} cached · {formatCompactTokens(usage.outputTokens)} output</div>
            {usage.hasCost && <div>Estimated cost: {formatCost(usage.estimatedCost)}</div>}
          </>
        ) : (
          <div>Estimated context: ~{formatCompactTokens(contextStats?.estimatedTokens)} tokens</div>
        )}
        {contextStats?.includedSources?.labels?.length > 0 && (
          <div className="mt-1">
            <div className="font-bold text-[var(--text-main)]">Context included</div>
            {contextStats.includedSources.labels.slice(0, 8).map(label => <div key={label}>- {label}</div>)}
          </div>
        )}
      </div>
    </details>
  )
}

function mergeUsageEvent(previous, next) {
  if (!previous) return next
  if (!next) return previous
  return {
    ...previous,
    ...next,
    inputTokens: Math.max(previous.inputTokens || 0, next.inputTokens || 0),
    cachedInputTokens: Math.max(previous.cachedInputTokens || 0, next.cachedInputTokens || 0),
    outputTokens: Math.max(previous.outputTokens || 0, next.outputTokens || 0),
    totalTokens: Math.max(previous.totalTokens || 0, next.totalTokens || 0, (next.inputTokens || previous.inputTokens || 0) + (next.outputTokens || previous.outputTokens || 0)),
    estimatedCost: Math.max(previous.estimatedCost || 0, next.estimatedCost || 0),
    hasCost: previous.hasCost || next.hasCost,
  }
}

function Message({ msg, onRequestSave, onRetry, streaming }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)
  const [savedAs, setSavedAs] = useState('')
  const [saving, setSaving] = useState('')

  const copyMessage = async () => {
    if (!msg.content) return
    try {
      await navigator.clipboard.writeText(msg.content)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = msg.content
      textArea.setAttribute('readonly', '')
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const requestSave = async (type) => {
    if (!msg.content || msg.streaming || saving) return
    setSaving(type)
    const saved = await onRequestSave?.(type, msg.content)
    setSaving('')
    if (!saved) return
    setSavedAs(type)
    window.setTimeout(() => setSavedAs(''), 1400)
  }

  const canRetry = !isUser && msg.error && !!onRetry

  return (
    <div className={`ai-chat-message flex ${isUser ? 'justify-end is-user' : 'justify-start is-assistant'} mb-3 group/message`}>
      <div className={`max-w-[88%] min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`ai-chat-bubble w-full px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[var(--accent)] text-[var(--bg-main)] rounded-br-sm'
            : 'bg-[var(--bg-nav)] border border-[var(--border)] text-[var(--text-main)] rounded-bl-sm'
        } ${msg.error ? 'border-red-500/50 text-red-400 bg-transparent' : ''}`}>
          {msg.content}
          {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-[var(--accent)] ml-0.5 animate-pulse rounded-sm align-middle" />}
        </div>
        {/* Single row for all message actions — previously Copy sat on its own
            line directly above the Idea/Lore row, which read as two stacked,
            overlapping-looking button clusters. */}
        <div className="ai-message-actions flex items-center flex-wrap gap-1">
          <button
            type="button"
            onClick={copyMessage}
            disabled={!msg.content}
            title={copied ? 'Copied' : `Copy ${isUser ? 'prompt' : 'answer'}`}
            className={`h-6 px-2 inline-flex items-center gap-1 rounded border text-[10px] font-bold transition-all ${
              isUser
                ? 'border-[var(--accent)]/30 text-[var(--text-main)] bg-[var(--bg-nav)] hover:border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-main)] hover:text-[var(--text-main)] hover:border-[var(--accent)]'
            } ${msg.content ? 'opacity-100' : 'opacity-40 cursor-not-allowed'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canRetry && (
            <button
              type="button"
              onClick={() => onRetry(msg.id)}
              disabled={streaming}
              title="Resend this request"
              className="h-6 px-2 inline-flex items-center gap-1 rounded border border-red-500/40 text-[10px] font-bold text-red-400 bg-transparent hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => requestSave('idea')}
            disabled={!msg.content || msg.streaming || !!saving}
            title={isUser ? 'Save message as an idea' : 'Save answer as an idea'}
            className="h-6 px-2 inline-flex items-center gap-1 rounded border border-[var(--border)] text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-main)] hover:text-[var(--text-main)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.7-1.5 1.6-1.5 2.5h-4c0-.9-.6-1.8-1.5-2.5Z" /></svg>
            {savedAs === 'idea' ? 'Saved' : saving === 'idea' ? '…' : 'Idea'}
          </button>
          <button
            type="button"
            onClick={() => requestSave('lore')}
            disabled={!msg.content || msg.streaming || !!saving}
            title={isUser ? 'Save message as a lore entry' : 'Save answer as a lore entry'}
            className="h-6 px-2 inline-flex items-center gap-1 rounded border border-[var(--border)] text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-main)] hover:text-[var(--text-main)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>
            {savedAs === 'lore' ? 'Saved' : saving === 'lore' ? '…' : 'Lore'}
          </button>
        </div>
        {!isUser && <UsageDetails usage={msg.usage} contextStats={msg.contextStats} />}
      </div>
    </div>
  )
}

function SaveEntryModal({ type, content, existingCategories = [], existingGroups = [], onSave, onClose }) {
  const isIdea = type === 'idea'
  const [title, setTitle]     = useState(() => responseTitle(content, isIdea ? 'New idea' : 'New lore entry'))
  const [category, setCategory] = useState('AI Chat')
  const [body, setBody]       = useState(content || '')

  const submit = (e) => {
    e.preventDefault()
    const trimmedTitle    = title.trim() || (isIdea ? 'Untitled idea' : 'Untitled entry')
    const trimmedCategory = category.trim()
    if (isIdea) {
      onSave({ title: trimmedTitle, description: body, body, group: trimmedCategory, tags: ['AI Chat'] })
    } else {
      onSave({ title: trimmedTitle, category: trimmedCategory || 'AI Chat', content: body, tags: ['AI Chat'] })
    }
  }

  const listId  = isIdea ? 'ai-save-groups' : 'ai-save-categories'
  const options = isIdea ? existingGroups : existingCategories

  return (
    <Modal title={isIdea ? 'Save as Idea' : 'Save as Lore Entry'} onClose={onClose} centered>
      <form onSubmit={submit} className="space-y-3 text-left">
        <div>
          <label className="block form-label mb-1.5">Title</label>
          <input
            className="field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={isIdea ? 'e.g. A hidden second moon' : 'e.g. The Binding Laws'}
            autoFocus
          />
        </div>
        <div>
          <label className="block form-label mb-1.5">{isIdea ? 'Group' : 'Category'}</label>
          <input
            className="field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]"
            list={listId}
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder={isIdea ? 'e.g. Worldbuilding' : 'e.g. Magic System'}
          />
          <datalist id={listId}>{options.map(o => <option key={o} value={o} />)}</datalist>
        </div>
        <div>
          <label className="block form-label mb-1.5">Content</label>
          <textarea
            className="field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)] resize-none h-48"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-main)]">Cancel</button>
          <button type="submit" className="bg-[var(--accent)] text-[var(--bg-main)] font-bold px-4 py-2 rounded text-sm hover:opacity-90">
            Save {isIdea ? 'Idea' : 'Lore Entry'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Streamed responses arrive as many small chunks per second. Pushing every
// chunk into the session (and from there into the global novels store, which
// diffs and persists the *entire* collection — see commitLocal in useStore.js)
// turned each AI reply into dozens of full-collection JSON stringify/parse and
// localStorage-write cycles per second, which is what made the chat feel
// laggy while the AI was typing. Chunks now only update local component state
// (cheap, ChatView-only re-render); the session/global store is flushed at
// most once per this interval, plus always on completion/stop, so a crash
// mid-stream still loses at most one interval's worth of text.
const STREAM_FLUSH_INTERVAL_MS = 400

function ChatView({ session, store, aiSettings, onUpdate, onBack, onPin, onSetCategory, onUsage }) {
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [liveMessage, setLiveMessage] = useState(null) // { id, content } — in-flight assistant text not yet flushed to the store
  const [editingCategory, setEditingCategory] = useState(false)
  const [categoryDraft, setCategoryDraft]     = useState('')
  const [editingTitle, setEditingTitle]       = useState(false)
  const [titleDraft, setTitleDraft]           = useState('')
  const [saveModal, setSaveModal]             = useState(null) // { type, content, resolve }
  const bottomRef      = useRef(null)
  const scrollRef       = useRef(null)
  const isNearBottomRef = useRef(true)
  const abortRef       = useRef(false)
  const inputRef       = useRef(null)
  const categoryInputRef = useRef(null)
  const titleInputRef     = useRef(null)
  const lastFlushRef    = useRef(0)

  // Defensive: a session's `messages` should always be an array, but guard against
  // any that were ever saved malformed (e.g. mid-write interruption) — reading
  // .length off undefined here crashes the whole Manuscript view for that project.
  const messages = useMemo(
    () => Array.isArray(session.messages) ? session.messages : [],
    [session.messages]
  )

  // Overlay the not-yet-flushed streaming text onto the message list for display,
  // so typing still looks live even though the store isn't updated on every chunk.
  const displayMessages = useMemo(() => {
    if (!liveMessage) return messages
    return messages.map(m => m.id === liveMessage.id ? { ...m, content: liveMessage.content } : m)
  }, [messages, liveMessage])

  const resizeInput = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = 150
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  const startEditCategory = () => {
    setCategoryDraft(session.category || '')
    setEditingCategory(true)
    setTimeout(() => categoryInputRef.current?.focus(), 10)
  }
  const commitCategory = () => {
    onSetCategory(session.id, categoryDraft.trim())
    setEditingCategory(false)
  }

  const startEditTitle = () => {
    setTitleDraft(session.title || '')
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 10)
  }
  const commitTitle = () => {
    const next = titleDraft.trim()
    if (next) onUpdate(session.id, { title: next })
    setEditingTitle(false)
  }

  // Only auto-scroll if the reader is already at (or near) the bottom, so
  // scrolling up to re-read earlier messages while a reply streams in doesn't
  // get yanked back down.
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }

  // New message appended (user sends, or a reply starts/finishes) — smooth-scroll once.
  useEffect(() => {
    if (isNearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Streaming text growing — re-running scrollIntoView({ smooth }) on every one of
  // these (previously on every chunk) restarted the scroll animation dozens of
  // times a second, which is what made the reply feel jumpy as it typed out.
  // An instant jump keeps it pinned to the bottom without the repeated animation.
  useEffect(() => {
    if (liveMessage && isNearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [liveMessage?.content])

  useEffect(() => { inputRef.current?.focus() }, [session.id])
  useEffect(() => { resizeInput() }, [input, session.id, resizeInput])

  const provider  = aiSettings.activeProvider
  const provCfg   = aiSettings[provider]
  const hasKey = !!provCfg.apiKey?.trim()

  const promptStore = useMemo(
    () => store.getProjectContextData?.(session.novelId) ?? store,
    [store, session.novelId]
  )

  const existingLoreCategories = useMemo(
    () => [...new Set((promptStore.loreEntries || []).map(e => e.category).filter(Boolean))].sort(),
    [promptStore]
  )
  const existingIdeaGroups = useMemo(
    () => [...new Set((promptStore.ideaEntries || []).map(e => e.group).filter(Boolean))].sort(),
    [promptStore]
  )

  const freedom = getFreedomLevel(session.freedomLevel)

  // Shared by send() (appends a new user+assistant pair) and retry() (replaces
  // a failed assistant reply in place) — nextMessages is the full messages
  // array to write, already containing the fresh streaming placeholder.
  const runAssistantStream = (nextMessages, assistantMsgId, apiMessages, userPrompt) => {
    const model = provCfg.model || PROVIDERS[provider]?.defaultModel
    const builtContext = buildAIContext({
      projectId: session.novelId,
      mode: session.context?.mode,
      userPrompt,
      activeCharacterId: store.selectedCharacterId,
      provider,
      model,
      store,
      customInstruction: session.context?.customInstruction,
    })
    const systemPrompt = buildSystemPrompt(
      promptStore.activeNovel,
      {
        ...session.context,
        builtContext: builtContext.context,
        stableContext: builtContext.stableContext,
        requestContext: builtContext.requestContext,
      },
      promptStore,
      buildAiBehaviorDirective(session.agentId, session.freedomLevel)
    )
    const summarizedMessages = summarizeOlderConversation(apiMessages)
    const fittedMessages = fitMessagesToInputBudget(summarizedMessages, systemPrompt, builtContext.safeInputBudget)
    const contextWarnings = fittedMessages.length < apiMessages.length
      ? [...builtContext.warnings, 'Older chat history was omitted so this request stays within the selected model budget.']
      : builtContext.warnings
    const messageContextStats = {
      estimatedTokens: builtContext.estimatedTokens,
      safeInputBudget: builtContext.safeInputBudget,
      contextWindow: builtContext.contextWindow,
      truncated: builtContext.truncated,
      warnings: contextWarnings,
      includedSources: builtContext.includedSources,
      contextLevel: builtContext.contextLevel,
      estimatedInputCost: builtContext.estimatedInputCost,
      stableFingerprint: builtContext.stableFingerprint,
      contextFingerprint: builtContext.contextFingerprint,
      cache: builtContext.cache,
    }
    const promptMetadata = {
      provider,
      model,
      contextMode: builtContext.includedSources.mode,
      stableFingerprint: builtContext.stableFingerprint,
      contextFingerprint: builtContext.contextFingerprint,
    }

    onUpdate(session.id, {
      messages: nextMessages,
      context: { ...session.context, mode: builtContext.includedSources.mode },
      contextStats: {
        ...messageContextStats,
      },
      updatedAt: Date.now(),
    })
    setStreaming(true)
    setLiveMessage({ id: assistantMsgId, content: '' })
    lastFlushRef.current = Date.now()

    let accumulated = ''
    let latestUsage = null

    streamMessage({
      provider,
      apiKey:  provCfg.apiKey,
      model,
      baseUrl: provCfg.baseUrl,
      systemPrompt,
      messages: fittedMessages,
      cacheControl: builtContext.cache,
      promptMetadata,
      onChunk: (chunk) => {
        if (abortRef.current) return
        accumulated += chunk
        // Update local state on every chunk (cheap) so it still looks live;
        // only push into the session/global store periodically (see
        // STREAM_FLUSH_INTERVAL_MS comment above ChatView).
        setLiveMessage({ id: assistantMsgId, content: accumulated })
        const now = Date.now()
        if (now - lastFlushRef.current >= STREAM_FLUSH_INTERVAL_MS) {
          lastFlushRef.current = now
          onUpdate(session.id, {
            messages: nextMessages.map(m => m.id === assistantMsgId ? { ...m, content: accumulated } : m),
            updatedAt: Date.now(),
          })
        }
      },
      onDone: () => {
        setStreaming(false)
        if (latestUsage) onUsage?.(latestUsage)
        onUpdate(session.id, {
          messages: nextMessages.map(m => m.id === assistantMsgId ? { ...m, content: accumulated, streaming: false, contextStats: messageContextStats, ...(latestUsage ? { usage: latestUsage } : {}) } : m),
          updatedAt: Date.now(),
        })
        setLiveMessage(null)
      },
      onUsage: (usage) => {
        latestUsage = mergeUsageEvent(latestUsage, usage)
        onUpdate(session.id, {
          messages: nextMessages.map(m => m.id === assistantMsgId ? { ...m, usage: latestUsage, contextStats: messageContextStats } : m),
          contextStats: messageContextStats,
          updatedAt: Date.now(),
        })
      },
      onError: (err) => {
        setStreaming(false)
        onUpdate(session.id, {
          messages: nextMessages.map(m => m.id === assistantMsgId ? { ...m, content: `Error: ${err}`, streaming: false, error: true } : m),
          updatedAt: Date.now(),
        })
        setLiveMessage(null)
      },
    })
  }

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    if (!hasKey) {
      const assistantMsg = { id: uid(), role: 'assistant', content: AI_CONFIG_REQUIRED_TEXT, streaming: false, error: true }
      onUpdate(session.id, { messages: [...messages, assistantMsg], updatedAt: Date.now() })
      return
    }
    setInput('')
    abortRef.current = false

    const userMsg      = { id: uid(), role: 'user',      content: text }
    const assistantMsg = { id: uid(), role: 'assistant', content: '', streaming: true }
    const nextMessages = [...messages, userMsg, assistantMsg]
    const apiMessages  = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    runAssistantStream(nextMessages, assistantMsg.id, apiMessages, text)
  }

  // Re-send a failed request: reuses the conversation up to (but not
  // including) the failed reply, and replaces it in place with a fresh
  // streaming placeholder rather than appending a duplicate exchange.
  const retry = (failedMsgId) => {
    if (streaming) return
    const idx = messages.findIndex(m => m.id === failedMsgId)
    if (idx === -1) return
    const priorMessages = messages.slice(0, idx)
    if (!hasKey) {
      const assistantMsg = { id: uid(), role: 'assistant', content: AI_CONFIG_REQUIRED_TEXT, streaming: false, error: true }
      onUpdate(session.id, { messages: [...priorMessages, assistantMsg, ...messages.slice(idx + 1)], updatedAt: Date.now() })
      return
    }
    abortRef.current = false
    const assistantMsg = { id: uid(), role: 'assistant', content: '', streaming: true }
    const nextMessages = [...priorMessages, assistantMsg, ...messages.slice(idx + 1)]
    const apiMessages  = priorMessages.map(m => ({ role: m.role, content: m.content }))
    const lastUserPrompt = [...priorMessages].reverse().find(m => m.role === 'user')?.content || ''
    runAssistantStream(nextMessages, assistantMsg.id, apiMessages, lastUserPrompt)
  }

  const stop = () => {
    abortRef.current = true
    setStreaming(false)
    const stoppedMessages = messages.map(m => {
      if (!m.streaming) return m
      // Carry over whatever text arrived since the last periodic flush so
      // stopping mid-stream doesn't drop the most recent chunks.
      const latestContent = liveMessage?.id === m.id ? liveMessage.content : m.content
      return { ...m, content: latestContent, streaming: false }
    })
    onUpdate(session.id, { messages: stoppedMessages })
    setLiveMessage(null)
  }

  const requestSave = (type, content) => new Promise(resolve => setSaveModal({ type, content, resolve }))

  const closeSaveModal = (result = false) => {
    saveModal?.resolve?.(result)
    setSaveModal(null)
  }

  const confirmSave = (fields) => {
    const entry = saveModal?.type === 'idea' ? store.addIdeaEntry?.(fields) : store.addLoreEntry?.(fields)
    closeSaveModal(!!entry)
  }

  const exportChat = () => {
    if (!messages.length) return
    createAiChatDocxBlob(session).then(blob => {
      downloadBlob(blob, `${sanitizeFilename(session.title, 'ai-chat')}.docx`)
    }).catch(error => {
      console.error('[ai-chat] Could not export chat', error)
    })
  }

  const quickPrompts = [
    'What should I work on next?',
    'Find continuity risks in this context.',
    'Give me three scene ideas.',
  ]

  const contextMode = AI_CHAT_CONTEXT_MODES.find(item => item.id === normalizeAiContextMode(session.context?.mode)) || AI_CHAT_CONTEXT_MODES[0]

  return (
    <>
    <div className="ai-chat-view flex flex-col h-full">
      <div className="ai-chat-session-header px-3 py-2 border-b border-[var(--border)] flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              onBlur={commitTitle}
              className="w-full text-sm font-semibold bg-[var(--bg-main)] border border-[var(--accent)]/40 rounded px-1.5 py-0.5 text-[var(--text-main)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startEditTitle}
              title="Rename chat"
              className="block w-full text-left text-sm font-semibold text-[var(--text-main)] truncate hover:text-[var(--accent)] transition-colors"
            >
              {session.title}
            </button>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <select
              value={session.agentId || DEFAULT_AGENT_ID}
              onChange={e => onUpdate(session.id, { agentId: e.target.value })}
              title="Behavior mode"
              className="text-[10px] bg-transparent border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)] outline-none focus:border-[var(--accent)] hover:text-[var(--text-main)] transition-colors"
            >
              {AI_AGENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            <select
              value={freedom.id}
              onChange={e => onUpdate(session.id, { freedomLevel: e.target.value })}
              title="Creative freedom"
              className="text-[10px] bg-transparent border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-muted)] outline-none focus:border-[var(--accent)] hover:text-[var(--text-main)] transition-colors"
            >
              {AI_FREEDOM_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
            </select>
            <span className="text-[10px] text-[var(--accent)]">
              <span aria-hidden="true">{contextMode.icon}</span> {contextMode.label}
              {session.contextStats?.estimatedTokens ? ` · ~${formatCompactTokens(session.contextStats.estimatedTokens)} tokens` : ''}
            </span>
            {editingCategory ? (
              <input
                ref={categoryInputRef}
                value={categoryDraft}
                onChange={e => setCategoryDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitCategory(); if (e.key === 'Escape') setEditingCategory(false) }}
                onBlur={commitCategory}
                placeholder="Category…"
                className="text-[10px] bg-[var(--bg-main)] border border-[var(--accent)]/40 rounded px-1.5 py-0.5 text-[var(--text-main)] outline-none w-24"
              />
            ) : session.category ? (
              <button type="button" onClick={startEditCategory}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-fade)] text-[var(--accent)] border border-[var(--accent)]/20 hover:border-[var(--accent)]/50 transition-colors">
                {session.category}
              </button>
            ) : (
              <button type="button" onClick={startEditCategory}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">
                + category
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={exportChat}
          disabled={!messages.length}
          title="Export chat"
          className="h-7 w-7 inline-flex items-center justify-center border rounded transition-colors flex-shrink-0 border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onPin(session.id)}
          title={session.pinned ? 'Unpin' : 'Pin'}
          className={`h-7 w-7 inline-flex items-center justify-center border rounded transition-colors flex-shrink-0 ${
            session.pinned
              ? 'border-[var(--accent)]/40 text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--accent)]'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={session.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="ai-chat-scroll flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-3">
            <AIStar size={28} className="text-[var(--accent)] opacity-70" />
            {!hasKey && <AiConfigRequiredNotice style={{ maxWidth: 320, textAlign: 'left' }} />}
            <p className="text-xs text-[var(--text-muted)]">Ask anything about your project, or start with one of these.</p>
            <div className="grid gap-2 w-full max-w-[320px]">
              {quickPrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setInput(prompt)
                    inputRef.current?.focus()
                  }}
                  className="text-left text-xs text-[var(--text-main)] bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2 hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {displayMessages.map(msg => <Message key={msg.id} msg={msg} onRequestSave={requestSave} onRetry={retry} streaming={streaming} />)}
        <div ref={bottomRef} />
      </div>

      <div className="ai-chat-composer px-3 pb-3 pt-2 border-t border-[var(--border)] flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            name="yow-ai-chat-message"
            autoComplete="off"
            autoCorrect="on"
            spellCheck
            value={input}
            onChange={e => {
              setInput(e.target.value)
              queueMicrotask(resizeInput)
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask the AI…  (Shift+Enter for new line)"
            rows={1}
            disabled={streaming}
            className="ai-chat-input flex-1 min-h-10 max-h-36 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2 text-base text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none disabled:opacity-50 transition-colors"
          />
          {streaming && (
            <button
              type="button"
              onClick={stop}
              title="Stop response"
              className="h-9 w-9 flex items-center justify-center border border-[var(--border)] text-[var(--text-muted)] rounded-lg hover:text-[var(--text-main)] hover:border-[var(--accent)] transition-colors flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
            </button>
          )}
          <button
            onClick={send}
            disabled={!input.trim() || streaming || !hasKey}
            className="h-9 w-9 flex items-center justify-center bg-[var(--accent)] text-[var(--bg-main)] rounded-lg disabled:opacity-40 hover:opacity-90 transition-all flex-shrink-0"
          >
            {streaming
              ? <span className="w-3 h-3 border-2 border-[var(--bg-main)]/40 border-t-[var(--bg-main)] rounded-full animate-spin" />
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            }
          </button>
        </div>
      </div>
    </div>
    {saveModal && (
      <SaveEntryModal
        type={saveModal.type}
        content={saveModal.content}
        existingCategories={existingLoreCategories}
        existingGroups={existingIdeaGroups}
        onSave={confirmSave}
        onClose={() => closeSaveModal(false)}
      />
    )}
    </>
  )
}

// ── Session List ──────────────────────────────────────────────────────────────

function SessionUsageSummary({ usage }) {
  if (!usage?.requests) return null
  return (
    <div className="mx-3 mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-main)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
      <div className="font-bold text-[var(--text-main)]">This session</div>
      <div className="mt-1">
        Requests: {usage.requests} · Input: {formatCompactTokens(usage.inputTokens)} · Cached: {formatCompactTokens(usage.cachedInputTokens)} · Output: {formatCompactTokens(usage.outputTokens)}
      </div>
      {usage.hasCost && <div>Estimated API cost: {formatCost(usage.estimatedCost)}</div>}
    </div>
  )
}

function SessionList({ sessions, aiSettings, usageTotals, onSelect, onNew, onDelete, onPin, onSetCategory }) {
  const provider  = aiSettings.activeProvider
  const provLabel = PROVIDERS[provider]?.name || provider
  const model     = aiSettings[provider]?.model || PROVIDERS[provider]?.defaultModel
  const hasKey    = !!aiSettings[provider]?.apiKey?.trim()

  const [categoryFilter, setCategoryFilter]     = useState('')
  const [editingCategoryFor, setEditingCategoryFor] = useState(null)
  const [categoryDraft, setCategoryDraft]           = useState('')
  const categoryInputRef = useRef(null)

  const categories = useMemo(
    () => [...new Set(sessions.map(s => s.category).filter(Boolean))].sort(),
    [sessions]
  )

  const sorted = useMemo(() =>
    [...sessions].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
    }),
    [sessions]
  )

  const filtered = categoryFilter ? sorted.filter(s => s.category === categoryFilter) : sorted

  const startEditCategory = (e, id, current) => {
    e.stopPropagation()
    setEditingCategoryFor(id)
    setCategoryDraft(current || '')
    setTimeout(() => categoryInputRef.current?.focus(), 20)
  }

  const commitCategory = (id) => {
    onSetCategory(id, categoryDraft.trim())
    setEditingCategoryFor(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="ai-chat-list-header px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-bold text-[var(--text-main)] text-sm">Chats</h3>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{provLabel} · {model}</div>
        </div>
        <button
          onClick={onNew}
          className="text-xs font-bold text-[var(--accent)] bg-[var(--accent-fade)] border border-[var(--accent)]/30 px-3 py-1 rounded-full hover:opacity-80 transition-opacity"
        >
          + New chat
        </button>
      </div>

      {!hasKey && (
        <div className="px-3 pt-3">
          <AiConfigRequiredNotice style={{ textAlign: 'left' }} />
        </div>
      )}

      <SessionUsageSummary usage={usageTotals} />

      {categories.length > 0 && (
        <div className="ai-chat-filter-bar px-3 py-2 border-b border-[var(--border)] flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              !categoryFilter
                ? 'bg-[var(--accent)] text-[var(--bg-main)] border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            All
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                categoryFilter === cat
                  ? 'bg-[var(--accent)] text-[var(--bg-main)] border-[var(--accent)]'
                  : 'bg-[var(--accent-fade)] text-[var(--accent)] border-[var(--accent)]/30 hover:border-[var(--accent)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 opacity-60">
            <AIStar size={32} />
            <p className="text-sm text-[var(--text-muted)]">Start a new chat to get writing help from AI.</p>
          </div>
        )}
        {filtered.length === 0 && sessions.length > 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 opacity-60">
            <p className="text-sm text-[var(--text-muted)]">No chats in this category.</p>
          </div>
        )}
        {filtered.map(s => {
          const sMessages = Array.isArray(s.messages) ? s.messages : []
          const lastMsg = sMessages[sMessages.length - 1]
          const preview = lastMsg?.content?.slice(0, 70) || 'No messages yet'
          const mode = AI_CHAT_CONTEXT_MODES.find(item => item.id === normalizeAiContextMode(s.context?.mode)) || AI_CHAT_CONTEXT_MODES[0]
          const isEditingCat = editingCategoryFor === s.id

          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-hover)] cursor-pointer group transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {s.pinned && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent)] flex-shrink-0">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    )}
                    <div className="text-sm font-medium text-[var(--text-main)] truncate">{s.title}</div>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{preview}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {s.agentId && s.agentId !== DEFAULT_AGENT_ID && (
                      <div className="text-[10px] text-[var(--text-muted)]">{getAgent(s.agentId).label}</div>
                    )}
                    {s.freedomLevel && s.freedomLevel !== DEFAULT_AI_FREEDOM_LEVEL && (
                      <div className="text-[10px] text-[var(--text-muted)]">{getFreedomLevel(s.freedomLevel).label}</div>
                    )}
                    <div className="text-[10px] text-[var(--accent)]">
                      <span aria-hidden="true">{mode.icon}</span> {mode.label}
                      {s.contextStats?.estimatedTokens ? ` · ~${formatCompactTokens(s.contextStats.estimatedTokens)} tokens` : ''}
                    </div>
                    {isEditingCat ? (
                      <input
                        ref={categoryInputRef}
                        value={categoryDraft}
                        onChange={e => setCategoryDraft(e.target.value)}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter') commitCategory(s.id)
                          if (e.key === 'Escape') setEditingCategoryFor(null)
                        }}
                        onBlur={() => commitCategory(s.id)}
                        onClick={e => e.stopPropagation()}
                        placeholder="Category…"
                        className="text-[10px] bg-[var(--bg-main)] border border-[var(--accent)]/40 rounded px-1.5 py-0.5 text-[var(--text-main)] outline-none w-24"
                      />
                    ) : s.category ? (
                      <button
                        type="button"
                        onClick={e => startEditCategory(e, s.id, s.category)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-fade)] text-[var(--accent)] border border-[var(--accent)]/20 hover:border-[var(--accent)]/50 transition-colors"
                      >
                        {s.category}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={e => startEditCategory(e, s.id, '')}
                        className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors opacity-0 group-hover:opacity-100"
                      >
                        + category
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); onPin(s.id) }}
                    title={s.pinned ? 'Unpin' : 'Pin'}
                    className={`h-6 w-6 flex items-center justify-center rounded transition-all ${
                      s.pinned
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--text-main)]'
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill={s.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-400 transition-all h-6 w-6 flex items-center justify-center"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Root Panel ────────────────────────────────────────────────────────────────

function AIUpgradeWall({ onClose, docked }) {
  const panelMode = docked
    ? 'ai-panel-docked rounded-lg'
    : 'fixed right-3 bottom-3 left-3 top-20 sm:left-auto sm:top-auto sm:right-5 sm:bottom-5 sm:w-[430px] sm:h-[min(680px,calc(100vh-7rem))] rounded-xl'

  return (
    <div
      className={`z-50 bg-[var(--bg-nav)] border border-[var(--border)] flex flex-col shadow-2xl overflow-hidden ${panelMode}`}
      role="dialog"
      aria-label="AI chat"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <AIStar size={14} className="text-[var(--accent)]" />
          <span className="block text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">AI Chat</span>
        </div>
        {!docked && (
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-8 py-10">
        <AIStar size={42} className="opacity-40" />
        <div>
          <p className="text-sm font-bold text-[var(--text-main)] mb-2">AI assistant is a paid feature</p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Upgrade your plan to unlock AI-powered writing assistance, brainstorming, and worldbuilding help.
          </p>
        </div>
        <button
          type="button"
          onClick={openAiPlans}
          className="mt-2 bg-[var(--accent)] text-[var(--bg-main)] font-bold text-sm px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          View plans
        </button>
      </div>
    </div>
  )
}

export default function AIPanel({ store, open, onClose, initialContext, membership, userId = null, docked = false, onPopOut }) {
  const novelId = store.activeNovelId
  const chatStorageKey = getAiChatStorageKey(novelId)
  const activeProject = store.novels?.find?.(novel => novel.id === novelId) ?? store.activeNovel ?? null
  const [aiSettings, setAiSettings] = useState(() => loadAiSettings(userId, DEFAULT_SETTINGS))
  const [sessions,   setSessions]   = useState(() => mergeAiChatSessions(activeProject?.aiChatSessions, loadAiChatSessions(novelId), novelId))
  const [view,       setView]       = useState('sessions') // 'sessions' | 'context' | 'chat'
  const [activeId,   setActiveId]   = useState(null)
  const [fullscreen, setFullscreen] = useState(() => load('nf_aiFullscreen', false))
  const [minimized,  setMinimized]  = useState(false)
  const [panelFrame, setPanelFrame] = useState(() => clampPanelFrame(load(AI_PANEL_FRAME_KEY, getDefaultPanelFrame())))
  const [usageTotals, setUsageTotals] = useState(() => emptyAiUsageTotals())
  const activeChatStorageKey = useRef(chatStorageKey)
  const panelFrameRef = useRef(panelFrame)

  // AI provider/model settings are read-only here — they're only ever
  // edited in Account Settings. Reload whenever that page saves a change,
  // so this panel never sends to a provider/model cached from panel-open.
  useEffect(() => {
    setAiSettings(loadAiSettings(userId, DEFAULT_SETTINGS))
  }, [userId])
  useEffect(() => {
    const handleAiSettingsUpdate = () => setAiSettings(loadAiSettings(userId, DEFAULT_SETTINGS))
    window.addEventListener(AI_SETTINGS_EVENT, handleAiSettingsUpdate)
    return () => window.removeEventListener(AI_SETTINGS_EVENT, handleAiSettingsUpdate)
  }, [userId])
  useEffect(() => {
    activeChatStorageKey.current = chatStorageKey
    const projectSessions = normalizeAiChatSessions(activeProject?.aiChatSessions, novelId)
    const legacySessions = loadAiChatSessions(novelId)
    const nextSessions = mergeAiChatSessions(projectSessions, legacySessions, novelId)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessions(prev => sameJson(prev, nextSessions) ? prev : nextSessions)
    setActiveId(null)
    setView('sessions')
    if (legacySessions.length && activeProject?.id && typeof store.updateNovel === 'function' && !sameJson(projectSessions, nextSessions)) {
      store.updateNovel(activeProject.id, { aiChatSessions: nextSessions })
    }
  }, [chatStorageKey, novelId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeChatStorageKey.current !== chatStorageKey) return
    if (!activeProject?.id || typeof store.updateNovel !== 'function') return
    const projectSessions = normalizeAiChatSessions(activeProject.aiChatSessions, novelId)
    if (sameJson(projectSessions, sessions)) return
    store.updateNovel(activeProject.id, { aiChatSessions: sessions })
  }, [sessions, chatStorageKey, novelId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handleChatHistoryUpdate = (event) => {
      if (event.detail?.storageKey !== chatStorageKey) return
      setSessions(prev => mergeAiChatSessions(event.detail?.sessions, prev, novelId))
    }
    window.addEventListener(AI_CHAT_HISTORY_EVENT, handleChatHistoryUpdate)
    return () => window.removeEventListener(AI_CHAT_HISTORY_EVENT, handleChatHistoryUpdate)
  }, [chatStorageKey, novelId])
  useEffect(() => { save('nf_aiFullscreen', fullscreen) }, [fullscreen])
  useEffect(() => { panelFrameRef.current = panelFrame; save(AI_PANEL_FRAME_KEY, panelFrame) }, [panelFrame])
  useEffect(() => {
    if (!open || docked) return undefined
    const handleKey = (event) => {
      if (event.key === 'Escape') setMinimized(true)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, docked])
  useEffect(() => {
    if (!open || docked || fullscreen) return undefined
    const handleResize = () => setPanelFrame(prev => clampPanelFrame(prev))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [open, docked, fullscreen])

  const activeProvider = aiSettings.activeProvider

  const handleNewChat = () => setView('context')

  const handleContextConfirm = (ctx, agentId, freedomLevel) => {
    const session = {
      id: uid(), novelId, title: `Chat ${sessions.length + 1}`,
      context: ctx, agentId: agentId || DEFAULT_AGENT_ID, freedomLevel: freedomLevel || DEFAULT_AI_FREEDOM_LEVEL, messages: [], createdAt: Date.now(),
      pinned: false, category: '',
    }
    setSessions(prev => [...prev, session])
    setActiveId(session.id)
    setView('chat')
  }

  const updateSession = (id, patch) =>
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))

  const pinSession = (id) =>
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s))

  const setCategorySession = (id, category) =>
    setSessions(prev => prev.map(s => s.id === id ? { ...s, category } : s))

  const recordUsage = (usage) => {
    setUsageTotals(prev => addAiUsage(prev, usage))
  }

  const deleteSession = (id) => {
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeId === id) { setActiveId(null); setView('sessions') }
  }

  const startMove = (event) => {
    if (docked || fullscreen || event.button !== 0) return
    if (event.target.closest('button, input, textarea, select, a')) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const startFrame = panelFrameRef.current

    const move = (moveEvent) => {
      setPanelFrame(clampPanelFrame({
        ...startFrame,
        left: startFrame.left + moveEvent.clientX - startX,
        top: startFrame.top + moveEvent.clientY - startY,
      }))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const startResize = (event) => {
    if (docked || fullscreen || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startFrame = panelFrameRef.current

    const move = (moveEvent) => {
      setPanelFrame(clampPanelFrame({
        ...startFrame,
        width: startFrame.width + moveEvent.clientX - startX,
        height: startFrame.height + moveEvent.clientY - startY,
      }))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const handleClose = () => {
    setMinimized(false)
    onClose?.()
  }

  const activeSession = sessions.find(s => s.id === activeId) ?? null

  if (!open) return null
  if (membership?.isFree) return <AIUpgradeWall onClose={onClose} docked={docked} />

  const latestSession = sessions[sessions.length - 1]

  if (!docked && minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="ai-tool-launcher"
        aria-label="Restore AI chat"
      >
        <span className="ai-tool-launcher-mark"><AIStar size={18} /></span>
        <span className="ai-tool-launcher-copy">
          <strong>AI Chat</strong>
          <span>{latestSession ? latestSession.title : 'Ready when you are'}</span>
        </span>
        {sessions.length > 0 && <span className="ai-tool-launcher-count">{sessions.length}</span>}
      </button>
    )
  }

  const panelMode = fullscreen
    ? 'fixed inset-3 sm:inset-5 rounded-xl'
    : docked
      ? 'ai-panel-docked rounded-lg'
      : 'ai-tool-panel fixed rounded-xl'

  const panelStyle = !fullscreen && !docked
    ? { left: panelFrame.left, top: panelFrame.top, width: panelFrame.width, height: panelFrame.height }
    : undefined
  const activeChatOpen = view === 'chat' && activeSession

  return (
    <div
      className={`z-50 bg-[var(--bg-nav)] border border-[var(--border)] flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${activeChatOpen ? 'ai-chat-active' : ''} ${panelMode}`}
      style={panelStyle}
      role="dialog"
      aria-label="AI chat"
    >

        {/* Header */}
        <div
          className={`ai-chat-header flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0 ${activeChatOpen ? 'is-compact' : ''} ${!docked && !fullscreen ? 'is-draggable' : ''}`}
          onPointerDown={startMove}
        >
          <div className="flex items-center gap-2">
            <span className="ai-chat-pulse text-[var(--accent)]"><AIStar size={12} /></span>
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text-main)] uppercase tracking-wider leading-tight">AI Chat</span>
              <span className="ai-chat-mode-label block text-[10px] text-[var(--text-muted)] leading-tight">
                {fullscreen ? 'Full screen' : docked ? 'Docked tool' : 'Drag to move'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!docked && !fullscreen && (
              <button
                type="button"
                onClick={() => setMinimized(true)}
                title="Minimize"
                className="h-7 w-7 inline-flex items-center justify-center text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-main)] hover:border-[var(--accent)] rounded transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg>
              </button>
            )}
            {docked && !fullscreen && (
              <button
                type="button"
                onClick={onPopOut}
                title="Pop out"
                className="h-7 w-7 inline-flex items-center justify-center text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-main)] hover:border-[var(--accent)] rounded transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 3h7v7" /><path d="M21 3l-9 9" /><path d="M10 5H5v14h14v-5" /></svg>
              </button>
            )}
            <button
              type="button"
              onClick={openAiSettings}
              title="Change model in Account Settings"
              className="text-[10px] font-bold border px-2 py-0.5 rounded transition-colors text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-main)]"
            >
              {(() => {
              const p = PROVIDERS[activeProvider]
              const model = aiSettings[activeProvider]?.model || p?.defaultModel || ''
              const modelLabel = p?.models?.find(m => m.id === model)?.label || model
              return modelLabel ? `${p?.name?.split(' ')[0] || 'AI'} · ${modelLabel}` : (p?.name?.split(' ')[0] || 'Not configured')
            })()}
            </button>
            <button
              type="button"
              onClick={() => setFullscreen(v => !v)}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
              className="h-7 w-7 inline-flex items-center justify-center text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--text-main)] hover:border-[var(--accent)] rounded transition-colors"
            >
              {fullscreen ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3v5H3" /><path d="M16 3v5h5" /><path d="M8 21v-5H3" /><path d="M16 21v-5h5" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M8 3H3v5" /><path d="M16 3h5v5" /><path d="M8 21H3v-5" /><path d="M16 21h5v-5" /></svg>
              )}
            </button>
            {!docked && (
              <button onClick={handleClose} title="Close" className="h-7 w-7 inline-flex items-center justify-center text-[var(--text-muted)] border border-transparent hover:text-[var(--text-main)] hover:border-[var(--border)] rounded transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden">
          {view === 'context' && (
            <ContextSelector
              store={store}
              aiSettings={aiSettings}
              initialContext={initialContext}
              initialFreedomLevel={DEFAULT_AI_FREEDOM_LEVEL}
              onStart={handleContextConfirm}
              onCancel={() => setView('sessions')}
            />
          )}
          {view === 'chat' && activeSession && (
            <ChatView
              session={activeSession}
              store={store}
              aiSettings={aiSettings}
              onUpdate={updateSession}
              onBack={() => { setActiveId(null); setView('sessions') }}
              onPin={pinSession}
              onSetCategory={setCategorySession}
              onUsage={recordUsage}
            />
          )}
          {view === 'sessions' && (
            <SessionList
              sessions={sessions}
              aiSettings={aiSettings}
              usageTotals={usageTotals}
              onSelect={(id) => { setActiveId(id); setView('chat') }}
              onNew={handleNewChat}
              onDelete={deleteSession}
              onPin={pinSession}
              onSetCategory={setCategorySession}
            />
          )}
        </div>
        {!docked && !fullscreen && (
          <button
            type="button"
            className="ai-resize-grip"
            onPointerDown={startResize}
            aria-label="Resize AI chat"
            title="Resize"
          />
        )}
      </div>
  )
}
