import { useState, useMemo } from 'react'
import Modal from '../shared/Modal'
import { StudioSplit, StudioIndex, StudioRecord, StudioDetail, StudioButton, StudioEmpty, StudioPageHeader, StudioNote } from '../presentation/Studio'
import { loreRefsFor, timelineRefsFor } from '../../utils/worldLinks'

const loadJ = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def } catch { return def } }

function removeLocationFromAllMaps(locationId) {
  const maps = loadJ('nf_maps_list', []);
  maps.forEach(map => {
    const mk = `nf_markers_${map.id}`;
    const rk = `nf_regions_${map.id}`;
    const ik = `nf_icons_${map.id}`;
    const markers = loadJ(mk, []).filter(x => x.locationId !== locationId);
    const regions = loadJ(rk, []).filter(x => x.locationId !== locationId);
    const icons   = loadJ(ik, []).filter(x => x.locationId !== locationId);
    localStorage.setItem(mk, JSON.stringify(markers));
    localStorage.setItem(rk, JSON.stringify(regions));
    localStorage.setItem(ik, JSON.stringify(icons));
  });
}

// The Fix: uses theme variables so all 4 themes apply correctly
const CATS = ['Kingdom/Region', 'City', 'Town', 'Village', 'Landmark', 'Ruins', 'Feature', 'Other']
const IN = 'field w-full px-3 py-2 text-sm placeholder:text-[var(--text-muted)]'

function LocationForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    description: initial?.description ?? '',
    tags: initial?.tags ?? [],
  })
  const [tagInput, setTagInput] = useState('')

  const addTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim().replace(/,$/, '')
      if (t && !form.tags.includes(t)) setForm(p => ({ ...p, tags: [...p.tags, t] }))
      setTagInput('')
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="space-y-4 text-left">
      <div>
        <label className="form-label">Name</label>
        <input value={form.name} onChange={e=>setForm(p=>({...p, name:e.target.value}))} className={IN} required />
      </div>
      <div>
        <label className="form-label">Category</label>
        <select value={form.category} onChange={e=>setForm(p=>({...p, category:e.target.value}))} className={IN}>
          {CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label">Description</label>
        <textarea value={form.description} onChange={e=>setForm(p=>({...p, description:e.target.value}))} rows={6} className={IN + ' resize-none'} />
      </div>
      <div>
        <label className="form-label">Tags</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {form.tags.map(t => (
            <span key={t} className="chip">
              {t}
              <button type="button" onClick={()=>setForm(p=>({...p, tags:p.tags.filter(x=>x!==t)}))}>×</button>
            </span>
          ))}
        </div>
        <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={addTag} className={IN} placeholder="Enter tags..." />
      </div>
      <div className="flex gap-2 pt-4 border-t border-[var(--border)]">
        <button type="submit" className="btn btn-primary flex-1 justify-center">Save</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[var(--text-muted)]">Cancel</button>
      </div>
    </form>
  )
}

export default function Locations({ store }) {
  const { locations, loreEntries = [], timeline = [], saveLocation, deleteLocation, selectedLocationId, setSelectedLocationId, setSelectedLoreEntryId } = store
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name-asc')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const filtered = (locations || [])
    .filter(l => l.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '')
      if (sortBy === 'name-desc') return (b.name || '').localeCompare(a.name || '')
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '')
      return 0
    })
  const selected = (locations || []).find(l => l.id === selectedLocationId)

  const incomingRefs = useMemo(() => selected
    ? {
        lore: loreRefsFor(selected.id, loreEntries),
        timeline: timelineRefsFor(selected.id, timeline),
      }
    : { lore: [], timeline: [] },
    [selected, loreEntries, timeline]
  )

  return (
    <StudioSplit data-tour="locations-header">
      <StudioIndex
        eyebrow="Atlas wall"
        title="Field Notes"
        tools={<StudioButton tone="primary" size="sm" onClick={()=>{setEditTarget(null);setShowForm(true)}}>New</StudioButton>}
      >
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..." className="field w-full px-2 py-1.5 text-xs placeholder:text-[var(--text-muted)]" />
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="field w-full px-2 py-1.5 text-xs">
            <option value="name-asc">Name A→Z</option>
            <option value="name-desc">Name Z→A</option>
            <option value="category">Category</option>
          </select>
          {(locations || []).length === 0 && (
            <div className="px-4 py-6 text-center space-y-1">
              <p className="text-sm text-[var(--text-main)]">No locations yet.</p>
              <p className="text-xs text-[var(--text-muted)]">Add places from your world using the New button above.</p>
            </div>
          )}
          {(locations || []).length > 0 && filtered.length === 0 && (
            <div className="px-4 py-4 text-center">
              <p className="text-xs text-[var(--text-muted)]">No matches.</p>
            </div>
          )}

          {filtered.map(l => (
            <StudioRecord
              key={l.id}
              onClick={()=>setSelectedLocationId(l.id)}
              active={selectedLocationId===l.id}
            >
              <div className="text-sm font-medium text-[var(--text-main)]">{l.name}</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{l.category}</div>
            </StudioRecord>
          ))}
      </StudioIndex>

      <StudioDetail>
        {!selected ? (
          <StudioEmpty
            title="Select a field note"
            body="Choose a location from the atlas wall or add a new place."
            action={<StudioButton tone="primary" className="mt-4" onClick={() => { setEditTarget(null); setShowForm(true) }}>Add Location</StudioButton>}
          />
        ) : (
          <div className="max-w-4xl">
            <StudioPageHeader
              eyebrow="Atlas field note"
              title={selected.name}
              actions={(
                <>
                <StudioButton tone="secondary" size="sm" onClick={()=>{setEditTarget(selected);setShowForm(true)}}>Edit</StudioButton>
                <StudioButton tone="secondary" size="sm" onClick={()=>{
                  if (!confirm('Delete this location?')) return
                  const scope = confirm('Delete this location from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
                  deleteLocation(selected.id, { scope })
                  if (loadJ('nf_linked_delete', false)) removeLocationFromAllMaps(selected.id)
                  setSelectedLocationId(null)
                }}>Delete</StudioButton>
                </>
              )}
            >
              <span className="chip chip-accent mt-3">{selected.category}</span>
            </StudioPageHeader>
            <StudioNote className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">{selected.description || 'No description provided yet.'}</StudioNote>

            {selected.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-3 border-t border-[var(--border)]">
                {selected.tags.map(t => (
                  <span key={t} className="bg-[var(--bg-nav)] border border-[var(--border)] text-[var(--text-muted)] text-xs px-2 py-0.5 rounded">{t}</span>
                ))}
              </div>
            )}

            {(incomingRefs.lore.length > 0 || incomingRefs.timeline.length > 0) && (
              <div className="pt-3 border-t border-[var(--border)] space-y-3">
                <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Referenced in</div>

                {incomingRefs.lore.length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--text-muted)] mb-1">Lore</div>
                    <div className="flex flex-wrap gap-1">
                      {incomingRefs.lore.map(e => (
                        <button key={e.id} className="chip hover:border-[var(--accent)] hover:text-[var(--accent)]" onClick={() => setSelectedLoreEntryId(e.id)}>
                          {e.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {incomingRefs.timeline.length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--text-muted)] mb-1">Timeline</div>
                    <div className="flex flex-wrap gap-1">
                      {incomingRefs.timeline.map(e => (
                        <span key={e.id} className="chip">{e.title}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </StudioDetail>

      {showForm && (
        <Modal title={editTarget ? "Edit Location" : "New Location"} onClose={() => setShowForm(false)} wide>
          <LocationForm initial={editTarget} onSave={(d) => {
            const location = saveLocation(d, editTarget?.id)
            if (location?.id) setSelectedLocationId(location.id)
            setShowForm(false)
          }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
    </StudioSplit>
  )
}
