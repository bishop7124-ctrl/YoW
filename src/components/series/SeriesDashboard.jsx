import { useState, useRef, useEffect, useMemo } from 'react'
import YOWLogo from '../brand/YOWLogo'
import UserMenu from '../auth/UserMenu'
import { getProjectType } from '../../constants/projectTypes'
import { hasJourneyContent, normalizeJourney } from '../../utils/characterJourney'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COVER_GRADIENTS = [
  'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  'linear-gradient(160deg, #1c0c2a 0%, #2d1b4e 60%, #1a0d33 100%)',
  'linear-gradient(160deg, #0d1f2d 0%, #1a3a4a 55%, #0a2030 100%)',
  'linear-gradient(160deg, #1a0c0c 0%, #2d1212 50%, #3a1a1a 100%)',
  'linear-gradient(160deg, #0d2013 0%, #1a3a20 50%, #0a1a0d 100%)',
  'linear-gradient(160deg, #0c1a24 0%, #1a2e3a 50%, #0a1520 100%)',
  'linear-gradient(160deg, #1a1208 0%, #2e2010 50%, #3a2a18 100%)',
  'linear-gradient(160deg, #0c0c1a 0%, #1a1a30 50%, #0a0a18 100%)',
]
const getCoverGradient = (title) => {
  const n = (title || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return COVER_GRADIENTS[n % COVER_GRADIENTS.length]
}

/** Return the human-readable type label for a project, e.g. "Novel", "Screenplay". */
const projectTypeLabel = (project) => getProjectType(project?.type)?.label ?? 'Project'

const fmt = (n) => new Intl.NumberFormat().format(n || 0)
const shortText = (value, fallback = 'No summary yet') => {
  const text = String(value || '').trim()
  if (!text) return fallback
  return text.length > 150 ? `${text.slice(0, 147)}...` : text
}
const normalizeKey = value => String(value || '').trim().toLowerCase()
const getProjectTitle = (project) => project?.title || 'Untitled project'
const getTimelineSortParts = value => {
  const label = String(value || '').trim()
  if (!label) return { bucket: 1, value: 0, label: '' }
  const parsedDate = Date.parse(label)
  if (!Number.isNaN(parsedDate)) return { bucket: 0, value: parsedDate, label: label.toLowerCase() }
  const numberMatch = label.match(/-?\d+(?:\.\d+)?/)
  if (numberMatch) return { bucket: 0, value: Number(numberMatch[0]), label: label.toLowerCase() }
  return { bucket: 0, value: Number.POSITIVE_INFINITY, label: label.toLowerCase() }
}
const compareTimelineRows = (a, b) => {
  const dateA = getTimelineSortParts(a.date)
  const dateB = getTimelineSortParts(b.date)
  if (dateA.bucket !== dateB.bucket) return dateA.bucket - dateB.bucket
  if (dateA.value !== dateB.value) return dateA.value - dateB.value
  if (dateA.label !== dateB.label) return dateA.label.localeCompare(dateB.label)
  return String(a.title || '').localeCompare(String(b.title || ''))
}
const buildCharacterIdentityGroups = (characters, orderedProjects, mergedCharacterGroups = {}) => {
  const projectOrder = new Map(orderedProjects.map((project, index) => [project.id, index]))
  const mergedEntries = Object.entries(mergedCharacterGroups)
  const grouped = new Map()
  characters.forEach(character => {
    const merged = mergedEntries.find(([, ids]) => Array.isArray(ids) && ids.includes(character.id))
    const nameKey = normalizeKey(character.name)
    const key = merged ? `merged:${merged[0]}` : `name:${nameKey || character.syncRootId || character.syncSourceId || character.id}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(character)
  })
  return [...grouped.entries()].map(([key, values]) => {
    const sorted = values.sort((a, b) => (projectOrder.get(a.novelId) ?? 9999) - (projectOrder.get(b.novelId) ?? 9999))
    const projectIds = [...new Set(sorted.map(character => character.novelId))]
    return {
      id: key,
      key,
      name: sorted.find(character => character.name)?.name || 'Unnamed character',
      characters: sorted,
      characterIds: sorted.map(character => character.id),
      projectIds,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

const SERIES_STATUS = [
  { id: 'planned',  label: 'Planned',  color: '#89919a' },
  { id: 'ongoing',  label: 'Ongoing',  color: '#5bb7d9' },
  { id: 'hiatus',   label: 'Hiatus',   color: '#e3a84f' },
  { id: 'complete', label: 'Complete', color: '#5dc878' },
]

const PROJECT_STATUS_DATA = {
  not_started: { label: 'Not started', color: '#89919a' },
  draft:       { label: 'Draft',       color: '#a78bfa' },
  in_progress: { label: 'In progress', color: '#5bb7d9' },
  editing:     { label: 'Editing',     color: '#e3a84f' },
  complete:    { label: 'Complete',    color: '#5dc878' },
  paused:      { label: 'Paused',      color: '#d86b70' },
  writing:     { label: 'In progress', color: '#5bb7d9' },
  revision:    { label: 'Editing',     color: '#e3a84f' },
}

const SYNC_CATEGORY_OPTIONS = [
  { id: 'characters',   label: 'Characters' },
  { id: 'factions',     label: 'Factions' },
  { id: 'locations',    label: 'Locations' },
  { id: 'lore',         label: 'Lore' },
  { id: 'timeline',     label: 'Timeline' },
  { id: 'worldhistory', label: 'World History' },
  { id: 'ideas',        label: 'Ideas' },
]

const CONTINUITY_RECORD_TYPES = [
  { id: 'all', label: 'All records' },
  { id: 'character', label: 'Characters' },
  { id: 'location', label: 'Locations' },
  { id: 'lore', label: 'Lore' },
  { id: 'faction', label: 'Factions' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'history', label: 'History' },
  { id: 'map', label: 'Maps' },
  { id: 'journey', label: 'Journeys' },
]

const CONTINUITY_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'summary', label: 'Summary' },
  { id: 'index', label: 'Index' },
  { id: 'characters', label: 'Characters' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'issues', label: 'Issues' },
  { id: 'export', label: 'Export' },
]

const PROJECT_SECTION_BY_CONTINUITY_TYPE = {
  character: 'characters',
  journey: 'characters',
  location: 'locations',
  lore: 'lore',
  faction: 'characters',
  timeline: 'timeline',
  history: 'worldhistory',
  map: 'map',
}
const getProjectTarget = (type, item, projectId) => ({
  type,
  itemId: item?.id || null,
  section: PROJECT_SECTION_BY_CONTINUITY_TYPE[type] || 'dashboard',
  projectId,
})

function SeriesStatusBadge({ status }) {
  const d = SERIES_STATUS.find(s => s.id === status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: '.04em',
      background: `${d?.color ?? '#89919a'}22`,
      color: d?.color ?? 'var(--text-muted)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d?.color ?? '#89919a', flexShrink: 0 }} />
      {d?.label ?? 'Unknown'}
    </span>
  )
}

function ProjectStatusDot({ status }) {
  const d = PROJECT_STATUS_DATA[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 600, color: d?.color ?? 'var(--text-muted)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: d?.color ?? '#89919a', flexShrink: 0 }} />
      {d?.label ?? 'No status'}
    </span>
  )
}

function ProgressBar({ value, total, color = 'var(--accent)' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ title, body, confirmLabel = 'Delete', onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%' }}>
        <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 22 }}>{body}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#d86b70', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Project Modal ────────────────────────────────────────────────────────

function AddProjectModal({ store, seriesId, onClose }) {
  const [tab, setTab] = useState('existing') // 'existing' | 'new'
  const [newTitle, setNewTitle] = useState('')
  const [selectedId, setSelectedId] = useState('')
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const unassigned = store.novels.filter(n => !n.seriesId)

  const handleAssign = () => {
    if (!selectedId) return
    store.updateNovel(selectedId, { seriesId })
    onClose()
  }

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    store.addNovel({ title: newTitle.trim(), seriesId })
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 18, width: 'min(480px, 100%)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700 }}>Add Project to Series</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {['existing', 'new'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`, color: tab === t ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'capitalize' }}>
              {t === 'existing' ? 'Assign Existing' : 'Create New'}
            </button>
          ))}
        </div>
        <div style={{ padding: 22 }}>
          {tab === 'existing' ? (
            <>
              {unassigned.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>All your projects are already in a series.</p>
              ) : (
                <>
                  <select
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 13, marginBottom: 16 }}
                  >
                    <option value="">Select a project…</option>
                    {unassigned.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.title || 'Untitled'}{n.type && n.type !== 'novel' ? ` (${projectTypeLabel(n)})` : ''}
                      </option>
                    ))}
                  </select>
                  <button onClick={handleAssign} disabled={!selectedId} style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontWeight: 700, fontSize: 13, cursor: selectedId ? 'pointer' : 'not-allowed', opacity: selectedId ? 1 : .5 }}>
                    Add to Series
                  </button>
                </>
              )}
            </>
          ) : (
            <form onSubmit={handleCreate}>
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Project title…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }}
              />
              <button type="submit" disabled={!newTitle.trim()} style={{ width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontWeight: 700, fontSize: 13, cursor: newTitle.trim() ? 'pointer' : 'not-allowed', opacity: newTitle.trim() ? 1 : .5 }}>
                Create Project
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ series, orderedProjects, allStats, onOpenProject }) {
  const totalWords = allStats.reduce((s, st) => s + st.manuscriptWords, 0)
  const wordGoal = series.wordGoal || 0
  const completedProjects = allStats.filter(st => (st.project.status === 'complete')).length

  return (
    <div className="series-tab-content">
      {/* Stats bar */}
      <div className="series-stats-bar">
        <div className="series-stat">
          <span className="series-stat-value">{orderedProjects.length}</span>
          <span className="series-stat-label">Projects</span>
        </div>
        <div className="series-stat-divider" />
        <div className="series-stat">
          <span className="series-stat-value">{fmt(totalWords)}</span>
          <span className="series-stat-label">Total Words</span>
        </div>
        <div className="series-stat-divider" />
        <div className="series-stat">
          <span className="series-stat-value">{completedProjects}</span>
          <span className="series-stat-label">Complete</span>
        </div>
        {wordGoal > 0 && (
          <>
            <div className="series-stat-divider" />
            <div className="series-stat" style={{ flex: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="series-stat-label">Series Goal</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmt(totalWords)} / {fmt(wordGoal)}</span>
              </div>
              <ProgressBar value={totalWords} total={wordGoal} />
            </div>
          </>
        )}
      </div>

      {/* Projects table */}
      <div className="series-books-section">
        <div className="series-section-header">
          <h3>Projects in Series</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reading order</span>
        </div>

        {orderedProjects.length === 0 ? (
          <div className="series-empty-books">
            <p>No projects yet.</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Use the Projects tab to add your first project to this series.</p>
          </div>
        ) : (
          <div className="series-books-table">
            <div className="series-books-table-head">
              <span className="sbt-num">#</span>
              <span className="sbt-title">Title</span>
              <span className="sbt-status">Status</span>
              <span className="sbt-words">Words</span>
              <span className="sbt-progress">Progress</span>
              <span className="sbt-action" />
            </div>
            {orderedProjects.map((project, i) => {
              const stats = allStats.find(s => s.project.id === project.id)
              const words = stats?.manuscriptWords ?? 0
              const goal = project.wordGoal || 0
              return (
                <div key={project.id} className="series-books-table-row">
                  <span className="sbt-num">{i + 1}</span>
                  <span className="sbt-title">
                    <div className="sbt-cover" style={{ background: project.coverPhoto ? undefined : getCoverGradient(project.title) }}>
                      {project.coverPhoto ? <img src={project.coverPhoto} alt="" /> : <span>{project.title?.[0]?.toUpperCase()}</span>}
                    </div>
                    <span className="sbt-title-text">
                      {project.title || 'Untitled'}
                      {project.type && project.type !== 'novel' && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 600 }}>{projectTypeLabel(project)}</span>
                      )}
                    </span>
                  </span>
                  <span className="sbt-status"><ProjectStatusDot status={project.status} /></span>
                  <span className="sbt-words">{fmt(words)}</span>
                  <span className="sbt-progress">
                    {goal > 0 ? <ProgressBar value={words} total={goal} /> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                  </span>
                  <span className="sbt-action">
                    <button className="series-open-book-btn" onClick={() => onOpenProject(project.id)}>Open</button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Projects Tab ─────────────────────────────────────────────────────────────

function ProjectsTab({ orderedProjects, allStats, onOpenProject, onAddProject, onRemoveProject, onReorder }) {
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const handleDragStart = (e, id) => {
    setDragging(id)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, id) => {
    e.preventDefault()
    setDragOver(id)
  }
  const handleDrop = (e, targetId) => {
    e.preventDefault()
    if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return }
    const ids = orderedProjects.map(p => p.id)
    const from = ids.indexOf(dragging)
    const to = ids.indexOf(targetId)
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragging)
    onReorder(next)
    setDragging(null)
    setDragOver(null)
  }
  const handleDragEnd = () => { setDragging(null); setDragOver(null) }

  return (
    <div className="series-tab-content">
      <div className="series-section-header">
        <h3>Projects</h3>
        <button className="series-add-btn" onClick={onAddProject}>+ Add Project</button>
      </div>

      {orderedProjects.length === 0 ? (
        <div className="series-empty-books">
          <p>No projects yet.</p>
          <button className="series-add-btn" style={{ marginTop: 12 }} onClick={onAddProject}>Add your first project</button>
        </div>
      ) : (
        <div className="series-books-grid">
          {orderedProjects.map((project, i) => {
            const stats = allStats.find(s => s.project.id === project.id)
            const words = stats?.manuscriptWords ?? 0
            const goal = project.wordGoal || 0
            return (
              <div
                key={project.id}
                className={`series-book-card${dragging === project.id ? ' is-dragging' : ''}${dragOver === project.id && dragging !== project.id ? ' is-drag-target' : ''}`}
                draggable
                onDragStart={e => handleDragStart(e, project.id)}
                onDragOver={e => handleDragOver(e, project.id)}
                onDrop={e => handleDrop(e, project.id)}
                onDragEnd={handleDragEnd}
              >
                <div className="series-book-card-cover" style={{ background: project.coverPhoto ? undefined : getCoverGradient(project.title) }}>
                  {project.coverPhoto ? <img src={project.coverPhoto} alt="" /> : <span className="series-book-card-letter">{project.title?.[0]?.toUpperCase()}</span>}
                  <div className="series-book-card-num">#{i + 1}</div>
                  <div className="series-book-card-drag" title="Drag to reorder">⠿</div>
                </div>
                <div className="series-book-card-body">
                  <p className="series-book-card-title">{project.title || 'Untitled'}</p>
                  {project.type && project.type !== 'novel' && (
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>{projectTypeLabel(project)}</p>
                  )}
                  <ProjectStatusDot status={project.status} />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{fmt(words)} words</p>
                  {goal > 0 && <div style={{ marginTop: 6 }}><ProgressBar value={words} total={goal} /></div>}
                </div>
                <div className="series-book-card-actions">
                  <button className="series-open-book-btn" onClick={() => onOpenProject(project.id)}>Open</button>
                  <button
                    className="series-remove-book-btn"
                    onClick={() => onRemoveProject(project.id)}
                    title="Remove from series"
                  >Remove</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({ series, store, onDelete }) {
  const [form, setForm] = useState({
    name: series.name || '',
    description: series.description || series.summary || '',
    genre: series.genre || '',
    status: series.status || 'ongoing',
    wordGoal: series.wordGoal || '',
    syncCategories: series.syncCategories ?? [],
  })
  const [saved, setSaved] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const patch = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleSync = (id) => {
    setForm(f => {
      const next = f.syncCategories.includes(id)
        ? f.syncCategories.filter(c => c !== id)
        : [...f.syncCategories, id]
      return { ...f, syncCategories: next }
    })
  }

  const handleSave = (e) => {
    e.preventDefault()
    store.updateSeries(series.id, {
      name: form.name.trim() || series.name,
      description: form.description,
      summary: form.description,
      genre: form.genre,
      status: form.status,
      wordGoal: form.wordGoal ? parseInt(form.wordGoal, 10) : null,
      syncCategories: form.syncCategories,
      updatedAt: new Date().toISOString(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="series-tab-content">
      <form onSubmit={handleSave} className="series-settings-form">
        <section className="series-settings-section">
          <h4>Identity</h4>
          <div className="series-settings-grid">
            <label className="series-settings-field series-settings-field--wide">
              <span>Series Name</span>
              <input value={form.name} onChange={e => patch('name', e.target.value)} placeholder="Series name" />
            </label>
            <label className="series-settings-field">
              <span>Genre</span>
              <input value={form.genre} onChange={e => patch('genre', e.target.value)} placeholder="e.g. Epic Fantasy" />
            </label>
            <label className="series-settings-field series-settings-field--summary">
              <span>Description</span>
              <textarea value={form.description} onChange={e => patch('description', e.target.value)} rows={3} placeholder="Series description…" />
            </label>
            <label className="series-settings-field">
              <span>Status</span>
              <select value={form.status} onChange={e => patch('status', e.target.value)}>
                {SERIES_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="series-settings-field">
              <span>Series Word Goal</span>
              <input type="number" min="0" value={form.wordGoal} onChange={e => patch('wordGoal', e.target.value)} placeholder="e.g. 300000" />
            </label>
          </div>
        </section>

        <section className="series-settings-section">
          <h4>Shared World-Building</h4>
          <p className="series-settings-hint">Data in toggled categories pools across all projects in reading order — earlier projects share data forward to later ones.</p>
          <div className="series-sync-grid">
            {SYNC_CATEGORY_OPTIONS.map(cat => {
              const on = form.syncCategories.includes(cat.id)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleSync(cat.id)}
                  className={`series-sync-chip${on ? ' is-on' : ''}`}
                >
                  {cat.label}
                  {on && <span>✓</span>}
                </button>
              )
            })}
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ fontSize: 12, color: '#d86b70', background: 'none', border: '1px solid #d86b7044', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}
          >
            Delete Series
          </button>
          <button type="submit" style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: saved ? '#5dc878' : 'var(--accent)', color: 'var(--bg-main)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'background .2s' }}>
            {saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        </div>
      </form>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this series?"
          body="The series will be removed. All projects will remain in your library as standalone projects. This cannot be undone."
          confirmLabel="Delete Series"
          onConfirm={onDelete}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  )
}

// ─── Continuity Tab ───────────────────────────────────────────────────────────

function ContinuityTab({ series, orderedProjects, store, onOpenProject, onOpenSettings }) {
  const [continuityTab, setContinuityTab] = useState('overview')
  const [timelineMode, setTimelineMode] = useState('byProject')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [selectedResult, setSelectedResult] = useState(null)
  const [editingLane, setEditingLane] = useState(null)
  const detailRef = useRef(null)
  const records = useMemo(() => store.continuityRecords || {}, [store.continuityRecords])
  const syncCategories = series.syncCategories ?? []
  const projectIds = useMemo(() => new Set(orderedProjects.map(project => project.id)), [orderedProjects])
  const projectById = useMemo(() => new Map(orderedProjects.map(project => [project.id, project])), [orderedProjects])
  const continuity = series.continuity || {}
  const visibleCharacterIds = useMemo(() => continuity.visibleCharacterIds || [], [continuity.visibleCharacterIds])
  const reviewedIssueIds = useMemo(() => continuity.reviewedIssueIds || [], [continuity.reviewedIssueIds])
  const mergedCharacterGroups = useMemo(() => continuity.mergedCharacterGroups || {}, [continuity.mergedCharacterGroups])
  const continuityCharacters = useMemo(() => (
    (records.characters || []).filter(character => (
      character &&
      projectIds.has(character.novelId) &&
      !character.syncDeleted &&
      !character.hiddenFromContinuity &&
      !character.hideFromContinuity
    ))
  ), [records.characters, projectIds])
  const characterRecordGroups = useMemo(() => (
    buildCharacterIdentityGroups(continuityCharacters, orderedProjects, mergedCharacterGroups)
  ), [continuityCharacters, orderedProjects, mergedCharacterGroups])
  const journeyCharacterGroups = useMemo(() => (
    characterRecordGroups
      .map(group => ({ ...group, characters: group.characters.filter(character => hasJourneyContent(character.journey)) }))
      .filter(group => group.characters.length > 0)
      .map(group => ({
        ...group,
        characterIds: group.characters.map(character => character.id),
        projectIds: [...new Set(group.characters.map(character => character.novelId))],
      }))
  ), [characterRecordGroups])
  const visibleCharacterGroups = useMemo(() => (
    journeyCharacterGroups.filter(group => group.characterIds.some(id => visibleCharacterIds.includes(id)))
  ), [journeyCharacterGroups, visibleCharacterIds])
  const selectedJourneyCount = visibleCharacterGroups.length

  const seriesItems = useMemo(() => {
    const allowed = item => item && projectIds.has(item.novelId) && !item.syncDeleted && !item.hiddenFromContinuity && !item.hideFromContinuity
    const make = (type, item, title, summary, section) => ({
      id: `${type}:${item.id}`,
      type,
      item,
      itemId: item.id,
      title: title || 'Untitled',
      summary: shortText(summary),
      project: projectById.get(item.novelId),
      projectId: item.novelId,
      section,
      scope: item.syncRootId || item.syncSourceId ? 'Shared lineage' : 'Project-local',
      search: [title, summary, type, projectById.get(item.novelId)?.title].map(value => String(value || '').toLowerCase()).join(' '),
    })
    const makeCharacterIdentity = (type, group) => {
      const projectTitles = group.projectIds.map(id => getProjectTitle(projectById.get(id)))
      const summary = type === 'journey'
        ? `${group.name} has journey entries across ${group.projectIds.length} ${group.projectIds.length === 1 ? 'project' : 'projects'}.`
        : `${group.characters.length} continuity ${group.characters.length === 1 ? 'record' : 'records'} across ${group.projectIds.length} ${group.projectIds.length === 1 ? 'project' : 'projects'}.`
      return {
        id: `${type}-identity:${group.id}`,
        type,
        item: group.characters[0],
        itemId: group.id,
        title: type === 'journey' ? `${group.name} journey` : group.name,
        summary,
        project: projectById.get(group.projectIds[0]),
        projectId: group.projectIds[0],
        projectIds: group.projectIds,
        projectLabel: projectTitles.join(', '),
        section: 'characters',
        scope: 'Series character',
        search: [group.name, summary, type, ...projectTitles].map(value => String(value || '').toLowerCase()).join(' '),
        characterGroup: group,
      }
    }
    const chars = characterRecordGroups.map(group => makeCharacterIdentity('character', group))
    const locations = (records.locations || []).filter(allowed).map(item => make('location', item, item.name, item.description || item.summary || item.category, 'locations'))
    const lore = (records.loreEntries || []).filter(allowed).map(item => make('lore', item, item.title, item.content || item.summary || item.category, 'lore'))
    const factions = (records.factions || []).filter(allowed).map(item => make('faction', item, item.name, item.description || item.summary || item.type, 'factions'))
    const timeline = (records.timeline || []).filter(allowed).map(item => make('timeline', item, item.title, item.description || item.date || item.category, 'timeline'))
    const history = (records.worldHistory || []).filter(allowed).map(item => make('history', item, item.title, item.content || item.dateRange || item.era, 'worldhistory'))
    const maps = (records.maps || []).filter(allowed).map(item => make('map', item, item.name, item.mapType || item.metadata?.stylePreset, 'map'))
    const journeys = journeyCharacterGroups.map(group => makeCharacterIdentity('journey', group))
    return [...chars, ...locations, ...lore, ...factions, ...timeline, ...history, ...maps, ...journeys]
  }, [records, projectById, projectIds, characterRecordGroups, journeyCharacterGroups])
  const getContinuityResultForIssue = rel => {
    if (!rel?.item) return null
    if (rel.type === 'character') {
      return seriesItems.find(result => result.type === 'character' && result.characterGroup?.characterIds.includes(rel.item.id))
    }
    return seriesItems.find(result => result.type === rel.type && result.item?.id === rel.item.id)
  }

  const recurringGroups = useMemo(() => {
    const groupBy = (items, type, label) => {
      const grouped = new Map()
      items.forEach(item => {
        if (!item || !projectIds.has(item.novelId) || item.syncDeleted || item.hiddenFromContinuity) return
        const key = normalizeKey(item.name || item.title)
        if (!key) return
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push(item)
      })
      return [...grouped.entries()]
        .filter(([, values]) => new Set(values.map(item => item.novelId)).size > 1 || values.length > 1)
        .map(([key, values]) => ({ key, type, label, values }))
    }
    return [
      ...groupBy(records.characters || [], 'character', 'Character'),
      ...groupBy(records.locations || [], 'location', 'Location'),
      ...groupBy(records.loreEntries || [], 'lore', 'Lore'),
    ]
  }, [records, projectIds])

  const timelineRows = useMemo(() => {
    const events = [
      ...(records.timeline || []).filter(item => projectIds.has(item.novelId)).map(item => ({ kind: 'Timeline', item, title: item.title, body: item.description, date: item.date })),
      ...(records.worldHistory || []).filter(item => projectIds.has(item.novelId)).map(item => ({ kind: 'History', item, title: item.title, body: item.content, date: item.dateRange || item.date })),
    ].filter(row => row.item && !row.item.syncDeleted && !row.item.hiddenFromContinuity)
    const datedByProject = orderedProjects.map(project => ({
      project,
      rows: events.filter(row => row.item.novelId === project.id && String(row.date || '').trim()),
    })).filter(group => group.rows.length)
    const undated = events.filter(row => !String(row.date || '').trim())
    const all = [...events].sort(compareTimelineRows)
    return { datedByProject, undated, all }
  }, [records, orderedProjects, projectIds])

  const issues = useMemo(() => {
    const active = []
    const makeEvidence = (item, type) => {
      if (type === 'location') return shortText(item.description || item.summary || item.category || item.type, 'No details recorded on this location.')
      if (type === 'lore') return shortText(item.content || item.summary || item.category, 'No details recorded on this lore entry.')
      return shortText(item.summary || item.description || item.notes || item.status || item.state, 'No details recorded on this entry.')
    }
    recurringGroups.forEach(group => {
      if (group.type === 'character') return
      const label = group.label.toLowerCase()
      active.push({
        id: `possible-match:${group.type}:${group.key}`,
        severity: 'Review',
        title: `Possible duplicate ${label}: ${group.values[0].name || group.values[0].title}`,
        body: `${group.values.length} ${label} records share this name/title across the series.`,
        explanation: `The dashboard found multiple ${label} records with the same normalized name/title. This can be intentional, but if these records describe the same thing, their details should agree before you treat them as shared continuity.`,
        reviewPrompt: `Review each listed ${label} entry and decide whether they are the same continuity record, separate records with the same name, or records that need cleanup.`,
        related: group.values.map(item => ({
          project: projectById.get(item.novelId),
          item,
          type: group.type,
          title: item.name || item.title || 'Untitled entry',
          evidence: makeEvidence(item, group.type),
        })),
      })
    })
    ;(records.characters || []).filter(character => projectIds.has(character.novelId) && !character.syncDeleted).forEach(character => {
      const statusText = normalizeKey([character.status, character.state, character.notes, character.description].filter(Boolean).join(' '))
      if (statusText.includes('dead') || statusText.includes('deceased')) {
        const projectIndex = orderedProjects.findIndex(project => project.id === character.novelId)
        const later = (records.characters || []).find(other => (
          other.id !== character.id &&
          normalizeKey(other.name) === normalizeKey(character.name) &&
          orderedProjects.findIndex(project => project.id === other.novelId) > projectIndex
        ))
        if (later) {
          const firstEvidence = [character.status, character.state, character.notes, character.description].filter(Boolean).join(' · ')
          const laterEvidence = [later.status, later.state, later.notes, later.description].filter(Boolean).join(' · ')
          active.push({
            id: `after-death:${character.id}:${later.id}`,
            severity: 'Conflict',
            title: `${character.name} may appear after a death/status change`,
            body: `A later project also has ${character.name}.`,
            explanation: `One ${character.name} record contains death/deceased language, but a later story-order project also contains a ${character.name} record. This may be intentional, but it needs review because the later entry could contradict the earlier status.`,
            reviewPrompt: `Check whether the later record is a flashback, resurrection, mistaken report, legacy duplicate, or a continuity error.`,
            related: [
              {
                project: projectById.get(character.novelId),
                item: character,
                type: 'character',
                title: character.name || 'Unnamed character',
                evidence: shortText(firstEvidence, 'Earlier character record contains death/deceased language.'),
              },
              {
                project: projectById.get(later.novelId),
                item: later,
                type: 'character',
                title: later.name || 'Unnamed character',
                evidence: shortText(laterEvidence, 'Later character record exists after the death/status warning.'),
              },
            ],
          })
        }
      }
    })
    return active
  }, [records, projectIds, projectById, orderedProjects, recurringGroups])
  const recurringWorldGroups = useMemo(() => recurringGroups.filter(group => group.type !== 'character'), [recurringGroups])

  const reviewedSet = useMemo(() => new Set(reviewedIssueIds), [reviewedIssueIds])
  const activeIssues = issues.filter(issue => !reviewedSet.has(issue.id))
  const reviewedIssues = issues.filter(issue => reviewedSet.has(issue.id))

  const filteredResults = seriesItems.filter(result => {
    if (typeFilter !== 'all' && result.type !== typeFilter) return false
    if (projectFilter !== 'all' && !(result.projectIds || [result.projectId]).includes(projectFilter)) return false
    if (query.trim() && !result.search.includes(query.trim().toLowerCase())) return false
    return true
  })

  useEffect(() => {
    if (continuityTab !== 'index' || !selectedResult) return
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [continuityTab, selectedResult])

  const getResultProjectTarget = (result, projectId) => {
    if (result.characterGroup) {
      const character = result.characterGroup.characters.find(item => item.novelId === projectId) || result.characterGroup.characters[0]
      return getProjectTarget('character', character, projectId)
    }
    return getProjectTarget(result.type, result.item, projectId)
  }

  const setVisibleCharacterGroup = (group, visible) => {
    const next = new Set(visibleCharacterIds)
    group.characterIds.forEach(characterId => {
      if (visible) next.add(characterId)
      else next.delete(characterId)
    })
    store.updateSeriesContinuity?.(series.id, { visibleCharacterIds: [...next] })
  }
  const markReviewed = issueId => {
    const next = new Set(reviewedIssueIds)
    next.add(issueId)
    store.updateSeriesContinuity?.(series.id, { reviewedIssueIds: [...next] })
  }
  const restoreIssue = issueId => {
    store.updateSeriesContinuity?.(series.id, { reviewedIssueIds: reviewedIssueIds.filter(id => id !== issueId) })
  }
  const saveLaneField = (character, projectId, field, value) => {
    const journey = normalizeJourney(character.journey)
    const projectContinuity = {
      ...(journey.projectContinuity || {}),
      [projectId]: {
        ...(journey.projectContinuity?.[projectId] || {}),
        [field]: value,
        updatedAt: new Date().toISOString(),
      },
    }
    store.updateCharacterJourneyForSeries?.(character.id, { ...journey, projectContinuity, updatedAt: new Date().toISOString() })
  }
  const openResult = result => {
    setSelectedResult(result)
    setContinuityTab('index')
  }
  const openIssueEntry = rel => {
    const result = getContinuityResultForIssue(rel)
    if (result) openResult(result)
  }

  const renderResultCard = result => (
    <button key={result.id} type="button" className="series-continuity-result" onClick={() => openResult(result)}>
      <span className="series-continuity-result-type">{CONTINUITY_RECORD_TYPES.find(type => type.id === result.type)?.label || result.type}</span>
      <strong>{result.title}</strong>
      <span>{result.summary}</span>
      <small>{result.projectLabel || getProjectTitle(result.project)} · {result.scope}</small>
    </button>
  )

  return (
    <div className="series-tab-content">
      <div className="series-section-header">
        <h3>Continuity</h3>
        <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-fade)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 999 }}>Series journey</span>
      </div>

      <div className="series-continuity-tabs">
        {CONTINUITY_TABS.map(tab => (
          <button key={tab.id} type="button" className={`series-continuity-tab${continuityTab === tab.id ? ' is-active' : ''}`} onClick={() => setContinuityTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {continuityTab === 'overview' && (
        <div className="series-continuity-grid">
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Series Summary</p>
            <p className="series-continuity-card-hint">{shortText(series.description || series.summary, 'Add a series summary for the continuity dashboard.')}</p>
            <button className="series-add-btn" type="button" onClick={() => setContinuityTab('summary')}>Open summary</button>
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Story Linking</p>
            <p className="series-continuity-card-hint">Earlier projects flow forward. Later edits ask before they reshape shared continuity.</p>
            {syncCategories.length === 0 ? (
              <div className="series-continuity-empty">
                <p>To see your series journey, enable story linking here.</p>
                <button type="button" className="series-add-btn" onClick={onOpenSettings}>Series Settings</button>
              </div>
            ) : (
              <>
                <div className="series-continuity-chip-row">
                  {syncCategories.map(id => {
                    const cat = SYNC_CATEGORY_OPTIONS.find(c => c.id === id)
                    return cat ? <span key={id}>{cat.label}</span> : null
                  })}
                </div>
                <button type="button" className="series-add-btn" style={{ marginTop: 14 }} onClick={onOpenSettings}>Series Settings</button>
              </>
            )}
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Select Characters</p>
            <p className="series-continuity-card-hint">{selectedJourneyCount} selected for visual series-wide journey lanes</p>
            <JourneyCharacterPicker
              groups={journeyCharacterGroups}
              visibleCharacterIds={visibleCharacterIds}
              projectById={projectById}
              onToggle={setVisibleCharacterGroup}
              compact
            />
            <button className="series-add-btn" type="button" onClick={() => setContinuityTab('characters')}>Open journey lanes</button>
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Continuity Index</p>
            <p className="series-continuity-card-hint">{seriesItems.length} worldbuilding records across {orderedProjects.length} projects</p>
            <button className="series-add-btn" type="button" onClick={() => setContinuityTab('index')}>Search index</button>
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Open Issues</p>
            <p className="series-continuity-card-hint">{activeIssues.length} deterministic review {activeIssues.length === 1 ? 'warning' : 'warnings'} · {reviewedIssues.length} reviewed</p>
            <button className="series-add-btn" type="button" onClick={() => setContinuityTab('issues')}>Review issues</button>
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Map Previews</p>
            <p className="series-continuity-card-hint">{(records.maps || []).filter(map => projectIds.has(map.novelId)).length} maps available for visual continuity review</p>
            <button className="series-add-btn" type="button" onClick={() => { setTypeFilter('map'); setContinuityTab('index') }}>View maps</button>
          </div>
        </div>
      )}

      {continuityTab === 'summary' && (
        <div className="series-continuity-panel">
          <div className="series-continuity-card series-summary-card">
            <p className="series-continuity-card-title">Series Summary</p>
            <p className="series-summary-copy">{series.description || series.summary || 'No series summary has been added yet.'}</p>
            <button className="series-add-btn series-summary-edit-btn" type="button" onClick={onOpenSettings}>Edit series summary</button>
          </div>
          <div className="series-summary-grid">
            <div className="series-summary-stat"><strong>{orderedProjects.length}</strong><span>Projects in story order</span></div>
            <div className="series-summary-stat"><strong>{seriesItems.length}</strong><span>Continuity records</span></div>
            <div className="series-summary-stat"><strong>{selectedJourneyCount}</strong><span>Characters selected</span></div>
            <div className="series-summary-stat"><strong>{activeIssues.length}</strong><span>Open warnings</span></div>
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Selected Characters</p>
            {visibleCharacterGroups.length ? (
              <div className="series-continuity-chip-row">
                {visibleCharacterGroups.map(group => <span key={group.id}>{group.name}</span>)}
              </div>
            ) : (
              <p className="series-continuity-muted">No journey characters selected yet.</p>
            )}
            <button className="series-add-btn" type="button" onClick={() => setContinuityTab('characters')}>Select journey characters</button>
          </div>
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Continuity Health</p>
            <p className="series-continuity-card-hint">{activeIssues.length} active warnings, {reviewedIssues.length} reviewed, {Object.keys(mergedCharacterGroups).length} merged character continuity groups.</p>
            <button className="series-add-btn" type="button" onClick={() => setContinuityTab('issues')}>Review warnings</button>
          </div>
        </div>
      )}

      {continuityTab === 'index' && (
        <div className="series-continuity-panel">
          <div className="series-continuity-controls">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search continuity..." />
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
              {CONTINUITY_RECORD_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
            </select>
            <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
              <option value="all">All projects</option>
              {orderedProjects.map(project => <option key={project.id} value={project.id}>{project.title || 'Untitled'}</option>)}
            </select>
          </div>
          {selectedResult && (
            <div className="series-continuity-detail" ref={detailRef}>
              <button type="button" className="series-continuity-close" onClick={() => setSelectedResult(null)}>Close</button>
              <span className="series-continuity-result-type">{CONTINUITY_RECORD_TYPES.find(type => type.id === selectedResult.type)?.label || selectedResult.type}</span>
              <h4>{selectedResult.title}</h4>
              <p>{selectedResult.summary}</p>
              <div className="series-continuity-meta">
                <span>{selectedResult.projectLabel || getProjectTitle(selectedResult.project)}</span>
                <span>{selectedResult.scope}</span>
              </div>
              {selectedResult.type === 'map' && <MapPreviewCard result={selectedResult} />}
              <div className="series-detail-actions">
                {(selectedResult.projectIds || [selectedResult.projectId]).filter(Boolean).map(projectId => (
                  <button key={`${selectedResult.id}:${projectId}`} type="button" className="series-open-book-btn" onClick={() => onOpenProject(projectId, getResultProjectTarget(selectedResult, projectId))}>
                    Open {getProjectTitle(projectById.get(projectId))}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="series-continuity-results">
            {filteredResults.length ? filteredResults.map(renderResultCard) : <p className="series-continuity-muted">No continuity records match those filters.</p>}
          </div>
        </div>
      )}

      {continuityTab === 'characters' && (
        <div className="series-continuity-panel">
          <div className="series-character-dashboard">
            <div className="series-continuity-card series-character-selector">
              <p className="series-continuity-card-title">Characters Shown</p>
              <p className="series-continuity-card-hint">Choose whole series characters, not per-project fragments.</p>
              <JourneyCharacterPicker
                groups={journeyCharacterGroups}
                visibleCharacterIds={visibleCharacterIds}
                projectById={projectById}
                onToggle={setVisibleCharacterGroup}
              />
            </div>
            <div className="series-character-main">
              <div className="series-character-overview-head">
                <div>
                  <p className="series-continuity-card-title">Series Character Journeys</p>
                  <p className="series-continuity-card-hint">Each lane treats the character as one person and lays their journey across the full series.</p>
                </div>
                <span>{selectedJourneyCount} shown</span>
              </div>
              {visibleCharacterGroups.length === 0 ? (
                <p className="series-continuity-muted">Select one or more characters to see their series-wide journey lanes.</p>
              ) : visibleCharacterGroups.map(group => (
                <CharacterJourneyLane
                  key={group.id}
                  group={group}
                  orderedProjects={orderedProjects}
                  editingLane={editingLane}
                  setEditingLane={setEditingLane}
                  saveLaneField={saveLaneField}
                  onOpenProject={onOpenProject}
                />
              ))}
            </div>
          </div>
          {recurringWorldGroups.length > 0 && (
            <div className="series-continuity-card">
              <p className="series-continuity-card-title">Worldbuilding Possible Matches</p>
              <p className="series-continuity-card-hint">Locations and lore with matching names stay reviewable before you treat them as the same world record.</p>
              <div className="series-continuity-match-list">
                {recurringWorldGroups.map(group => (
                  <div key={`${group.type}:${group.key}`}>
                    <strong>{group.values[0].name || group.values[0].title}</strong>
                    <span>{group.label} possible match across {group.values.length} records</span>
                    <small>{group.values.map(item => getProjectTitle(projectById.get(item.novelId))).join(', ')}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {continuityTab === 'timeline' && (
        <div className="series-continuity-panel">
          <div className="series-timeline-mode">
            <button type="button" className={timelineMode === 'byProject' ? 'is-active' : ''} onClick={() => setTimelineMode('byProject')}>By project</button>
            <button type="button" className={timelineMode === 'allEvents' ? 'is-active' : ''} onClick={() => setTimelineMode('allEvents')}>All events</button>
          </div>
          {timelineMode === 'allEvents' ? (
            <div className="series-continuity-card">
              <p className="series-continuity-card-title">All Timeline and History Entries</p>
              <p className="series-continuity-card-hint">One chronological stream from available event dates, regardless of project number.</p>
              <div className="series-timeline-list">
                {timelineRows.all.length ? timelineRows.all.map(row => <TimelineRow key={`${row.kind}:${row.item.id}`} row={row} project={projectById.get(row.item.novelId)} />) : <p className="series-continuity-muted">No timeline or history entries yet.</p>}
              </div>
            </div>
          ) : (
            <>
              {timelineRows.datedByProject.map(group => (
                <div key={group.project.id} className="series-continuity-card">
                  <p className="series-continuity-card-title">{group.project.title}</p>
                  <div className="series-timeline-list">
                    {group.rows.map(row => <TimelineRow key={`${row.kind}:${row.item.id}`} row={row} />)}
                  </div>
                </div>
              ))}
              <div className="series-continuity-card">
                <p className="series-continuity-card-title">Undated</p>
                <p className="series-continuity-card-hint">Entries without dates across all projects.</p>
                <div className="series-timeline-list">
                  {timelineRows.undated.length ? timelineRows.undated.map(row => <TimelineRow key={`${row.kind}:${row.item.id}`} row={row} project={projectById.get(row.item.novelId)} />) : <p className="series-continuity-muted">No undated entries.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {continuityTab === 'issues' && (
        <div className="series-continuity-panel">
          <IssueList title="Active Warnings" issues={activeIssues} empty="No active deterministic warnings." onReview={markReviewed} actionLabel="Move to reviewed" onOpenProject={onOpenProject} onOpenEntry={openIssueEntry} getEntryResult={getContinuityResultForIssue} />
          <IssueList title="Reviewed" issues={reviewedIssues} empty="No reviewed warnings yet." onReview={restoreIssue} actionLabel="Restore warning" reviewed />
        </div>
      )}

      {continuityTab === 'export' && (
        <div className="series-continuity-card">
          <p className="series-continuity-card-title">Series Bible Export</p>
          <p className="series-continuity-card-hint">Planned export: one readable Series Bible document plus folders of project data with inherited records labelled.</p>
          <p className="series-continuity-muted">The continuity dashboard is now structured for this export, but the downloadable Series Bible package is a follow-up implementation slice.</p>
        </div>
      )}
    </div>
  )
}

function TimelineRow({ row, project }) {
  const meta = [row.kind, row.date, project ? project.title || 'Untitled' : null].filter(Boolean).join(' · ')
  return (
    <div className="series-timeline-row">
      <span>{meta}</span>
      <strong>{row.title || 'Untitled entry'}</strong>
      <p>{shortText(row.body || row.date, 'No details yet')}</p>
    </div>
  )
}

function CharacterJourneyLane({ group, orderedProjects, editingLane, setEditingLane, saveLaneField, onOpenProject }) {
  return (
    <div className="series-journey-lane">
      <div className="series-journey-lane-head">
        <div>
          <h4>{group.name}</h4>
          <p>{group.projectIds.length} project {group.projectIds.length === 1 ? 'entry' : 'entries'} in this series identity</p>
        </div>
        <span>Unified character</span>
      </div>
      <div className="series-journey-lane-track">
        {orderedProjects.map(project => {
          const character = group.characters.find(item => item.novelId === project.id)
          if (!character) return <div key={project.id} className="series-journey-stop is-empty"><strong>{project.title}</strong><span>No journey entry</span></div>
          const journey = normalizeJourney(character.journey)
          const continuityFields = journey.projectContinuity?.[project.id] || {}
          const editing = editingLane === `${character.id}:${project.id}`
          return (
            <div key={project.id} className="series-journey-stop">
              <strong>{project.title}</strong>
              <span>{journey.arcType} · {journey.scope === 'series' ? 'Series' : 'Local'}</span>
              <p>{shortText(continuityFields.status || journey.endingState || journey.notes || journey.startingState)}</p>
              <button type="button" className="series-open-book-btn" onClick={() => setEditingLane(editing ? null : `${character.id}:${project.id}`)}>
                {editing ? 'Close detail' : 'Open detail'}
              </button>
              {editing && (
                <div className="series-journey-edit">
                  {[
                    ['status', 'Status / state'],
                    ['relationships', 'Relationships'],
                    ['allegiance', 'Faction / allegiance'],
                    ['location', 'Location movement'],
                    ['goal', 'External goal'],
                    ['notes', 'Continuity notes'],
                  ].map(([field, label]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <textarea value={continuityFields[field] || ''} onChange={event => saveLaneField(character, project.id, field, event.target.value)} />
                    </label>
                  ))}
                  <button type="button" className="series-open-book-btn" onClick={() => onOpenProject(project.id)}>Open character project</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JourneyCharacterPicker({ groups, visibleCharacterIds, projectById, onToggle, compact = false }) {
  if (!groups.length) {
    return <p className="series-continuity-muted">No character journeys are available in this series yet.</p>
  }

  return (
    <div className={`series-continuity-picker${compact ? ' is-compact' : ''}`}>
      {groups.map(group => {
        const checked = group.characterIds.some(id => visibleCharacterIds.includes(id))
        return (
        <label key={group.id}>
          <input type="checkbox" checked={checked} onChange={event => onToggle(group, event.target.checked)} />
          <span>
            <strong>{group.name}</strong>
            <small>{group.projectIds.map(projectId => getProjectTitle(projectById.get(projectId))).join(', ')}</small>
          </span>
        </label>
        )
      })}
    </div>
  )
}

function IssueList({ title, issues, empty, onReview, actionLabel, onOpenProject, onOpenEntry, getEntryResult }) {
  return (
    <div className="series-continuity-card">
      <p className="series-continuity-card-title">{title}</p>
      {issues.length === 0 ? (
        <p className="series-continuity-muted">{empty}</p>
      ) : (
        <div className="series-issue-list">
          {issues.map(issue => (
            <div key={issue.id} className={`series-issue-item${title === 'Reviewed' ? ' is-reviewed' : ''}`}>
              <span>{issue.severity}</span>
              <strong>{issue.title}</strong>
              {title !== 'Reviewed' && <p>{issue.body}</p>}
              {title !== 'Reviewed' && issue.explanation && (
                <div className="series-issue-explanation">
                  <strong>What was detected</strong>
                  <p>{issue.explanation}</p>
                  {issue.reviewPrompt && <p>{issue.reviewPrompt}</p>}
                </div>
              )}
              {title !== 'Reviewed' && issue.related?.length > 0 && (
                <div className="series-issue-evidence">
                  {issue.related.map(rel => (
                    <div key={`${issue.id}:evidence:${rel.item?.id || rel.title}`}>
                      <div>
                        <strong>{rel.title || rel.item?.name || rel.item?.title || 'Untitled entry'}</strong>
                        <span>{getProjectTitle(rel.project)}</span>
                      </div>
                      <p>{rel.evidence || 'No recorded detail was available for this entry.'}</p>
                      <div className="series-issue-actions">
                        {getEntryResult?.(rel) && (
                          <button type="button" className="series-open-book-btn" onClick={() => onOpenEntry?.(rel)}>
                            Review entry
                          </button>
                        )}
                        {rel.project && (
                          <button type="button" className="series-open-book-btn" onClick={() => onOpenProject?.(rel.project.id, getProjectTarget(rel.type, rel.item, rel.project.id))}>
                            Open project
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {issue.related?.length > 0 && <small>{issue.related.map(rel => getProjectTitle(rel.project)).join(', ')}</small>}
              <div className="series-issue-actions">
                <button type="button" className="series-open-book-btn" onClick={() => onReview(issue.id)}>{actionLabel}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MapPreviewCard({ result }) {
  const map = result.item
  const objects = map.mapObjects || map.objects || []
  const pins = map.mapPins || []
  return (
    <div className="series-map-preview">
      <div>
        <span>{map.mapType || 'Map'}</span>
        <strong>{map.name || 'Untitled map'}</strong>
        <small>{objects.length} objects · {pins.length} legacy pins</small>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'projects',   label: 'Projects' },
  { id: 'continuity', label: 'Continuity' },
  { id: 'settings',   label: 'Settings' },
]

export default function SeriesDashboard({
  store,
  seriesId,
  onOpenBook,
  onBack,
  onOpenAccount,
  onOpenHelp,
  onOpenLegal,
  onOpenAbout,
}) {
  const series = store.series?.find(s => s.id === seriesId)
  const [tab, setTab] = useState('overview')
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const coverInputRef = useRef(null)

  if (!series) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <p style={{ color: 'var(--text-muted)' }}>Series not found.</p>
        <button onClick={onBack} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', cursor: 'pointer', fontSize: 13 }}>← Back to Library</button>
      </div>
    )
  }

  // Build ordered projects list
  const seriesProjects = store.novels.filter(n => n.seriesId === seriesId)
  const order = series.projectOrder?.filter(id => seriesProjects.some(p => p.id === id)) ?? []
  const unordered = seriesProjects.filter(p => !order.includes(p.id)).map(p => p.id)
  const orderedIds = [...order, ...unordered]
  const orderedProjects = orderedIds.map(id => seriesProjects.find(p => p.id === id)).filter(Boolean)

  const allStats = store.allProjectStats?.filter(s => s.project.seriesId === seriesId) ?? []

  const handleReorder = (newOrder) => {
    store.updateSeries(seriesId, { projectOrder: newOrder })
  }

  const handleRemoveProject = (novelId) => {
    store.updateNovel(novelId, { seriesId: null })
  }

  const handleDelete = () => {
    store.deleteSeries(seriesId)
    onBack()
  }

  const handleCoverSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => store.updateSeries(seriesId, { coverPhoto: ev.target.result })
    reader.readAsDataURL(file)
  }

  return (
    <div className="series-dashboard" style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg-main)', color: 'var(--text-main)' }}>

      {/* Top bar */}
      <div className="library-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" className="library-brand-logo-btn" onClick={onBack} aria-label="Back to library">
            <span className="library-brand-logo"><YOWLogo /></span>
          </button>
          <button
            onClick={onBack}
            className="series-back-btn"
            aria-label="Back to Library"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Library
          </button>
          <span className="series-breadcrumb-sep" aria-hidden="true">/</span>
          <span className="series-breadcrumb-current">{series.name}</span>
        </div>
        <UserMenu onOpenAccount={onOpenAccount} onOpenHelp={onOpenHelp} onOpenLegal={onOpenLegal} onOpenAbout={onOpenAbout} />
      </div>

      {/* Series hero */}
      <div className="series-hero">
        <div className="series-hero-inner">
          <div
            className="series-hero-cover"
            style={{ background: series.coverPhoto ? undefined : getCoverGradient(series.name) }}
            onClick={() => coverInputRef.current?.click()}
            title="Click to change cover"
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && coverInputRef.current?.click()}
          >
            {series.coverPhoto
              ? <img src={series.coverPhoto} alt="" />
              : <span className="series-hero-cover-letter">{series.name[0]?.toUpperCase()}</span>
            }
            <div className="series-hero-cover-edit-hint">Change cover</div>
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverSelect} />
          </div>

          <div className="series-hero-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Series</span>
              <SeriesStatusBadge status={series.status || 'ongoing'} />
              {series.genre && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{series.genre}</span>}
            </div>
            <h1 className="series-hero-title">{series.name}</h1>
            {(series.description || series.summary) && (
              <p className="series-hero-description">{series.description || series.summary}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {tab !== 'projects' && (
                <button className="series-cta-btn series-cta-btn--primary" onClick={() => setTab('projects')}>
                  Manage Projects
                </button>
              )}
              <button className="series-cta-btn" onClick={() => setTab('settings')}>
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="series-tab-nav">
        <div className="series-tab-nav-inner">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`series-tab-btn${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="series-tab-body">
        {tab === 'overview' && (
          <OverviewTab
            series={series}
            orderedProjects={orderedProjects}
            allStats={allStats}
            onOpenProject={onOpenBook}
          />
        )}
        {tab === 'projects' && (
          <ProjectsTab
            series={series}
            orderedProjects={orderedProjects}
            allStats={allStats}
            onOpenProject={onOpenBook}
            onAddProject={() => setAddProjectOpen(true)}
            onRemoveProject={handleRemoveProject}
            onReorder={handleReorder}
            store={store}
          />
        )}
        {tab === 'continuity' && (
          <ContinuityTab
            series={series}
            orderedProjects={orderedProjects}
            allStats={allStats}
            store={store}
            onOpenProject={onOpenBook}
            onOpenSettings={() => setTab('settings')}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            series={series}
            store={store}
            onDelete={handleDelete}
          />
        )}
      </div>

      {addProjectOpen && (
        <AddProjectModal
          store={store}
          seriesId={seriesId}
          onClose={() => setAddProjectOpen(false)}
        />
      )}
    </div>
  )
}
