import { useState, useMemo, useEffect } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'

const INPUT = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'

const SUGGESTED_CATEGORIES = ['Magic System', 'Religion', 'History', 'Politics', 'Geography', 'Culture', 'Technology', 'Prophecy', 'Mythology', 'Other']

function EntryForm({ entry, onSave, onCancel, characters, locations, existingCategories, existingTags, configuredCategories }) {
  const [form, setForm] = useState({
    title: entry?.title || '',
    category: entry?.category || '',
    content: entry?.content || '',
    characterIds: entry?.characterIds || [],
    locationIds: entry?.locationIds || [],
    tags: entry?.tags || [],
  })
  const [tagInput, setTagInput] = useState('')

  const allCategories = useMemo(
    () => [...new Set([...(configuredCategories?.length ? configuredCategories : SUGGESTED_CATEGORIES), ...existingCategories])],
    [configuredCategories, existingCategories],
  )
  const toggleArray = (field, id) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(id) ? prev[field].filter(x => x !== id) : [...prev[field], id],
    }))
  }
  const addTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().replace(/^#/, '').replace(/,$/, '')
      if (tag && !form.tags.includes(tag)) setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }))
      setTagInput('')
    }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); onSave({ ...form, category: form.category.trim() }) }} className="space-y-4 text-left">
      <div>
        <label className={LABEL}>Title</label>
        <input className={INPUT} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. The Binding Laws" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Category</label>
          <input className={INPUT} list="lore-categories" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Magic System" />
          <datalist id="lore-categories">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className={LABEL}>Tags</label>
          <input className={INPUT} list="lore-tags" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={addTag} placeholder="Type a tag and press Enter" />
          <datalist id="lore-tags">{existingTags.map(t => <option key={t} value={t} />)}</datalist>
        </div>
      </div>

      {form.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {form.tags.map(tag => (
            <span key={tag} className="chip chip-accent">
              #{tag}
              <button type="button" onClick={() => setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))}>×</button>
            </span>
          ))}
        </div>
      )}

      <div>
        <label className={LABEL}>Content</label>
        <textarea className={INPUT + ' resize-none h-48'} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="Describe this aspect of your world..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <LinkPicker title="Linked Characters" items={characters} selected={form.characterIds} getLabel={c => c.name} onToggle={id => toggleArray('characterIds', id)} />
        <LinkPicker title="Linked Locations" items={locations} selected={form.locationIds} getLabel={l => l.name} onToggle={id => toggleArray('locationIds', id)} />
      </div>

      <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
        <button type="submit" className="btn btn-primary flex-1 justify-center">Save Entry</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-main)]">Cancel</button>
      </div>
    </form>
  )
}

function LinkPicker({ title, items, selected, getLabel, onToggle }) {
  return (
    <div>
      <label className={LABEL}>{title}</label>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">None yet.</p>
      ) : (
        <div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
          {items.map(item => {
            const active = selected.includes(item.id)
            return (
              <button key={item.id} type="button" onClick={() => onToggle(item.id)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-[var(--accent-fade)] border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                {item.image && <img src={item.image} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />}
                {active && <span>✓</span>}{getLabel(item)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function collectTags(store) {
  return [
    ...(store.loreEntries || []).flatMap(e => e.tags || []),
    ...(store.ideaEntries || []).flatMap(e => e.tags || []),
    ...(store.locations || []).flatMap(e => e.tags || []),
    ...(store.worldHistory || []).flatMap(e => e.tags || []),
    ...(store.timeline || []).flatMap(e => e.tags || []),
    ...(store.characters || []).flatMap(e => e.keywords || []),
  ]
}

function tagMatches(tag, store) {
  const same = (value) => value?.toLowerCase() === tag.toLowerCase()
  return [
    ...(store.loreEntries || []).filter(e => e.tags?.some(same)).map(e => ({ type: 'Lore', title: e.title, section: 'lore', id: e.id })),
    ...(store.ideaEntries || []).filter(e => e.tags?.some(same)).map(e => ({ type: 'Idea', title: e.title, section: 'ideas', id: e.id })),
    ...(store.locations || []).filter(e => e.tags?.some(same)).map(e => ({ type: 'Location', title: e.name, section: 'locations', id: e.id })),
    ...(store.characters || []).filter(e => e.keywords?.some(same)).map(e => ({ type: 'Character', title: e.name, section: 'characters', id: e.id })),
    ...(store.worldHistory || []).filter(e => e.tags?.some(same)).map(e => ({ type: 'History', title: e.title, section: 'worldhistory', id: e.id })),
    ...(store.timeline || []).filter(e => e.tags?.some(same)).map(e => ({ type: 'Timeline', title: e.title, section: 'timeline', id: e.id })),
  ]
}

export default function Lore({ store }) {
  const {
    loreEntries, addLoreEntry, updateLoreEntry, deleteLoreEntry,
    characters, locations, selectedLoreEntryId, setSelectedLoreEntryId,
  } = store
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [tagFilter, setTagFilter] = useState('')
  const [sortBy, setSortBy] = useState('title-asc')
  const [collapsed, setCollapsed] = useState({})
  const [editing, setEditing] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const configuredCategories = store.activeNovel?.categoryOptions?.lore || SUGGESTED_CATEGORIES

  const selected = loreEntries.find(e => e.id === selectedLoreEntryId) ?? null

  useEffect(() => {
    if (selectedLoreEntryId && !loreEntries.find(e => e.id === selectedLoreEntryId)) {
      setSelectedLoreEntryId(null)
    }
  }, [loreEntries, selectedLoreEntryId, setSelectedLoreEntryId])

  const existingCategories = useMemo(() => [...new Set(loreEntries.map(e => e.category).filter(Boolean))].sort(), [loreEntries])
  const existingTags = useMemo(() => [...new Set(collectTags(store).filter(Boolean))].sort(), [store])

  const grouped = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = loreEntries.filter(e => {
      const matchesText = !q || e.title.toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q) || (e.content || '').toLowerCase().includes(q) || e.tags?.some(t => t.toLowerCase().includes(q))
      const matchesCategory = categoryFilter === 'All' || (e.category || 'Uncategorized') === categoryFilter
      const matchesTag = !tagFilter || e.tags?.some(t => t.toLowerCase() === tagFilter.toLowerCase())
      return matchesText && matchesCategory && matchesTag
    })
    const sorter = (a, b) => {
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title)
      if (sortBy === 'title-desc') return b.title.localeCompare(a.title)
      return 0
    }
    const groups = filtered.reduce((acc, entry) => {
      const cat = entry.category || 'Uncategorized'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(entry)
      return acc
    }, {})
    Object.keys(groups).forEach(cat => groups[cat].sort(sorter))
    if (sortBy === 'category-asc') return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)))
    if (sortBy === 'category-desc') return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)))
    return groups
  }, [loreEntries, search, categoryFilter, tagFilter, sortBy])

  const handleNew = () => {
    setEditTarget(null)
    setEditing(true)
    setSelectedLoreEntryId(null)
  }
  const handleSave = (data) => {
    if (editTarget) {
      const entry = updateLoreEntry(editTarget.id, data)
      setSelectedLoreEntryId(entry?.id || editTarget.id)
    } else {
      const entry = addLoreEntry(data)
      setSelectedLoreEntryId(entry.id)
    }
    setEditing(false)
    setEditTarget(null)
  }
  const jumpTo = (match) => {
    if (match.section === 'characters') store.setSelectedCharacterId(match.id)
    if (match.section === 'locations') store.setSelectedLocationId(match.id)
    if (match.section === 'lore') store.setSelectedLoreEntryId(match.id)
    if (match.section === 'ideas') store.setSelectedIdeaEntryId(match.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: match.section } }))
  }

  return (
    <StudioSplit>
      <StudioIndex
        eyebrow="Lore wall"
        title="Notebook"
        tools={<StudioButton tone="primary" size="sm" onClick={handleNew}>New</StudioButton>}
      >
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lore..." className="field w-full px-2 py-1.5 text-xs placeholder:text-[var(--text-muted)]" />
          <div className="grid grid-cols-2 gap-2">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="field px-2 py-1.5 text-xs">
              <option>All</option>
              <option>Uncategorized</option>
              {existingCategories.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="field px-2 py-1.5 text-xs">
              <option value="">All Tags</option>
              {existingTags.map(t => <option key={t} value={t}>#{t}</option>)}
            </select>
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="field w-full px-2 py-1.5 text-xs">
            <option value="title-asc">Title A→Z</option>
            <option value="title-desc">Title Z→A</option>
            <option value="category-asc">Category A→Z</option>
            <option value="category-desc">Category Z→A</option>
          </select>

          {Object.keys(grouped).length === 0 && <p className="text-xs text-[var(--text-muted)] italic px-4 py-3">{search || tagFilter || categoryFilter !== 'All' ? 'No results.' : 'No lore entries yet.'}</p>}
          {Object.entries(grouped).map(([cat, entries]) => (
            <div key={cat} className="mb-2">
              <button onClick={() => setCollapsed(p => ({ ...p, [cat]: !p[cat] }))} className="w-full px-3 py-1.5 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--accent)] opacity-80">
                <span>{cat} ({entries.length})</span>
                <span>{collapsed[cat] ? '+' : '-'}</span>
              </button>
              {!collapsed[cat] && entries.map(entry => (
                <StudioRecord key={entry.id} onClick={() => { setSelectedLoreEntryId(entry.id); setEditing(false) }} active={selectedLoreEntryId === entry.id}>
                  <div className="text-sm font-medium text-[var(--text-main)] truncate">{entry.title}</div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] mt-0.5">
                    {entry.tags?.length > 0 && <span>{entry.tags.length} tag{entry.tags.length === 1 ? '' : 's'}</span>}
                    {entry.characterIds?.length > 0 && <span>{entry.characterIds.length} character{entry.characterIds.length === 1 ? '' : 's'}</span>}
                  </div>
                </StudioRecord>
              ))}
            </div>
          ))}
      </StudioIndex>

      <StudioDetail>
        {selected ? (
          <div className="max-w-4xl">
            <StudioPageHeader
              eyebrow="Lore entry"
              title={selected.title}
              actions={(
                <>
                  <StudioButton tone="secondary" size="sm" onClick={() => { setEditTarget(selected); setEditing(true) }}>Edit</StudioButton>
                  <StudioButton tone="secondary" size="sm" onClick={() => {
                    if (!confirm(`Delete "${selected.title}"?`)) return
                    const scope = confirm('Delete this lore entry from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
                    deleteLoreEntry(selected.id, { scope })
                  }}>Delete</StudioButton>
                </>
              )}
            >
                <div className="flex flex-wrap gap-2 mt-3">
                  {selected.category && <span className="chip chip-accent">{selected.category}</span>}
                  {selected.tags?.map(tag => (
                    <button key={tag} onClick={() => setTagFilter(tag)} className="chip hover:text-[var(--accent)] hover:border-[var(--accent)]">#{tag}</button>
                  ))}
                </div>
            </StudioPageHeader>

            <div className="border-t border-[var(--border)] pt-8 space-y-8">
              <StudioNote className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed text-lg">{selected.content || <span className="italic text-[var(--text-muted)]">No content yet.</span>}</StudioNote>

              {(selected.characterIds?.length > 0 || selected.locationIds?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  <LinkedItems title="Linked Characters" ids={selected.characterIds || []} items={characters} getLabel={c => c.name} onOpen={id => jumpTo({ section: 'characters', id })} />
                  <LinkedItems title="Linked Locations" ids={selected.locationIds || []} items={locations} getLabel={l => l.name} onOpen={id => jumpTo({ section: 'locations', id })} />
                </div>
              )}

              {selected.tags?.length > 0 && (
                <div>
                  <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Related By Tag</h3>
                  <div className="space-y-3">
                    {selected.tags.map(tag => {
                      const matches = tagMatches(tag, store).filter(m => !(m.section === 'lore' && m.id === selected.id))
                      return (
                        <div key={tag} className="space-y-2">
                          <button onClick={() => setTagFilter(tag)} className="text-xs text-[var(--accent)] font-bold">#{tag}</button>
                          <div className="flex flex-wrap gap-2">
                            {matches.length === 0 && <span className="text-xs text-[var(--text-muted)]">No other matches yet.</span>}
                            {matches.map(match => (
                              <button key={`${tag}-${match.section}-${match.id}`} onClick={() => jumpTo(match)} className="text-xs border border-[var(--border)] rounded px-2 py-1 text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]">
                                {match.type}: {match.title}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <StudioEmpty title="Select a notebook page" body="Choose an entry or pin a new piece of lore." action={<StudioButton tone="primary" className="mt-4" onClick={handleNew}>New Lore Entry</StudioButton>} />
        )}
      </StudioDetail>

      {editing && (
        <Modal
          title={editTarget ? `Edit: ${editTarget.title}` : 'New Lore Entry'}
          onClose={() => { setEditing(false); setEditTarget(null) }}
          wide
          centered
        >
          <EntryForm
            entry={editTarget}
            onSave={handleSave}
            onCancel={() => { setEditing(false); setEditTarget(null) }}
            characters={characters}
            locations={locations}
            existingCategories={existingCategories}
            existingTags={existingTags}
            configuredCategories={configuredCategories}
          />
        </Modal>
      )}
    </StudioSplit>
  )
}

function LinkedItems({ title, ids, items, getLabel, onOpen }) {
  const linked = ids.map(id => items.find(item => item.id === id)).filter(Boolean)
  if (linked.length === 0) return null
  return (
    <div>
      <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {linked.map(item => (
          <button key={item.id} onClick={() => onOpen(item.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-fade)] border border-[var(--accent)]/30 text-[var(--accent)] hover:opacity-80 transition-opacity">
            {item.image && <img src={item.image} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />}
            {getLabel(item)}
          </button>
        ))}
      </div>
    </div>
  )
}
