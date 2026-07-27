import { useEffect } from 'react'
import LogoBuilder from './LogoBuilder'

// A dedicated, larger view for building a faction logo. Kept separate from
// the shared Modal/StudioSheet so the drag-to-resize canvas gets real room —
// and so it isn't wired into StudioSheet's form-submit/dirty-tracking, which
// doesn't apply here since every edit already writes straight through to the
// caller's state via onChange.
export default function LogoEditorModal({ logo, onChange, onClose, store }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="studio-sheet-backdrop is-centered" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="logo-editor-heading"
        className="studio-sheet is-centered"
        style={{ width: 'min(720px, calc(100vw - 32px))' }}
        onClick={e => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="studio-kicker">Editor</p>
            <h2 id="logo-editor-heading">Faction Logo</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="studio-sheet-body">
          <LogoBuilder logo={logo} onChange={onChange} canvasSize={320} store={store} />
        </div>
      </section>
    </div>
  )
}
