export const WEB_IDLE_LOGOUT_MS = 24 * 60 * 60 * 1000
export const WEB_LAST_ACTIVITY_KEY = 'yow_last_browser_activity_at'

export function readLastWebActivity(now = Date.now()) {
  if (typeof localStorage === 'undefined') return now
  const raw = localStorage.getItem(WEB_LAST_ACTIVITY_KEY)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : now
}

export function writeLastWebActivity(now = Date.now()) {
  if (typeof localStorage === 'undefined') return now
  localStorage.setItem(WEB_LAST_ACTIVITY_KEY, String(now))
  return now
}

export function clearLastWebActivity() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(WEB_LAST_ACTIVITY_KEY)
}

export function isWebSessionIdleExpired(now = Date.now(), idleMs = WEB_IDLE_LOGOUT_MS) {
  const lastActivityAt = readLastWebActivity(now)
  return now - lastActivityAt >= idleMs
}
