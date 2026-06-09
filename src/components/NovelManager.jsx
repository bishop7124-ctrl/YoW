import { useState, useEffect, useRef } from 'react'
import UserMenu from './auth/UserMenu'
import YOWLogo from './brand/YOWLogo'
import AIImportModal from './AIImportModal'
import { PROJECT_TYPES, DEFAULT_TYPE, getProjectType, getProjectTypeStage } from '../constants/projectTypes'
import {
  createProjectZipBlob,
  downloadProjectDocx,
  downloadProjectPdf,
  EXPORT_PDF_THEME_OPTIONS,
  getProjectExportFilename,
} from '../utils/projectExport'

const TYPE_OPTIONS = Object.entries(PROJECT_TYPES).map(([id, cfg]) => ({ id, ...cfg }))
const isProjectTypeSelectable = (type) => Boolean(PROJECT_TYPES[type])

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

const resizeCoverPhoto = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const objectUrl = URL.createObjectURL(file)

  image.onload = () => {
    URL.revokeObjectURL(objectUrl)
    const maxWidth = 900
    const maxHeight = 1200
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    canvas.width = width
    canvas.height = height
    ctx.fillStyle = '#111814'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    let quality = 0.82
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > 900000 && quality > 0.48) {
      quality -= 0.08
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }
    resolve(dataUrl)
  }

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl)
    reject(new Error('Could not read that image.'))
  }

  image.src = objectUrl
})

function ProjectTypeImage({ type, label, size = 34 }) {
  const id = type || DEFAULT_TYPE
  const common = {
    className: `project-type-image project-type-image-${id}`,
    width: size,
    height: size,
    viewBox: '0 0 40 40',
    role: 'img',
    'aria-label': label,
  }

  const paths = {
    novel: (
      <>
        <path className="project-type-fill" d="M10 8h12a8 8 0 0 1 8 8v17H17a7 7 0 0 0-7-7V8Z" />
        <path className="project-type-accent" d="M17 8v25a7 7 0 0 0-7-7V8h7Z" />
        <path className="project-type-line" d="M15 14h10M15 19h11M15 24h8" />
      </>
    ),
    novella: (
      <>
        <path className="project-type-fill" d="M9 11h12a7 7 0 0 1 7 7v12H16a7 7 0 0 0-7-7V11Z" />
        <path className="project-type-accent" d="M16 11v19a7 7 0 0 0-7-7V11h7Z" />
        <path className="project-type-line" d="M15 16h10M15 21h8" />
      </>
    ),
    short_story: (
      <>
        <path className="project-type-fill" d="M12 7h13l5 5v21H12V7Z" />
        <path className="project-type-accent" d="M25 7v6h5L25 7Z" />
        <path className="project-type-line" d="M17 17h8M17 22h8M17 27h6" />
      </>
    ),
    play: (
      <>
        <path className="project-type-fill" d="M9 11c5-3 10-3 15 0v9c0 6-3 10-7.5 12C12 30 9 26 9 20v-9Z" />
        <path className="project-type-accent" d="M17 11c5-3 10-3 15 0v9c0 6-3 10-7.5 12-2.1-1-3.9-2.6-5.2-4.8 2-1.8 3.2-4.3 3.2-7.2v-8.3A18.2 18.2 0 0 0 17 11Z" />
        <path className="project-type-line" d="M14 18h.1M20 18h.1M13 24c2 2 5 2 7 0" />
      </>
    ),
    screenplay: (
      <>
        <path className="project-type-fill" d="M8 15h24v16H8V15Z" />
        <path className="project-type-accent" d="M10 8h6l3 7h-7l-2-7ZM20 8h6l3 7h-7l-2-7Z" />
        <path className="project-type-line" d="M13 21h14M13 26h9" />
      </>
    ),
    tv_show: (
      <>
        <path className="project-type-fill" d="M9 12h22v16H9V12Z" />
        <path className="project-type-accent" d="M14 28h12v4H14v-4Z" />
        <path className="project-type-line" d="M15 17h10M15 22h7M16 8l4 4 4-4" />
      </>
    ),
    dnd_campaign: (
      <>
        <path className="project-type-fill" d="M20 7l12 7v12l-12 7-12-7V14l12-7Z" />
        <path className="project-type-accent" d="M20 7v26l12-7V14L20 7Z" />
        <path className="project-type-line" d="M15 17l5-3 5 3M15 23l5 3 5-3" />
      </>
    ),
    tabletop_rpg: (
      <>
        <path className="project-type-fill" d="M20 7l12 7v12l-12 7-12-7V14l12-7Z" />
        <path className="project-type-accent" d="M20 7v26l-12-7V14l12-7Z" />
        <path className="project-type-line" d="M20 16v.1M16 21v.1M24 21v.1M20 26v.1" />
      </>
    ),
    comic: (
      <>
        <path className="project-type-fill" d="M9 10h22v15H19l-7 6 2-6H9V10Z" />
        <path className="project-type-accent" d="M13 14h14v4H13v-4Z" />
        <path className="project-type-line" d="M13 22h9" />
      </>
    ),
    video_game: (
      <>
        <path className="project-type-fill" d="M12 16h16l4 9a5 5 0 0 1-8 5l-2-3h-4l-2 3a5 5 0 0 1-8-5l4-9Z" />
        <path className="project-type-accent" d="M23 16h5l4 9a5 5 0 0 1-8 5l-2-3h-2l3-11Z" />
        <path className="project-type-line" d="M14 22h6M17 19v6M25 22h.1M28 25h.1" />
      </>
    ),
  }

  return (
    <svg {...common}>
      {paths[id] || paths.novel}
    </svg>
  )
}

const STATUS_DATA = {
  not_started: { label: 'Not started', color: '#89919a' },
  draft:       { label: 'Draft',        color: '#a78bfa' },
  in_progress: { label: 'In progress',  color: '#5bb7d9' },
  editing:     { label: 'Editing',      color: '#e3a84f' },
  complete:    { label: 'Complete',     color: '#5dc878' },
  paused:      { label: 'Paused',       color: '#d86b70' },
  writing:     { label: 'In progress',  color: '#5bb7d9', aliasFor: 'in_progress' },
  revision:    { label: 'Editing',      color: '#e3a84f', aliasFor: 'editing' },
}
const STATUS_PICKER = ['not_started', 'draft', 'in_progress', 'editing', 'complete', 'paused']

function StatusBadge({ status, onClick, small }) {
  const data = status ? STATUS_DATA[status] : null
  const style = { '--status-color': data?.color ?? 'var(--text-muted)' }
  return (
    <span
      className={`status-badge${small ? ' status-badge--small' : ''}${onClick ? ' status-badge--click' : ''}`}
      style={style}
      onClick={onClick}
      title={onClick ? 'Click to change status' : undefined}
    >
      <span className="status-dot" />
      {data ? data.label : 'No status'}
    </span>
  )
}

function ProjectExportMenu({ onExport, compact = false }) {
  const [open, setOpen] = useState(false)
  if (!onExport) return null

  const options = [
    ['docx', 'Word document'],
    ['pdf', 'Visual PDF'],
    ['zip', 'Backup zip'],
  ]

  return (
    <div className="novel-export-control" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        className={compact ? 'project-export-inline-button' : 'novel-cover-button'}
        onClick={() => setOpen(v => !v)}
        title="Export project"
        aria-label="Export project"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {compact && <span>Export</span>}
      </button>
      {open && (
        <div className="novel-export-menu">
          {options.filter(([format]) => format !== 'pdf').map(([format, label]) => (
            <button
              key={format}
              type="button"
              onClick={() => {
                setOpen(false)
                onExport(format)
              }}
            >
              {label}
            </button>
          ))}
          <div className="novel-export-theme-group" role="group" aria-label="Visual PDF themes">
            <span>Visual PDF theme</span>
            {EXPORT_PDF_THEME_OPTIONS.map(theme => (
              <button
                key={theme.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onExport('pdf', theme.id)
                }}
              >
                <strong>{theme.name}</strong>
                <small>{theme.tagline}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveProjectHero({ stats, allStats, series, userName, onOpen, onSetStatus, onToggleFocus, onEditProject, onExportProject }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const novel = stats?.project ?? null
  const totalWords = allStats.reduce((sum, item) => sum + item.manuscriptWords, 0)
  const currentStatus = STATUS_DATA[novel?.status]?.aliasFor ?? novel?.status
  const progress = Number.isFinite(Number(novel?.progress)) ? Math.max(0, Math.min(100, Number(novel.progress))) : null
  const hasActiveProject = !!novel

  return (
    <div
      className={[
        'active-project-command',
        hasActiveProject ? '' : 'active-project-command--empty',
        novel?.coverPhoto ? 'active-project-command--has-photo' : '',
      ].filter(Boolean).join(' ')}
      onMouseLeave={() => setSettingsOpen(false)}
      onClick={() => { if (hasActiveProject && !settingsOpen) onOpen(novel.id) }}
    >
      <section className="active-project-command-main" style={{ gridRow: 2 }}>
        <div className="active-project-command-copy">
          <div className="active-project-badge">
            {hasActiveProject && <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
            {hasActiveProject ? 'Active Project' : `Welcome, ${userName}`}
          </div>
          <h2 className="active-project-command-title">{hasActiveProject ? novel.title : 'What are we working on today?'}</h2>
          {hasActiveProject && novel.description && <p className="active-project-command-desc">{novel.description}</p>}
          {!hasActiveProject && <p className="active-project-command-desc">Choose a project below to make it active, or open one directly when you are ready to work.</p>}
          <div className="active-project-command-stats">
            {progress !== null && (
              <div className="active-project-command-stat">
                <strong>{progress}%</strong>
                <span>Progress</span>
              </div>
            )}
            <div className="active-project-command-stat">
              <strong>{hasActiveProject ? stats.manuscriptWords.toLocaleString() : allStats.length}</strong>
              <span>{hasActiveProject ? 'Words' : 'Projects'}</span>
            </div>
            <div className="active-project-command-stat">
              <strong>{hasActiveProject ? stats.scenes.length : totalWords.toLocaleString()}</strong>
              <span>{hasActiveProject ? 'Scenes' : 'Total words'}</span>
            </div>
            {hasActiveProject && <StatusBadge status={novel.status} />}
          </div>
          {hasActiveProject && <span className="active-project-command-cue">Open project</span>}
        </div>
      </section>

      <aside className="active-project-command-cover">
        <div className="active-project-cover-card" style={{ background: novel?.coverPhoto ? undefined : getCoverGradient(novel?.title || 'Your Own World') }}>
          <div className="active-project-cover-inner">
            {!novel?.coverPhoto && <div className="active-project-hero-bg" style={{ background: getCoverGradient(novel?.title || 'Your Own World') }} />}
          {novel?.coverPhoto
            ? <img src={novel.coverPhoto} alt="" />
            : <span className="active-project-cover-letter">{hasActiveProject ? novel.title[0]?.toUpperCase() : '?'}</span>
          }
          </div>
          {hasActiveProject && <button
            className="active-project-settings-btn"
            onClick={e => { e.stopPropagation(); setSettingsOpen(o => !o) }}
            title="Project settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
            </svg>
          </button>}
          {hasActiveProject && <div className="active-project-export-slot">
            <ProjectExportMenu onExport={(format, themeId) => onExportProject?.(novel.id, format, themeId)} />
          </div>}

          {/* Settings panel */}
          {hasActiveProject && settingsOpen && (
            <div className="active-project-settings-panel" onClick={e => e.stopPropagation()}>
              <p className="active-project-settings-label">Status</p>
              <div className="active-project-status-row">
                {STATUS_PICKER.map((key) => {
                  const data = STATUS_DATA[key]
                  return (
                  <button
                    key={key}
                    className={`active-project-status-pill${currentStatus === key ? ' active-project-status-pill--on' : ''}`}
                    style={{ '--sp-color': data.color }}
                    onClick={() => onSetStatus(currentStatus === key ? null : key)}
                  >
                    {data.label}
                  </button>
                  )
                })}
              </div>
              <button className="active-project-settings-action" onClick={onToggleFocus}>
                Remove active project
              </button>
              <button className="active-project-settings-action" onClick={onEditProject}>
                Project settings
              </button>
            </div>
          )}
        </div>
      </aside>

      <section className="active-project-command-snapshot" style={{ gridRow: 1 }} onClick={e => e.stopPropagation()}>
        <p className="active-project-settings-label">Library Snapshot</p>
        <div className="active-project-command-stats active-project-command-stats--compact">
          <div className="active-project-command-stat">
            <strong>{allStats.length}</strong>
            <span>Projects</span>
          </div>
          <div className="active-project-command-stat">
            <strong>{series.length}</strong>
            <span>Series</span>
          </div>
          <div className="active-project-command-stat">
            <strong>{totalWords.toLocaleString()}</strong>
            <span>Total words</span>
          </div>
        </div>
      </section>
    </div>
  )
}

const STATUS_SORTS = [
  { id: 'status', label: 'Status' },
  { id: 'words', label: 'Words' },
  { id: 'updated', label: 'Updated' },
  { id: 'title', label: 'Title' },
]

function StatusQueue({ stats, onOpenProject }) {
  const [sortBy, setSortBy] = useState('status')
  const statusRank = new Map(STATUS_PICKER.map((status, index) => [status, index]))
  const sortedStats = [...stats].sort((a, b) => {
    if (sortBy === 'words') return b.manuscriptWords - a.manuscriptWords || a.project.title.localeCompare(b.project.title)
    if (sortBy === 'updated') {
      const aTime = a.latestTimestamp || Date.parse(a.project.updatedAt || a.project.createdAt || '') || 0
      const bTime = b.latestTimestamp || Date.parse(b.project.updatedAt || b.project.createdAt || '') || 0
      return bTime - aTime || a.project.title.localeCompare(b.project.title)
    }
    if (sortBy === 'title') return a.project.title.localeCompare(b.project.title)
    const aStatus = STATUS_DATA[a.project.status]?.aliasFor ?? a.project.status ?? 'not_started'
    const bStatus = STATUS_DATA[b.project.status]?.aliasFor ?? b.project.status ?? 'not_started'
    return (statusRank.get(aStatus) ?? 99) - (statusRank.get(bStatus) ?? 99) || a.project.title.localeCompare(b.project.title)
  })

  return (
    <section>
      <div className="dash-section-title">
        <h2>Status Queue</h2>
        <label className="status-sort-control">
          <span>Sort</span>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            {STATUS_SORTS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="project-status-queue">
        {sortedStats.map(item => {
          const data = STATUS_DATA[item.project.status] ?? STATUS_DATA.not_started
          const cfg = getProjectType(item.project.type)
          return (
            <button
              key={item.project.id}
              type="button"
              className="project-status-row"
              onClick={() => onOpenProject(item.project.id)}
            >
              <span className="project-status-dot" style={{ '--status-row-color': data.color }} />
              <span className="project-status-copy">
                <strong>{item.project.title}</strong>
                <small>{cfg.label} · {item.manuscriptWords.toLocaleString()} words</small>
              </span>
              <StatusBadge status={item.project.status} />
            </button>
          )
        })}
      </div>
    </section>
  )
}

const STATUS_OPTIONS = [
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'completed', label: 'Completed' },
  { id: 'hiatus', label: 'Hiatus' },
  { id: 'planned', label: 'Planned' },
]

const SYNC_AREA_OPTIONS = [
  { id: 'characters', label: 'Characters' },
  { id: 'locations', label: 'Locations' },
  { id: 'factions', label: 'Factions' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'worldhistory', label: 'World History' },
  { id: 'lore', label: 'Lore' },
  { id: 'ideas', label: 'Ideas' },
]

function EditSeriesModal({ series, allStats, onSave, onDelete, onClose }) {
  const seriesProjects = allStats.filter(s => s.project.seriesId === series.id)
  const initialOrder = series.projectOrder
    ? series.projectOrder.filter(id => seriesProjects.some(s => s.project.id === id))
    : seriesProjects.map(s => s.project.id)
  // Include any assigned projects not yet in order
  const unordered = seriesProjects.filter(s => !initialOrder.includes(s.project.id)).map(s => s.project.id)

  const [form, setForm] = useState({
    name: series.name || '',
    summary: series.summary || '',
    status: series.status || 'ongoing',
    tags: series.tags || [],
    coverPhoto: series.coverPhoto || null,
    syncCategories: series.syncCategories ?? [],
  })
  const [tagInput, setTagInput] = useState('')
  const [coverError, setCoverError] = useState('')
  const [assignedIds, setAssignedIds] = useState(
    () => new Set(seriesProjects.map(s => s.project.id))
  )
  // Ordered list of assigned project ids
  const [projectOrder, setProjectOrder] = useState(() => [...initialOrder, ...unordered])
  const dragIdx = useRef(null)
  const dragOverIdx = useRef(null)

  const initialFormRef = useRef(JSON.stringify({
    name: series.name || '',
    summary: series.summary || '',
    status: series.status || 'ongoing',
    tags: series.tags || [],
    coverPhoto: series.coverPhoto || null,
    syncCategories: series.syncCategories ?? [],
  }))
  const initialAssignedRef = useRef(JSON.stringify(
    [...seriesProjects.map(s => s.project.id)].sort()
  ))

  // Keep projectOrder in sync as projects are checked/unchecked
  useEffect(() => {
    setProjectOrder(prev => {
      const next = prev.filter(id => assignedIds.has(id))
      assignedIds.forEach(id => { if (!next.includes(id)) next.push(id) })
      return next
    })
  }, [assignedIds])

  const requestClose = () => {
    const formDirty = JSON.stringify(form) !== initialFormRef.current
    const assignedDirty = JSON.stringify([...assignedIds].sort()) !== initialAssignedRef.current
    if ((formDirty || assignedDirty) && !confirm('Discard changes?')) return
    onClose()
  }

  const handleCoverSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      setCoverError('')
      const photo = await resizeCoverPhoto(file)
      setForm(p => ({ ...p, coverPhoto: photo }))
    } catch {
      setCoverError('Could not use that image.')
    }
  }

  const commitTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags.includes(t)) setForm(p => ({ ...p, tags: [...p.tags, t] }))
    setTagInput('')
  }

  const handleTagKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag() }
    if (e.key === 'Backspace' && !tagInput && form.tags.length) {
      setForm(p => ({ ...p, tags: p.tags.slice(0, -1) }))
    }
  }

  const toggleProject = (id) => {
    setAssignedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSyncArea = (id) => {
    setForm(p => ({
      ...p,
      syncCategories: p.syncCategories.includes(id)
        ? p.syncCategories.filter(c => c !== id)
        : [...p.syncCategories, id],
    }))
  }

  // Drag-to-reorder handlers
  const onDragStart = (e, idx) => {
    dragIdx.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e, idx) => {
    e.preventDefault()
    dragOverIdx.current = idx
  }
  const onDrop = () => {
    const from = dragIdx.current
    const to = dragOverIdx.current
    if (from === null || to === null || from === to) return
    setProjectOrder(prev => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    dragIdx.current = null
    dragOverIdx.current = null
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(series.id, { ...form, name: form.name.trim(), projectOrder }, assignedIds)
  }

  const orderedAssigned = projectOrder.filter(id => assignedIds.has(id))
  const unassignedStats = allStats.filter(s => !assignedIds.has(s.project.id))

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <form
        onSubmit={handleSave}
        style={{ width: '100%', maxWidth: 540, background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Cover banner */}
        <div style={{ position: 'relative', height: 140, flexShrink: 0, background: form.coverPhoto ? undefined : 'linear-gradient(135deg, var(--bg-main) 0%, color-mix(in srgb, var(--accent) 18%, var(--bg-main)) 100%)', overflow: 'hidden' }}>
          {form.coverPhoto && <img src={form.coverPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <label style={{ cursor: 'pointer', background: 'rgba(0,0,0,.52)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              <input type="file" accept="image/*" onChange={handleCoverSelect} style={{ display: 'none' }} />
              {form.coverPhoto ? 'Change Cover' : 'Add Cover'}
            </label>
            {form.coverPhoto && (
              <button type="button" onClick={() => setForm(p => ({ ...p, coverPhoto: null }))}
                style={{ cursor: 'pointer', background: 'rgba(0,0,0,.52)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.65)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Remove
              </button>
            )}
          </div>
          {coverError && <p style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: '#f87171', margin: 0 }}>{coverError}</p>}
        </div>

        {/* Scrollable body */}
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-main)' }}>Edit Series</p>

          <input
            autoFocus
            placeholder="Series name *"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            required
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-main)', outline: 'none' }}
          />

          <textarea
            placeholder="Series summary (optional)"
            value={form.summary}
            onChange={e => setForm(p => ({ ...p, summary: e.target.value }))}
            rows={4}
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--text-main)', resize: 'vertical', outline: 'none', lineHeight: 1.55, minHeight: 88, flexShrink: 0 }}
          />

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.id} type="button" onClick={() => setForm(p => ({ ...p, status: opt.id }))}
                  style={{
                    padding: '5px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${form.status === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: form.status === opt.id ? 'var(--accent-fade)' : 'transparent',
                    color: form.status === opt.id ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tags</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '7px 10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 40, alignItems: 'center' }}>
              {form.tags.map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, background: 'var(--accent-fade)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                  {tag}
                  <button type="button" onClick={() => setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={commitTag}
                placeholder={form.tags.length ? '' : 'fantasy, sci-fi… (Enter or comma to add)'}
                style={{ flex: 1, minWidth: 140, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-main)', padding: '1px 0' }}
              />
            </div>
          </div>

          {/* Shared areas */}
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Shared areas</p>
            <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45 }}>Toggled areas are pooled across all books in this series. Data flows forward — later books can see earlier entries. Earlier books only see their own data unless &quot;Include later works&quot; is enabled per-project.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SYNC_AREA_OPTIONS.map(opt => {
                const on = form.syncCategories.includes(opt.id)
                return (
                  <button key={opt.id} type="button" onClick={() => toggleSyncArea(opt.id)}
                    style={{
                      padding: '5px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent-fade)' : 'transparent',
                      color: on ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Projects — ordered list for assigned, checkboxes for unassigned */}
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Books in series</p>
            {orderedAssigned.length > 0 && (
              <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-muted)' }}>Drag to set reading order. Book 1 is listed first.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {orderedAssigned.map((id, idx) => {
                const s = allStats.find(s => s.project.id === id)
                if (!s) return null
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={e => onDragStart(e, idx)}
                    onDragOver={e => onDragOver(e, idx)}
                    onDrop={onDrop}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'var(--accent-fade)', border: '1px solid color-mix(in srgb, var(--accent) 38%, transparent)', cursor: 'grab', userSelect: 'none' }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', minWidth: 18, textAlign: 'right' }}>{idx + 1}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>⠿</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{s.project.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginRight: 4 }}>{getProjectType(s.project.type).label}</span>
                    <button type="button" onClick={() => toggleProject(id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 0 }}
                      title="Remove from series">×</button>
                  </div>
                )
              })}
              {unassignedStats.map(s => (
                <label key={s.project.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg-main)', border: '1px solid var(--border)', transition: 'background .15s, border-color .15s' }}>
                  <input type="checkbox" checked={false} onChange={() => toggleProject(s.project.id)} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>{s.project.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>{getProjectType(s.project.type).label}</span>
                </label>
              ))}
              {allStats.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No projects yet.</p>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={() => onDelete(series.id)}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: 'auto' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            Delete series
          </button>
          <button type="button" onClick={requestClose}
            style={{ padding: '9px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit"
            style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

function EditProjectModal({ project, series, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    title: project.title || '',
    description: project.description || '',
    type: project.type || DEFAULT_TYPE,
    status: project.status || null,
    seriesId: project.seriesId || '',
    tags: project.tags || [],
    coverPhoto: project.coverPhoto || null,
    progress: project.progress ?? '',
    includeLaterWorks: project.includeLaterWorks ?? false,
  })
  const [tagInput, setTagInput] = useState('')
  const [coverError, setCoverError] = useState('')
  const initialFormRef = useRef(JSON.stringify({
    title: project.title || '',
    description: project.description || '',
    type: project.type || DEFAULT_TYPE,
    status: project.status || null,
    seriesId: project.seriesId || '',
    tags: project.tags || [],
    coverPhoto: project.coverPhoto || null,
    progress: project.progress ?? '',
    includeLaterWorks: project.includeLaterWorks ?? false,
  }))

  const requestClose = () => {
    if (JSON.stringify(form) !== initialFormRef.current && !confirm('Discard changes?')) return
    onClose()
  }

  const handleCoverSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      setCoverError('')
      const photo = await resizeCoverPhoto(file)
      setForm(p => ({ ...p, coverPhoto: photo }))
    } catch {
      setCoverError('Could not use that image.')
    }
  }

  const commitTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !form.tags.includes(t)) setForm(p => ({ ...p, tags: [...p.tags, t] }))
    setTagInput('')
  }

  const handleTagKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTag() }
    if (e.key === 'Backspace' && !tagInput && form.tags.length) {
      setForm(p => ({ ...p, tags: p.tags.slice(0, -1) }))
    }
  }

  const handleProgress = value => {
    const cleaned = value.replace(/[^\d]/g, '')
    const next = cleaned === '' ? '' : String(Math.min(100, Number(cleaned)))
    setForm(p => ({ ...p, progress: next }))
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave(project.id, {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      type: project.type || DEFAULT_TYPE,
      seriesId: form.seriesId || null,
      progress: form.progress === '' ? null : Number(form.progress),
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
      onClick={requestClose}
    >
      <form
        onSubmit={handleSave}
        style={{ width: '100%', maxWidth: 560, background: 'var(--bg-nav)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: 'relative', height: 150, flexShrink: 0, background: form.coverPhoto ? undefined : getCoverGradient(form.title || project.title), overflow: 'hidden' }}>
          {form.coverPhoto && <img src={form.coverPhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(to bottom, rgba(0,0,0,.1), rgba(0,0,0,.36))' }}>
            <label style={{ cursor: 'pointer', background: 'rgba(0,0,0,.52)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              <input type="file" accept="image/*" onChange={handleCoverSelect} style={{ display: 'none' }} />
              {form.coverPhoto ? 'Change Cover' : 'Add Cover'}
            </label>
            {form.coverPhoto && (
              <button type="button" onClick={() => setForm(p => ({ ...p, coverPhoto: null }))}
                style={{ cursor: 'pointer', background: 'rgba(0,0,0,.52)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 7, padding: '6px 14px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.65)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Remove
              </button>
            )}
          </div>
          {coverError && <p style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: '#f87171', margin: 0 }}>{coverError}</p>}
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto', flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-main)' }}>Project Settings</p>

          <input
            autoFocus
            placeholder="Project title *"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            required
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-main)', outline: 'none' }}
          />

          <textarea
            placeholder="Project summary (optional)"
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            rows={4}
            style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--text-main)', resize: 'vertical', outline: 'none', lineHeight: 1.55, minHeight: 88, flexShrink: 0 }}
          />

          <div className="project-settings-grid">
            <label>
              <span>Series</span>
              <select value={form.seriesId} onChange={e => setForm(p => ({ ...p, seriesId: e.target.value }))}>
                <option value="">Standalone</option>
                {series.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              <span>Progress</span>
              <input value={form.progress} onChange={e => handleProgress(e.target.value)} inputMode="numeric" placeholder="0-100" />
            </label>
          </div>

          {form.seriesId && (() => {
            const activeSer = series.find(s => s.id === form.seriesId)
            const hasSyncAreas = activeSer?.syncCategories?.length > 0
            if (!hasSyncAreas) return null
            return (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8, background: form.includeLaterWorks ? 'var(--accent-fade)' : 'var(--bg-main)', border: `1px solid ${form.includeLaterWorks ? 'color-mix(in srgb, var(--accent) 38%, transparent)' : 'var(--border)'}`, cursor: 'pointer', transition: 'background .15s, border-color .15s' }}>
                <input type="checkbox" checked={form.includeLaterWorks} onChange={e => setForm(p => ({ ...p, includeLaterWorks: e.target.checked }))} style={{ accentColor: 'var(--accent)', width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>Include later works</p>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>Show shared entries from books that come after this one in the series. Off by default — later books don&#39;t affect earlier ones.</p>
                </div>
              </label>
            )
          })()}

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUS_PICKER.map(key => {
                const opt = STATUS_DATA[key]
                const current = STATUS_DATA[form.status]?.aliasFor ?? form.status
                return (
                  <button key={key} type="button" onClick={() => setForm(p => ({ ...p, status: current === key ? null : key }))}
                    style={{
                      padding: '5px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${current === key ? opt.color : 'var(--border)'}`,
                      background: current === key ? `color-mix(in srgb, ${opt.color} 16%, transparent)` : 'transparent',
                      color: current === key ? opt.color : 'var(--text-muted)',
                    }}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Tags</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '7px 10px', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 40, alignItems: 'center' }}>
              {form.tags.map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 999, background: 'var(--accent-fade)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                  {tag}
                  <button type="button" onClick={() => setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={commitTag}
                placeholder={form.tags.length ? '' : 'fantasy, sci-fi... (Enter or comma to add)'}
                style={{ flex: 1, minWidth: 140, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-main)', padding: '1px 0' }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={() => onDelete(project.id)}
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginRight: 'auto' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            Delete project
          </button>
          <button type="button" onClick={requestClose}
            style={{ padding: '9px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="submit"
            style={{ padding: '9px 20px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

function SeriesCard({ series, seriesStats, onClick, onEdit }) {
  const totalWords = seriesStats.reduce((sum, s) => sum + s.manuscriptWords, 0)
  return (
    <div className="series-dash-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div
        className="series-dash-card-cover"
        style={{ background: series.coverPhoto ? undefined : getCoverGradient(series.name) }}
      >
        {series.coverPhoto
          ? <img src={series.coverPhoto} alt="" />
          : <span className="series-dash-card-letter">{series.name[0]?.toUpperCase()}</span>
        }
        <span className="series-dash-card-count">
          {seriesStats.length} {seriesStats.length === 1 ? 'project' : 'projects'}
        </span>
        <span className="series-dash-card-type-badge">Series</span>
      </div>
      <div className="series-dash-card-foot">
        <p className="series-dash-card-name">{series.name}</p>
        {totalWords > 0 && <p className="series-dash-card-words">{totalWords.toLocaleString()} words</p>}
      </div>
      <div className="series-dash-card-hover">
        <p className="series-dash-card-hover-open">Open Series →</p>
        <ul>
          {seriesStats.map(stats => (
            <li key={stats.project.id}>
              <span>{stats.project.title}</span>
              <StatusBadge status={stats.project.status} small />
            </li>
          ))}
        </ul>
        {onEdit && (
          <button
            className="series-dash-card-edit-btn"
            onClick={e => { e.stopPropagation(); onEdit() }}
            title="Edit series"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></svg>
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ stats, onClick, onEdit, onExport, isFocus, onSetFocus }) {
  const project = stats.project
  const cfg = getProjectType(project.type)
  return (
    <div className="series-dash-card project-dash-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div
        className="series-dash-card-cover"
        style={{ background: project.coverPhoto ? undefined : getCoverGradient(project.title) }}
      >
        {project.coverPhoto
          ? <img src={project.coverPhoto} alt="" />
          : <span className="series-dash-card-letter">{project.title[0]?.toUpperCase()}</span>
        }
        <span className="series-dash-card-count">{cfg.label}</span>
        <button
          type="button"
          style={{
            position: 'absolute', top: 78, right: 6, zIndex: 5,
            width: 30, height: 30,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: isFocus ? '1px solid rgba(245,158,11,.7)' : '1px solid rgba(255,255,255,.18)',
            borderRadius: '50%',
            background: isFocus ? 'rgba(245,158,11,.85)' : 'rgba(0,0,0,.48)',
            color: isFocus ? '#fff' : 'rgba(255,255,255,.38)',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            transition: 'color .15s, background .15s, border-color .15s',
          }}
          onClick={e => { e.stopPropagation(); onSetFocus(project.id) }}
          title={isFocus ? 'Remove active project' : 'Set as active project'}
          aria-label={isFocus ? 'Remove active project' : 'Set as active project'}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </button>
        <button
          className="dash-card-settings-button"
          type="button"
          onClick={e => { e.stopPropagation(); onEdit() }}
          title="Project settings"
          aria-label="Project settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V22h-4v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H2v-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 0 1 6.1 3.3l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V2h4v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1h.2v4h-.2a1.7 1.7 0 0 0-1.4 1Z" />
          </svg>
        </button>
      </div>
      <div className="dash-card-export-button">
        <ProjectExportMenu onExport={(format, themeId) => onExport?.(project.id, format, themeId)} />
      </div>
      <div className="series-dash-card-foot">
        <p className="series-dash-card-name">{project.title}</p>
        <p className="series-dash-card-words">{stats.manuscriptWords.toLocaleString()} words</p>
      </div>
      <div className="series-dash-card-hover">
        <p>Project</p>
        <ul>
          <li><span>Characters</span><span>{stats.characters.length}</span></li>
          <li><span>Status</span><StatusBadge status={project.status} small /></li>
        </ul>
        <span className="project-dash-card-select-cue">Select project</span>
      </div>
    </div>
  )
}

export default function NovelManager({ store, user, onOpenProject, onOpenSeries, onOpenChat, onOpenAccount, onOpenHelp, onOpenLegal, onOpenAbout, membership }) {
  const [showForm, setShowForm] = useState(false)
  const [showAIImport, setShowAIImport] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const restoreInputRef = useRef(null)
  const [form, setForm] = useState({ title: '', description: '', type: DEFAULT_TYPE, seriesId: '' })
  const [showSeriesForm, setShowSeriesForm] = useState(false)
  const [seriesName, setSeriesName] = useState('')
  const [editingSeries, setEditingSeries] = useState(null)
  const [editingProject, setEditingProject] = useState(null)
  const userProfile = user?.user_metadata || {}
  const userName = userProfile.full_name || userProfile.name || userProfile.alias || userProfile.writer_alias || user?.displayName || user?.email?.split('@')[0] || 'User'

  const handleSaveSeries = (id, data, assignedProjectIds) => {
    store.updateSeries(id, data)
    store.allProjectStats.forEach(s => {
      const inSeries = s.project.seriesId === id
      const shouldBe = assignedProjectIds.has(s.project.id)
      if (shouldBe && !inSeries) store.updateNovel(s.project.id, { seriesId: id })
      else if (!shouldBe && inSeries) store.updateNovel(s.project.id, { seriesId: null })
    })
    setEditingSeries(null)
  }

  const handleDeleteSeries = (id) => {
    if (confirm('Delete this series? Projects will not be deleted.')) {
      store.deleteSeries(id)
      setEditingSeries(null)
    }
  }

  const handleSaveProject = (id, data) => {
    store.updateNovel(id, data)
    setEditingProject(null)
  }

  const handleSetFocus = (id) => {
    const isAlready = store.allProjectStats.find(s => s.project.id === id)?.project.focus
    store.allProjectStats.forEach(s => { if (s.project.focus) store.updateNovel(s.project.id, { focus: false }) })
    if (!isAlready) store.updateNovel(id, { focus: true })
  }
  const handleSetStatus = (id, status) => {
    store.updateNovel(id, { status })
  }

  const handleCreateSeries = (e) => {
    e.preventDefault()
    if (!seriesName.trim()) return
    store.addSeries(seriesName.trim())
    setSeriesName('')
    setShowSeriesForm(false)
  }

  const handleCreate = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    const type = isProjectTypeSelectable(form.type) ? form.type : DEFAULT_TYPE
    const typeCfg = getProjectType(type)
    const novel = store.addNovel({
      ...form,
      type,
      wordTarget: typeCfg.defaultWordTarget || null,
      enabledSections: typeCfg.defaultSections || null,
      seriesId: form.seriesId || null,
    })
    setForm({ title: '', description: '', type: DEFAULT_TYPE, seriesId: '' })
    setShowForm(false)
    if (novel) onOpenProject(novel.id)
  }

  const handleRestoreFromZip = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setRestoring(true)
    try {
      const { unzip } = await import('fflate')
      const buffer = await file.arrayBuffer()
      await new Promise((resolve, reject) => {
        unzip(new Uint8Array(buffer), (err, files) => {
          if (err) { reject(err); return }
          const dataFile = files['project-data.json']
          if (!dataFile) { reject(new Error('Not a valid YOW backup. Missing project-data.json.')); return }
          try {
            const data = JSON.parse(new TextDecoder().decode(dataFile))
            if (!data.project) { reject(new Error('Backup file is missing project data.')); return }
            const imported = store.importProjectFromData(data)
            if (!imported) { reject(new Error('Could not import project. You may be on a free plan.')); return }
            resolve()
          } catch {
            reject(new Error('Could not read backup file. The file may be corrupt.'))
          }
        })
      })
    } catch (err) {
      alert(err.message || 'Restore failed. Please try again.')
    } finally {
      setRestoring(false)
    }
  }

  const handleCloseProjectForm = () => {
    if ((form.title.trim() || form.description.trim()) && !confirm('Discard new project?')) return
    setForm({ title: '', description: '', type: DEFAULT_TYPE, seriesId: '' })
    setShowForm(false)
  }

  const handleCloseSeriesForm = () => {
    if (seriesName.trim() && !confirm('Discard new series?')) return
    setSeriesName('')
    setShowSeriesForm(false)
  }

  const handleDelete = (id) => {
    if (confirm('Delete this project and all its content? This cannot be undone.')) {
      store.deleteNovel(id)
      setEditingProject(null)
    }
  }

  const handleExportProject = async (id, format = 'zip', themeId) => {
    const projectData = store.getProjectExportData(id)
    if (!projectData) return

    if (format === 'docx') {
      try {
        await downloadProjectDocx(projectData)
      } catch (error) {
        console.error('Word export failed:', error)
        alert('Word export failed. Please try again.')
      }
      return
    }

    if (format === 'pdf') {
      try {
        await downloadProjectPdf(projectData, { themeId })
      } catch (error) {
        console.error('PDF export failed:', error)
        alert('PDF export failed. Please try again.')
      }
      return
    }

    const blob = createProjectZipBlob(projectData)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = getProjectExportFilename(projectData.project)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const focusStats = store.allProjectStats.find(s => s.project.focus) ?? null

  const allStatsCount = store.allProjectStats.length
  useEffect(() => {
    const allStats = store.allProjectStats
    if (allStats.length === 1 && !allStats[0].project.focus) {
      store.updateNovel(allStats[0].project.id, { focus: true })
    }
  }, [allStatsCount]) // eslint-disable-line react-hooks/exhaustive-deps


  const handleOpenLibraryChat = () => {
    const projectId = focusStats?.project?.id || store.activeNovelId
    if (projectId) store.setActiveNovelId(projectId)
    onOpenChat?.()
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--bg-main)', color: 'var(--text-main)', WebkitOverflowScrolling: 'touch' }}>

      {/* Top bar */}
      <div className="library-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="library-brand-logo"><YOWLogo /></span>
          <span className="beta-watermark" aria-label="Beta">Beta</span>
          {!store.readOnly && !membership?.freeProjectId && (
            <>
              <button className="library-new-project-button" type="button" onClick={() => setShowForm(true)}>
                New Project
              </button>
              <button className="library-new-series-button" type="button" onClick={() => setShowSeriesForm(true)}>
                New Series
              </button>
              <button className="library-new-series-button" type="button" onClick={() => setShowAIImport(true)} title="Import files and let AI build your project">
                AI Import
              </button>
              <button
                className="library-new-series-button"
                type="button"
                disabled={restoring}
                onClick={() => restoreInputRef.current?.click()}
                title="Restore a project from a YOW backup ZIP"
              >
                {restoring ? 'Restoring…' : 'Restore'}
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={handleRestoreFromZip}
              />
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="library-chat-button" type="button" onClick={handleOpenLibraryChat} title="Open AI chat" aria-label="Open AI chat">
            ✦
          </button>
          <UserMenu onOpenAccount={onOpenAccount} onOpenHelp={onOpenHelp} onOpenLegal={onOpenLegal} onOpenAbout={onOpenAbout} />
        </div>
      </div>

      <ActiveProjectHero
        stats={focusStats}
        allStats={store.allProjectStats}
        series={store.series}
        userName={userName}
        onOpen={onOpenProject}
        onSetStatus={(status) => focusStats && handleSetStatus(focusStats.project.id, status)}
        onToggleFocus={() => focusStats && handleSetFocus(focusStats.project.id)}
        onEditProject={() => focusStats && setEditingProject(focusStats.project)}
        onExportProject={handleExportProject}
      />

      {/* Content */}
      <div className="library-content-shell">
        {(() => {
          const seriesById = new Map((store.series || []).map(s => [s.id, s]))
          const dashboardStats = store.allProjectStats
          const seriesWithProjects = store.series || []
          const projectCards = dashboardStats.filter(s => !s.project.seriesId || !seriesById.has(s.project.seriesId))
          const seriesProjectGroups = (store.series || [])
            .map(series => ({
              series,
              stats: dashboardStats.filter(st => st.project.seriesId === series.id),
            }))
            .filter(group => group.stats.length > 0)

          if (seriesWithProjects.length === 0 && projectCards.length === 0 && seriesProjectGroups.length === 0) return null

          return (
            <section className="command-library-grid">
              <div className="library-sections">
                {seriesWithProjects.length > 0 && (
                  <div className="library-section">
                    <div className="dash-section-title">
                      <h2>Series</h2>
                      <span>Multi-book collections</span>
                    </div>
                    <div className="dash-series-grid">
                      {seriesWithProjects.map(s => {
                        const sStats = dashboardStats.filter(st => st.project.seriesId === s.id)
                        return (
                          <SeriesCard
                            key={s.id}
                            series={s}
                            seriesStats={sStats}
                            onClick={() => onOpenSeries?.(s.id)}
                            onEdit={() => setEditingSeries(s)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}

                {seriesProjectGroups.map(({ series, stats }) => (
                  <div key={series.id} className="library-section">
                    <div className="dash-section-title">
                      <h2>{series.name}</h2>
                      <span>Series projects</span>
                    </div>
                    <div className="dash-series-grid">
                      {stats.map(item => (
                        <ProjectCard
                          key={item.project.id}
                          stats={item}
                          onClick={() => onOpenProject(item.project.id)}
                          onEdit={() => setEditingProject(item.project)}
                          onExport={handleExportProject}
                          isFocus={!!item.project.focus}
                          onSetFocus={handleSetFocus}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {projectCards.length > 0 && (
                  <div className="library-section">
                    <div className="dash-section-title">
                      <h2>Standalone Projects</h2>
                      <span>Choose the active project</span>
                    </div>
                    <div className="dash-series-grid">
                      {projectCards.map(stats => (
                        <ProjectCard
                          key={stats.project.id}
                          stats={stats}
                          onClick={() => onOpenProject(stats.project.id)}
                          onEdit={() => setEditingProject(stats.project)}
                          onExport={handleExportProject}
                          isFocus={!!stats.project.focus}
                          onSetFocus={handleSetFocus}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {seriesWithProjects.length === 0 && projectCards.length === 0 && seriesProjectGroups.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No projects yet.</p>
                )}
              </div>
              <StatusQueue stats={store.allProjectStats} onOpenProject={onOpenProject} />
            </section>
          )
        })()}

        {/* Empty state */}
        {store.novels.length === 0 && !store.readOnly && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, textAlign: 'center', padding: '56px 16px' }}>
            <div style={{ fontSize: 52, marginBottom: 24, opacity: 0.12, lineHeight: 1 }}>✦</div>
            <h2 style={{ margin: '0 0 14px', fontSize: 28, fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-.02em', lineHeight: 1.15 }}>
              Start your first project
            </h2>
            <p style={{ margin: '0 0 32px', fontSize: 15, color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.65 }}>
              Build your story world — characters, locations, lore, and manuscript — all in one place.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setShowForm(true)}
                style={{ padding: '14px 40px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--bg-main)', fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: '-.01em' }}
              >
                New Project
              </button>
              <button
                onClick={() => setShowAIImport(true)}
                style={{ padding: '9px 22px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Import with AI
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit series modal */}
      {editingSeries && (
        <EditSeriesModal
          series={editingSeries}
          allStats={store.allProjectStats}
          onSave={handleSaveSeries}
          onDelete={handleDeleteSeries}
          onClose={() => setEditingSeries(null)}
        />
      )}

      {/* Edit project modal */}
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          series={store.series}
          onSave={handleSaveProject}
          onDelete={handleDelete}
          onClose={() => setEditingProject(null)}
        />
      )}

      {/* New series modal */}
      {showSeriesForm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={handleCloseSeriesForm}
        >
          <form
            onSubmit={handleCreateSeries}
            style={{
              width: '100%', maxWidth: 360, padding: 24,
              background: 'var(--bg-nav)', border: '1px solid var(--border)',
              borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.4)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-main)' }}>New Series</p>
            <input
              autoFocus
              placeholder="Series name *"
              value={seriesName}
              onChange={e => setSeriesName(e.target.value)}
              required
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 14, color: 'var(--text-main)', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit"
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 7, border: 'none',
                  background: 'var(--accent)', color: 'var(--bg-main)',
                  fontSize: 13, fontWeight: 800, cursor: 'pointer',
                }}>
                Create
              </button>
              <button type="button" onClick={handleCloseSeriesForm}
                style={{ padding: '10px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AI Import modal */}
      {showAIImport && (
        <AIImportModal
          store={store}
          onClose={() => setShowAIImport(false)}
          onImportDone={(novelId) => { onOpenProject?.(novelId) }}
        />
      )}

      {/* New project modal */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={handleCloseProjectForm}
        >
          <form
            onSubmit={handleCreate}
            style={{
              width: '100%', maxWidth: 420, padding: 24,
              background: 'var(--bg-nav)', border: '1px solid var(--border)',
              borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.4)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-main)' }}>New Project</p>

            <input
              autoFocus
              placeholder="Title *"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              required
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 14, color: 'var(--text-main)', outline: 'none' }}
            />

            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--text-main)', resize: 'none', outline: 'none' }}
            />

            {store.series.length > 0 && (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Series</p>
                <select
                  value={form.seriesId}
                  onChange={e => setForm(p => ({ ...p, seriesId: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: 'var(--text-main)', outline: 'none' }}
                >
                  <option value="">Standalone</option>
                  {store.series.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Project type */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Type</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {TYPE_OPTIONS.map(t => {
                  const stage = getProjectTypeStage(t.id)
                  const isBeta = stage.stage === 'beta'
                  return (
                    <button key={t.id} type="button" onClick={() => setForm(p => ({ ...p, type: t.id }))}
                      title={stage.note}
                      style={{
                        textAlign: 'left', padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                        border: `1px solid ${form.type === t.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: form.type === t.id ? 'var(--accent-fade)' : 'var(--bg-main)',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <ProjectTypeImage type={t.id} label={t.label} size={24} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-main)' }}>{t.label}</span>
                        {isBeta && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>{stage.label}</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{isBeta ? stage.note : t.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit"
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 7, border: 'none',
                  background: 'var(--accent)', color: 'var(--bg-main)',
                  fontSize: 13, fontWeight: 800, cursor: 'pointer',
                }}>
                Create
              </button>
              <button type="button" onClick={handleCloseProjectForm}
                style={{ padding: '10px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
