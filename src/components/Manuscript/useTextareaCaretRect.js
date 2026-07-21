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

    const result = {
      top: textareaRect.top + markerRect.top - mirrorRect.top - textarea.scrollTop + borderTop,
      left: textareaRect.left + markerRect.left - mirrorRect.left - textarea.scrollLeft + borderLeft,
      height: Math.min(markerRect.height || markerHeight, markerHeight, lineHeight),
    }
    mirror.remove()
    return result
  }, [scale, textareaRef])
}
