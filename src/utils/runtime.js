export function isDesktopAppRuntime() {
  // Optional chaining: import.meta.env only exists under Vite. This module
  // also gets loaded outside Vite now (tests/e2e/helpers.js imports
  // browserVaultAdapter.js's DB schema constants directly, under
  // Playwright's plain-Node loader) — no behavior change under a real Vite
  // build, where import.meta.env is always defined.
  if (import.meta.env?.MODE === 'desktop') return true
  if (import.meta.env?.VITE_YOW_DESKTOP === 'true') return true
  if (typeof window === 'undefined') return false
  return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__)
}
