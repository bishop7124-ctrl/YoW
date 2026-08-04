import Modal from './Modal'

// Fires *before* the user commits to editing, not after — see the 2026-08-02/03
// row in docs/ROADMAP.md's Bugs table: reconciling concurrent edits after the
// fact (field-level merge, conflict copies, cross-tab storage sync) has kept
// finding new gaps under real live testing, so this warns up front instead.
export default function EditingElsewhereWarning({ label, onClose, onEditAnyway }) {
  return (
    <Modal title="Also open in another tab" onClose={onClose}>
      <p style={{ marginBottom: '1rem' }}>
        {label ? <>This {label} is</> : 'This is'} currently open for editing in another browser
        tab. Editing it here at the same time can cause one of you to lose changes.
      </p>
      <p style={{ marginBottom: '1.25rem', color: 'var(--text-muted)' }}>
        Safest option: finish or close out the other tab first.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button type="button" className="ms-conflict-btn" onClick={onClose}>
          Go back
        </button>
        <button type="button" className="ms-conflict-btn ms-conflict-btn-primary" onClick={onEditAnyway}>
          Edit anyway
        </button>
      </div>
    </Modal>
  )
}
