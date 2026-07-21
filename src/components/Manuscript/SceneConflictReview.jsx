import Modal from '../shared/Modal'

function formatWhen(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function preview(content) {
  const trimmed = (content || '').trim()
  if (!trimmed) return '(empty)'
  return trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed
}

export default function SceneConflictReview({ conflicts, onRestore, onDiscard, onClose }) {
  return (
    <Modal title="Scene conflict copies" onClose={onClose} wide>
      <div className="ms-conflict-review">
        <p className="ms-conflict-review-intro">
          These scenes were edited in two browser tabs at once. To avoid silently losing
          either version, both were kept — the copy below was saved separately from your
          current scene. Restore a copy to replace the current scene's content with it, or
          discard the copy if you don't need it.
        </p>
        {conflicts.length === 0 ? (
          <p className="ms-conflict-review-empty">No conflict copies remain.</p>
        ) : (
          <ul className="ms-conflict-review-list">
            {conflicts.map(conflict => (
              <li key={conflict.id} className="ms-conflict-review-item">
                <div className="ms-conflict-review-item-head">
                  <strong>{conflict.title}</strong>
                  {formatWhen(conflict.conflictCreatedAt) && (
                    <span className="ms-conflict-review-when">Saved {formatWhen(conflict.conflictCreatedAt)}</span>
                  )}
                </div>
                <p className="ms-conflict-review-preview">{preview(conflict.content)}</p>
                <div className="ms-conflict-review-actions">
                  <button type="button" className="ms-conflict-btn ms-conflict-btn-primary" onClick={() => onRestore(conflict.id)}>
                    Restore this version
                  </button>
                  <button type="button" className="ms-conflict-btn" onClick={() => onDiscard(conflict.id)}>
                    Discard copy
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
