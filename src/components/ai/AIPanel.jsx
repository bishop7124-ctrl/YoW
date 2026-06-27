import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { streamMessage, buildSystemPrompt, PROVIDERS } from '../../utils/aiApi'

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const load = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }
const save = (key, val) => localStorage.setItem(key, JSON.stringify(val))

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

const DEFAULT_SETTINGS = {
  activeProvider: 'openrouter',
  google:      { apiKey: '', model: 'gemini-2.0-flash' },
  anthropic:   { apiKey: '', model: 'claude-sonnet-4-6' },
  openrouter:  { apiKey: import.meta.env.VITE_OPENROUTER_API_KEY ?? '', model: 'google/gemma-3-27b-it' },
  openai:      { apiKey: '', model: '', baseUrl: 'https://api.openai.com/v1' },
}

// ── Provider Settings ─────────────────────────────────────────────────────────

function ProviderSettings({ settings, onSave, onCancel }) {
  const [local, setLocal] = useState(settings)
  const active = local.activeProvider
  const prov = PROVIDERS[active]
  const cfg = local[active]

  const update = (field, val) =>
    setLocal(prev => ({ ...prev, [active]: { ...prev[active], [field]: val } }))

  const hasKey = !!cfg.apiKey.trim()

  return (
    <div className="flex flex-col h-full">
      <div className="ai-panel-subheader px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <h3 className="font-bold text-[var(--text-main)] text-sm">AI Settings</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Keys are stored locally and sent only to the chosen provider.</p>
        {/* Active model callout */}
        <div className="mt-3 flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--accent-fade)] border border-[var(--accent)]/30">
          <span className="text-[var(--accent)] text-sm flex-shrink-0">✦</span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-0.5">Active model</p>
            <p className="text-xs font-bold text-[var(--text-main)] leading-tight truncate">
              {(() => {
                const model = local[active]?.model || prov?.defaultModel || ''
                return prov?.models?.find(m => m.id === model)?.label || model || 'Not set'
              })()}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] leading-tight">{prov?.name}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Provider tabs */}
        <div>
          <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Provider</label>
          <div className="flex gap-1 p-1 bg-[var(--bg-main)] rounded-lg border border-[var(--border)]">
            {Object.entries(PROVIDERS).map(([id, p]) => {
              const connected = !!local[id]?.apiKey?.trim()
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLocal(prev => ({ ...prev, activeProvider: id }))}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all relative ${
                    active === id
                      ? 'bg-[var(--accent)] text-[var(--bg-main)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {p.name.split(' ')[0]}
                  {connected && (
                    <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${active === id ? 'bg-[var(--bg-main)]/60' : 'bg-[var(--accent)]'}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Model</label>
          {prov.models.length > 0 ? (
            <select
              value={cfg.model || prov.defaultModel}
              onChange={e => update('model', e.target.value)}
              className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            >
              {prov.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ) : (
            <input
              value={cfg.model}
              onChange={e => update('model', e.target.value)}
              placeholder={`e.g. ${prov.defaultModel}`}
              className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            />
          )}
        </div>

        {/* Base URL (OpenAI-compatible only) */}
        {prov.hasBaseUrl && (
          <div>
            <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">Base URL</label>
            <input
              value={cfg.baseUrl || ''}
              onChange={e => update('baseUrl', e.target.value)}
              placeholder={PROVIDERS.openai.defaultBaseUrl}
              className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Works with Groq, Together, Mistral, Ollama, and any OpenAI-compatible endpoint.</p>
          </div>
        )}

        {/* API Key */}
        <div>
          <label className="block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-2">
            API Key {hasKey && <span className="text-[var(--accent)] normal-case font-normal">· saved</span>}
          </label>
          <input
            type="password"
            value={cfg.apiKey}
            onChange={e => update('apiKey', e.target.value)}
            placeholder={prov.keyPlaceholder}
            className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
        <button
          onClick={() => onSave(local)}
          className="flex-1 bg-[var(--accent)] text-[var(--bg-main)] font-bold py-2 rounded text-sm hover:opacity-90"
        >
          Save
        </button>
        {onCancel && (
          <button onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] text-sm hover:text-[var(--text-main)]">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

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

function CheckItem({ label, sub, checked, onChange, image }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group py-0.5">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[var(--accent)] flex-shrink-0" />
      {image ? (
        <img src={image} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
      ) : sub !== undefined && (
        <div className="w-5 h-5 rounded-full bg-[var(--accent-fade)] border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0">
          <span className="text-[8px] font-bold text-[var(--accent)]">{label.charAt(0)}</span>
        </div>
      )}
      <span className="text-sm text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors leading-tight">
        {label}
        {sub && <span className="block text-[11px] text-[var(--text-muted)]">{sub}</span>}
      </span>
    </label>
  )
}

function ContextSelector({ store, onStart, onCancel, initialContext }) {
  const defaultContext = {
    characterIds: [], locationIds: [], loreEntryIds: [], worldHistoryIds: [], chapterIds: [], customInstruction: '',
  }
  const [ctx, setCtx] = useState({ ...defaultContext, ...(initialContext || {}) })

  const toggle = (field, id) => setCtx(prev => {
    const arr = prev[field] || []
    return { ...prev, [field]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] }
  })
  const selectAll = (field, ids) => setCtx(prev => ({ ...prev, [field]: ids }))
  const clearAll  = (field)      => setCtx(prev => ({ ...prev, [field]: [] }))

  const {
    characters = [], locations = [], loreEntries = [], worldHistory = [], chapters = [], acts = [],
  } = store

  const chaptersByAct = useMemo(() => {
    const map = {}
    acts.forEach(act => { map[act.id] = { act, chapters: chapters.filter(c => c.actId === act.id) } })
    return map
  }, [acts, chapters])

  const loreByCategory = useMemo(() => {
    const map = {}
    loreEntries.forEach(e => {
      const cat = e.category || 'Uncategorized'
      if (!map[cat]) map[cat] = []
      map[cat].push(e)
    })
    return map
  }, [loreEntries])

  const historyByEra = useMemo(() => {
    const map = {}
    worldHistory.forEach(entry => {
      const era = entry.era || entry.dateRange || 'Unassigned'
      if (!map[era]) map[era] = []
      map[era].push(entry)
    })
    return map
  }, [worldHistory])

  const total = ctx.characterIds.length + ctx.locationIds.length + ctx.loreEntryIds.length +
    ctx.worldHistoryIds.length + ctx.chapterIds.length

  return (
    <div className="flex flex-col h-full">
      <div className="ai-panel-subheader px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <h3 className="font-bold text-[var(--text-main)] text-sm">Configure context for this chat</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">Choose what the AI knows about your novel.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {characters.length > 0 && (
          <Section title={`Characters${ctx.characterIds.length ? ` (${ctx.characterIds.length})` : ''}`} defaultOpen={ctx.characterIds.length > 0}>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => selectAll('characterIds', characters.map(c => c.id))} className="text-[10px] text-[var(--accent)] hover:underline">All</button>
              <button type="button" onClick={() => clearAll('characterIds')} className="text-[10px] text-[var(--text-muted)] hover:underline">None</button>
            </div>
            {characters.map(c => <CheckItem key={c.id} label={c.name} sub={c.role} image={c.image} checked={ctx.characterIds.includes(c.id)} onChange={() => toggle('characterIds', c.id)} />)}
          </Section>
        )}

        {locations.length > 0 && (
          <Section title={`Locations${ctx.locationIds.length ? ` (${ctx.locationIds.length})` : ''}`} defaultOpen={ctx.locationIds.length > 0}>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => selectAll('locationIds', locations.map(l => l.id))} className="text-[10px] text-[var(--accent)] hover:underline">All</button>
              <button type="button" onClick={() => clearAll('locationIds')} className="text-[10px] text-[var(--text-muted)] hover:underline">None</button>
            </div>
            {locations.map(l => <CheckItem key={l.id} label={l.name} sub={l.category} checked={ctx.locationIds.includes(l.id)} onChange={() => toggle('locationIds', l.id)} />)}
          </Section>
        )}

        {loreEntries.length > 0 && (
          <Section title={`Lore${ctx.loreEntryIds.length ? ` (${ctx.loreEntryIds.length})` : ''}`} defaultOpen={ctx.loreEntryIds.length > 0}>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => selectAll('loreEntryIds', loreEntries.map(e => e.id))} className="text-[10px] text-[var(--accent)] hover:underline">All</button>
              <button type="button" onClick={() => clearAll('loreEntryIds')} className="text-[10px] text-[var(--text-muted)] hover:underline">None</button>
            </div>
            {Object.entries(loreByCategory).map(([cat, entries]) => (
              <div key={cat}>
                <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider mb-1 mt-2">{cat}</div>
                {entries.map(e => <CheckItem key={e.id} label={e.title} checked={ctx.loreEntryIds.includes(e.id)} onChange={() => toggle('loreEntryIds', e.id)} />)}
              </div>
            ))}
          </Section>
        )}

        {worldHistory.length > 0 && (
          <Section title={`History${ctx.worldHistoryIds.length ? ` (${ctx.worldHistoryIds.length})` : ''}`} defaultOpen={ctx.worldHistoryIds.length > 0}>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => selectAll('worldHistoryIds', worldHistory.map(h => h.id))} className="text-[10px] text-[var(--accent)] hover:underline">All</button>
              <button type="button" onClick={() => clearAll('worldHistoryIds')} className="text-[10px] text-[var(--text-muted)] hover:underline">None</button>
            </div>
            {Object.entries(historyByEra).map(([era, entries]) => (
              <div key={era}>
                <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider mb-1 mt-2">{era}</div>
                {entries.map(entry => (
                  <CheckItem
                    key={entry.id}
                    label={entry.title}
                    sub={entry.startYear || entry.endYear ? [entry.startYear, entry.endYear].filter(Boolean).join(' - ') : entry.dateRange}
                    checked={ctx.worldHistoryIds.includes(entry.id)}
                    onChange={() => toggle('worldHistoryIds', entry.id)}
                  />
                ))}
              </div>
            ))}
          </Section>
        )}

        {chapters.length > 0 && (
          <Section title={`Manuscript${ctx.chapterIds.length ? ` (${ctx.chapterIds.length} chapters)` : ''}`} defaultOpen={ctx.chapterIds.length > 0}>
            <div className="flex gap-2 mb-2">
              <button type="button" onClick={() => selectAll('chapterIds', chapters.map(c => c.id))} className="text-[10px] text-[var(--accent)] hover:underline">All</button>
              <button type="button" onClick={() => clearAll('chapterIds')} className="text-[10px] text-[var(--text-muted)] hover:underline">None</button>
            </div>
            {Object.values(chaptersByAct).map(({ act, chapters: actChaps }) => (
              <div key={act.id}>
                <div className="text-[10px] text-[var(--accent)] uppercase tracking-wider mb-1 mt-2">{act.title}</div>
                {actChaps.map((ch, i) => <CheckItem key={ch.id} label={ch.title || `Chapter ${i + 1}`} checked={ctx.chapterIds.includes(ch.id)} onChange={() => toggle('chapterIds', ch.id)} />)}
              </div>
            ))}
          </Section>
        )}

        <Section title="Custom instruction" defaultOpen={!!ctx.customInstruction}>
          <textarea
            value={ctx.customInstruction}
            onChange={e => setCtx(prev => ({ ...prev, customInstruction: e.target.value }))}
            placeholder="Tell the AI anything extra — tone, style, what you're working on…"
            rows={4}
            className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none"
          />
        </Section>
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] flex gap-2 flex-shrink-0">
        <button
          onClick={() => onStart(ctx)}
          className="flex-1 bg-[var(--accent)] text-[var(--bg-main)] font-bold py-2 rounded text-sm hover:opacity-90"
        >
          Start Chat{total > 0 ? ` · ${total} item${total !== 1 ? 's' : ''}` : ''}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] text-sm hover:text-[var(--text-main)]">Cancel</button>
      </div>
    </div>
  )
}

// ── Chat View ─────────────────────────────────────────────────────────────────

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const [copied, setCopied] = useState(false)

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
      </div>
    </div>
  )
}

function ChatView({ session, store, aiSettings, onUpdate, onBack, onPin, onSetCategory }) {
  const [input, setInput]         = useState('')
  const [streaming, setStreaming] = useState(false)
  const [editingCategory, setEditingCategory] = useState(false)
  const [categoryDraft, setCategoryDraft]     = useState('')
  const bottomRef      = useRef(null)
  const abortRef       = useRef(false)
  const inputRef       = useRef(null)
  const categoryInputRef = useRef(null)

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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [session.messages])
  useEffect(() => { inputRef.current?.focus() }, [session.id])
  useEffect(() => { resizeInput() }, [input, session.id, resizeInput])

  const provider  = aiSettings.activeProvider
  const provCfg   = aiSettings[provider]
  const provLabel = PROVIDERS[provider]?.name || provider
  const modelLabel = provCfg.model || PROVIDERS[provider]?.defaultModel

  const promptStore = useMemo(
    () => store.getProjectContextData?.(session.novelId) ?? store,
    [store, session.novelId]
  )

  const systemPrompt = useMemo(
    () => buildSystemPrompt(promptStore.activeNovel, session.context, promptStore),
    [promptStore, session.context]
  )

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    abortRef.current = false

    const userMsg      = { id: uid(), role: 'user',      content: text }
    const assistantMsg = { id: uid(), role: 'assistant', content: '', streaming: true }
    const nextMessages = [...session.messages, userMsg, assistantMsg]
    onUpdate(session.id, { messages: nextMessages })
    setStreaming(true)

    let accumulated = ''
    const apiMessages = [...session.messages, userMsg].map(m => ({ role: m.role, content: m.content }))

    streamMessage({
      provider,
      apiKey:  provCfg.apiKey,
      model:   provCfg.model || PROVIDERS[provider]?.defaultModel,
      baseUrl: provCfg.baseUrl,
      systemPrompt,
      messages: apiMessages,
      onChunk: (chunk) => {
        if (abortRef.current) return
        accumulated += chunk
        onUpdate(session.id, {
          messages: nextMessages.map(m => m.id === assistantMsg.id ? { ...m, content: accumulated } : m),
        })
      },
      onDone: () => {
        setStreaming(false)
        onUpdate(session.id, {
          messages: nextMessages.map(m => m.id === assistantMsg.id ? { ...m, content: accumulated, streaming: false } : m),
        })
      },
      onError: (err) => {
        setStreaming(false)
        onUpdate(session.id, {
          messages: nextMessages.map(m => m.id === assistantMsg.id ? { ...m, content: `Error: ${err}`, streaming: false, error: true } : m),
        })
      },
    })
  }

  const stop = () => {
    abortRef.current = true
    setStreaming(false)
    const messages = session.messages.map(m => m.streaming ? { ...m, streaming: false } : m)
    onUpdate(session.id, { messages })
  }

  const quickPrompts = [
    'What should I work on next?',
    'Find continuity risks in this context.',
    'Give me three scene ideas.',
  ]

  const contextCount = (session.context.characterIds?.length || 0) + (session.context.locationIds?.length || 0) +
    (session.context.loreEntryIds?.length || 0) + (session.context.worldHistoryIds?.length || 0) +
    (session.context.chapterIds?.length || 0)

  return (
    <div className="ai-chat-view flex flex-col h-full">
      <div className="ai-chat-session-header px-3 py-2 border-b border-[var(--border)] flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--text-main)] truncate">{session.title}</div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <div className="text-[10px] text-[var(--text-muted)]">
              {provLabel} · {modelLabel}{contextCount > 0 ? ` · ${contextCount} context item${contextCount !== 1 ? 's' : ''}` : ''}
            </div>
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

      <div className="ai-chat-scroll flex-1 overflow-y-auto px-3 py-3">
        {session.messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-3">
            <div className="text-2xl text-[var(--accent)] opacity-70">✦</div>
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
        {session.messages.map(msg => <Message key={msg.id} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      <div className="ai-chat-composer px-3 pb-3 pt-2 border-t border-[var(--border)] flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              queueMicrotask(resizeInput)
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask the AI…  (Shift+Enter for new line)"
            rows={1}
            disabled={streaming}
            className="ai-chat-input flex-1 min-h-10 max-h-36 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-none disabled:opacity-50 transition-colors"
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
            disabled={!input.trim() || streaming}
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
  )
}

// ── Session List ──────────────────────────────────────────────────────────────

function SessionList({ sessions, aiSettings, onSelect, onNew, onDelete, onPin, onSetCategory }) {
  const provider  = aiSettings.activeProvider
  const provLabel = PROVIDERS[provider]?.name || provider
  const model     = aiSettings[provider]?.model || PROVIDERS[provider]?.defaultModel

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
      return (b.createdAt || 0) - (a.createdAt || 0)
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
            <div className="text-3xl">✦</div>
            <p className="text-sm text-[var(--text-muted)]">Start a new chat to get writing help from AI.</p>
          </div>
        )}
        {filtered.length === 0 && sessions.length > 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6 opacity-60">
            <p className="text-sm text-[var(--text-muted)]">No chats in this category.</p>
          </div>
        )}
        {filtered.map(s => {
          const lastMsg = s.messages[s.messages.length - 1]
          const preview = lastMsg?.content?.slice(0, 70) || 'No messages yet'
          const total   = (s.context.characterIds?.length || 0) + (s.context.locationIds?.length || 0) +
            (s.context.loreEntryIds?.length || 0) + (s.context.worldHistoryIds?.length || 0) +
            (s.context.chapterIds?.length || 0)
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
                    {total > 0 && <div className="text-[10px] text-[var(--accent)]">{total} context item{total !== 1 ? 's' : ''}</div>}
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
          <span className="text-[var(--accent)]">✦</span>
          <span className="block text-sm font-bold text-[var(--text-main)] uppercase tracking-wider">AI Chat</span>
        </div>
        {!docked && (
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] p-1 rounded transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-8 py-10">
        <div className="text-4xl opacity-40">✦</div>
        <div>
          <p className="text-sm font-bold text-[var(--text-main)] mb-2">AI assistant is a paid feature</p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            Upgrade your plan to unlock AI-powered writing assistance, brainstorming, and worldbuilding help.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-account-settings'))}
          className="mt-2 bg-[var(--accent)] text-[var(--bg-main)] font-bold text-sm px-5 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          View plans
        </button>
      </div>
    </div>
  )
}

export default function AIPanel({ store, open, onClose, initialContext, membership, docked = false, onPopOut }) {
  const novelId = store.activeNovelId
  const chatStorageKey = `nf_chats_${novelId ?? 'library'}`
  const [aiSettings, setAiSettings] = useState(() => {
    const stored = load('nf_aiSettings', {})
    const merged = { ...DEFAULT_SETTINGS, ...stored }
    // Fill in env-seeded keys only when the stored value is blank
    for (const [prov, def] of Object.entries(DEFAULT_SETTINGS)) {
      if (typeof def === 'object' && def.apiKey && !merged[prov]?.apiKey) {
        merged[prov] = { ...merged[prov], apiKey: def.apiKey }
      }
    }
    return merged
  })
  const [sessions,   setSessions]   = useState(() => load(chatStorageKey, []))
  const [view,       setView]       = useState('sessions') // 'sessions' | 'settings' | 'context' | 'chat'
  const [activeId,   setActiveId]   = useState(null)
  const [fullscreen, setFullscreen] = useState(() => load('nf_aiFullscreen', false))
  const [minimized,  setMinimized]  = useState(false)
  const [panelFrame, setPanelFrame] = useState(() => clampPanelFrame(load(AI_PANEL_FRAME_KEY, getDefaultPanelFrame())))
  const activeChatStorageKey = useRef(chatStorageKey)
  const panelFrameRef = useRef(panelFrame)

  useEffect(() => { save('nf_aiSettings', aiSettings) }, [aiSettings])
  useEffect(() => {
    if (activeChatStorageKey.current !== chatStorageKey) {
      activeChatStorageKey.current = chatStorageKey
      setSessions(load(chatStorageKey, []))
      setActiveId(null)
      setView(current => current === 'settings' ? current : 'sessions')
      return
    }
    save(chatStorageKey, sessions)
  }, [sessions, chatStorageKey])
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

  const projectStore = useMemo(
    () => store.getProjectContextData?.(novelId) ?? store,
    [store, novelId]
  )

  const activeProvider = aiSettings.activeProvider
  const hasKey = !!aiSettings[activeProvider]?.apiKey?.trim()

  // Auto-show settings if active provider has no key
  useEffect(() => {
    if (open && !hasKey && view === 'sessions') {
      queueMicrotask(() => setView('settings'))
    }
  }, [open, hasKey, view])

  const handleSaveSettings = (newSettings) => {
    setAiSettings(newSettings)
    setView('sessions')
  }

  const handleNewChat = () => setView('context')

  const handleContextConfirm = (ctx) => {
    const session = {
      id: uid(), novelId, title: `Chat ${sessions.length + 1}`,
      context: ctx, messages: [], createdAt: Date.now(),
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
        <span className="ai-tool-launcher-mark">✦</span>
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

  return (
    <div
      className={`z-50 bg-[var(--bg-nav)] border border-[var(--border)] flex flex-col shadow-2xl overflow-hidden transition-all duration-200 ${panelMode}`}
      style={panelStyle}
      role="dialog"
      aria-label="AI chat"
    >

        {/* Header */}
        <div
          className={`ai-chat-header flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0 ${!docked && !fullscreen ? 'is-draggable' : ''}`}
          onPointerDown={startMove}
        >
          <div className="flex items-center gap-2">
            <span className="ai-chat-pulse text-[var(--accent)]">✦</span>
            <div className="min-w-0">
              <span className="block text-sm font-bold text-[var(--text-main)] uppercase tracking-wider leading-tight">AI Chat</span>
              <span className="block text-[10px] text-[var(--text-muted)] leading-tight">
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
              onClick={() => setView(v => v === 'settings' ? (hasKey ? 'sessions' : 'settings') : 'settings')}
              className={`text-[10px] font-bold border px-2 py-0.5 rounded transition-colors ${
                view === 'settings'
                  ? 'text-[var(--accent)] border-[var(--accent)]/40'
                  : 'text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-main)]'
              }`}
            >
              {(() => {
              const p = PROVIDERS[activeProvider]
              const model = aiSettings[activeProvider]?.model || p?.defaultModel || ''
              const modelLabel = p?.models?.find(m => m.id === model)?.label || model
              return modelLabel ? `${p?.name?.split(' ')[0] || 'AI'} · ${modelLabel}` : (p?.name?.split(' ')[0] || 'Settings')
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
          {view === 'settings' && (
            <ProviderSettings
              settings={aiSettings}
              onSave={handleSaveSettings}
              onCancel={hasKey ? () => setView('sessions') : null}
            />
          )}
          {view === 'context' && (
            <ContextSelector
              store={projectStore}
              initialContext={initialContext}
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
            />
          )}
          {view === 'sessions' && (
            <SessionList
              sessions={sessions}
              aiSettings={aiSettings}
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
