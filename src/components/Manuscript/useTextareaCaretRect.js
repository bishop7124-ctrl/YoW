import { useCallback } from 'react'

const MIRRORED_PROPERTIES = [
  'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
  'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
  'tabSize', 'MozTabSize', 'direction',
]

function createMirror() {
  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  Object.assign(mirror.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordWrap: 'break-word',
  })
  document.body.appendChild(mirror)
  return mirror
}

export function useTextareaCaretRect(textareaRef, scale = 1) {
  return useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return null

    const mirror = createMirror()
    mirror.style.zoom = String(scale)
    const computed = window.getComputedStyle(textarea)
    MIRRORED_PROPERTIES.forEach(property => {
      mirror.style[property] = computed[property]
    })
    mirror.style.height = 'auto'

    const before = textarea.value.slice(0, textarea.selectionEnd)
    mirror.replaceChildren(document.createTextNode(before))
    const fontSize = Number.parseFloat(computed.fontSize) || 16
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.2
    const markerHeight = Math.max(6, fontSize * 0.75)
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    Object.assign(marker.style, {
      display: 'inline-block',
      width: '1px',
      height: `${markerHeight}px`,
      verticalAlign: 'baseline',
    })
    mirror.appendChild(marker)

    const textareaRect = textarea.getBoundingClientRect()
    const mirrorRect = mirror.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
    const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0

    // `top` lands on the caret's *line box* top (the marker's own small height
    // only exists so its baseline-aligned box measures cleanly — it doesn't
    // change where that top sits). `height` is reported as the full computed
    // `lineHeight`, not the marker's own small height, because the one caller
    // that reads it (useCaretComfortScroll's getCaretScrollDelta) uses
    // `top + height` as the caret's line-box *bottom* for its comfort-zone
    // boundary check. Reporting the marker's ~0.75×fontSize height there
    // undercounted the real line-box bottom by `lineHeight - markerHeight`
    // (confirmed against tests/e2e/focused-writing.spec.js's "long wrapped
    // prose" case: the bottom-boundary correction was consistently landing
    // the caret's line ~24px past its 65%-height target), so every downward
    // correction quietly overshot by that same fixed amount. The other
    // consumer (SceneEditor.jsx's syncFloatingNoteButton) only reads
    // `top`/`left`, never `height`, so this doesn't affect it.
    const result = {
      top: textareaRect.top + markerRect.top - mirrorRect.top - textarea.scrollTop + borderTop,
      left: textareaRect.left + markerRect.left - mirrorRect.left - textarea.scrollLeft + borderLeft,
      height: lineHeight,
    }
    mirror.remove()
    return result
  }, [scale, textareaRef])
}
