import { useCallback, useEffect, useRef, useState } from 'react'

// One toast host per Manuscript editor instance. `toast(message, { undo })`
// shows a single line for 5s with an optional Undo button. Used by
// replace-all and restore-snapshot (both already had no confirm dialog to
// remove — this only adds a safety net) — deliberately NOT used for
// scene/chapter/act delete, which keep their existing window.confirm() per
// an explicit product decision (see the manuscript-editor-redesign branch's
// step-2 commit).
export function useToast() {
  const [visible, setVisible] = useState(false)
  const [content, setContent] = useState({ message: '', undo: null })
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  const toast = useCallback((message, { undo } = {}) => {
    clearTimeout(timerRef.current)
    setContent({ message, undo: undo || null })
    setVisible(true)
    timerRef.current = setTimeout(() => setVisible(false), 5000)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const toastNode = (
    <div className={`ms-toast${visible ? ' is-on' : ''}`} role="status" aria-live="polite">
      <span>{content.message}</span>
      {content.undo && (
        <button type="button" onClick={() => { content.undo(); dismiss() }}>Undo</button>
      )}
    </div>
  )

  return { toast, toastNode }
}
