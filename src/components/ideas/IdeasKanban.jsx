import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import KanbanColumn from './KanbanColumn'
import QuickCapture from './QuickCapture'
import FiltersBar from './FiltersBar'
import ConvertModal from './ConvertModal'
import { streamMessage } from '../../utils/aiApi'

// ─── Constants ───────────────────────────────────────────────────────────────

const KANBAN_STATUSES = [
  { id: 'raw',        label: 'Raw Capture',  desc: 'Fast, messy idea dumping' },
  { id: 'developing', label: 'Developing',   desc: 'Refining & expanding' },
  { id: 'inStory',    label: 'In Story',     desc: 'Active in your story' },
  { id: 'archived',   label: 'Archived',     desc: 'Saved but inactive' },
]

const loadAiSettings = () => {
  try { return JSON.parse(localStorage.getItem('nf-ai-settings')) ?? {} } catch { return {} }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(entry) {
  return {
    status: 'raw',
    order: 0,
    isFavourite: false,
    isPinned: false,
    aiExpanded: false,
    description: entry.body || '',
    linkedEntities: [],
    linkedIdeas: [],
    convertedTo: null,
    updatedAt: entry.createdAt || Date.now(),
    ...entry,
  }
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function IdeaCreateModal({ status, onClose, onAdd }) {
  const [title, setTitle] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onAdd(title.trim(), status)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          width: 420,
          maxWidth: '90vw',
          boxShadow: '0 24px 64px rgba(0,0,0,.45)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>
          New idea
        </h3>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="What's your idea?"
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            style={{
              width: '100%',
              background: 'color-mix(in srgb, var(--bg-nav) 60%, var(--bg-main))',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 14px',
              color: 'var(--text-main)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim()}>Create</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function IdeaEditModal({ idea, store, onUpdate, onClose, onConvert, onArchive, onDelete, onAiExpand, aiExpandId, readOnly }) {
  const [titleDraft, setTitleDraft] = useState(idea.title || '')
  const [bodyDraft, setBodyDraft] = useState(idea.description || idea.body || '')
  const [tagDraft, setTagDraft] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [showLinkSearch, setShowLinkSearch] = useState(false)
  const isExpanding = aiExpandId === idea.id
  const textareaRef = useRef(null)

  useEffect(() => {
    setTitleDraft(idea.title || '')
    setBodyDraft(idea.description || idea.body || '')
  }, [idea.id, idea.title, idea.description, idea.body])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
  }, [bodyDraft])

  const commitTitle = () => {
    const t = titleDraft.trim()
    if (t && t !== idea.title) onUpdate(idea.id, { title: t })
  }

  const commitBody = () => {
    const b = bodyDraft
    if (b !== (idea.description || idea.body || '')) onUpdate(idea.id, { description: b, body: b })
  }

  const allEntities = useMemo(() => {
    const arr = []
    ;(store.characters || []).forEach(c => arr.push({ type: 'character', id: c.id, name: c.name || 'Unnamed' }))
    ;(store.locations || []).forEach(l => arr.push({ type: 'location', id: l.id, name: l.name || 'Unnamed' }))
    ;(store.factions || []).forEach(f => arr.push({ type: 'faction', id: f.id, name: f.name || 'Unnamed' }))
    ;(store.loreEntries || []).forEach(e => arr.push({ type: 'lore', id: e.id, name: e.title || 'Untitled' }))
    return arr
  }, [store.characters, store.locations, store.factions, store.loreEntries])

  const linkResults = useMemo(() => {
    if (!linkSearch.trim()) return []
    const q = linkSearch.toLowerCase()
    const linked = idea.linkedEntities || []
    return allEntities.filter(e => e.name.toLowerCase().includes(q) && !linked.some(l => l.id === e.id)).slice(0, 6)
  }, [linkSearch, allEntities, idea.linkedEntities])

  const addLink = (entity) => {
    onUpdate(idea.id, { linkedEntities: [...(idea.linkedEntities || []), entity] })
    setLinkSearch('')
    setShowLinkSearch(false)
  }

  const addTag = (tag) => {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (clean && !(idea.tags || []).includes(clean)) onUpdate(idea.id, { tags: [...(idea.tags || []), clean] })
    setTagDraft('')
  }

  const statusInfo = KANBAN_STATUSES.find(s => s.id === (idea.status || 'raw'))

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.6)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '78vw',
          maxWidth: 960,
          height: '82vh',
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          boxShadow: '0 32px 96px rgba(0,0,0,.55)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Modal toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'var(--accent-fade)', color: 'var(--accent)',
            letterSpacing: '.04em', textTransform: 'uppercase',
          }}>
            {statusInfo?.label || idea.status}
          </span>
          {idea.isFavourite && <span style={{ fontSize: 12, color: '#f59e0b' }}>★</span>}
          <div style={{ flex: 1 }} />
          {!readOnly && (
            <button
              type="button"
              onClick={() => onAiExpand?.(idea.id)}
              disabled={isExpanding}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 12px',
                cursor: 'pointer', color: 'var(--accent)',
                fontSize: 11, fontFamily: 'inherit',
                opacity: isExpanding ? 0.6 : 1,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              {isExpanding ? 'Expanding…' : 'AI expand'}
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onConvert?.()}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'inherit' }}
            >
              Convert
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => { onDelete?.(); onClose() }}
              style={{ background: 'none', border: '1px solid color-mix(in srgb, var(--danger) 30%, var(--border))', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', color: 'var(--danger)', fontSize: 11, fontFamily: 'inherit' }}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Main body — two columns: document + sidebar */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Document area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '32px 48px' }}>
            {/* Title */}
            <input
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              readOnly={readOnly}
              placeholder="Untitled idea"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-serif)',
                fontSize: 32,
                fontWeight: 700,
                color: 'var(--text-main)',
                lineHeight: 1.2,
                marginBottom: 24,
                padding: 0,
                cursor: readOnly ? 'default' : 'text',
              }}
            />

            {/* Body / content */}
            <textarea
              ref={textareaRef}
              value={bodyDraft}
              onChange={e => setBodyDraft(e.target.value)}
              onBlur={commitBody}
              readOnly={readOnly}
              placeholder={readOnly ? '' : 'Start writing your idea here…'}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                fontFamily: 'var(--font-sans, inherit)',
                fontSize: 15,
                color: 'var(--text-main)',
                lineHeight: 1.75,
                padding: 0,
                minHeight: 200,
                cursor: readOnly ? 'default' : 'text',
              }}
            />
          </div>

          {/* Sidebar */}
          <div style={{
            width: 220,
            borderLeft: '1px solid var(--border)',
            overflowY: 'auto',
            padding: '20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            flexShrink: 0,
          }}>
            {/* Status change */}
            {!readOnly && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Status</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {KANBAN_STATUSES.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onUpdate(idea.id, { status: s.id })}
                      style={{
                        background: (idea.status || 'raw') === s.id ? 'var(--accent-fade)' : 'none',
                        border: `1px solid ${(idea.status || 'raw') === s.id ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--border)'}`,
                        borderRadius: 8,
                        padding: '6px 10px',
                        cursor: 'pointer',
                        color: (idea.status || 'raw') === s.id ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: 11,
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        fontWeight: (idea.status || 'raw') === s.id ? 700 : 400,
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                {(idea.tags || []).map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-fade)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    #{tag}
                    {!readOnly && (
                      <button type="button" onClick={() => onUpdate(idea.id, { tags: (idea.tags || []).filter(t => t !== tag) })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6, lineHeight: 1, fontSize: 12 }}>×</button>
                    )}
                  </span>
                ))}
                {!readOnly && (
                  <input
                    value={tagDraft}
                    onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft) }
                      if (e.key === 'Backspace' && !tagDraft) onUpdate(idea.id, { tags: (idea.tags || []).slice(0, -1) })
                    }}
                    placeholder="+ add tag"
                    style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'inherit', padding: '2px 0', minWidth: 50 }}
                  />
                )}
              </div>
            </div>

            {/* Linked entities */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Linked to</label>
                {!readOnly && (
                  <button type="button" onClick={() => setShowLinkSearch(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 10, fontFamily: 'inherit', padding: 0 }}>+ link</button>
                )}
              </div>
              {showLinkSearch && (
                <div style={{ marginBottom: 8 }}>
                  <input
                    autoFocus
                    value={linkSearch}
                    onChange={e => setLinkSearch(e.target.value)}
                    placeholder="Search…"
                    style={{ width: '100%', background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text-main)', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                  {linkResults.length > 0 && (
                    <div style={{ marginTop: 4, background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      {linkResults.map(e => (
                        <button key={e.id} type="button" onClick={() => addLink(e)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-main)', fontSize: 11, fontFamily: 'inherit', textAlign: 'left' }}>
                          <span style={{ fontSize: 9, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.04em', width: 48, flexShrink: 0 }}>{e.type}</span>
                          {e.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(idea.linkedEntities || []).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {idea.linkedEntities.map(entity => (
                    <div key={entity.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))', borderRadius: 7, border: '1px solid var(--border)', fontSize: 11 }}>
                      <span style={{ fontSize: 9, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.04em', width: 48, flexShrink: 0 }}>{entity.type}</span>
                      <span style={{ flex: 1, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity.name}</span>
                      {!readOnly && (
                        <button type="button" onClick={() => onUpdate(idea.id, { linkedEntities: (idea.linkedEntities || []).filter(e => e.id !== entity.id) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--faint)' }}>No linked entities.</p>
              )}
            </div>

            {/* Converted indicator */}
            {idea.convertedTo && (
              <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, #7ac4a0 10%, var(--bg-nav))', border: '1px solid color-mix(in srgb, #7ac4a0 30%, var(--border))', borderRadius: 8, fontSize: 11 }}>
                <p style={{ margin: 0, color: '#7ac4a0', fontWeight: 600 }}>✓ Converted to {idea.convertedTo.type}</p>
                <p style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>{idea.convertedTo.name}</p>
              </div>
            )}

            {/* Archive / restore */}
            {!readOnly && (
              <div style={{ marginTop: 'auto' }}>
                {idea.status !== 'archived' ? (
                  <button type="button" onClick={() => { onArchive?.(); onClose() }} className="btn btn-secondary" style={{ width: '100%' }}>Archive</button>
                ) : (
                  <button type="button" onClick={() => { onUpdate(idea.id, { status: 'raw' }); onClose() }} className="btn btn-secondary" style={{ width: '100%' }}>Restore</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Ghost card ───────────────────────────────────────────────────────────────

function GhostCard({ idea, style }) {
  return (
    <div style={{
      position: 'fixed',
      left: style.x,
      top: style.y,
      width: style.width,
      zIndex: 9999,
      pointerEvents: 'none',
      opacity: 0.92,
      transform: 'rotate(2.5deg) scale(1.04)',
      boxShadow: '0 24px 64px rgba(0,0,0,.45)',
      background: 'var(--bg-nav)',
      border: '1px solid var(--accent)',
      borderRadius: 12,
      padding: '12px 14px',
      userSelect: 'none',
    }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.4 }}>
        {idea.title || 'Untitled'}
      </p>
      {(idea.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {idea.tags.slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: 'var(--accent-fade)', color: 'var(--accent)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IdeasKanban({ store }) {
  const {
    ideaEntries,
    addIdeaEntry,
    updateIdeaEntry,
    deleteIdeaEntry,
    readOnly,
  } = store

  // Filter & sort state
  const [filterTag, setFilterTag] = useState('')
  const [sortBy, setSortBy] = useState('manual')
  const [showArchived, setShowArchived] = useState(false)
  const [filterFavourite, setFilterFavourite] = useState(false)
  const [filterLinked, setFilterLinked] = useState(false)
  const [filterAiExpanded, setFilterAiExpanded] = useState(false)

  // UI state
  const [selectedId, setSelectedId] = useState(null)
  const [convertId, setConvertId] = useState(null)
  const [aiExpandId, setAiExpandId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [createStatus, setCreateStatus] = useState(null)

  // Drag state
  const [draggingId, setDraggingId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [ghostStyle, setGhostStyle] = useState(null)

  const boardRef = useRef(null)
  const dragData = useRef(null)
  const autoScrollFrame = useRef(null)
  const lastPointerPos = useRef({ x: 0, y: 0 })

  // Normalise existing entries
  const ideas = useMemo(() => ideaEntries.map(normalise), [ideaEntries])

  // All tags across ideas
  const allTags = useMemo(() => {
    const tags = new Set()
    ideas.forEach(i => (i.tags || []).forEach(t => tags.add(t)))
    return [...tags]
  }, [ideas])

  // Filter & sort
  const filteredIdeas = useMemo(() => {
    let list = ideas
    if (filterTag) list = list.filter(i => (i.tags || []).includes(filterTag))
    if (filterFavourite) list = list.filter(i => i.isFavourite)
    if (filterLinked) list = list.filter(i => (i.linkedEntities || []).length > 0)
    if (filterAiExpanded) list = list.filter(i => i.aiExpanded)
    if (!showArchived) list = list.filter(i => i.status !== 'archived' || i.id === draggingId)

    if (sortBy === 'newest') list = [...list].sort((a, b) => b.createdAt - a.createdAt)
    else if (sortBy === 'oldest') list = [...list].sort((a, b) => a.createdAt - b.createdAt)
    else if (sortBy === 'active') list = [...list].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    else list = [...list].sort((a, b) => (a.order || 0) - (b.order || 0))

    return list
  }, [ideas, filterTag, filterFavourite, filterLinked, filterAiExpanded, showArchived, sortBy, draggingId])

  // Group by status
  const columns = useMemo(() => {
    const cols = {}
    KANBAN_STATUSES.forEach(s => { cols[s.id] = [] })
    filteredIdeas.forEach(idea => {
      const s = idea.status || 'raw'
      if (cols[s]) cols[s].push(idea)
    })
    return cols
  }, [filteredIdeas])

  // ── CRUD handlers ────────────────────────────────────────────────────────────

  const handleAdd = useCallback((title, tags = []) => {
    if (!title.trim() || readOnly) return
    const rawIdeas = ideas.filter(i => (i.status || 'raw') === 'raw')
    const maxOrder = rawIdeas.length ? Math.max(...rawIdeas.map(i => i.order || 0)) : -1
    addIdeaEntry({
      title: title.trim(),
      description: '',
      body: '',
      tags,
      status: 'raw',
      order: maxOrder + 1,
      updatedAt: Date.now(),
    })
  }, [ideas, addIdeaEntry, readOnly])

  const handleAddForStatus = useCallback((title, status) => {
    if (!title.trim() || readOnly) return
    const colIdeas = ideas.filter(i => (i.status || 'raw') === status)
    const maxOrder = colIdeas.length ? Math.max(...colIdeas.map(i => i.order || 0)) : -1
    addIdeaEntry({
      title: title.trim(),
      description: '',
      body: '',
      tags: [],
      status,
      order: maxOrder + 1,
      updatedAt: Date.now(),
    })
  }, [ideas, addIdeaEntry, readOnly])

  const handleUpdate = useCallback((id, data) => {
    if (readOnly) return
    updateIdeaEntry(id, { ...data, updatedAt: Date.now() })
  }, [updateIdeaEntry, readOnly])

  const handleDelete = useCallback((id) => {
    if (readOnly) return
    const scope = window.confirm('Delete this idea from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
    deleteIdeaEntry(id, { scope })
    if (selectedId === id) setSelectedId(null)
    if (convertId === id) setConvertId(null)
    if (editingId === id) setEditingId(null)
  }, [deleteIdeaEntry, readOnly, selectedId, convertId, editingId])

  const handleArchive = useCallback((id) => {
    handleUpdate(id, { status: 'archived' })
  }, [handleUpdate])

  const handleRestore = useCallback((id) => {
    handleUpdate(id, { status: 'raw' })
  }, [handleUpdate])

  const handleFavourite = useCallback((id) => {
    const idea = ideas.find(i => i.id === id)
    if (idea) handleUpdate(id, { isFavourite: !idea.isFavourite })
  }, [ideas, handleUpdate])

  const handleMove = useCallback((id, newStatus, beforeId = null) => {
    if (readOnly) return
    const colIdeas = ideas
      .filter(i => (i.status || 'raw') === newStatus && i.id !== id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))

    let order
    if (beforeId === null) {
      order = colIdeas.length ? Math.max(...colIdeas.map(i => i.order || 0)) + 1 : 0
    } else {
      const idx = colIdeas.findIndex(i => i.id === beforeId)
      if (idx === 0) {
        order = (colIdeas[0].order || 0) - 1
      } else if (idx > 0) {
        order = ((colIdeas[idx - 1].order || 0) + (colIdeas[idx].order || 0)) / 2
      } else {
        order = colIdeas.length ? Math.max(...colIdeas.map(i => i.order || 0)) + 1 : 0
      }
    }

    handleUpdate(id, { status: newStatus, order })
  }, [ideas, handleUpdate, readOnly])

  // ── AI expand ────────────────────────────────────────────────────────────────

  const handleAiExpand = useCallback(async (id) => {
    if (aiExpandId) return
    const idea = ideas.find(i => i.id === id)
    if (!idea) return

    const aiSettings = loadAiSettings()
    const provider = aiSettings?.activeProvider || 'google'
    const cfg = aiSettings?.[provider] || {}
    if (!cfg.apiKey?.trim()) {
      alert('Add an AI API key in settings to use AI expand.')
      return
    }

    setAiExpandId(id)
    let result = ''

    await streamMessage({
      provider,
      apiKey: cfg.apiKey,
      model: cfg.model,
      systemPrompt: 'You are a creative writing assistant. Expand a story idea into a rich, evocative description of 2–4 sentences. Be specific. Return only the expanded description — no JSON, no preamble, no quotes.',
      messages: [{
        role: 'user',
        content: `Expand this story idea:\n\nTitle: "${idea.title}"${idea.description ? `\nCurrent description: ${idea.description}` : ''}`,
      }],
      onChunk: (chunk) => { result += chunk },
      onDone: () => {
        handleUpdate(id, { description: result.trim(), body: result.trim(), aiExpanded: true })
        setAiExpandId(null)
      },
      onError: (err) => {
        console.error('AI expand failed:', err)
        setAiExpandId(null)
      },
    })
  }, [ideas, handleUpdate, aiExpandId])

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const resolveDropTarget = useCallback((x, y, excludeId) => {
    const elements = document.elementsFromPoint(x, y)
    const colEl = elements.find(el => el.dataset?.column)
    if (!colEl) return null
    const status = colEl.dataset.column
    const cardEls = colEl.querySelectorAll('[data-card-id]')
    let beforeId = null
    for (const cardEl of cardEls) {
      if (cardEl.dataset.cardId === excludeId) continue
      const r = cardEl.getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        beforeId = cardEl.dataset.cardId
        break
      }
    }
    return { status, beforeId }
  }, [])

  const startAutoScroll = useCallback(() => {
    if (autoScrollFrame.current) return
    const scroll = () => {
      if (!dragData.current?.moved) { autoScrollFrame.current = null; return }
      const { x, y } = lastPointerPos.current
      const ZONE = 80, SPEED = 8

      if (boardRef.current) {
        const br = boardRef.current.getBoundingClientRect()
        if (x < br.left + ZONE) boardRef.current.scrollLeft -= SPEED
        else if (x > br.right - ZONE) boardRef.current.scrollLeft += SPEED
      }

      const colBody = document.elementFromPoint(x, y)?.closest('[data-column-body]')
      if (colBody) {
        const cr = colBody.getBoundingClientRect()
        if (y < cr.top + ZONE) colBody.scrollTop -= SPEED
        else if (y > cr.bottom - ZONE) colBody.scrollTop += SPEED
      }

      autoScrollFrame.current = requestAnimationFrame(scroll)
    }
    autoScrollFrame.current = requestAnimationFrame(scroll)
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrame.current) {
      cancelAnimationFrame(autoScrollFrame.current)
      autoScrollFrame.current = null
    }
  }, [])

  const handleCardPointerDown = useCallback((idea, e) => {
    if (e.button !== 0 || readOnly || idea.status === 'archived') return
    const rect = e.currentTarget.getBoundingClientRect()
    dragData.current = {
      id: idea.id,
      status: idea.status || 'raw',
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    }

    const onPointerMove = (ev) => {
      const d = dragData.current
      if (!d) return
      lastPointerPos.current = { x: ev.clientX, y: ev.clientY }

      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY

      if (!d.moved && Math.sqrt(dx * dx + dy * dy) > 8) {
        d.moved = true
        setDraggingId(d.id)
        setGhostStyle({ x: ev.clientX - d.offsetX, y: ev.clientY - d.offsetY, width: d.width })
        startAutoScroll()
      }

      if (d.moved) {
        setGhostStyle({ x: ev.clientX - d.offsetX, y: ev.clientY - d.offsetY, width: d.width })
        setDropTarget(resolveDropTarget(ev.clientX, ev.clientY, d.id))
      }
    }

    const onPointerUp = (ev) => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      stopAutoScroll()

      const d = dragData.current
      if (d?.moved) {
        const target = resolveDropTarget(ev.clientX, ev.clientY, d.id)
        if (target && (target.status !== d.status || target.beforeId !== null)) {
          handleMove(d.id, target.status, target.beforeId)
        }
      }

      dragData.current = null
      setDraggingId(null)
      setDropTarget(null)
      setGhostStyle(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }, [readOnly, resolveDropTarget, handleMove, startAutoScroll, stopAutoScroll])

  // Cleanup on unmount
  useEffect(() => () => stopAutoScroll(), [stopAutoScroll])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const editingIdea = editingId ? ideas.find(i => i.id === editingId) ?? null : null
  const convertIdea = convertId ? ideas.find(i => i.id === convertId) ?? null : null
  const visibleStatuses = showArchived ? KANBAN_STATUSES : KANBAN_STATUSES.filter(s => s.id !== 'archived')

  const handleCardSelect = useCallback((id) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const handleCardEdit = useCallback((id) => {
    setEditingId(id)
  }, [])

  return (
    <div data-tour="ideas-header" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .quick-capture-wrap:focus-within {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 2px var(--accent-fade) !important;
        }
      `}</style>

      <QuickCapture onAdd={handleAdd} readOnly={readOnly} allTags={allTags} />

      <FiltersBar
        allTags={allTags}
        filterTag={filterTag}
        setFilterTag={setFilterTag}
        sortBy={sortBy}
        setSortBy={setSortBy}
        showArchived={showArchived}
        setShowArchived={setShowArchived}
        filterFavourite={filterFavourite}
        setFilterFavourite={setFilterFavourite}
        filterLinked={filterLinked}
        setFilterLinked={setFilterLinked}
        filterAiExpanded={filterAiExpanded}
        setFilterAiExpanded={setFilterAiExpanded}
        totalCount={filteredIdeas.filter(i => showArchived || i.status !== 'archived').length}
      />

      {/* Board */}
      <div
        ref={boardRef}
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'hidden',
          display: 'flex',
          gap: 14,
          padding: '16px 18px 18px',
          userSelect: draggingId ? 'none' : undefined,
        }}
        onClick={() => setSelectedId(null)}
      >
        {visibleStatuses.map(status => (
          <KanbanColumn
            key={status.id}
            status={status}
            ideas={columns[status.id] || []}
            draggingId={draggingId}
            isDropTarget={dropTarget?.status === status.id}
            dropBeforeId={dropTarget?.status === status.id ? dropTarget.beforeId : null}
            selectedId={selectedId}
            aiExpandId={aiExpandId}
            onCardClick={handleCardSelect}
            onCardEdit={handleCardEdit}
            onCardPointerDown={handleCardPointerDown}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onFavourite={handleFavourite}
            onConvert={(id) => setConvertId(id)}
            onAiExpand={handleAiExpand}
            onEmptyClick={() => setCreateStatus(status.id)}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Drag ghost */}
      {draggingId && ghostStyle && (() => {
        const idea = ideas.find(i => i.id === draggingId)
        return idea ? <GhostCard idea={idea} style={ghostStyle} /> : null
      })()}

      {/* Edit modal */}
      {editingIdea && (
        <IdeaEditModal
          idea={editingIdea}
          store={store}
          onUpdate={handleUpdate}
          onClose={() => setEditingId(null)}
          onConvert={() => { setConvertId(editingIdea.id); setEditingId(null) }}
          onArchive={() => handleArchive(editingIdea.id)}
          onDelete={() => { handleDelete(editingIdea.id); setEditingId(null) }}
          onAiExpand={handleAiExpand}
          aiExpandId={aiExpandId}
          readOnly={readOnly}
        />
      )}

      {/* Create modal */}
      {createStatus && (
        <IdeaCreateModal
          status={createStatus}
          onClose={() => setCreateStatus(null)}
          onAdd={handleAddForStatus}
        />
      )}

      {/* Convert modal */}
      {convertIdea && (
        <ConvertModal
          idea={convertIdea}
          store={store}
          onClose={() => setConvertId(null)}
          onConverted={(type, entityId, entityName) => {
            handleUpdate(convertIdea.id, {
              convertedTo: { type, id: entityId, name: entityName },
              status: 'inStory',
              linkedEntities: [
                ...(convertIdea.linkedEntities || []),
                { type, id: entityId, name: entityName },
              ],
            })
            setConvertId(null)
          }}
        />
      )}
    </div>
  )
}
