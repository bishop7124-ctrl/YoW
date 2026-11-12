import { useEffect, useMemo, useRef, useState } from 'react'
import { searchReferences, sortReferences, sourceHost } from '../../utils/references'
import { ReferenceBody, ReferenceForm } from './ReferenceParts'

// A slide-over for looking up or jotting down a reference from any room, including the manuscript, without
// leaving the page. Opened from the top bar button or the "R" key (outside text fields). Escape closes it.
export default function ReferencesDrawer({ store, onClose, onOpenRoom }) {
  const { referenceEntries = [], addReference } = store
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const searchRef = useRef(null)
  const visible = useMemo(() => sortReferences(searchReferences(referenceEntries, search)), [referenceEntries, search])
  const open = referenceEntries.find(entry => entry.id === openId) || null
  const locked = Boolean(store.readOnly)

  const drawerRef = useRef(null)
  // Focus moves into the drawer on open and goes back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement
    searchRef.current?.focus()
    return () => { if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus() }
  }, [])
  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      // Keep Tab inside the drawer while it is open.
      const focusable = [...(drawerRef.current?.querySelectorAll('button, input, select, textarea, a[href]') || [])].filter(el => !el.disabled && el.tabIndex >= 0)
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="refs-drawer-layer">
      <button type="button" className="refs-drawer-backdrop" aria-label="Close references" onClick={onClose} tabIndex={-1} />
      <aside ref={drawerRef} className="refs-drawer font-sans" role="dialog" aria-modal="true" aria-label="References" data-testid="references-drawer">
        <header className="refs-drawer-head">
          <h2>References</h2>
          <div className="refs-drawer-actions">
            <button type="button" className="btn btn-secondary btn-sm" disabled={locked || adding} onClick={() => { setAdding(true); setOpenId(null) }}>New</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenRoom(open?.id)}>Open in References</button>
            <button type="button" className="refs-drawer-close" aria-label="Close references" onClick={onClose}>×</button>
          </div>
        </header>
        {adding ? (
          <div className="refs-drawer-body">
            <ReferenceForm onSave={data => { const entry = addReference(data); if (!entry) return false; setAdding(false); setOpenId(entry.id); return true }} onCancel={() => setAdding(false)} />
          </div>
        ) : open ? (
          <div className="refs-drawer-body">
            <button type="button" className="refs-drawer-back" onClick={() => setOpenId(null)}>← All references</button>
            <h3 className="refs-drawer-title">{open.title}</h3>
            <ReferenceBody entry={open} />
          </div>
        ) : (
          <div className="refs-drawer-body">
            <input ref={searchRef} aria-label="Search references" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search references..." className="field w-full px-2 py-1.5 text-base placeholder:text-[var(--text-muted)]" />
            {visible.length === 0 && <p className="refs-drawer-empty">{referenceEntries.length ? 'No results.' : 'No references yet. Use New to add the first one.'}</p>}
            <ul className="refs-drawer-list">
              {visible.map(entry => (
                <li key={entry.id}>
                  <button type="button" onClick={() => setOpenId(entry.id)}>
                    <strong>{entry.title}</strong>
                    <span>{sourceHost(entry.sourceUrl) || entry.citation || 'No source yet'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
