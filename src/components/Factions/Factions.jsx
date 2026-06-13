import { useState } from 'react'
import Modal from '../shared/Modal'
import FactionLogo from './FactionLogo'
import LogoBuilder from './LogoBuilder'

const INPUT = 'w-full bg-[var(--bg-main)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-main)] focus:border-[var(--accent)] outline-none transition-colors'
const LABEL = 'block text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1.5'

const emptyForm = () => ({ name: '', logo: [], description: '' })

export default function Factions({ store }) {
  const { factions, saveFaction, deleteFaction, characters, setSelectedCharacterId } = store
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [selectedFactionId, setSelectedFactionId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [sortBy, setSortBy] = useState('name-asc')

  const activeFaction = factions.find(f => f.id === selectedFactionId)
  const factionMembers = characters.filter(c => c.factionId === selectedFactionId)
  const memberCount = (f) => characters.filter(c => c.factionId === f.id).length
  const sortedFactions = [...factions].sort((a, b) => {
    if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
    if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
    if (sortBy === 'members-desc') return memberCount(b) - memberCount(a)
    if (sortBy === 'members-asc') return memberCount(a) - memberCount(b)
    return 0
  })

  const openCreate = () => {
    setEditTarget(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  const openEdit = (e, faction) => {
    e?.stopPropagation()
    setEditTarget(faction)
    setForm({ name: faction.name, logo: faction.logo || [], description: faction.description || '' })
    setShowForm(true)
  }

  const handleSave = (e) => {
    e.preventDefault()
    const faction = saveFaction(form, editTarget?.id)
    if (faction?.id && selectedFactionId) setSelectedFactionId(faction.id)
    setShowForm(false)
    setEditTarget(null)
  }

  const teleportToCharacter = (id) => {
    setSelectedCharacterId(id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: 'characters' } }))
  }

  return (
    <div className="workspace-page text-left">
      <div className="workspace-inner max-w-5xl">

        <div className="page-header mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {selectedFactionId && (
                <button onClick={() => setSelectedFactionId(null)} className="btn btn-secondary btn-sm mr-2">
                  Back
                </button>
              )}
              <div>
              <p className="eyebrow">Allegiances</p>
              <h1 className="page-title">
                {activeFaction ? activeFaction.name : 'Factions & Allegiances'}
              </h1>
              </div>
            </div>
            <p className="page-copy mt-2">
              {activeFaction
                ? 'Review the history and membership of this organization.'
                : 'Manage the organizations, kingdoms, and guilds of your world.'}
            </p>
          </div>
          {!selectedFactionId && (
            <button
              onClick={openCreate}
              className="btn btn-primary"
            >
              Create Faction
            </button>
          )}
        </div>

        {!selectedFactionId ? (
          <>
            <div className="mb-4">
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="field px-2 py-1.5 text-xs">
                <option value="name-asc">Name A→Z</option>
                <option value="name-desc">Name Z→A</option>
                <option value="members-desc">Most Members</option>
                <option value="members-asc">Fewest Members</option>
              </select>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedFactions.map(faction => (
              <div
                key={faction.id}
                onClick={() => setSelectedFactionId(faction.id)}
                className="panel p-5 flex items-start gap-5 hover:border-[var(--accent)]/50 cursor-pointer transition-all group"
              >
                <div className="w-16 h-16 flex items-center justify-center rounded-lg border border-[var(--border)] flex-shrink-0">
                  <FactionLogo shapes={faction.logo} size={52} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between">
                    <h3 className="font-serif text-xl font-bold text-[var(--text-main)]">{faction.name}</h3>
                    <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase mt-1">
                      {characters.filter(c => c.factionId === faction.id).length} Members
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)] text-sm mt-1 line-clamp-2">{faction.description || 'No description provided.'}</p>
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={(e) => openEdit(e, faction)}
                      className="btn btn-secondary btn-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!confirm('Delete this faction?')) return
                        const scope = confirm('Delete this faction from every synced project too?\n\nOK = every synced project\nCancel = current project only') ? 'all' : 'current'
                        deleteFaction(faction.id, { scope })
                      }}
                      className="text-xs text-red-500/60 hover:text-red-500 hover:underline"
                    >Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        ) : (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="panel p-8 flex gap-8">
              <div className="w-32 h-32 flex items-center justify-center rounded-xl border border-[var(--border)] flex-shrink-0">
                <FactionLogo shapes={activeFaction.logo} size={110} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-xs font-bold text-[var(--accent)] uppercase tracking-[0.2em]">Organization Profile</h2>
                  <button
                    onClick={(e) => openEdit(e, activeFaction)}
                    className="btn btn-secondary btn-sm"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-[var(--text-main)] text-lg leading-relaxed max-w-2xl">
                  {activeFaction.description || 'Historical records for this faction are currently being compiled.'}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                Active Membership <span className="h-px flex-1 bg-[var(--border)]"></span>
              </h3>
              {factionMembers.length === 0 ? (
                <div className="empty-state">
                  No characters are currently aligned with this faction.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {factionMembers.map(member => (
                    <button
                      key={member.id}
                      onClick={() => teleportToCharacter(member.id)}
                      className="panel-soft flex items-center justify-between p-4 hover:border-[var(--accent)]/50 hover:bg-[var(--bg-hover)] transition-all text-left group"
                    >
                      <div>
                        <div className="text-sm font-bold text-[var(--text-main)] group-hover:text-[var(--accent)]">{member.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase mt-0.5">{member.role || 'Member'}</div>
                      </div>
                      <span className="text-[var(--text-muted)] group-hover:text-[var(--accent)]">→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={editTarget ? 'Edit Faction' : 'New Faction'} onClose={() => setShowForm(false)} wide>
          <form onSubmit={handleSave} className="space-y-5 text-left">
            <div>
              <label className={LABEL}>Logo Builder</label>
              <LogoBuilder
                logo={form.logo}
                onChange={logo => setForm(f => ({ ...f, logo }))}
              />
            </div>
            <div>
              <label className={LABEL}>Faction Name</label>
              <input className={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <textarea className={`${INPUT} h-32 resize-none`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <button type="submit" className="w-full bg-[var(--accent)] text-[var(--bg-main)] font-bold py-2.5 rounded hover:opacity-90">
              Save Faction
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
