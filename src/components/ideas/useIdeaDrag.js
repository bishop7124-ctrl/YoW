import { useCallback, useEffect, useRef, useState } from 'react'

export default function useIdeaDrag(boardRef, enabled, onMove) {
  const [visual, setVisual] = useState(null)
  const cleanupRef = useRef(null)
  const suppressClick = useRef(false)
  const clickTimer = useRef(null)
  const start = useCallback((idea, event) => {
    if (!enabled || event.button !== 0 || cleanupRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const card = event.currentTarget.closest('[data-card-id]')
    const rect = card.getBoundingClientRect()
    const pointerId = event.pointerId
    const origin = { x: event.clientX, y: event.clientY }
    let point = origin, moved = false, frame = null, ended = false, lastVisual = ''
    const oldSelection = [document.body.style.userSelect, document.body.style.webkitUserSelect]
    const targetAt = () => {
      const column = document.elementsFromPoint(point.x, point.y).find(element => element.dataset?.column && boardRef.current?.contains(element))
      if (!column) return null
      const before = [...column.querySelectorAll('[data-card-id]')].find(element => element.dataset.cardId !== idea.id && point.y < element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2)
      return { status: column.dataset.column, beforeId: before?.dataset.cardId || null }
    }
    const paint = () => {
      if (ended) return
      const board = boardRef.current
      if (board) {
        const bounds = board.getBoundingClientRect()
        const insideY = point.y >= bounds.top && point.y <= bounds.bottom
        if (insideY && point.x < bounds.left + 60) board.scrollLeft -= 8
        else if (insideY && point.x > bounds.right - 60) board.scrollLeft += 8
        const column = document.elementFromPoint(point.x, point.y)?.closest('[data-column-body]')
        if (column && board.contains(column)) {
          const bounds = column.getBoundingClientRect()
          if (point.y < bounds.top + 60) column.scrollTop -= 8
          else if (point.y > bounds.bottom - 60) column.scrollTop += 8
        }
      }
      const next = { id: idea.id, x: point.x - (origin.x - rect.left), y: point.y - (origin.y - rect.top), width: rect.width, target: targetAt() }
      const fingerprint = JSON.stringify(next)
      if (fingerprint !== lastVisual) { lastVisual = fingerprint; setVisual(next) }
      frame = requestAnimationFrame(paint)
    }
    const move = ev => {
      if (ev.pointerId !== pointerId) return
      point = { x: ev.clientX, y: ev.clientY }
      if (!moved && Math.hypot(point.x - origin.x, point.y - origin.y) > 8) {
        moved = true
        suppressClick.current = true
        document.body.style.userSelect = 'none'
        document.body.style.webkitUserSelect = 'none'
        window.getSelection?.()?.removeAllRanges?.()
        frame = requestAnimationFrame(paint)
      }
    }
    const stop = (commit = false, unmount = false) => {
      ended = true
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', keyDown)
      if (frame !== null) cancelAnimationFrame(frame)
      document.body.style.userSelect = oldSelection[0]
      document.body.style.webkitUserSelect = oldSelection[1]
      cleanupRef.current = null
      if (!unmount) setVisual(null)
      if (commit && moved) {
        const target = targetAt()
        if (target) onMove(idea.id, target.status, target.beforeId)
      }
      clearTimeout(clickTimer.current)
      if (!unmount) clickTimer.current = setTimeout(() => { suppressClick.current = false }, 0)
    }
    const up = ev => { if (ev.pointerId === pointerId) { point = { x: ev.clientX, y: ev.clientY }; stop(true) } }
    const cancel = ev => { if (ev?.type !== 'pointercancel' || ev.pointerId === pointerId) stop() }
    const keyDown = ev => { if (ev.key === 'Escape') { ev.preventDefault(); stop() } }
    cleanupRef.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', keyDown)
  }, [boardRef, enabled, onMove])
  useEffect(() => {
    if (!enabled) cleanupRef.current?.()
  }, [enabled])
  useEffect(() => () => {
    cleanupRef.current?.(false, true)
    clearTimeout(clickTimer.current)
  }, [])
  return { visual, start, suppressClick }
}
