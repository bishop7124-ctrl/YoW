import { useState } from 'react'

const ENTITY_TYPES = [
  {
    id: 'character',
    label: 'Character',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="10" r="2.5" /><path d="M14.5 20a4.5 4.5 0 0 1 6 0" />
      </svg>
    ),
    desc: 'A person in your story',
  },
  {
    id: 'location',
    label: 'Location',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
    desc: 'A place in your world',
  },
  {
    id: 'faction',
    label: 'Faction',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 21V4" /><path d="M5 4h12l-2 4 2 4H5" />
      </svg>
    ),
    desc: 'A group or organisation',
  },
  {
    id: 'lore',
    label: 'Lore Entry',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4-4z" />
        <path d="M5 4v16" /><path d="M9 8h6" /><path d="M9 12h5" />
      </svg>
    ),
    desc: 'World-building knowledge',
  },
  {
    id: 'event',
    label: 'Timeline Event',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5v14" /><circle cx="4" cy="5" r="1.5" /><circle cx="4" cy="12" r="1.5" /><circle cx="4" cy="19" r="1.5" />
        <path d="M8 5h12" /><path d="M8 12h9" /><path d="M8 19h12" />
      </svg>
    ),
    desc: 'An event on your timeline',
  },
  {
    id: 'chapter',
    label: 'Chapter',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" />
        <path d="M9 12h6" /><path d="M9 16h6" />
      </svg>
    ),
    desc: 'A chapter in your manuscript',
  },
]

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export default function ConvertModal({ idea, store, onClose, onConverted }) {
  const [selectedType, setSelectedType] = useState(null)
  const [name, setName] = useState(idea.title || '')
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState('')

  const handleConvert = async () => {
    if (!selectedType || !name.trim()) return
    setConverting(true)
    setError('')

    try {
      let entityId = null
      let entityName = name.trim()
      const desc = idea.description || idea.body || ''

      if (selectedType === 'character') {
        entityId = store.saveCharacter({ name: entityName, bio: desc, role: '', keywords: [] })

      } else if (selectedType === 'location') {
        const loc = store.saveLocation({ name: entityName, description: desc, category: '' })
        entityId = loc?.id || loc

      } else if (selectedType === 'faction') {
        const newId = uid()
        store.setFactions(prev => [...prev, {
          id: newId,
          name: entityName,
          description: desc,
          motto: '',
          members: [],
        }])
        entityId = newId

      } else if (selectedType === 'lore') {
        const entry = store.addLoreEntry({ title: entityName, content: desc, category: '', characterIds: [] })
        entityId = entry?.id

      } else if (selectedType === 'event') {
        const entry = store.addEvent({ title: entityName, description: desc, date: '', tags: [], type: 'event' })
        entityId = entry?.id || entry

      } else if (selectedType === 'chapter') {
        const acts = store.acts || []
        const firstActId = acts[0]?.id || null
        store.addChapter(firstActId, { title: entityName, synopsis: desc, order: 999 })
        entityId = uid()
      }

      onConverted(selectedType, entityId, entityName)
    } catch {
      setError('Conversion failed. Please try again.')
      setConverting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(6px)',
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-nav)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-modal)',
        boxShadow: 'var(--shadow-modal)',
        width: '100%',
        maxWidth: 520,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
              Convert to Story Entity
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              The original idea is preserved. This creates a linked entity in your project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, borderRadius: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Idea preview */}
          <div style={{
            padding: '10px 14px',
            background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))',
            borderRadius: 10,
            marginBottom: 20,
            border: '1px solid var(--border)',
          }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-main)' }}>
              {idea.title}
            </p>
            {(idea.description || idea.body) && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {(idea.description || idea.body).slice(0, 120)}{(idea.description || idea.body).length > 120 ? '…' : ''}
              </p>
            )}
          </div>

          {/* Entity type grid */}
          <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Convert to
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 20,
          }}>
            {ENTITY_TYPES.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type.id)}
                style={{
                  background: selectedType === type.id ? 'var(--accent-fade)' : 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))',
                  border: `1px solid ${selectedType === type.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '12px 10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all .12s',
                  color: selectedType === type.id ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                <div style={{ marginBottom: 4 }}>{type.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: selectedType === type.id ? 'var(--accent)' : 'var(--text-main)' }}>
                  {type.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>
                  {type.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Name input */}
          {selectedType && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {selectedType === 'lore' || selectedType === 'event' ? 'Title' : 'Name'}
              </p>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConvert() }}
                placeholder={`${ENTITY_TYPES.find(t => t.id === selectedType)?.label} name…`}
                style={{
                  width: '100%',
                  background: 'color-mix(in srgb, var(--bg-nav) 78%, var(--bg-main))',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: 'var(--text-main)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 4,
                }}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--faint)' }}>
                The idea's description will be prefilled into the entity.
              </p>
            </>
          )}

          {error && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--danger)' }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
        }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConvert}
            disabled={!selectedType || !name.trim() || converting}
            className="btn btn-primary"
            style={{ opacity: !selectedType || !name.trim() ? 0.5 : 1 }}
          >
            {converting ? 'Converting…' : 'Convert & Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
