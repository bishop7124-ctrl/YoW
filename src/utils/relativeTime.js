// Short human-readable "time ago" label for sync/status timestamps.
// Deliberately coarse (minute resolution and up) — this is status chrome,
// not a precision clock.
export function relativeTimeFromNow(timestamp, now = Date.now()) {
  if (!timestamp) return ''
  const diffMs = Math.max(0, now - timestamp)
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 minute ago'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours === 1) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}
