import { useState, useRef, useEffect, useCallback } from 'react'
import { streamMessage } from '../../utils/aiApi'
import { buildInterviewSystemPrompt } from '../../utils/aiToolPrompts'
import { createInterview, updateInterview, loadInterviews, deleteInterview } from '../../utils/aiFindings'
import { getActiveAiConfig } from '../../utils/aiSettings'

const INTERVIEW_MODES = [
  { id: 'general',       label: 'General',        desc: 'Open conversation in character' },
  { id: 'backstory',     label: 'Backstory',       desc: 'Past, formative experiences' },
  { id: 'motivation',    label: 'Motivation',      desc: 'Goals, fears, decisions' },
  { id: 'relationships', label: 'Relationships',   desc: 'Feelings toward other characters' },
  { id: 'secrets',       label: 'Secrets',         desc: 'Hidden truths, guarded feelings' },
  { id: 'emotional',     label: 'Emotional state', desc: 'Feelings at a specific moment' },
  { id: 'dialogue',      label: 'Dialogue voice',  desc: 'Test speaking style and patterns' },
]

function Avatar({ name }) {
  const initials = name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 25%, var(--bg-main))', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
      {initials}
    </div>
  )
}

export default function CharacterInterview({ store, userId }) {
  const novel      = store.activeNovel
  const novelId    = novel?.id
  const characters = (store.characters || []).filter(c => c.novelId === novelId)

  const [charId,         setCharId]        = useState('')
  const [mode,           setMode]          = useState('general')
  const [timelinePos,    setTimelinePos]   = useState('')
  const [messages,       setMessages]      = useState([])
  const [input,          setInput]         = useState('')
  const [streaming,      setStreaming]      = useState(false)
  const [error,          setError]         = useState(null)
  const [interviewId,    setInterviewId]   = useState(null)
  const [savedNotes,     setSavedNotes]    = useState([])
  const [savingNote,     setSavingNote]    = useState(null)
  const [noteSaved,      setNoteSaved]     = useState(null)
  const [started,        setStarted]       = useState(false)
  // Past sessions
  const [pastSessions,   setPastSessions]  = useState([])
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [deletingId,     setDeletingId]    = useState(null)

  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)

  // Load past interview sessions on mount
  useEffect(() => {
    if (!userId || !novelId) { setLoadingSessions(false); return }
    loadInterviews(userId, novelId)
      .then(rows => setPastSessions(rows))
      .catch(() => {})
      .finally(() => setLoadingSessions(false))
  }, [userId, novelId])

  const resumeSession = useCallback((session) => {
    setCharId(session.character_id)
    setMode(session.mode || 'general')
    setMessages(session.messages || [])
    setSavedNotes(session.saved_notes || [])
    setInterviewId(session.id)
    setStarted(true)
  }, [])

  const handleDeleteSession = useCallback(async (id, e) => {
    e.stopPropagation()
    setDeletingId(id)
    try {
      await deleteInterview(id)
      setPastSessions(prev => prev.filter(s => s.id !== id))
    } catch { /* ignore */ }
    finally { setDeletingId(null) }
  }, [])

  const character = characters.find(c => c.id === charId)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const startInterview = useCallback(async () => {
    if (!charId || !character) return
    setMessages([])
    setSavedNotes([])
    setInterviewId(null)
    setError(null)
    setStarted(true)

    if (userId && novelId) {
      try {
        const rec = await createInterview(userId, novelId, charId, mode)
        setInterviewId(rec.id)
        setPastSessions(prev => [rec, ...prev])
      } catch { /* offline fallback — continue without DB id */ }
    }

    inputRef.current?.focus()
  }, [charId, character, userId, novelId, mode])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming || !character) return
    const ai = getActiveAiConfig(userId)
    if (!ai.apiKey) { setError('No AI API key configured. Add one in AI Settings.'); return }

    const userMsg = { role: 'user', content: input.trim() }
    const nextMsgs = [...messages, userMsg]
    setMessages(nextMsgs)
    setInput('')
    setStreaming(true)
    setError(null)

    const system = buildInterviewSystemPrompt(character, novel, store, mode, timelinePos)
    let buffer = ''
    const assistantIdx = nextMsgs.length

    streamMessage({
      provider: ai.provider, apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl,
      systemPrompt: system,
      messages: nextMsgs,
      maxTokens: 2048,
      onChunk: chunk => {
        buffer += chunk
        setMessages(prev => {
          const copy = [...prev]
          if (copy[assistantIdx]) {
            copy[assistantIdx] = { role: 'assistant', content: buffer }
          } else {
            copy.push({ role: 'assistant', content: buffer })
          }
          return copy
        })
      },
      onDone: () => {
        setStreaming(false)
        const final = [...nextMsgs, { role: 'assistant', content: buffer }]
        setMessages(final)
        if (interviewId) {
          updateInterview(interviewId, final, savedNotes).catch(() => {})
        }
      },
      onError: msg => { setStreaming(false); setError(msg) },
    })
  }, [input, streaming, character, messages, novel, store, mode, timelinePos, interviewId, savedNotes, userId])

  const saveNote = useCallback(async (content, msgIndex) => {
    const note = { content, savedAt: new Date().toISOString(), msgIndex }
    const next = [...savedNotes, note]
    setSavedNotes(next)
    setSavingNote(msgIndex)
    if (interviewId) {
      try { await updateInterview(interviewId, messages, next) } catch { /* local-only */ }
    }
    setTimeout(() => {
      setSavingNote(null)
      setNoteSaved(msgIndex)
      setTimeout(() => setNoteSaved(null), 2000)
    }, 400)
  }, [savedNotes, interviewId, messages])

  const reset = () => {
    setStarted(false)
    setMessages([])
    setSavedNotes([])
    setInterviewId(null)
    setError(null)
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Setup screen
  if (!started) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px' }}>Character Interview</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chat with an AI roleplaying as one of your characters to develop voice, motivation, and backstory.</p>
        </div>

        <div style={{ background: 'color-mix(in srgb, #f59e0b 8%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)', borderRadius: 8, padding: '8px 12px', marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            ⚠️ Interview responses are exploratory and <strong style={{ color: 'var(--text-main)' }}>not automatically canon</strong>. Save useful answers to notes manually.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Character</span>
            <select value={charId} onChange={e => setCharId(e.target.value)} className="field">
              <option value="">Select a character…</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}{c.role ? ` — ${c.role}` : ''}</option>)}
            </select>
          </label>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Interview mode</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {INTERVIEW_MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 7, textAlign: 'left',
                    border: `1px solid ${mode === m.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: mode === m.id ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: mode === m.id ? 'var(--accent)' : 'var(--text-main)', margin: 0 }}>{m.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {mode === 'emotional' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Timeline position (optional)</span>
              <input type="text" value={timelinePos} onChange={e => setTimelinePos(e.target.value)} placeholder="e.g. After the battle of Helm's Deep" className="field" />
            </label>
          )}

          <button
            onClick={startInterview}
            disabled={!charId}
            style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, background: charId ? 'var(--accent)' : 'var(--border)', color: charId ? 'var(--bg-main)' : 'var(--text-muted)', border: 'none', cursor: charId ? 'pointer' : 'default', transition: 'all 0.12s' }}
          >
            Begin Interview
          </button>
        </div>

        {/* Past sessions */}
        {!loadingSessions && pastSessions.length > 0 && (
          <div style={{ marginTop: 28, maxWidth: 440 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10 }}>Previous sessions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pastSessions.map(session => {
                const char = characters.find(c => c.id === session.character_id)
                const modeLabel = INTERVIEW_MODES.find(m => m.id === session.mode)?.label || session.mode
                const msgCount = session.messages?.length || 0
                return (
                  <div
                    key={session.id}
                    onClick={() => resumeSession(session)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'color-mix(in srgb, var(--bg-main) 50%, transparent)', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <Avatar name={char?.name || '?'} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{char?.name || 'Unknown character'}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                        {modeLabel} · {msgCount} message{msgCount !== 1 ? 's' : ''} · {new Date(session.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      disabled={deletingId === session.id}
                      aria-label="Delete session"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0, opacity: deletingId === session.id ? 0.4 : 1 }}
                    >
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Chat screen
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Avatar name={character?.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>{character?.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {INTERVIEW_MODES.find(m => m.id === mode)?.label} interview
            {character?.role ? ` · ${character.role}` : ''}
          </p>
        </div>
        <button onClick={reset} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          Change
        </button>
      </div>

      {/* Canon notice */}
      <div style={{ padding: '6px 16px', background: 'color-mix(in srgb, #f59e0b 6%, transparent)', borderBottom: '1px solid color-mix(in srgb, #f59e0b 20%, transparent)', flexShrink: 0 }}>
        <p style={{ fontSize: 10, color: '#f59e0b', margin: 0 }}>Exploratory mode — responses are not automatically canon. Save useful answers to notes.</p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Ask {character?.name} anything. They'll answer in character based on their profile.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            {msg.role === 'assistant' && <Avatar name={character?.name} />}
            <div style={{ maxWidth: '80%' }}>
              <div style={{
                background: msg.role === 'user'
                  ? 'color-mix(in srgb, var(--accent) 15%, var(--bg-main))'
                  : 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
                border: `1px solid ${msg.role === 'user' ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`,
                borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                padding: '10px 13px',
              }}>
                <p style={{ fontSize: 13, color: 'var(--text-main)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </p>
              </div>
              {msg.role === 'assistant' && msg.content && !streaming && (
                <button
                  onClick={() => saveNote(msg.content, i)}
                  disabled={savingNote === i}
                  style={{ marginTop: 5, fontSize: 10, fontWeight: 600, color: noteSaved === i ? '#4ade80' : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                >
                  {noteSaved === i ? '✓ Saved to notes' : savingNote === i ? 'Saving…' : '+ Save to notes'}
                </button>
              )}
            </div>
          </div>
        ))}
        {error && (
          <div style={{ background: 'color-mix(in srgb, #ef4444 10%, transparent)', border: '1px solid #ef4444', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Saved notes panel */}
      {savedNotes.length > 0 && (
        <details style={{ flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <summary style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}>
            {savedNotes.length} saved note{savedNotes.length !== 1 ? 's' : ''} from this interview
          </summary>
          <div style={{ padding: '0 16px 12px', maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedNotes.map((note, i) => (
              <div key={i} style={{ background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-main)', lineHeight: 1.5, margin: '0 0 3px', whiteSpace: 'pre-wrap' }}>{note.content}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{new Date(note.savedAt).toLocaleTimeString()}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Input */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Ask ${character?.name || 'the character'} something…`}
          rows={2}
          disabled={streaming}
          style={{
            flex: 1, resize: 'none', background: 'color-mix(in srgb, var(--bg-main) 60%, transparent)',
            border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
            fontSize: 13, color: 'var(--text-main)', outline: 'none', lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          style={{
            padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13,
            background: !input.trim() || streaming ? 'var(--border)' : 'var(--accent)',
            color: !input.trim() || streaming ? 'var(--text-muted)' : 'var(--bg-main)',
            border: 'none', cursor: !input.trim() || streaming ? 'default' : 'pointer', flexShrink: 0,
          }}
        >
          {streaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
