// Shared in-flight progress UI for long-running AI tool streams (Plot Hole,
// Lore Conflict, Style Consistency, Character Interview). A raw character
// count alone gives no sense of whether a run is still alive on a long
// manuscript — this adds an elapsed-time readout and an indeterminate
// animated bar so the run visibly signals "still working" without implying
// a percentage that isn't actually knowable for LLM streaming.
function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

export function AiRunProgress({ label, elapsedMs = 0, progressChars = 0, onCancel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div className="ai-progress-track">
        <div className="ai-progress-fill" />
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
        {label}… ({formatElapsed(elapsedMs)}{progressChars > 0 ? `, ${progressChars.toLocaleString()} characters received` : ''})
      </p>
      {onCancel && (
        <button
          onClick={onCancel}
          style={{ fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >Cancel</button>
      )}
    </div>
  )
}
