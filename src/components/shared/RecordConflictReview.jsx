import Modal from './Modal'

function formatWhen(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function fieldPreview(value) {
  if (value == null || value === '') return '(empty)'
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return '(complex value)'
  const text = String(value)
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

// Fields both versions share that actually differ — what the user needs to
// see to decide which version to keep. Skips bookkeeping fields that differ
// on every save (timestamps) and aren't meaningful to review.
const IGNORED_FIELDS = new Set(['lastModified', 'updatedAt', 'wordHistory'])
function diffFields(mine, theirs) {
  const keys = new Set([...Object.keys(mine || {}), ...Object.keys(theirs || {})])
  const diffs = []
  keys.forEach(key => {
    if (IGNORED_FIELDS.has(key)) return
    const a = mine?.[key]
    const b = theirs?.[key]
    if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push({ key, mine: a, theirs: b })
  })
  return diffs
}

export default function RecordConflictReview({
  conflicts,
  onRestore,
  onDiscard,
  onClose,
  embedded = false,
  title = 'Records changed in another tab',
  intro = 'These were edited in two browser tabs at once. Your edit here was saved as-is — nothing was lost — but the other tab\'s version is shown below in case you want it instead. Keep yours (already saved) or restore theirs to overwrite it.',
  mineLabel = 'Your version (kept)',
  theirsLabel = "Other tab's version",
  discardLabel = 'Keep mine',
  restoreLabel = "Restore other tab's version",
}) {
  const content = (
      <div className="ms-conflict-review">
        <p className="ms-conflict-review-intro">
          {intro}
        </p>
        {conflicts.length === 0 ? (
          <p className="ms-conflict-review-empty">No conflicts remain.</p>
        ) : (
          <ul className="ms-conflict-review-list">
            {conflicts.map(conflict => {
              const diffs = diffFields(conflict.mine, conflict.theirs)
              return (
                <li key={conflict.id} className="ms-conflict-review-item">
                  <div className="ms-conflict-review-item-head">
                    <strong>{conflict.label}: {conflict.name}</strong>
                    {formatWhen(conflict.detectedAt) && (
                      <span className="ms-conflict-review-when">Detected {formatWhen(conflict.detectedAt)}</span>
                    )}
                  </div>
                  {diffs.length > 0 ? (
                    <table className="rc-conflict-diff">
                      <thead>
                        <tr><th></th><th>{mineLabel}</th><th>{theirsLabel}</th></tr>
                      </thead>
                      <tbody>
                        {diffs.map(diff => (
                          <tr key={diff.key}>
                            <td className="rc-conflict-diff-field">{diff.key}</td>
                            <td>{fieldPreview(diff.mine)}</td>
                            <td>{fieldPreview(diff.theirs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="ms-conflict-review-preview">Only timing metadata differs — content is effectively the same.</p>
                  )}
                  <div className="ms-conflict-review-actions">
                    <button type="button" className="ms-conflict-btn" onClick={() => onDiscard(conflict.id)}>
                      {discardLabel}
                    </button>
                    <button type="button" className="ms-conflict-btn ms-conflict-btn-primary" onClick={() => onRestore(conflict.id)}>
                      {restoreLabel}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
  )
  if (embedded) return content
  return (
    <Modal title={title} onClose={onClose} wide>
      {content}
    </Modal>
  )
}
