import { isDesktopAppRuntime } from './runtime.js'

// The desktop webview (tauri://localhost) cannot follow links to other sites:
// `target="_blank"` anchors, `window.open` and `location.assign` to https URLs
// all silently do nothing. Everything external goes through the Rust
// `open_external_url` command instead, which hands https:/mailto: links to the
// OS default browser or mail client. In a normal browser these helpers behave
// like the plain DOM calls they replace.

function getInvoke() {
  if (typeof window === 'undefined') return null
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null
}

export function isExternalUrl(href, base = typeof window !== 'undefined' ? window.location.href : 'http://localhost/') {
  let url
  try {
    url = new URL(href, base)
  } catch {
    return false
  }
  if (url.protocol === 'mailto:') return true
  if (url.protocol !== 'https:') return false
  return url.origin !== new URL(base).origin
}

// Opens `url` outside the app. Resolves true if it was handed off.
export async function openExternalUrl(url) {
  if (isDesktopAppRuntime()) {
    const invoke = getInvoke()
    if (!invoke) return false
    try {
      await invoke('open_external_url', { url })
      return true
    } catch (error) {
      console.error('[YOW] Could not open external link', error)
      return false
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

// Replacement for `window.location.assign(url)` on billing/checkout redirects.
// On desktop the browser takes over, so the app stays open and the caller can
// tell the user to come back; returns 'external' there and 'navigated' on web.
export async function navigateToExternalUrl(url) {
  if (isDesktopAppRuntime()) {
    return (await openExternalUrl(url)) ? 'external' : 'failed'
  }
  window.location.assign(url)
  return 'navigated'
}

// Desktop only: route clicks on external anchors (including target="_blank")
// to the OS default browser. Returns an uninstall function.
export function installDesktopExternalLinkHandler() {
  if (typeof document === 'undefined' || !isDesktopAppRuntime()) return () => {}
  const onClick = event => {
    if (event.defaultPrevented || event.button !== 0) return
    const anchor = event.target?.closest?.('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || !isExternalUrl(href)) return
    event.preventDefault()
    openExternalUrl(new URL(href, window.location.href).href)
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
