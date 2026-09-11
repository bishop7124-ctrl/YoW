import { useEffect, useRef, useState } from 'react'

const controls = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
const visible = element => {
  if (element.closest('[hidden], [inert]')) return false
  for (let node = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}
function topDialog() {
  const dialogs = [...document.querySelectorAll('[aria-modal="true"]')].filter(visible)
  const layer = element => {
    let level = 0
    for (let node = element; node; node = node.parentElement) level = Math.max(level, Number.parseInt(getComputedStyle(node).zIndex) || 0)
    return level
  }
  return dialogs.sort((a, b) => layer(a) - layer(b)).at(-1)
}

// Shared by sheets, nested confirmations and onboarding. Higher overlays retain
// ownership of focus; opening a child never lets the parent's trap reclaim it.
export function useDialogFocus(ref, onClose, enabled = true) {
  const closeRef = useRef(onClose)
  const [initialReturnFocus] = useState(() => enabled && typeof document !== 'undefined' ? document.activeElement : null)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!enabled || !ref.current) return undefined
    const dialog = ref.current
    // Descendant autoFocus can run before this effect, so dialogs enabled at
    // mount use the control captured by the state initializer during render.
    const activeFocus = document.activeElement
    const previousFocus = initialReturnFocus?.isConnected ? initialReturnFocus : activeFocus
    const focus = () => dialog.focus({ preventScroll: true })
    const frame = requestAnimationFrame(() => {
      if (topDialog() === dialog && !dialog.contains(document.activeElement)) focus()
    })
    const onKey = event => {
      if (event.defaultPrevented || topDialog() !== dialog) return
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const items = [...dialog.querySelectorAll(controls)].filter(visible)
      const first = items[0], last = items.at(-1)
      if (!first) { event.preventDefault(); focus(); return }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    const onFocus = event => {
      if (topDialog() === dialog && !dialog.contains(event.target)) focus()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [enabled, ref, initialReturnFocus])
}
