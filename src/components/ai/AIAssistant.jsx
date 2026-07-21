import { useState, useRef } from 'react'
import { streamMessage, PROVIDERS } from '../../utils/aiApi'
import { DEFAULT_AI_SETTINGS, loadAiSettings } from '../../utils/aiSettings'
import { appendAiBarExchange } from '../../utils/aiChatHistory'
import { buildProjectTypePromptContext } from '../../utils/aiToolPrompts'
import { AI_CONFIG_REQUIRED_TEXT, AiSettingsLink } from './AiConfigRequired'
import AIStar from './AIStar'

const uid  = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const DEFAULT_SETTINGS = DEFAULT_AI_SETTINGS

// ── Section config ────────────────────────────────────────────────────────────

const SECTION_CONFIG = {
  characters:   { label: 'Characters',    createType: 'character', placeholder: 'Add a character, or ask about your cast…' },
  locations:    { label: 'Locations',     createType: 'location',  placeholder: 'Add a location, or ask about your world…' },
  lore:         { label: 'Lore',          createType: 'lore',      placeholder: 'Add a lore entry, or ask about your world rules…' },
  timeline:     { label: 'Timeline',      createType: 'event',     placeholder: 'Add an event, or ask about your timeline…' },
  worldhistory: { label: 'World History', createType: 'history',   placeholder: 'Add a historical entry, or ask about your world history…' },
  ideas:        { label: 'Notes',         createType: 'idea',      placeholder: 'Add a note or idea, or brainstorm with AI…' },
  factions:     { label: 'Factions',      createType: 'faction',   placeholder: 'Add a faction, or ask about your groups…' },
  schedule:     { label: 'Schedule',      createType: 'schedule',  placeholder: 'Add a schedule event, or ask about your writing calendar…' },
  manuscript:   { label: 'Manuscript',    createType: 'scene',     placeholder: 'Ask about your story, add a scene, or brainstorm ideas…' },
  outline:      { label: 'Outline',       createType: null,        placeholder: 'Ask about your story structure…' },
  dashboard:    { label: 'Overview',      createType: null,        placeholder: 'Ask about your project…' },
  relationships: { label: 'Relationship Map', createType: null,     placeholder: 'Ask about character relationships…' },
  familytree:   { label: 'Family Tree',     createType: null,        placeholder: 'Ask about family connections…' },
  map:          { label: 'Map',           createType: null,        placeholder: 'Ask about your world map…' },
}

// Empty data templates for each create type
const CREATE_SCHEMAS = {
  character: { name: '', role: '', bio: '', keywords: [], familyGroup: '' },
  location:  { name: '', category: '', description: '' },
  lore:      { title: '', category: '', content: '', characterIds: [] },
  event:     { title: '', date: '', description: '', type: 'event', tags: [] },
  history:   { title: '', era: '', dateRange: '', content: '', tags: [] },
  idea:      { title: '', body: '', group: '', color: 'amber', tags: [] },
  faction:   { name: '', description: '', motto: '' },
  schedule:  { title: '', date: '', category: 'scene', duration: 1 },
  scene:     { title: '', synopsis: '', content: '' },
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(section, store) {
  const cfg   = SECTION_CONFIG[section] || {}
  const novel = store.activeNovel
  const createType = cfg.createType

  const lines = [
    'You are an AI assistant embedded in Your Own World, a creative writing platform.',
    buildProjectTypePromptContext(novel),
    `Current section: ${cfg.label || section}.`,
    '',
    'CRITICAL RULE: Respond ONLY with a single valid JSON object. No markdown fences, no explanatory text outside the JSON.',
    '',
    'Actions you can take:',
  ]

  if (createType && CREATE_SCHEMAS[createType]) {
    const schema = JSON.stringify({ action: 'create', type: createType, data: CREATE_SCHEMAS[createType] })
    lines.push(`  CREATE — ${schema}`)
  }

  lines.push(
    `  DELETE — {"action":"delete","type":"[type]","id":"[existing-id]","name":"[display name]"}`,
    `  ANSWER — {"action":"answer","message":"your complete answer as a plain string"}`,
    '',
  )

  const ctx = buildContext(section, store)
  if (ctx) lines.push(ctx)

  return lines.filter(l => l !== null).join('\n')
}

function buildContext(section, store) {
  const fmt = (arr, getName, getId) =>
    arr.slice(0, 20).map(x => `  - ${getName(x)} [id:${getId(x)}]`).join('\n')

  if (section === 'characters' && store.characters?.length)
    return `Existing characters (use ids for delete):\n${fmt(store.characters, c => `${c.name}${c.role ? ` (${c.role})` : ''}`, c => c.id)}`
  if (section === 'locations' && store.locations?.length)
    return `Existing locations:\n${fmt(store.locations, l => `${l.name}${l.category ? ` (${l.category})` : ''}`, l => l.id)}`
  if (section === 'lore' && store.loreEntries?.length)
    return `Existing lore entries:\n${fmt(store.loreEntries, e => `${e.title}${e.category ? ` (${e.category})` : ''}`, e => e.id)}`
  if (section === 'factions' && store.factions?.length)
    return `Existing factions:\n${fmt(store.factions, f => f.name, f => f.id)}`
  if (section === 'timeline' && store.timeline?.length)
    return `Existing timeline events:\n${fmt(store.timeline, e => `${e.title}${e.date ? ` (${e.date})` : ''}`, e => e.id)}`
  if (section === 'worldhistory' && store.worldHistory?.length)
    return `Existing history entries:\n${fmt(store.worldHistory, h => h.title, h => h.id)}`
  if (section === 'ideas' && store.ideaEntries?.length)
    return `Existing notes:\n${fmt(store.ideaEntries, i => i.title || '(untitled)', i => i.id)}`
  if (section === 'manuscript') {
    const parts = []
    if (store.characters?.length)
      parts.push(`Characters: ${store.characters.slice(0, 8).map(c => c.name).join(', ')}`)
    if (store.chapters?.length)
      parts.push(`Chapters: ${store.chapters.slice(0, 6).map(c => c.title || 'Untitled').join(', ')}`)
    return parts.length ? parts.join('\n') : ''
  }
  return ''
}

function describeAiBarResult(result, fallback) {
  if (result?.action === 'answer' && result.message) return result.message
  if (result?.action === 'create' && result.type && result.data) {
    const name = result.data.name || result.data.title || 'Untitled'
    return `Suggested creating ${result.type}: ${name}`
  }
  if (result?.action === 'delete') {
    return `Suggested deleting ${result.name || result.type || 'item'}`
  }
  return fallback
}

function recordAiBarExchange(args) {
  try {
    appendAiBarExchange(args)
  } catch (error) {
    console.warn('[ai-bar] Unable to save exchange to chat history', error)
  }
}

// ── Store action executors ────────────────────────────────────────────────────

function executeCreate(type, data, store) {
  switch (type) {
    case 'character': store.saveCharacter(data); break
    case 'location':  store.saveLocation(data);  break
    case 'lore':      store.addLoreEntry(data);   break
    case 'event':     store.addEvent(data);       break
    case 'history':   store.addHistoryEntry(data); break
    case 'idea':      store.addIdeaEntry(data);   break
    case 'faction':
      store.setFactions(prev => [...prev, { id: uid(), novelId: store.activeNovelId, ...data }])
      break
    case 'schedule':  store.addScheduleEvent(data); break
    case 'scene': {
      const firstChapter = store.chapters?.[0]
      if (firstChapter) store.addScene(firstChapter.id, data.title || 'New Scene')
      break
    }
    default: break
  }
}

function executeDelete(type, id, store) {
  switch (type) {
    case 'character': store.deleteCharacter(id); break
    case 'location':  store.deleteLocation(id);  break
    case 'lore':      store.deleteLoreEntry(id);  break
    case 'event':     store.deleteEvent(id);      break
    case 'history':   store.deleteHistoryEntry(id); break
    case 'idea':      store.deleteIdeaEntry(id);  break
    case 'faction':   store.setFactions(prev => prev.filter(f => f.id !== id)); break
    case 'schedule':  store.deleteScheduleEvent(id); break
    default: break
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CreatePreview({ parsed, onConfirm, onCancel }) {
  const { type, data } = parsed
  const name = data.name || data.title || '(untitled)'
  const previewFields = Object.entries(data)
    .filter(([, v]) => v && typeof v === 'string' && v.trim())
    .slice(0, 4)

  return (
    <div className="px-3 pt-2.5 pb-2 border-t border-[var(--border)] bg-[var(--bg-nav)]">
      <div className="mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] inline-flex items-center gap-1">
          <AIStar size={10} /> Ready to add {type}
        </span>
        <div className="text-sm font-semibold text-[var(--text-main)] mt-0.5 truncate">{name}</div>
      </div>
      {previewFields.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-2.5">
          {previewFields.filter(([k]) => k !== 'name' && k !== 'title').map(([k, v]) => (
            <div key={k} className="text-xs text-[var(--text-muted)]">
              <span className="font-semibold capitalize">{k}:</span>{' '}
              <span className="text-[var(--text-main)]">
                {String(v).length > 60 ? String(v).slice(0, 60) + '…' : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 bg-[var(--accent)] text-[var(--bg-main)] text-xs font-bold rounded hover:opacity-90 transition-opacity"
        >
          Add {type}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[var(--text-muted)] text-xs hover:text-[var(--text-main)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function DeleteConfirm({ parsed, onConfirm, onCancel }) {
  const label = parsed.name || parsed.type
  return (
    <div className="px-3 pt-2.5 pb-2 border-t border-[var(--border)] bg-[var(--bg-nav)]">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-amber-400 text-base leading-none">⚠</span>
        <span className="text-sm text-[var(--text-main)]">
          Permanently delete <strong>{label}</strong>? This cannot be undone.
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 text-xs font-bold rounded hover:bg-red-500/20 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[var(--text-muted)] text-xs hover:text-[var(--text-main)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function AnswerDisplay({ message, onDismiss }) {
  return (
    <div className="px-3 pt-2.5 pb-2 border-t border-[var(--border)] bg-[var(--bg-nav)] max-h-48 overflow-y-auto">
      <div className="flex items-start gap-2">
        <AIStar size={12} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
        <p className="text-sm text-[var(--text-main)] whitespace-pre-wrap leading-relaxed flex-1 min-w-0">{message}</p>
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="text-[var(--text-muted)] hover:text-[var(--text-main)] flex-shrink-0 mt-0.5 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export default function AIAssistant({ store, section, onOpenChat, aiOpen, userId = null, membership = null }) {
  const [input,  setInput]  = useState('')
  const [status, setStatus] = useState('idle')
  const [parsed, setParsed] = useState(null)
  const [errMsg, setErrMsg] = useState('')
  const inputRef = useRef(null)

  const cfg = SECTION_CONFIG[section] || SECTION_CONFIG.dashboard

  const send = async () => {
    const text = input.trim()
    if (!text || status === 'loading') return

    // Read settings fresh each send so changes in AIPanel are reflected
    const settings = loadAiSettings(userId, DEFAULT_SETTINGS)
    const provider = settings.activeProvider || 'google'
    const provCfg  = settings[provider] || {}

    if (!provCfg.apiKey?.trim()) {
      setStatus('no_key')
      return
    }

    setStatus('loading')
    setInput('')
    setParsed(null)

    const systemPrompt = buildSystemPrompt(section, store)
    const isGoogle = provider === 'google'
    let accumulated = ''

    streamMessage({
      provider,
      apiKey:   provCfg.apiKey,
      model:    provCfg.model || PROVIDERS[provider]?.defaultModel,
      baseUrl:  provCfg.baseUrl,
      systemPrompt,
      messages: [{ role: 'user', content: text }],
      jsonMode: isGoogle,
      onChunk:  (chunk) => { accumulated += chunk },
      onDone:   () => {
        try {
          const cleaned = accumulated
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/, '')
            .trim()
          const result = JSON.parse(cleaned)
          recordAiBarExchange({
            novelId: store.activeNovelId,
            section,
            userText: text,
            assistantText: describeAiBarResult(result, cleaned),
          })

          if (result.action === 'create' && result.type && result.data) {
            setParsed(result)
            setStatus('preview_create')
          } else if (result.action === 'delete' && result.id) {
            setParsed(result)
            setStatus('preview_delete')
          } else if (result.action === 'answer' && result.message) {
            setParsed({ message: result.message })
            setStatus('answer')
          } else {
            setParsed({ message: accumulated.trim() || JSON.stringify(result, null, 2) })
            setStatus('answer')
          }
        } catch {
          const trimmed = accumulated.trim()
          if (trimmed) {
            recordAiBarExchange({
              novelId: store.activeNovelId,
              section,
              userText: text,
              assistantText: trimmed,
            })
            setParsed({ message: trimmed })
            setStatus('answer')
          } else {
            setErrMsg(`No response. ${AI_CONFIG_REQUIRED_TEXT}`)
            setStatus('error')
          }
        }
        inputRef.current?.focus()
      },
      onError: (err) => {
        setErrMsg(err)
        setStatus('error')
        inputRef.current?.focus()
      },
    })
  }

  const dismiss = () => { setStatus('idle'); setParsed(null); setErrMsg('') }

  const handleConfirmCreate = () => {
    if (!parsed) return
    executeCreate(parsed.type, parsed.data, store)
    dismiss()
  }

  const handleConfirmDelete = () => {
    if (!parsed) return
    executeDelete(parsed.type, parsed.id, store)
    dismiss()
  }

  const isLoading = status === 'loading'

  if (membership?.isFree) {
    return (
      <div className="flex-shrink-0 border-t border-[var(--border)]">
        <div className="flex items-center gap-2 px-3 py-2">
          <AIStar size={12} className="text-[var(--accent)] flex-shrink-0 select-none" />
          <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-muted)]">
            Upgrade to access AI chat and quick project actions.
          </span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'membership' } }))}
            className="h-7 px-2 flex items-center border border-[var(--border)] rounded flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
          >
            Upgrade
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-shrink-0">

      {/* Response / action area */}
      {status === 'preview_create' && parsed && (
        <CreatePreview parsed={parsed} onConfirm={handleConfirmCreate} onCancel={dismiss} />
      )}
      {status === 'preview_delete' && parsed && (
        <DeleteConfirm parsed={parsed} onConfirm={handleConfirmDelete} onCancel={dismiss} />
      )}
      {status === 'answer' && parsed?.message && (
        <AnswerDisplay message={parsed.message} onDismiss={dismiss} />
      )}
      {status === 'error' && (
        <div className="px-3 py-2 border-t border-[var(--border)] flex items-center gap-2">
          <span className="text-red-400 text-xs flex-1 min-w-0 truncate">{errMsg}</span>
          <button onClick={dismiss} className="text-[var(--text-muted)] text-xs hover:text-[var(--text-main)] flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}
      {status === 'no_key' && (
        <div className="px-3 py-2 border-t border-[var(--border)] flex items-center gap-1.5">
          <span className="text-[var(--text-muted)] text-xs">{AI_CONFIG_REQUIRED_TEXT}</span>
          <AiSettingsLink className="text-xs hover:opacity-80">Open AI settings</AiSettingsLink>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        <AIStar size={12} className="text-[var(--accent)] flex-shrink-0 select-none" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder={isLoading ? 'Thinking…' : cfg.placeholder}
          disabled={isLoading}
          className="flex-1 bg-transparent text-sm text-[var(--text-main)] placeholder:text-[var(--text-muted)] outline-none min-w-0 disabled:opacity-40 transition-opacity"
        />
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin flex-shrink-0" />
        ) : input.trim() ? (
          <button
            onClick={send}
            className="h-6 w-6 flex items-center justify-center bg-[var(--accent)] text-[var(--bg-main)] rounded flex-shrink-0 hover:opacity-90 transition-opacity"
            title="Send (Enter)"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        ) : null}

        {/* Full chat panel toggle */}
        {onOpenChat && (
          <button
            onClick={onOpenChat}
            title={aiOpen ? 'Close AI chat' : 'Open AI chat'}
            className={`h-7 px-2 flex items-center gap-1.5 border rounded flex-shrink-0 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              aiOpen
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-fade)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-main)]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
          </button>
        )}
      </div>
    </div>
  )
}
