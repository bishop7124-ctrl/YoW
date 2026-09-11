import { useState, useMemo, useId } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import { buildLoreTagIndex, createLoreReferenceIndex, groupLoreEntries, loreCategory, loreTagKey, loreTagLabel, normalizeLoreEntry, normalizeLoreTags, relatedLoreFor } from '../../utils/loreEntries'
import { UserMediaImage } from '../shared/UserMedia'

const INPUT = 'field w-full px-3 py-2 text-base placeholder:text-[var(--text-muted)]'
const LABEL = 'block form-label mb-1.5'

const SUGGESTED_CATEGORIES = ['Magic System', 'Religion', 'History', 'Politics', 'Geography', 'Culture', 'Technology', 'Prophecy', 'Mythology', 'Other']

function EntryForm({ entry, onSave, onCancel, characters, locations, loreEntries, existingCategories, existingTags, configuredCategories }) {
  const fieldId = useId()
  const [form, setForm] = useState(() => {
    const { title, category, content, characterIds, locationIds, loreIds, tags } = normalizeLoreEntry(entry || {})
    return { title, category, content, characterIds, locationIds, loreIds, tags }
  })
  const [tagInput, setTagInput] = useState('')
  const [error, setError] = useState('')

  const allCategories = useMemo(
    () => [...new Set([...(Array.isArray(configuredCategories) && configuredCategories.length ? configuredCategories : SUGGESTED_CATEGORIES), ...existingCategories].map(String).map(value => value.trim()).filter(Boolean))],
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
      const tag = loreTagLabel(tagInput.replace(/,$/, ''))
      if (tag) setForm(prev => ({ ...prev, tags: normalizeLoreTags([...prev.tags, tag]) }))
      setTagInput('')
    }
  }

  return (
    <form data-confirms-save onChange={() => setError('')} onSubmit={e => {
      e.preventDefault()
      if (!form.title.trim()) { setError('Enter a title for this lore entry.'); return }
      const saved = onSave({ ...form, title: form.title.trim(), category: form.category.trim(), tags: normalizeLoreTags([...form.tags, tagInput.replace(/,$/, '')]) })
      if (!saved) setError('This entry could not be saved. Your draft is still here.')
      else e.currentTarget.dispatchEvent(new CustomEvent('studio-form-saved', { bubbles: true }))
    }} className="space-y-4 text-left">
      <div>
        <label htmlFor={`${fieldId}-title`} className={LABEL}>Title</label>
        <input id={`${fieldId}-title`} className={INPUT} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. The Binding Laws" required />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${fieldId}-category`} className={LABEL}>Category</label>
          <input id={`${fieldId}-category`} className={INPUT} list={`${fieldId}-categories`} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Magic System" />
          <datalist id={`${fieldId}-categories`}>{allCategories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor={`${fieldId}-tag`} className={LABEL}>Tags</label>
          <input id={`${fieldId}-tag`} className={INPUT} list={`${fieldId}-tags`} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={addTag} placeholder="Type a tag and press Enter" />
          <datalist id={`${fieldId}-tags`}>{existingTags.map(t => <option key={t} value={t} />)}</datalist>
        </div>
      </div>

      {form.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {form.tags.map(tag => (
            <span key={tag} className="chip chip-accent">
              #{tag}
              <button type="button" data-dirties-form aria-label={`Remove tag ${tag}`} onClick={() => setForm(p => ({ ...p, tags: p.tags.filter(t => t !== tag) }))}>×</button>
            </span>
          ))}
        </div>
      )}

      <div>
        <label htmlFor={`${fieldId}-content`} className={LABEL}>Content</label>
        <textarea id={`${fieldId}-content`} className={INPUT + ' resize-none h-48'} value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="Describe this aspect of your world..." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LinkPicker title="Linked Characters" items={characters} selected={form.characterIds} getLabel={c => c.name} onToggle={id => toggleArray('characterIds', id)} />
        <LinkPicker title="Linked Locations" items={locations} selected={form.locationIds} getLabel={l => l.name} onToggle={id => toggleArray('locationIds', id)} />
      </div>

      <LinkPicker title="Related Lore" items={(loreEntries || []).filter(e => e.id !== entry?.id)} selected={form.loreIds} getLabel={e => e.title} onToggle={id => toggleArray('loreIds', id)} />

      {error && <p role="alert" className="text-sm">{error}</p>}
      <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
        <button type="submit" className="btn btn-primary flex-1 justify-center">Save Entry</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)] hover:text-[var(--text-main)]">Cancel</button>
      </div>
    </form>
  )
}

function LinkPicker({ title, items, selected, getLabel, onToggle }) {
  const selectedIds = useMemo(() => new Set(selected), [selected])
  return (
    <fieldset className="min-w-0">
      <legend className={LABEL}>{title}</legend>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">None yet.</p>
      ) : (
        <div className="panel-soft max-h-32 overflow-y-auto flex flex-wrap gap-2 p-2">
          {items.map(item => {
            const active = selectedIds.has(item.id)
            return (
              <button key={item.id} type="button" data-dirties-form aria-pressed={active} onClick={() => onToggle(item.id)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${active ? 'bg-[var(--accent-fade)] border-[var(--accent)]/40 text-[var(--accent-text)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}>
                {item.image && <UserMediaImage src={item.image} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />}
                {active && <span>✓</span>}{getLabel(item)}
              </button>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}

export default function Lore({ store }) {
  return <LoreWorkspace key={store.activeNovelId || 'lore'} store={store} />
}

function LoreWorkspace({ store }) {
  const {
    loreEntries = [], addLoreEntry, updateLoreEntry, deleteLoreEntry,
    characters = [], locations = [], selectedLoreEntryId, setSelectedLoreEntryId,
    ideaEntries, worldHistory, timeline,
  } = store
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sortBy, setSortBy] = useState('title-asc')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [formState, setFormState] = useState(null)
  const [notice, setNotice] = useState('')
  const editTarget = formState?.entry
  const configuredCategories = store.activeNovel?.categoryOptions?.lore || SUGGESTED_CATEGORIES
  const index = useMemo(() => createLoreReferenceIndex({ loreEntries, characters, locations }), [loreEntries, characters, locations])
  const existingCategories = useMemo(() => [...new Set(index.entries.map(loreCategory))].sort(), [index])
  const tagIndex = useMemo(() => buildLoreTagIndex({ loreEntries, ideaEntries, characters, locations, worldHistory, timeline }), [loreEntries, ideaEntries, characters, locations, worldHistory, timeline])
  const existingTags = useMemo(() => [...tagIndex.values()].map(item => item.label), [tagIndex])
  const loreTags = useMemo(() => normalizeLoreTags(index.entries.flatMap(entry => entry.tags)).sort((a, b) => a.localeCompare(b)), [index])
  const effectiveCategory = existingCategories.includes(categoryFilter) ? categoryFilter : ''
  const effectiveTag = loreTags.find(tag => loreTagKey(tag) === loreTagKey(tagFilter)) || ''
  const grouped = useMemo(() => groupLoreEntries(index.entries, { search, category: effectiveCategory, tag: effectiveTag, sortBy }), [index, search, effectiveCategory, effectiveTag, sortBy])
  const visibleIds = useMemo(() => new Set(grouped.flatMap(([, entries]) => entries.map(entry => entry.id))), [grouped])
  const selected = visibleIds.has(selectedLoreEntryId) ? index.byId.get(selectedLoreEntryId) : null
  const relatedLore = useMemo(() => selected ? relatedLoreFor(selected, index) : null, [selected, index])

  const clearFilters = () => { setSearch(''); setCategoryFilter(''); setTagFilter('') }
  const closeForm = () => setFormState(null)

  const handleNew = () => {
    setNotice('')
    setFormState({ type: 'new' })
  }
  const handleSave = (data) => {
    const entry = editTarget ? updateLoreEntry(editTarget.id, data) : addLoreEntry(data)
    if (!entry) return false
    setSelectedLoreEntryId(entry.id)
    clearFilters()
    setCollapsed(new Set())
    setNotice('')
    closeForm()
    return true
  }
  const jumpTo = (match) => {
    if (formState) return
    if (match.section === 'characters') store.setSelectedCharacterId(match.id)
    if (match.section === 'locations') store.setSelectedLocationId(match.id)
    if (match.section === 'lore') { clearFilters(); setCollapsed(new Set()); store.setSelectedLoreEntryId(match.id) }
    if (match.section === 'ideas') store.setSelectedIdeaEntryId(match.id)
    if (match.section === 'timeline') store.setSelectedTimelineEventId(match.id)
    if (match.section === 'worldhistory') store.setSelectedHistoryEntryId(match.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: match.section } }))
  }

  return (
    <StudioSplit data-tour="lore-header">
      <StudioIndex
        eyebrow="Lore wall"
        title="Notebook"
        tools={<StudioButton tone="primary" size="sm" disabled={store.readOnly || Boolean(formState)} onClick={handleNew}>New</StudioButton>}
      >
          <input aria-label="Search lore" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lore..." className="field w-full px-2 py-1.5 text-base placeholder:text-[var(--text-muted)]" />
          <div data-tour="lore-categories" className="grid grid-cols-2 gap-2">
            <select aria-label="Filter by category" value={effectiveCategory} onChange={e => setCategoryFilter(e.target.value)} className="field px-2 py-1.5 text-base">
              <option value="">All categories</option>
              {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Filter by tag" value={effectiveTag} onChange={e => setTagFilter(e.target.value)} className="field px-2 py-1.5 text-base">
              <option value="">All Tags</option>
              {loreTags.map(t => <option key={t} value={t}>#{t}</option>)}
            </select>
          </div>
          <select aria-label="Sort lore" value={sortBy} onChange={e => setSortBy(e.target.value)} className="field w-full px-2 py-1.5 text-base">
            <option value="title-asc">Title A→Z</option>
            <option value="title-desc">Title Z→A</option>
            <option value="category-asc">Category A→Z</option>
            <option value="category-desc">Category Z→A</option>
          </select>

          {notice && <p role="status" className="text-xs px-4 py-3">{notice}</p>}
          {grouped.length === 0 && <p className="text-xs text-[var(--text-muted)] italic px-4 py-3">{index.entries.length ? 'No results.' : 'No lore entries yet.'}</p>}
          {(search || effectiveTag || effectiveCategory) && <StudioButton size="sm" onClick={clearFilters}>Clear filters</StudioButton>}
          {grouped.map(([cat, entries]) => (
            <div key={cat} className="mb-2">
              <button aria-expanded={!collapsed.has(cat)} onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(cat)) next.delete(cat); else next.add(cat); return next })} className="w-full px-3 py-1.5 flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-[var(--accent-text)] opacity-80">
                <span>{cat} ({entries.length})</span>
                <span>{collapsed.has(cat) ? '+' : '-'}</span>
              </button>
              {!collapsed.has(cat) && entries.map(entry => (
                <StudioRecord key={entry.id} disabled={Boolean(formState)} onClick={() => setSelectedLoreEntryId(entry.id)} active={selectedLoreEntryId === entry.id}>
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
                  <StudioButton tone="secondary" size="sm" disabled={store.readOnly || selected.readOnly || Boolean(formState)} onClick={() => setFormState({ type: 'edit', entry: selected })}>Edit</StudioButton>
                  <StudioButton tone="secondary" size="sm" disabled={store.readOnly || selected.readOnly || Boolean(formState)} onClick={() => {
                    if (!confirm(`Delete "${selected.title}"?`)) return
                    const scope = confirm('Delete this lore entry from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
                    if (!deleteLoreEntry(selected.id, { scope })) { setNotice('This entry could not be deleted.'); return }
                    setSelectedLoreEntryId(null)
                    setNotice('Lore entry deleted.')
                  }}>Delete</StudioButton>
                </>
              )}
            >
                <div className="flex flex-wrap gap-2 mt-3">
                  {selected.category && <span className="chip chip-accent">{selected.category}</span>}
                  {selected.tags?.map(tag => (
                    <button key={tag} onClick={() => setTagFilter(tag)} className="chip hover:text-[var(--accent-text)] hover:border-[var(--accent)]">#{tag}</button>
                  ))}
                </div>
            </StudioPageHeader>

            <div className="border-t border-[var(--border)] pt-8 space-y-8">
              <StudioNote className="text-[var(--text-main)] whitespace-pre-wrap break-words leading-relaxed text-lg">{selected.content || <span className="italic text-[var(--text-muted)]">No content yet.</span>}</StudioNote>

              {(selected.characterIds?.length > 0 || selected.locationIds?.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <LinkedItems title="Linked Characters" ids={selected.characterIds} byId={index.characters} getLabel={c => c.name} onOpen={id => jumpTo({ section: 'characters', id })} />
                  <LinkedItems title="Linked Locations" ids={selected.locationIds} byId={index.locations} getLabel={l => l.name} onOpen={id => jumpTo({ section: 'locations', id })} />
                </div>
              )}

              {(relatedLore.outgoing.length > 0 || relatedLore.incoming.length > 0) && (
                  <div>
                    <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Related Lore</h3>
                    <div className="flex flex-wrap gap-2">
                      {relatedLore.outgoing.map(e => (
                        <button key={e.id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent-text)]" onClick={() => jumpTo({ section: 'lore', id: e.id })}>
                          {e.title}
                        </button>
                      ))}
                      {relatedLore.incoming.map(e => (
                        <button key={e.id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent-text)]" onClick={() => jumpTo({ section: 'lore', id: e.id })} title="References this entry">
                          ← {e.title}
                        </button>
                      ))}
                    </div>
                  </div>
              )}

              {selected.tags?.length > 0 && (
                <div>
                  <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">Related By Tag</h3>
                  <div className="space-y-3">
                    {selected.tags.map(tag => {
                      const matches = [...(tagIndex.get(loreTagKey(tag))?.matches.values() || [])].filter(m => !(m.section === 'lore' && m.id === selected.id))
                      return (
                        <div key={tag} className="space-y-2">
                          <button onClick={() => setTagFilter(tag)} className="text-xs text-[var(--accent-text)] font-bold">#{tag}</button>
                          <TagMatches key={`${selected.id}:${tag}`} matches={matches} onOpen={jumpTo} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <StudioEmpty title="Select a notebook page" body="Choose an entry or pin a new piece of lore." action={<StudioButton tone="primary" className="mt-4" disabled={store.readOnly || Boolean(formState)} onClick={handleNew}>New Lore Entry</StudioButton>} />
        )}
      </StudioDetail>

      {formState && (
        <Modal
          title={editTarget ? `Edit: ${editTarget.title}` : 'New Lore Entry'}
          onClose={closeForm}
          wide
          centered
        >
          <EntryForm
            key={editTarget?.id || 'new'}
            entry={editTarget}
            onSave={handleSave}
            onCancel={closeForm}
            characters={characters}
            locations={locations}
            loreEntries={index.entries}
            existingCategories={existingCategories}
            existingTags={existingTags}
            configuredCategories={configuredCategories}
          />
        </Modal>
      )}
    </StudioSplit>
  )
}

function LinkedItems({ title, ids, byId, getLabel, onOpen }) {
  const linked = ids.map(id => byId.get(id)).filter(Boolean)
  if (linked.length === 0) return null
  return (
    <div>
      <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {linked.map(item => (
          <button key={item.id} onClick={() => onOpen(item.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent-fade)] border border-[var(--accent)]/30 text-[var(--accent-text)] hover:opacity-80 transition-opacity">
            {item.image && <UserMediaImage src={item.image} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />}
            {getLabel(item)}
          </button>
        ))}
      </div>
    </div>
  )
}


function TagMatches({ matches, onOpen }) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const visible = expanded ? matches.filter(match => `${match.type} ${match.title}`.toLowerCase().includes(query.toLowerCase())) : matches.slice(0, 6)
  return <div className="space-y-2">
    {expanded && <input className="field w-full px-3 py-2" type="search" aria-label="Search related entries" value={query} onChange={event => setQuery(event.target.value)} />}
    <div className="flex flex-wrap gap-2">
      {!visible.length && <span className="text-xs text-[var(--text-muted)]">{query ? 'No matching entries.' : 'No other matches yet.'}</span>}
      {visible.map(match => <button key={`${match.type}:${match.id}`} onClick={() => onOpen(match)} className="text-xs border border-[var(--border)] rounded px-2 py-1 text-[var(--text-muted)] hover:text-[var(--accent-text)]">{match.type}: {match.title}</button>)}
    </div>
    {matches.length > 6 && <button type="button" aria-expanded={expanded} className="text-xs underline text-[var(--accent-text)]" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer related entries' : `Show all ${matches.length} related entries`}</button>}
  </div>
}
