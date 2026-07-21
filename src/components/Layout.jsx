import { Component, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import UserMenu from './auth/UserMenu'
import AIPanel from './ai/AIPanel'
import AIAssistant from './ai/AIAssistant'
import AIStar from './ai/AIStar'
import Characters from './characters/Characters'
import FamilyTree from './familytree/FamilyTree'
import RelationshipMap from './relationships/RelationshipMap'
import Factions from './Factions/Factions'
import Lore from './lore/Lore'
import IdeasKanban from './ideas/IdeasKanban'
import Timeline from './timeline/Timeline'
import WorldHistory from './worldhistory/WorldHistory'
import MapBuilder from './Map/MapBuilder'
import Locations from './Locations/Locations'
import CharacterBuilder from './characterbuilder/CharacterBuilder'
import Manuscript from './Manuscript/Manuscript'
import StoryOutline from './outline/StoryOutline'
import ProjectDashboard from './dashboard/ProjectDashboard'
import ScheduleCalendar from './schedule/ScheduleCalendar'
import AITools from './aitools/AITools'
import OnboardingTour from './onboarding/OnboardingTour'
import { MANUSCRIPT_TOUR, CHARACTERS_TOUR, LOCATIONS_TOUR, LORE_TOUR, IDEAS_TOUR, MAP_TOUR, AI_TOOLS_TOUR, TIMELINE_TOUR, WORLDHISTORY_TOUR, FAMILYTREE_TOUR, COMIC_TOUR, OUTLINE_TOUR, DASHBOARD_TOUR, FACTIONS_TOUR } from './onboarding/tourDefinitions'
import { getProjectType, getEnabledSections, getProjectTypeStage, ALL_SECTION_IDS } from '../constants/projectTypes'
import { StudioFrame, StudioWorkspace, StudioTab, StudioButton, StudioEmpty } from './presentation/Studio'
import {
  EXPORT_PDF_THEME_OPTIONS,
  createProjectZipBlob,
  downloadBlob,
  downloadProjectDocx,
  downloadProjectPdf,
  getProjectExportFilename,
} from '../utils/projectExport'
import { readItem, writeItem } from '../storage/projectStorage'

// ─── Project status ──────────────────────────────────────────────────────────

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
const CAMPAIGN_PROJECT_TYPES = new Set(['dnd_campaign', 'tabletop_rpg'])
const isCampaignProjectType = (type) => CAMPAIGN_PROJECT_TYPES.has(type)

// ─── Icons ───────────────────────────────────────────────────────────────────

function Icon({ name, size = 16 }) {
  if (name === 'aitools') {
    return <AIStar size={size} />
  }

  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  }
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    planning: <><path d="M4 5h16" /><path d="M4 12h10" /><path d="M4 19h16" /><path d="M16 9l3 3-3 3" /></>,
    lore: <><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4z" /><path d="M5 4v16" /><path d="M9 8h6" /><path d="M9 12h5" /></>,
    characters: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="10" r="2.5" /><path d="M14.5 20a4.5 4.5 0 0 1 6 0" /></>,
    atlas: <><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3z" /><path d="M9 3v15" /><path d="M15 6v15" /></>,
    history: <><circle cx="12" cy="12" r="8" /><path d="M12 8v5l3 2" /><path d="M4 4l3 3" /></>,
    manuscript: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>,
    outline: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></>,
    familytree: <><circle cx="12" cy="5" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M12 8v4" /><path d="M6 15v-3h12v3" /></>,
    relationships: <><circle cx="7" cy="12" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M10 11l4-2.5" /><path d="M10 13l4 2.5" /></>,
    factions: <><path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" /></>,
    locations: <><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
    ideas: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8.5 14.5a6 6 0 1 1 7 0c-.8.7-1.5 1.5-1.5 2.5h-4c0-1-.7-1.8-1.5-2.5z" /></>,
    timeline: <><path d="M4 5v14" /><circle cx="4" cy="5" r="1.5" /><circle cx="4" cy="12" r="1.5" /><circle cx="4" cy="19" r="1.5" /><path d="M8 5h12" /><path d="M8 12h9" /><path d="M8 19h12" /></>,
    worldhistory: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></>,
    map: <><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" /><path d="M9 4v13" /><path d="M15 7v13" /></>,
    note: <><path d="M5 4h14v16H5z" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /></>,
    schedule: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /></>,
    characterbuilder: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
  }
  return <svg {...common}>{paths[name] || paths.note}</svg>
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class SectionErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
        <p className="text-[var(--text-main)] font-semibold">This section ran into an error.</p>
        <p className="text-[var(--text-muted)] text-sm max-w-xs">{this.state.error?.message}</p>
        <button onClick={() => this.setState({ error: null })} className="mt-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--bg-main)] font-bold text-xs">Retry</button>
      </div>
    )
    return this.props.children
  }
}

// ─── Cover photo resize (mirrors NovelManager.jsx) ───────────────────────────

const resizeCoverPhoto = (file) => new Promise((resolve, reject) => {
  const image = new Image()
  const objectUrl = URL.createObjectURL(file)
  image.onload = () => {
    URL.revokeObjectURL(objectUrl)
    const maxWidth = 900, maxHeight = 1200
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#111814'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    let quality = 0.82
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > 900000 && quality > 0.48) { quality -= 0.08; dataUrl = canvas.toDataURL('image/jpeg', quality) }
    resolve(dataUrl)
  }
  image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read that image.')) }
  image.src = objectUrl
})

// ─── Navigation config ────────────────────────────────────────────────────────

const ALL_SECTIONS = [
  { id: 'dashboard',    label: 'Overview',     icon: 'overview' },
  { id: 'outline',      label: 'Outline',      icon: 'outline' },
  { id: 'characters',   label: 'Characters',   icon: 'characters' },
  { id: 'relationships', label: 'Relationship Map', icon: 'relationships' },
  { id: 'familytree',   label: 'Family Tree', icon: 'familytree' },
  { id: 'factions',     label: 'Factions',     icon: 'factions' },
  { id: 'locations',    label: 'Locations',    icon: 'locations' },
  { id: 'lore',         label: 'Lore',         icon: 'lore' },
  { id: 'ideas',        label: 'Idea Board',   icon: 'ideas' },
  { id: 'schedule',     label: 'Schedule',     icon: 'schedule' },
  { id: 'timeline',     label: 'Timeline',     icon: 'timeline' },
  { id: 'worldhistory', label: 'History',      icon: 'worldhistory' },
  { id: 'map',          label: 'Map',          icon: 'map' },
  { id: 'aitools',          label: 'AI Tools',         icon: 'aitools' },
  { id: 'characterbuilder', label: 'Character Builder', icon: 'characterbuilder' },
]

const STUDIO_ROOMS = [
  { id: 'overview',          label: 'Overview',          icon: 'overview',          sections: ['dashboard'] },
  { id: 'planning',          label: 'Planning',          icon: 'planning',          sections: ['outline', 'ideas', 'schedule'] },
  { id: 'characters',        label: 'Characters',        icon: 'characters',        sections: ['characters', 'relationships', 'familytree', 'factions'] },
  { id: 'atlas',             label: 'Atlas',             icon: 'atlas',             sections: ['locations', 'map'] },
  { id: 'lore',              label: 'Lore',              icon: 'lore',              sections: ['lore', 'timeline', 'worldhistory'] },
  { id: 'party',             label: 'Party',             icon: 'characterbuilder',  sections: ['characterbuilder'], ttrpgOnly: true },
  { id: 'aitools',           label: 'AI Tools',          icon: 'aitools',           sections: ['aitools'] },
]

const SETTINGS_GROUPS = [
  { label: 'Planning',          sections: ['outline', 'ideas', 'schedule'] },
  { label: 'Characters',        sections: ['characters', 'relationships', 'familytree', 'factions'] },
  { label: 'Atlas',             sections: ['locations', 'map'] },
  { label: 'Lore',              sections: ['lore', 'timeline', 'worldhistory'] },
  { label: 'Tabletop RPG',      sections: ['characterbuilder'] },
  { label: 'AI',                sections: ['aitools'] },
]

const FREE_LOCKED_SECTIONS = new Set(['map', 'aitools'])

const openUpgradePage = () => {
  window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'membership' } }))
}

const BACKUP_DEFAULTS = {
  frequency: 'manual',
  retention: 5,
  includeMedia: true,
  includeCustomerData: true,
}

const DEFAULT_CATEGORY_OPTIONS = {
  lore: ['Magic System', 'Religion', 'History', 'Politics', 'Geography', 'Culture', 'Technology', 'Prophecy', 'Mythology', 'Other'],
  schedule: ['Scene', 'Battle', 'Travel', 'Meeting', 'Festival', 'Other'],
}

const backupKey = projectId => `nf_project_backups_${projectId}`

const safeSlug = value => String(value || 'project')
  .trim()
  .replace(/[^a-z0-9._ -]/gi, '_')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^[-_.]+|[-_.]+$/g, '') || 'project'

const stripMediaFromBackup = data => ({
  ...data,
  project: data.project ? { ...data.project, coverPhoto: null, bannerImage: null } : data.project,
  series: data.series ? { ...data.series, coverPhoto: null } : data.series,
  characters: (data.characters || []).map(item => ({ ...item, image: null, portrait: null, photo: null })),
  locations: (data.locations || []).map(item => ({ ...item, image: null, photo: null })),
  loreEntries: (data.loreEntries || []).map(item => ({ ...item, image: null, photo: null })),
  maps: (data.maps || []).map(item => ({ ...item, image: null, backgroundImage: null, mapImage: null })),
})

const normalizeList = value => String(value || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

const shouldCreateAutoBackup = (config, lastBackupAt) => {
  if (!config || config.frequency === 'manual') return false
  if (!lastBackupAt) return true
  const elapsed = Date.now() - Date.parse(lastBackupAt)
  const interval = config.frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return elapsed >= interval
}

// ─── Project Settings ─────────────────────────────────────────────────────────

function ProjectSettings({ store, onClose }) {
  const novel = store.activeNovel
  const settingsProjectType = getProjectType(novel?.type)
  const settingsProjectStage = getProjectTypeStage(novel?.type)
  const isCampaign = isCampaignProjectType(novel?.type)
  const initial = getEnabledSections(novel).filter(id => ALL_SECTION_IDS.includes(id))
  const [enabled, setEnabled] = useState(() => new Set(initial))
  const dialogRef = useRef(null)
  useEffect(() => { dialogRef.current?.focus() }, [])
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  const [details, setDetails] = useState(() => ({
    title: novel?.title || '',
    description: novel?.description || '',
    type: novel?.type || 'novel',
    currentYear: store.currentYear ?? 0,
    seriesId: novel?.seriesId || '',
    progress: novel?.progress ?? '',
    wordCountTarget: novel?.wordCountTarget ?? '',
    sessionTarget: novel?.sessionTarget ?? '',
    status: novel?.status ?? null,
  }))
  const [coverError, setCoverError] = useState('')
  const [bannerError, setBannerError] = useState('')
  const [exporting, setExporting] = useState('')
  const [backupMessage, setBackupMessage] = useState('')
  const [categoryDraft, setCategoryDraft] = useState(() => ({
    lore: (novel?.categoryOptions?.lore || DEFAULT_CATEGORY_OPTIONS.lore).join(', '),
    schedule: (novel?.categoryOptions?.schedule || DEFAULT_CATEGORY_OPTIONS.schedule).join(', '),
  }))
  const [backupConfig, setBackupConfig] = useState(() => ({
    ...BACKUP_DEFAULTS,
    ...(novel?.backupConfig || {}),
  }))
  const [localBackups, setLocalBackups] = useState(() => {
    try { return JSON.parse(readItem(backupKey(novel?.id)) || '[]') }
    catch { return [] }
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(new Set(getEnabledSections(novel).filter(id => ALL_SECTION_IDS.includes(id))))
    setDetails({
      title: novel?.title || '',
      description: novel?.description || '',
      type: novel?.type || 'novel',
      currentYear: store.currentYear ?? 0,
      seriesId: novel?.seriesId || '',
      progress: novel?.progress ?? '',
      wordCountTarget: novel?.wordCountTarget ?? '',
      sessionTarget: novel?.sessionTarget ?? '',
      status: novel?.status ?? null,
    })
    setBackupConfig({ ...BACKUP_DEFAULTS, ...(novel?.backupConfig || {}) })
    setCategoryDraft({
      lore: (novel?.categoryOptions?.lore || DEFAULT_CATEGORY_OPTIONS.lore).join(', '),
      schedule: (novel?.categoryOptions?.schedule || DEFAULT_CATEGORY_OPTIONS.schedule).join(', '),
    })
    try { setLocalBackups(JSON.parse(readItem(backupKey(novel?.id)) || '[]')) }
    catch { setLocalBackups([]) }
  }, [novel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchProject = (patch) => {
    if (!store.activeNovelId) return
    store.updateNovel(store.activeNovelId, patch)
  }

  const updateDetail = (field, value) => {
    setDetails(prev => ({ ...prev, [field]: value }))
    if (field === 'currentYear') { store.updateCurrentYear(value); return }
    if (field === 'progress') {
      const num = value === '' ? null : Math.max(0, Math.min(100, Number(value)))
      patchProject({ progress: num })
      return
    }
    if (field === 'wordCountTarget') {
      const num = value === '' ? null : Math.max(0, Number(value))
      patchProject({ wordCountTarget: num })
      return
    }
    if (field === 'sessionTarget') {
      const num = value === '' ? null : Math.max(0, Number(value))
      patchProject({ sessionTarget: num })
      return
    }
    patchProject({ [field]: field === 'seriesId' ? value || null : value })
  }

  const getBackupData = () => {
    const data = store.getProjectExportData?.(store.activeNovelId)
    if (!data) return null
    const prepared = backupConfig.includeMedia ? data : stripMediaFromBackup(data)
    return {
      ...prepared,
      backup: {
        createdAt: new Date().toISOString(),
        includeCustomerData: backupConfig.includeCustomerData,
        source: 'project-settings',
        config: backupConfig,
      },
    }
  }

  const saveBackupConfig = patch => {
    const next = { ...backupConfig, ...patch }
    const normalized = { ...next, retention: Math.max(1, Math.min(20, Number(next.retention) || BACKUP_DEFAULTS.retention)) }
    setBackupConfig(normalized)
    patchProject({ backupConfig: normalized })
  }

  const createLocalBackup = (kind = 'manual') => {
    const data = getBackupData()
    if (!data || !store.activeNovelId) return null
    const entry = {
      id: `${kind}-${Date.now()}`,
      kind,
      createdAt: new Date().toISOString(),
      title: data.project?.title || 'Untitled project',
      data,
    }
    const nextBackups = [entry, ...localBackups].slice(0, backupConfig.retention)
    try {
      writeItem(backupKey(store.activeNovelId), JSON.stringify(nextBackups))
      setLocalBackups(nextBackups)
      patchProject({ backupConfig: { ...backupConfig, lastBackupAt: entry.createdAt } })
      setBackupMessage(kind === 'auto' ? 'Automatic backup refreshed.' : 'Backup created.')
    } catch {
      setBackupMessage('Backup failed. Try reducing retained backups or excluding media.')
      return null
    }
    return entry
  }

  const exportBackup = entry => {
    const blob = createProjectZipBlob(entry.data)
    downloadBlob(blob, `${safeSlug(entry.title)}-${entry.createdAt.slice(0, 10)}-backup.zip`)
  }

  const handleExport = async (format, themeId) => {
    const projectData = store.getProjectExportData?.(store.activeNovelId)
    if (!projectData) return
    try {
      setExporting(format)
      if (format === 'docx') await downloadProjectDocx(projectData)
      else if (format === 'pdf') await downloadProjectPdf(projectData, { themeId })
      else await downloadBlob(createProjectZipBlob(projectData), getProjectExportFilename(projectData.project))
    } catch (error) {
      console.error('Project export failed:', error)
      setBackupMessage('Export failed. Please try again.')
    } finally {
      setExporting('')
    }
  }

  const saveCategoryOptions = (field, value) => {
    const nextDraft = { ...categoryDraft, [field]: value }
    const nextOptions = {
      ...(novel?.categoryOptions || {}),
      [field]: normalizeList(value),
    }
    setCategoryDraft(nextDraft)
    patchProject({ categoryOptions: nextOptions })
  }

  useEffect(() => {
    if (!store.activeNovelId || !shouldCreateAutoBackup(backupConfig, novel?.backupConfig?.lastBackupAt)) return
    createLocalBackup('auto')
  }, [store.activeNovelId, backupConfig.frequency]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCoverSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      setCoverError('')
      const photo = await resizeCoverPhoto(file)
      store.updateNovel(store.activeNovelId, { coverPhoto: photo })
    } catch {
      setCoverError('Could not use that image.')
    }
  }

  const handleBannerSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    try {
      setBannerError('')
      const photo = await resizeCoverPhoto(file)
      store.updateNovel(store.activeNovelId, { bannerImage: photo })
    } catch {
      setBannerError('Could not use that image.')
    }
  }

  const toggle = (id) => {
    setEnabled(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      store.updateNovel(store.activeNovelId, {
        enabledSections: [...next],
        ...(id === 'relationships' ? { relationshipMapConfigured: true } : {}),
      })
      return next
    })
  }

  const resetToDefaults = () => {
    const defaults = new Set(getProjectType(novel?.type).defaultSections)
    setEnabled(defaults)
    store.updateNovel(store.activeNovelId, { enabledSections: [...defaults] })
  }

  const enableAll = () => {
    const all = new Set(ALL_SECTION_IDS)
    setEnabled(all)
    store.updateNovel(store.activeNovelId, { enabledSections: [...all] })
  }

  return (
    <div
      className="project-settings-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
        tabIndex={-1}
        className="project-settings-dialog"
        style={{
          background: 'var(--bg-nav)',
          border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          borderRadius: 18,
          width: 'min(1080px, 100%)', height: 'min(820px, calc(100vh - 48px))',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 56px rgba(0,0,0,0.32)',
        }}>
        {/* Header */}
        <div style={{
          padding: '14px 22px',
          borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <p id="project-settings-title" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>Project Settings</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>{novel?.title || 'Untitled'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onClose}
              style={{
                height: 28, padding: '0 14px', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', borderRadius: 8,
                background: 'var(--accent)', color: 'var(--bg-main)',
                fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >Done</button>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          <div className="project-settings-sections" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <section style={{ border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)', borderRadius: 14, background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)', padding: 18 }}>
              <div className="project-settings-section-heading">
                <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Project Details</p>
                <span
                  className={`project-settings-type-chip${settingsProjectStage.stage === 'beta' ? ' is-beta' : ''}`}
                  title={settingsProjectStage.note}
                >
                  {settingsProjectStage.stage === 'beta' ? `${settingsProjectType.label} · ${settingsProjectStage.label}` : settingsProjectType.label}
                </span>
              </div>

              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Title</span>
                <input
                  value={details.title}
                  onChange={e => updateDetail('title', e.target.value)}
                  className="field"
                  style={{ padding: '8px 10px', fontSize: 13 }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Description</span>
                <textarea
                  value={details.description}
                  onChange={e => updateDetail('description', e.target.value)}
                  rows={5}
                  className="field"
                  style={{ padding: '8px 10px', fontSize: 13, resize: 'vertical', minHeight: 96 }}
                />
              </label>

              {store.series.length > 0 && (
                <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Series</span>
                  <select
                    value={details.seriesId}
                    onChange={e => updateDetail('seriesId', e.target.value)}
                    className="field"
                    style={{ padding: '8px 10px', fontSize: 13 }}
                  >
                    <option value="">No series</option>
                    {store.series.map(series => (
                      <option key={series.id} value={series.id}>{series.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="project-settings-compact-fields">
                <label>
                  <span>Current year</span>
                  <input
                    type="number"
                    value={details.currentYear}
                    onChange={e => updateDetail('currentYear', e.target.value)}
                    className="field"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  />
                </label>
                {isCampaign ? (
                  <label>
                    <span>Session target</span>
                    <input
                      type="number"
                      min={0}
                      value={details.sessionTarget}
                      onChange={e => updateDetail('sessionTarget', e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="12"
                      className="field"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                  </label>
                ) : (
                  <label>
                    <span>Word target</span>
                    <input
                      type="number"
                      min={0}
                      value={details.wordCountTarget}
                      onChange={e => updateDetail('wordCountTarget', e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="80000"
                      className="field"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                  </label>
                )}
              </div>

              {!isCampaign && !details.wordCountTarget && (
                <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Progress (0–100%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={details.progress}
                    onChange={e => updateDetail('progress', e.target.value)}
                    placeholder="—"
                    className="field"
                    style={{ padding: '8px 10px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                  />
                </label>
              )}

              <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Status</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {STATUS_PICKER.map(key => {
                    const opt = STATUS_DATA[key]
                    const current = STATUS_DATA[details.status]?.aliasFor ?? details.status
                    const active = current === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => updateDetail('status', active ? null : key)}
                        style={{
                          padding: '5px 14px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                          background: active ? `color-mix(in srgb, ${opt.color} 16%, transparent)` : 'transparent',
                          color: active ? opt.color : 'var(--text-muted)',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Cover Photo</span>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>Shown in the project list and sidebar.</p>
                <div className="project-cover-preview project-cover-preview-compact">
                  <div className="project-cover-preview-frame" style={{ background: novel?.coverPhoto ? 'var(--bg-main)' : 'linear-gradient(135deg, var(--bg-main), color-mix(in srgb, var(--accent) 16%, var(--bg-main)))' }}>
                    {novel?.coverPhoto ? (
                      <img src={novel.coverPhoto} alt="" />
                    ) : (
                      <span>No cover photo</span>
                    )}
                  </div>
                  <div className="project-cover-preview-actions">
                    <label>
                      <input type="file" accept="image/*" onChange={handleCoverSelect} style={{ display: 'none' }} />
                      {novel?.coverPhoto ? 'Change cover' : 'Add cover photo'}
                    </label>
                    {novel?.coverPhoto && (
                      <button
                        type="button"
                        onClick={() => store.updateNovel(store.activeNovelId, { coverPhoto: null })}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {coverError && <p>{coverError}</p>}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Header Banner</span>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>Background image for the project overview header.</p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {novel?.bannerImage && (
                    <img src={novel.bannerImage} alt="" style={{ width: 80, height: 44, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)', flexShrink: 0 }} />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', lineHeight: 1 }}>
                      <input type="file" accept="image/*" onChange={handleBannerSelect} style={{ display: 'none' }} />
                      {novel?.bannerImage ? 'Change banner' : 'Add header banner'}
                    </label>
                    {novel?.bannerImage && (
                      <button
                        type="button"
                        onClick={() => store.updateNovel(store.activeNovelId, { bannerImage: null })}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'transparent', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}
                      >
                        Remove
                      </button>
                    )}
                    {bannerError && <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{bannerError}</p>}
                  </div>
                </div>
              </div>
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)', borderRadius: 14, background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)', padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Sections</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 430 }}>
                    Choose which rooms and tools appear in this project. Hidden sections can be re-enabled any time.
                  </p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', paddingTop: 2 }}>
                  {enabled.size} / {ALL_SECTION_IDS.length} active
                </span>
              </div>

              <div className="project-settings-section-groups">
                {SETTINGS_GROUPS.map(group => (
                  <div key={group.label}>
                    <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{group.label}</p>
                    <div className="project-settings-section-options">
                      {group.sections.map(id => {
                        const section = ALL_SECTIONS.find(s => s.id === id)
                        if (!section) return null
                        const on = enabled.has(id)
                        return (
                          <button
                            key={id}
                            role="switch"
                            aria-checked={on}
                            aria-label={section.label}
                            onClick={() => toggle(id)}
                            className="project-settings-section-toggle"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              minHeight: 34, padding: '7px 9px', borderRadius: 10,
                              border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 70%, transparent)' : 'color-mix(in srgb, var(--border) 55%, transparent)'}`,
                              background: on ? 'var(--accent-fade)' : 'color-mix(in srgb, var(--bg-nav) 40%, transparent)',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                              <span style={{ color: on ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                                <Icon name={section.icon} size={14} />
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: on ? 'var(--text-main)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {section.label}
                              </span>
                            </div>
                            <div style={{
                              width: 26, height: 15, borderRadius: 8, flexShrink: 0,
                              background: on ? 'var(--accent)' : 'var(--border)',
                              position: 'relative', marginLeft: 8,
                            }}>
                              <div style={{
                                position: 'absolute', top: 3, left: on ? 14 : 3,
                                width: 9, height: 9, borderRadius: '50%',
                                background: on ? 'var(--bg-main)' : 'var(--bg-nav)',
                                transition: 'left .12s ease',
                              }} />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)', borderRadius: 14, background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)', padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>Export</p>
              <div className="project-settings-action-grid">
                <button type="button" onClick={() => handleExport('docx')} className="project-settings-action-card" disabled={!!exporting} title="Readable export — story, characters, locations, lore, timeline, and more">
                  <strong>Word document</strong>
                  <span>Readable export — story, characters, locations, lore, timeline, and more</span>
                </button>
                <button type="button" onClick={() => handleExport('zip')} className="project-settings-action-card" disabled={!!exporting} title="Restore file for YOW — JSON data, not for reading">
                  <strong>Backup zip</strong>
                  <span>Restore file for YOW — JSON data, not for reading</span>
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Visual PDF theme</p>
                <div className="project-settings-theme-grid">
                  {EXPORT_PDF_THEME_OPTIONS.map(theme => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleExport('pdf', theme.id)}
                      className="project-settings-theme-button"
                      disabled={!!exporting}
                    >
                      <strong>{theme.name}</strong>
                      <span>{theme.tagline}</span>
                    </button>
                  ))}
                </div>
              </div>
              {exporting && <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 10 }}>Preparing export...</p>}
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)', borderRadius: 14, background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)', padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Backups</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Automatic restore-ready snapshots of this project, saved as zip files. Use Import ZIP to restore one — they aren't meant to be opened and read.</p>
                </div>
                <button type="button" onClick={() => createLocalBackup('manual')} className="project-settings-small-button">Create backup</button>
              </div>

              <div className="project-settings-form-grid">
                <label>
                  <span>Frequency</span>
                  <select value={backupConfig.frequency} onChange={e => saveBackupConfig({ frequency: e.target.value })} className="field">
                    <option value="manual">Manual</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <label>
                  <span>Retained backups</span>
                  <input type="number" min={1} max={20} value={backupConfig.retention} onChange={e => saveBackupConfig({ retention: e.target.value })} className="field" />
                </label>
              </div>

              <div className="project-settings-checks">
                <label><input type="checkbox" checked={backupConfig.includeMedia} onChange={e => saveBackupConfig({ includeMedia: e.target.checked })} /> Include cover and media fields</label>
                <label><input type="checkbox" checked={backupConfig.includeCustomerData} onChange={e => saveBackupConfig({ includeCustomerData: e.target.checked })} /> Include project settings metadata</label>
              </div>

              <div className="project-settings-backup-list">
                {localBackups.length ? localBackups.slice(0, 4).map(entry => (
                  <button key={entry.id} type="button" onClick={() => exportBackup(entry)}>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    <strong>{entry.kind === 'auto' ? 'Auto backup' : 'Manual backup'}</strong>
                  </button>
                )) : (
                  <p>No local backups yet.</p>
                )}
              </div>
              {backupMessage && <p style={{ fontSize: 11, color: backupMessage.includes('failed') ? '#f87171' : 'var(--accent)', marginTop: 10 }}>{backupMessage}</p>}
            </section>

            <section style={{ border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)', borderRadius: 14, background: 'color-mix(in srgb, var(--bg-main) 80%, transparent)', padding: 18 }}>
              <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>Categories</p>
              <div className="project-settings-category-editor">
                <label>
                  <span>Lore categories</span>
                  <textarea value={categoryDraft.lore} onChange={e => saveCategoryOptions('lore', e.target.value)} rows={3} className="field" />
                </label>
                <label>
                  <span>Schedule categories</span>
                  <textarea value={categoryDraft.schedule} onChange={e => saveCategoryOptions('schedule', e.target.value)} rows={3} className="field" />
                </label>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 10 }}>Separate options with commas. Existing entries keep their current category labels.</p>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px',
          borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={resetToDefaults}
              style={{
                height: 28, padding: '0 12px', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', borderRadius: 8,
                background: 'transparent', color: 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >Type defaults</button>
            <button
              onClick={enableAll}
              style={{
                height: 28, padding: '0 12px', border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', borderRadius: 8,
                background: 'transparent', color: 'var(--text-muted)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >Enable all</button>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {enabled.size} / {ALL_SECTION_IDS.length} active
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function Layout({
  store,
  userId,
  section,
  setSection,
  onOpenAccount,
  onOpenHelp,
  onOpenLegal,
  onOpenAbout,
  membership,
  viewMode,
  setViewMode,
  projectSettingsOpen,
  setProjectSettingsOpen,
  seriesContext,
  onOpenSeries,
  onGoHome,
  tourStore,
  localModeBubble,
}) {
  const projectTypeCfg = getProjectType(store.activeNovel?.type)
  const projectTypeStage = getProjectTypeStage(store.activeNovel?.type)
  const projectTypeLabel = projectTypeStage.stage === 'beta'
    ? `${projectTypeCfg.label} · ${projectTypeStage.label}`
    : projectTypeCfg.label
  const enabledSectionIds = new Set(getEnabledSections(store.activeNovel))
  const planningSections = ALL_SECTIONS.filter(s => s.id === 'dashboard' || enabledSectionIds.has(s.id))
  const isFreePlan = membership?.isFree
  const isSectionLockedForFree = useCallback(
    (sectionId) => Boolean(isFreePlan && FREE_LOCKED_SECTIONS.has(sectionId)),
    [isFreePlan]
  )

  const [aiOpen, setAiOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [openSectionTourId, setOpenSectionTourId] = useState(null)

  const sectionTours = useMemo(() => ({
    manuscript: MANUSCRIPT_TOUR,
    characters: CHARACTERS_TOUR,
    locations: LOCATIONS_TOUR,
    lore: LORE_TOUR,
    ideas: IDEAS_TOUR,
    map: MAP_TOUR,
    aitools: AI_TOOLS_TOUR,
    timeline: TIMELINE_TOUR,
    worldhistory: WORLDHISTORY_TOUR,
    familytree: FAMILYTREE_TOUR,
    comic: COMIC_TOUR,
    outline: OUTLINE_TOUR,
    dashboard: DASHBOARD_TOUR,
    factions: FACTIONS_TOUR,
  }), [])
  const activeSectionTourId = viewMode === 'writing' ? 'manuscript' : section
  const activeSectionTour = (activeSectionTourId === 'map' && isMobileViewport) || (activeSectionTourId === 'aitools' && membership?.isFree)
    ? null
    : sectionTours[activeSectionTourId]

  // Auto-show tour on first visit to each section
  useEffect(() => {
    if (!tourStore || !tourStore.toursEnabled || !activeSectionTour) return
    if (tourStore.isTourComplete(activeSectionTourId)) return
    // Small delay so the section content can mount and data-tour elements can appear
    const t = setTimeout(() => setOpenSectionTourId(activeSectionTourId), 400)
    return () => clearTimeout(t)
  }, [activeSectionTourId, tourStore?.toursEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const resetStudioIndex = useCallback(() => {
    window.dispatchEvent(new Event('studio-index-reset'))
  }, [])

  // Redirect away from a section that just got disabled
  useEffect(() => {
    if (viewMode === 'planning' && section !== 'dashboard' && !enabledSectionIds.has(section)) {
      const first = planningSections.find(s => s.id !== 'dashboard')
      if (first) setSection(first.id)
    }
  }, [store.activeNovel?.enabledSections])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleTeleport = (e) => {
      if (e.detail?.section) {
        if (isSectionLockedForFree(e.detail.section)) {
          openUpgradePage()
          return
        }
        setSection(e.detail.section)
        if (ALL_SECTIONS.find(s => s.id === e.detail.section)) setViewMode('planning')
      }
    }
    const handleOpenProjectSettings = () => setProjectSettingsOpen(true)
    const handleOpenWriting = () => {
      resetStudioIndex()
      setViewMode('writing')
    }
    window.addEventListener('switch-section', handleTeleport)
    window.addEventListener('open-project-settings', handleOpenProjectSettings)
    window.addEventListener('switch-writing', handleOpenWriting)
    return () => {
      window.removeEventListener('switch-section', handleTeleport)
      window.removeEventListener('open-project-settings', handleOpenProjectSettings)
      window.removeEventListener('switch-writing', handleOpenWriting)
    }
  }, [setSection, setViewMode, setProjectSettingsOpen, resetStudioIndex, isSectionLockedForFree])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)')
    const handleChange = () => setIsMobileViewport(media.matches)
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  // iOS Safari requires a passive touchstart listener on scroll containers
  // to properly recognise them as touch-scroll targets.
  useEffect(() => {
    const noop = () => {}
    const els = document.querySelectorAll(
      '.studio-surface, .studio-split, .studio-split-dossier, .studio-split-notebook, .overflow-auto, .overflow-y-auto, .overflow-y-scroll'
    )
    els.forEach(el => el.addEventListener('touchstart', noop, { passive: true }))
    return () => els.forEach(el => el.removeEventListener('touchstart', noop))
  }, [section, viewMode])

  const initialContext = useMemo(() => {
    if (viewMode === 'writing') return { characterIds: [], locationIds: [], loreEntryIds: [], chapterIds: store.chapters.map(c => c.id), customInstruction: '' }
    if (section === 'characters' && store.selectedCharacterId) return { characterIds: [store.selectedCharacterId], locationIds: [], loreEntryIds: [], chapterIds: [], customInstruction: '' }
    if (section === 'locations' && store.selectedLocationId) return { characterIds: [], locationIds: [store.selectedLocationId], loreEntryIds: [], chapterIds: [], customInstruction: '' }
    return { characterIds: [], locationIds: [], loreEntryIds: [], chapterIds: [], customInstruction: '' }
  }, [viewMode, section, store.selectedCharacterId, store.selectedLocationId, store.chapters])

  const databaseContent = {
    dashboard:    <ProjectDashboard store={store} />,
    outline:      <StoryOutline store={store} />,
    characters:   <Characters store={store} />,
    relationships: <RelationshipMap store={store} />,
    familytree:   <FamilyTree store={store} />,
    factions:     <Factions store={store} />,
    locations:    <Locations store={store} />,
    lore:         <Lore store={store} />,
    ideas:        <IdeasKanban store={store} userId={userId} membership={membership} />,
    schedule:     <ScheduleCalendar store={store} />,
    timeline:     <Timeline store={store} />,
    worldhistory: <WorldHistory store={store} />,
    map:          <MapBuilder store={store} />,
    aitools:           <AITools store={store} userId={userId} membership={membership} />,
    characterbuilder:  <CharacterBuilder store={store} />,
  }

  const activeSection = planningSections.find(s => s.id === section) || planningSections[0]
  const availableSectionIds = new Set(planningSections.map(s => s.id))
  const isTtrpgType = ['tabletop_rpg', 'dnd_campaign'].includes(store.activeNovel?.type)
  const visibleRooms = STUDIO_ROOMS
    .filter(room => !room.ttrpgOnly || isTtrpgType)
    .map(room => ({ ...room, sections: room.sections.filter(id => availableSectionIds.has(id)) }))
    .filter(room => room.sections.length > 0)

  const activeRoom = viewMode === 'writing'
    ? { id: 'manuscript', label: 'Manuscript', sections: [] }
    : visibleRooms.find(room => room.sections.includes(section)) || visibleRooms[0]

  const activeRoomSections = activeRoom?.id === 'manuscript'
    ? []
    : planningSections.filter(s => activeRoom?.sections.includes(s.id))

  const openRoom = (room) => {
    if (room.locked) {
      openUpgradePage()
      return
    }
    resetStudioIndex()
    setViewMode('planning')
    if (!room.sections.includes(section)) setSection(room.sections[0])
  }

  const roomNav = visibleRooms.map(room => ({
    ...room,
    locked: room.sections.length > 0 && room.sections.every(isSectionLockedForFree),
    icon: <Icon name={room.icon} />,
    description: room.sections.map(id => ALL_SECTIONS.find(s => s.id === id)?.label).filter(Boolean).join(' · '),
  }))

  const renderLockedFeature = (featureName, body) => (
    <div className="workspace-page grid h-full place-items-center p-6">
      <StudioEmpty
        title={`${featureName} is included in paid plans`}
        body={body}
        action={<StudioButton tone="primary" onClick={openUpgradePage}>View plans</StudioButton>}
      />
    </div>
  )

  return (
    <>
      <StudioFrame
        projectTitle={store.activeNovel?.title || 'Draft'}
        projectType={projectTypeLabel}
        rooms={roomNav}
        activeRoomId={activeRoom?.id}
        onOpenRoom={openRoom}
        onGoHome={onGoHome}
        account={<UserMenu onOpenAccount={onOpenAccount} onOpenHelp={onOpenHelp} onOpenLegal={onOpenLegal} onOpenAbout={onOpenAbout} />}
        primaryAction={(
          <StudioButton
            tone={viewMode === 'writing' ? 'primary' : 'secondary'}
            size="md"
            className="studio-write-button"
            onClick={() => {
              resetStudioIndex()
              setViewMode('writing')
            }}
          >
            Write
          </StudioButton>
        )}
        topBar={null}
        utilityContent={(
          <div className="studio-utility-btns">
            {localModeBubble && (
              <button
                type="button"
                className="local-mode-bubble"
                onClick={localModeBubble.onOpenSettings}
                title={localModeBubble.message}
                aria-label={`${localModeBubble.label}. ${localModeBubble.message}`}
              >
                <span aria-hidden="true">!</span>
                <span>{localModeBubble.label}</span>
              </button>
            )}
            {tourStore?.toursEnabled && activeSectionTour && (
              <button
                className="studio-utility-btn library-tour-button"
                onClick={() => setOpenSectionTourId(activeSectionTourId)}
                aria-label="Tour this section"
                title="Tour this section"
              >
                <span>?</span>
              </button>
            )}
            <button
              className={`studio-utility-btn${projectSettingsOpen ? ' is-active' : ''}`}
              onClick={() => setProjectSettingsOpen(v => !v)}
              aria-label="Project settings"
              aria-pressed={projectSettingsOpen}
            >
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span aria-hidden="true">Project Settings</span>
            </button>
            {seriesContext && onOpenSeries ? (
              <button
                className="studio-utility-btn"
                onClick={onOpenSeries}
                aria-label={`Back to ${seriesContext.name}`}
                title={`Back to ${seriesContext.name}`}
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span aria-hidden="true" style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seriesContext.name}</span>
              </button>
            ) : (
              <button
                className="studio-utility-btn"
                onClick={() => store.setActiveNovelId(null)}
                aria-label="Back to projects"
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span aria-hidden="true">Exit</span>
              </button>
            )}
          </div>
        )}
        contextRail={null}
      >
        <StudioWorkspace
          eyebrow={viewMode === 'writing' ? 'Writing' : 'Reference'}
          title={activeRoom?.label || activeSection?.label}
          meta={viewMode === 'writing' ? projectTypeCfg.writingTab : (activeSection?.label !== activeRoom?.label ? activeSection?.label : undefined)}
          roomId={section === 'map' ? 'atlas-map' : activeRoom?.id}
          actions={null}
          tabs={viewMode === 'planning' && activeRoomSections.length > 1 ? (
            <>
              {activeRoomSections.map(s => (
                <StudioTab
                  key={s.id}
                  onClick={() => {
                    if (isSectionLockedForFree(s.id)) {
                      openUpgradePage()
                      return
                    }
                    resetStudioIndex()
                    setSection(s.id)
                  }}
                  active={section === s.id}
                  className={isSectionLockedForFree(s.id) ? 'is-locked' : ''}
                  >
                  <span><Icon name={s.icon} size={14} /></span>
                  <span>{s.label}{isSectionLockedForFree(s.id) ? ' · Locked' : ''}</span>
                </StudioTab>
              ))}
            </>
          ) : null}
          footer={
            <AIAssistant store={store} section={section === 'map' ? 'atlas' : (viewMode === 'writing' ? 'manuscript' : section)} onOpenChat={() => setAiOpen(v => !v)} aiOpen={aiOpen} userId={userId} membership={membership} />
          }
        >
          <div className="h-full overflow-hidden" style={{ position: 'relative' }}>
            {/* AI Tools stays mounted so analyses survive navigation */}
            <div style={{ position: 'absolute', inset: 0, display: viewMode === 'planning' && section === 'aitools' ? 'block' : 'none', zIndex: 1 }}>
              <SectionErrorBoundary key="aitools">
                <AITools store={store} userId={userId} membership={membership} />
              </SectionErrorBoundary>
            </div>

            {viewMode === 'planning' && section !== 'aitools' ? (
              <SectionErrorBoundary key={section}>
                {isSectionLockedForFree(section) ? (
                  renderLockedFeature(
                    section === 'map' ? 'Map Builder' : 'AI Tools',
                    section === 'map'
                      ? 'Free is a text-first workspace. Upgrade to create and edit maps for your worlds and campaigns.'
                      : 'Upgrade to unlock project-aware analysis, character interviews, and story consistency tools.'
                  )
                ) : section === 'map' && isMobileViewport ? (
                  <div className="workspace-page grid h-full place-items-center p-6">
                    <StudioEmpty
                      title="Map Builder is desktop-only"
                      body="Open this project on a tablet or desktop to create and edit maps. Locations remain available on mobile."
                    />
                  </div>
                ) : (
                  databaseContent[section] || databaseContent['characters']
                )}
              </SectionErrorBoundary>
            ) : viewMode === 'writing' ? (
              <SectionErrorBoundary key="manuscript">
                <Manuscript store={store} userId={userId} membership={membership} />
              </SectionErrorBoundary>
            ) : null}
          </div>
        </StudioWorkspace>
      </StudioFrame>

      {projectSettingsOpen && (
        <ProjectSettings
          store={store}
          onClose={() => setProjectSettingsOpen(false)}
        />
      )}

      <AIPanel store={store} open={aiOpen} onClose={() => setAiOpen(false)} initialContext={initialContext} membership={membership} userId={userId} />

      {tourStore?.toursEnabled && openSectionTourId === activeSectionTourId && activeSectionTour && (
        <OnboardingTour
          key={activeSectionTourId}
          steps={activeSectionTour}
          onFinish={() => {
            setOpenSectionTourId(null)
            tourStore?.markTourComplete(activeSectionTourId)
          }}
          onSkip={() => { setOpenSectionTourId(null); tourStore?.markTourComplete(activeSectionTourId) }}
        />
      )}
    </>
  )
}
