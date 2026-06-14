import { useState, useRef, useEffect } from 'react'
import YOWLogo from '../brand/YOWLogo'
import UserMenu from '../auth/UserMenu'
import { getProjectType } from '../../constants/projectTypes'

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
            <label className="series-settings-field">
              <span>Series Name</span>
              <input value={form.name} onChange={e => patch('name', e.target.value)} placeholder="Series name" />
            </label>
            <label className="series-settings-field">
              <span>Genre</span>
              <input value={form.genre} onChange={e => patch('genre', e.target.value)} placeholder="e.g. Epic Fantasy" />
            </label>
            <label className="series-settings-field" style={{ gridColumn: '1 / -1' }}>
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

function ContinuityTab({ series, orderedProjects, store }) {
  const syncCategories = series.syncCategories ?? []

  // Characters that appear in more than one project
  const projectIds = new Set(orderedProjects.map(p => p.id))
  const chars = store.characters ? store.characters.filter(c => projectIds.has(c.novelId)) : []
  const charsByName = new Map()
  chars.forEach(c => {
    const key = (c.name || '').toLowerCase().trim()
    if (!key) return
    if (!charsByName.has(key)) charsByName.set(key, [])
    charsByName.get(key).push(c)
  })
  const sharedChars = [...charsByName.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([, arr]) => arr[0])

  return (
    <div className="series-tab-content">
      <div className="series-section-header">
        <h3>Continuity</h3>
        <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent-fade)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 999 }}>Foundation</span>
      </div>

      <div className="series-continuity-grid">
        <div className="series-continuity-card">
          <p className="series-continuity-card-title">Shared World-Building</p>
          <p className="series-continuity-card-hint">Categories pooled across all projects in reading order</p>
          {syncCategories.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>No categories shared yet. Configure in Settings.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {syncCategories.map(id => {
                const cat = SYNC_CATEGORY_OPTIONS.find(c => c.id === id)
                return cat ? (
                  <span key={id} style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--accent-fade)', color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>{cat.label}</span>
                ) : null
              })}
            </div>
          )}
        </div>

        {sharedChars.length > 0 && (
          <div className="series-continuity-card">
            <p className="series-continuity-card-title">Characters in Multiple Projects</p>
            <p className="series-continuity-card-hint">Same name detected across projects</p>
            <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sharedChars.slice(0, 8).map(c => (
                <li key={c.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="series-continuity-card series-continuity-coming-soon">
          <p className="series-continuity-card-title">Coming in Phase 2</p>
          <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[
              'AI continuity checker — find character & lore contradictions',
              'Timeline conflict detector',
              'Series-wide manuscript search',
              'Character arc tracker across projects',
            ].map(f => (
              <li key={f} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                <span style={{ flexShrink: 0, color: 'var(--accent)' }}>◦</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
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
