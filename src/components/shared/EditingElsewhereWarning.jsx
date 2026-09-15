import Modal from './Modal'

// Fires *before* the user commits to editing, not after — see the 2026-08-02/03
// row in docs/ROADMAP.md's Bugs table: reconciling concurrent edits after the
// fact (field-level merge, conflict copies, cross-tab storage sync) has kept
// finding new gaps under real live testing, so this warns up front instead.
export default function EditingElsewhereWarning({ label, onClose }) {
  return (
    <Modal title="Also open in another tab" onClose={onClose} closeOnBackdrop={false}>
      <p style={{ marginBottom: '1rem' }}>
        {label ? <>This {label} is</> : 'This is'} currently open for editing in another browser
        tab. To protect both copies, YOW will keep this tab read-only until the other editor closes.
      </p>
      <p style={{ marginBottom: '1.25rem', color: 'var(--text-muted)' }}>
        Finish or close the scene in the other tab, then select this scene again to edit here.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="ms-conflict-btn" onClick={onClose}>
          Return to read-only
        </button>
      </div>
    </Modal>
  )
}
