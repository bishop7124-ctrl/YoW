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

// ─── Detail panel ─────────────────────────────────────────────────────────────

function IdeaDetailPanel({ idea, store, onUpdate, onClose, onConvert, onArchive, onDelete, onAiExpand, aiExpandId, readOnly }) {
  const [descDraft, setDescDraft] = useState(idea.description || idea.body || '')
  const [editingDesc, setEditingDesc] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [showLinkSearch, setShowLinkSearch] = useState(false)
  const isExpanding = aiExpandId === idea.id

  useEffect(() => {
    setDescDraft(idea.description || idea.body || '')
    setEditingDesc(false)
  }, [idea.body, idea.description, idea.id])

  const commitDesc = () => {
    const d = descDraft.trim()
    if (d !== (idea.description || idea.body || '')) {
      onUpdate(idea.id, { description: d, body: d })
    }
    setEditingDesc(false)
  }

  // Entity lookup for link search
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
    return allEntities
      .filter(e => e.name.toLowerCase().includes(q) && !linked.some(l => l.id === e.id))
      .slice(0, 6)
  }, [linkSearch, allEntities, idea.linkedEntities])

  const addLink = (entity) => {
    onUpdate(idea.id, { linkedEntities: [...(idea.linkedEntities || []), entity] })
    setLinkSearch('')
    setShowLinkSearch(false)
  }

  const removeLink = (entityId) => {
    onUpdate(idea.id, { linkedEntities: (idea.linkedEntities || []).filter(e => e.id !== entityId) })
  }

  // Tag management
  const [tagDraft, setTagDraft] = useState('')

  const addTag = (tag) => {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (clean && !(idea.tags || []).includes(clean)) {
      onUpdate(idea.id, { tags: [...(idea.tags || []), clean] })
    }
    setTagDraft('')
  }

  const removeTag = (tag) => {
    onUpdate(idea.id, { tags: (idea.tags || []).filter(t => t !== tag) })
  }

  const statusInfo = KANBAN_STATUSES.find(s => s.id === (idea.status || 'raw'))

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 360,
        maxWidth: '85vw',
        background: 'var(--bg-nav)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-12px 0 40px rgba(0,0,0,.35)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      {/* Panel header */}
      <div style={{
        padding: '16px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <h3 style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-main)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {idea.title || 'Untitled'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ flex: 1, padding: '18px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 20,
            background: 'var(--accent-fade)',
            color: 'var(--accent)',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}>
            {statusInfo?.label || idea.status}
          </span>
          {idea.isFavourite && (
            <span style={{ fontSize: 12, color: '#f59e0b' }}>★ Favourite</span>
          )}
          {idea.aiExpanded && (
            <span style={{ fontSize: 10, color: 'var(--accent2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              AI expanded
            </span>
          )}
        </div>

        {/* Description */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Description
            </label>
            {!readOnly && !editingDesc && (
              <button
                type="button"
                onClick={() => { setDescDraft(idea.description || idea.body || ''); setEditingDesc(true) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 10, fontFamily: 'inherit', padding: 0 }}
              >
                edit
              </button>
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => onAiExpand?.(idea.id)}
                disabled={isExpanding}
                style={{
                  marginLeft: 'auto',
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '3px 8px',
                  cursor: 'pointer', color: 'var(--accent)',
                  fontSize: 10, fontFamily: 'inherit',
                  opacity: isExpanding ? 0.6 : 1,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                {isExpanding ? 'Expanding…' : 'AI expand'}
              </button>
            )}
          </div>

          {editingDesc ? (
            <textarea
              autoFocus
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              onBlur={commitDesc}
              onKeyDown={e => { if (e.key === 'Escape') { setDescDraft(idea.description || idea.body || ''); setEditingDesc(false) } }}
              rows={5}
              style={{
                width: '100%',
                background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))',
                border: '1px solid var(--accent)',
                borderRadius: 8,
                padding: '10px 12px',
                color: 'var(--text-main)',
                fontSize: 13,
                fontFamily: 'inherit',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <p
              onClick={() => { if (!readOnly) { setDescDraft(idea.description || idea.body || ''); setEditingDesc(true) } }}
              style={{
                margin: 0,
                fontSize: 13,
                color: (idea.description || idea.body) ? 'var(--text-muted)' : 'var(--faint)',
                lineHeight: 1.65,
                cursor: readOnly ? 'default' : 'text',
                minHeight: 40,
              }}
            >
              {idea.description || idea.body || (readOnly ? '—' : 'Click to add a description…')}
            </p>
          )}
        </div>

        {/* Tags */}
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            Tags
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {(idea.tags || []).map(tag => (
              <span
                key={tag}
                style={{
                  fontSize: 11,
                  padding: '3px 9px',
                  borderRadius: 20,
                  background: 'var(--accent-fade)',
                  color: 'var(--accent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                #{tag}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6, lineHeight: 1, fontSize: 12 }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {!readOnly && (
              <input
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft) }
                  if (e.key === 'Backspace' && !tagDraft) removeTag((idea.tags || []).slice(-1)[0])
                }}
                placeholder="+ add tag"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: 'var(--text-muted)', fontSize: 11, fontFamily: 'inherit',
                  padding: '3px 0', minWidth: 60,
                }}
              />
            )}
          </div>
        </div>

        {/* Linked entities */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Linked to
            </label>
            {!readOnly && (
              <button
                type="button"
                onClick={() => setShowLinkSearch(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 10, fontFamily: 'inherit', padding: 0 }}
              >
                + link
              </button>
            )}
          </div>

          {/* Link search */}
          {showLinkSearch && (
            <div style={{ marginBottom: 10 }}>
              <input
                autoFocus
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                placeholder="Search characters, locations, lore…"
                style={{
                  width: '100%',
                  background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: 'var(--text-main)',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {linkResults.length > 0 && (
                <div style={{
                  marginTop: 4,
                  background: 'var(--bg-nav)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  {linkResults.map(e => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => addLink(e)}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                        padding: '8px 12px', background: 'none', border: 'none',
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        color: 'var(--text-main)', fontSize: 12, fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.04em', width: 56, flexShrink: 0 }}>
                        {e.type}
                      </span>
                      {e.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Linked list */}
          {(idea.linkedEntities || []).length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {idea.linkedEntities.map(entity => (
                <div
                  key={entity.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px',
                    background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontSize: 10, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.04em', width: 56, flexShrink: 0 }}>
                    {entity.type}
                  </span>
                  <span style={{ flex: 1, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entity.name}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeLink(entity.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 14, padding: 0, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--faint)' }}>No linked entities yet.</p>
          )}
        </div>

        {/* Converted indicator */}
        {idea.convertedTo && (
          <div style={{
            padding: '10px 14px',
            background: 'color-mix(in srgb, #7ac4a0 10%, color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main)))',
            border: '1px solid color-mix(in srgb, #7ac4a0 30%, var(--border))',
            borderRadius: 8,
            fontSize: 12,
          }}>
            <p style={{ margin: 0, color: '#7ac4a0', fontWeight: 600 }}>
              ✓ Converted to {idea.convertedTo.type}
            </p>
            <p style={{ margin: '2px 0 0', color: 'var(--text-muted)' }}>
              {idea.convertedTo.name}
            </p>
          </div>
        )}
      </div>

      {/* Panel footer actions */}
      {!readOnly && (
        <div style={{
          padding: '14px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={() => onConvert?.()}
            className="btn btn-secondary"
            style={{ flex: 1 }}
          >
            Convert
          </button>
          {idea.status !== 'archived' ? (
            <button
              type="button"
              onClick={() => { onArchive?.(); onClose() }}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              Archive
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { onUpdate(idea.id, { status: 'raw' }); onClose() }}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              Restore
            </button>
          )}
          <button
            type="button"
            onClick={() => { if (window.confirm('Delete this idea?')) { onDelete?.(); onClose() } }}
            className="btn"
            style={{ flex: 1, color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 30%, var(--border))' }}
          >
            Delete
          </button>
        </div>
      )}
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

  const handleUpdate = useCallback((id, data) => {
    if (readOnly) return
    updateIdeaEntry(id, { ...data, updatedAt: Date.now() })
  }, [updateIdeaEntry, readOnly])

  const handleDelete = useCallback((id) => {
    if (readOnly) return
    deleteIdeaEntry(id)
    if (selectedId === id) setSelectedId(null)
    if (convertId === id) setConvertId(null)
  }, [deleteIdeaEntry, readOnly, selectedId, convertId])

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

  const selectedIdea = selectedId ? ideas.find(i => i.id === selectedId) ?? null : null
  const convertIdea = convertId ? ideas.find(i => i.id === convertId) ?? null : null
  const visibleStatuses = showArchived ? KANBAN_STATUSES : KANBAN_STATUSES.filter(s => s.id !== 'archived')

  const handleCardSelect = useCallback((id) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
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
            onCardPointerDown={handleCardPointerDown}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onArchive={handleArchive}
            onRestore={handleRestore}
            onFavourite={handleFavourite}
            onConvert={(id) => setConvertId(id)}
            onAiExpand={handleAiExpand}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Drag ghost */}
      {draggingId && ghostStyle && (() => {
        const idea = ideas.find(i => i.id === draggingId)
        return idea ? <GhostCard idea={idea} style={ghostStyle} /> : null
      })()}

      {/* Selected idea detail panel */}
      {selectedIdea && (
        <IdeaDetailPanel
          idea={selectedIdea}
          store={store}
          onUpdate={handleUpdate}
          onClose={() => setSelectedId(null)}
          onConvert={() => setConvertId(selectedIdea.id)}
          onArchive={() => handleArchive(selectedIdea.id)}
          onDelete={() => handleDelete(selectedIdea.id)}
          onAiExpand={handleAiExpand}
          aiExpandId={aiExpandId}
          readOnly={readOnly}
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
