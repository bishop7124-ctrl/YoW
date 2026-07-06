export function isDesktopAppRuntime() {
  if (import.meta.env.MODE === 'desktop') return true
  if (import.meta.env.VITE_YOW_DESKTOP === 'true') return true
  if (typeof window === 'undefined') return false
  return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
}
