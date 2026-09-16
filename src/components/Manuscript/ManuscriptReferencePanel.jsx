import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getScheduleCalendar, monthName } from '../../utils/scheduleCalendar'

const TYPE_CONFIG = {
  character: { label: 'Characters', singular: 'Character', section: 'characters' },
  location: { label: 'Locations', singular: 'Location', section: 'locations' },
  lore: { label: 'Lore', singular: 'Lore', section: 'lore' },
  faction: { label: 'Factions', singular: 'Faction', section: 'factions' },
  timeline: { label: 'Timeline', singular: 'Timeline', section: 'timeline' },
  history: { label: 'History', singular: 'History', section: 'worldhistory' },
  idea: { label: 'Ideas', singular: 'Idea', section: 'ideas' },
  schedule: { label: 'Schedule', singular: 'Schedule', section: 'schedule' },
  rpg: { label: 'Party', singular: 'Party', section: 'characterbuilder' },
}

const DETAIL_SKIP_KEYS = new Set([
  'id',
  'novelId',
  'syncRootId',
  'syncSourceId',
  'syncHiddenInIds',
  'syncDeleted',
  'createdAt',
  'updatedAt',
  'order',
  'image',
  'portraitPosition',
  'portraitZoom',
  'logo',
  'aiExpanded',
])

const compact = value => String(value || '').replace(/\s+/g, ' ').trim()

function summarize(parts) {
  return parts.map(compact).filter(Boolean).join(' - ')
}

function formatScheduleDate(event, activeNovel) {
  const calendar = getScheduleCalendar(activeNovel)
  const month = Number(event.month) || 1
  const day = Number(event.day) || 1
  const year = Number(event.year) || 1
  return `${monthName(calendar, month)}, Day ${day}, Year ${year}`
}

function buildEntries({
  activeNovel,
  characters = [],
  locations = [],
  loreEntries = [],
  factions = [],
  timeline = [],
  worldHistory = [],
  ideaEntries = [],
  storySchedule = [],
  rpgCharacters = [],
}) {
  return [
    ...characters.map(item => ({
      id: `character:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'character',
      title: item.name || 'Unnamed character',
      kicker: summarize([item.role, item.status, item.species]),
      body: summarize([item.description, item.backstory, item.notes, item.internalGoal, item.externalGoal]),
      tags: [...(item.keywords || []), ...(item.tags || [])],
      section: 'characters',
    })),
    ...locations.map(item => ({
      id: `location:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'location',
      title: item.name || 'Unnamed location',
      kicker: item.category || 'Location',
      body: item.description || '',
      tags: item.tags || [],
      section: 'locations',
    })),
    ...loreEntries.map(item => ({
      id: `lore:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'lore',
      title: item.title || 'Untitled lore',
      kicker: item.category || 'Lore',
      body: item.content || item.description || '',
      tags: item.tags || [],
      section: 'lore',
    })),
    ...factions.map(item => ({
      id: `faction:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'faction',
      title: item.name || 'Unnamed faction',
      kicker: 'Faction',
      body: item.description || '',
      tags: item.tags || [],
      section: 'factions',
    })),
    ...timeline.map(item => ({
      id: `timeline:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'timeline',
      title: item.title || 'Untitled event',
      kicker: summarize([item.startYear != null ? String(item.startYear) : item.date, item.era]),
      body: item.description || item.content || '',
      tags: item.tags || [],
      section: 'timeline',
    })),
    ...worldHistory.map(item => ({
      id: `history:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'history',
      title: item.title || 'Untitled history entry',
      kicker: summarize([item.startYear != null ? String(item.startYear) : item.date, item.era]),
      body: item.description || item.content || '',
      tags: item.tags || [],
      section: 'worldhistory',
    })),
    ...ideaEntries.map(item => ({
      id: `idea:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'idea',
      title: item.title || 'Untitled idea',
      kicker: item.status ? `${item.status[0].toUpperCase()}${item.status.slice(1)}` : 'Idea',
      body: item.body || item.description || '',
      tags: item.tags || [],
      section: 'ideas',
    })),
    ...storySchedule.map(item => ({
      id: `schedule:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'schedule',
      title: item.title || 'Untitled schedule event',
      kicker: formatScheduleDate(item, activeNovel),
      body: item.description || '',
      tags: item.tags || [],
      section: 'schedule',
    })),
    ...rpgCharacters.map(item => ({
      id: `rpg:${item.id}`,
      rawId: item.id,
      raw: item,
      type: 'rpg',
      title: item.name || 'Unnamed adventurer',
      kicker: summarize([item.class, item.race, item.level ? `Level ${item.level}` : '']),
      body: summarize([item.background, item.notes, item.personalityTraits, item.ideals, item.bonds, item.flaws]),
      tags: item.tags || [],
      section: 'characterbuilder',
    })),
  ].sort((a, b) => a.title.localeCompare(b.title))
}

function includesText(entry, query) {
  if (!query) return true
  const haystack = [
    entry.title,
    entry.kicker,
    entry.body,
    ...(entry.tags || []),
    TYPE_CONFIG[entry.type]?.singular,
  ].join(' ').toLowerCase()
  return haystack.includes(query)
}

function labelForKey(key) {
  return key
    .replace(/Ids$/, 's')
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, char => char.toUpperCase())
}

function isRenderableValue(value) {
  if (value == null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function lookupNames(ids, items, field = 'name') {
  return (ids || [])
    .map(id => items.find(item => item.id === id)?.[field])
    .filter(Boolean)
}

function stringifyValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function RenderValue({ value }) {
  if (Array.isArray(value)) {
    const primitiveValues = value.filter(item => typeof item !== 'object' || item == null)
    const objectValues = value.filter(item => item && typeof item === 'object')
    return (
      <div className="ms-reference-value-stack">
        {primitiveValues.length > 0 && <p>{primitiveValues.map(stringifyValue).join(', ')}</p>}
        {objectValues.map((item, index) => (
          <div key={index} className="ms-reference-nested-card">
            {Object.entries(item)
              .filter(([, nestedValue]) => isRenderableValue(nestedValue))
              .map(([nestedKey, nestedValue]) => (
                <div key={nestedKey}>
                  <dt>{labelForKey(nestedKey)}</dt>
                  <dd><RenderValue value={nestedValue} /></dd>
                </div>
              ))}
          </div>
        ))}
      </div>
    )
  }

  if (value && typeof value === 'object') {
    return (
      <dl className="ms-reference-nested-list">
        {Object.entries(value)
          .filter(([, nestedValue]) => isRenderableValue(nestedValue))
          .map(([nestedKey, nestedValue]) => (
            <div key={nestedKey}>
              <dt>{labelForKey(nestedKey)}</dt>
              <dd><RenderValue value={nestedValue} /></dd>
            </div>
          ))}
      </dl>
    )
  }

  return <p>{stringifyValue(value)}</p>
}

function detailFields(entry) {
  return Object.entries(entry.raw || {})
    .filter(([key, value]) => !DETAIL_SKIP_KEYS.has(key) && isRenderableValue(value))
    .map(([key, value]) => ({ key, label: labelForKey(key), value }))
}

function linkedRows(entry, { characters = [], locations = [], loreEntries = [], factions = [] }) {
  const raw = entry.raw || {}
  const rows = [
    { label: 'Characters', values: lookupNames(raw.characterIds || raw.linkedCharacters || raw.parentIds || raw.childIds, characters) },
    { label: 'Locations', values: lookupNames(raw.locationIds || raw.linkedLocations, locations) },
    { label: 'Lore', values: lookupNames(raw.loreIds, loreEntries, 'title') },
    { label: 'Faction', values: lookupNames(raw.factionId ? [raw.factionId] : [], factions) },
    { label: 'Ideas', values: raw.linkedIdeas || [] },
  ]
  return rows.filter(row => row.values.length > 0)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function ReferenceModal({ entry, context, activeTab, onSetTab, onClose, onCopy, onOpenEntry }) {
  const windowRef = useRef(null)
  const dragRef = useRef(null)
  const [position, setPosition] = useState(null)

  useEffect(() => {
    if (!entry) return undefined
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entry, onClose])

  useEffect(() => {
    if (!entry) return undefined
    const onPointerMove = event => {
      const drag = dragRef.current
      if (!drag) return
      const maxLeft = Math.max(8, window.innerWidth - drag.width - 8)
      const maxTop = Math.max(8, window.innerHeight - drag.height - 8)
      setPosition({
        left: clamp(event.clientX - drag.offsetX, 8, maxLeft),
        top: clamp(event.clientY - drag.offsetY, 8, maxTop),
      })
    }
    const onPointerUp = () => {
      dragRef.current = null
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      document.body.style.userSelect = ''
    }
  }, [entry])

  const startDrag = useCallback(event => {
    if (event.target.closest('button')) return
    const rect = windowRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    }
    document.body.style.userSelect = 'none'
    setPosition({ left: rect.left, top: rect.top })
  }, [])

  if (!entry) return null
  const config = TYPE_CONFIG[entry.type]
  const fields = detailFields(entry)
  const links = linkedRows(entry, context)
  const tabs = [
    { id: 'overview', label: 'Overview' },
    fields.length ? { id: 'details', label: 'Details' } : null,
    (entry.tags?.length || links.length) ? { id: 'links', label: 'Links' } : null,
  ].filter(Boolean)
  const visibleTab = tabs.some(tab => tab.id === activeTab) ? activeTab : 'overview'

  return (
    <div className="ms-reference-float-layer">
      <section
        ref={windowRef}
        className={`ms-reference-modal${position ? ' is-positioned' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label={`${entry.title} reference`}
        style={position ? { left: position.left, top: position.top } : undefined}
      >
        <header className="ms-reference-modal-header" onPointerDown={startDrag}>
          <div>
            <span className={`ms-reference-badge type-${entry.type}`}>{config.singular}</span>
            <h3>{entry.title}</h3>
            {entry.kicker && <p>{entry.kicker}</p>}
          </div>
          <button type="button" className="ms-reference-modal-close" onClick={onClose} aria-label="Close reference">×</button>
        </header>

        <div className="ms-reference-modal-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={visibleTab === tab.id ? 'is-active' : ''}
              onClick={() => onSetTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ms-reference-modal-content">
          {visibleTab === 'overview' && (
            <div className="ms-reference-modal-overview">
              <p>{entry.body || 'No overview has been added yet.'}</p>
              {entry.tags?.length > 0 && (
                <div className="ms-reference-tags">
                  {entry.tags.map(tag => <span key={tag}>#{tag}</span>)}
                </div>
              )}
            </div>
          )}

          {visibleTab === 'details' && (
            <dl className="ms-reference-field-list">
              {fields.map(field => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd><RenderValue value={field.value} /></dd>
                </div>
              ))}
            </dl>
          )}

          {visibleTab === 'links' && (
            <div className="ms-reference-link-list">
              {links.map(row => (
                <section key={row.label}>
                  <h4>{row.label}</h4>
                  <div className="ms-reference-tags">
                    {row.values.map(value => <span key={value}>{value}</span>)}
                  </div>
                </section>
              ))}
              {entry.tags?.length > 0 && (
                <section>
                  <h4>Tags</h4>
                  <div className="ms-reference-tags">
                    {entry.tags.map(tag => <span key={tag}>#{tag}</span>)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <footer className="ms-reference-modal-actions">
          <button type="button" onClick={() => onCopy(entry)}>Copy name</button>
          <button type="button" className="is-primary" onClick={() => onOpenEntry?.(entry)}>Open full entry</button>
        </footer>
      </section>
    </div>
  )
}

export default function ManuscriptReferencePanel({
  activeNovel,
  characters,
  locations,
  loreEntries,
  factions,
  timeline,
  worldHistory,
  ideaEntries,
  storySchedule,
  rpgCharacters,
  onOpenEntry,
}) {
  const [query, setQuery] = useState('')
  const [activeType, setActiveType] = useState('all')
  const [modalEntry, setModalEntry] = useState(null)
  const [modalTab, setModalTab] = useState('overview')

  const entries = useMemo(() => buildEntries({
    activeNovel,
    characters,
    locations,
    loreEntries,
    factions,
    timeline,
    worldHistory,
    ideaEntries,
    storySchedule,
    rpgCharacters,
  }), [activeNovel, characters, locations, loreEntries, factions, timeline, worldHistory, ideaEntries, storySchedule, rpgCharacters])

  const counts = useMemo(() => entries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1
    return acc
  }, {}), [entries])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = entries.filter(entry =>
    (activeType === 'all' || entry.type === activeType) && includesText(entry, normalizedQuery)
  )

  const typeButtons = Object.entries(TYPE_CONFIG).filter(([type]) => counts[type] > 0)

  const copyTitle = async entry => {
    try {
      await navigator.clipboard?.writeText(entry.title)
    } catch {
      // Clipboard access can be unavailable in local/offline contexts.
    }
  }

  return (
    <div className="ms-reference-panel">
      <div className="ms-reference-search-row">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          className="ms-reference-search"
          placeholder="Search project references..."
          aria-label="Search project references"
        />
      </div>

      <div className="ms-reference-type-strip" aria-label="Reference filters">
        <button
          type="button"
          className={`ms-reference-type${activeType === 'all' ? ' is-active' : ''}`}
          onClick={() => setActiveType('all')}
        >
          All <span>{entries.length}</span>
        </button>
        {typeButtons.map(([type, config]) => (
          <button
            key={type}
            type="button"
            className={`ms-reference-type${activeType === type ? ' is-active' : ''}`}
            onClick={() => setActiveType(type)}
          >
            {config.label} <span>{counts[type]}</span>
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <div className="ms-reference-empty">
          Add characters, locations, lore, ideas, or schedule entries elsewhere in the project and they will appear here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="ms-reference-empty">No matching references.</div>
      ) : (
        <div className="ms-reference-body">
          <div className="ms-reference-list">
            {filtered.map(entry => {
              const config = TYPE_CONFIG[entry.type]
              return (
                <article key={entry.id} className="ms-reference-card">
                  <button
                    type="button"
                    className="ms-reference-card-main"
                    onClick={() => { setModalEntry(entry); setModalTab('overview') }}
                  >
                    <span className={`ms-reference-badge type-${entry.type}`}>{config.singular}</span>
                    <strong>{entry.title}</strong>
                    {entry.kicker && <span className="ms-reference-kicker">{entry.kicker}</span>}
                    {entry.body && <p>{entry.body}</p>}
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      )}

      <ReferenceModal
        key={modalEntry?.id || 'no-reference-window'}
        entry={modalEntry}
        context={{ characters, locations, loreEntries, factions }}
        activeTab={modalTab}
        onSetTab={setModalTab}
        onClose={() => setModalEntry(null)}
        onCopy={copyTitle}
        onOpenEntry={entry => {
          setModalEntry(null)
          onOpenEntry?.(entry)
        }}
      />
    </div>
  )
}
