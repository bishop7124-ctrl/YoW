import { useCallback, useEffect, useRef, useState } from 'react'

// Manuscript.jsx mounts one wrapper div per scene regardless of viewport position, but
// the *content* inside it (a full SceneEditor — textarea or the regex-parsed
// ContentPreview) is only worth paying for near the visible area. On an 80k+ word
// manuscript with dozens of scenes, keeping every scene's SceneEditor mounted means
// every layout-forcing read anywhere on the page (e.g. the active textarea's own
// auto-grow `scrollHeight` correction) has to lay out the *entire* manuscript's DOM,
// not just the part on screen — this is the "architectural" cause the 2026-08-06/08
// typing-lag investigation in docs/ROADMAP.md landed on after ruling out every
// discrete function-level cost. This hook tracks which scene ids are within (or near)
// the visible area of the manuscript's scroll container, so Manuscript.jsx can swap
// far-away scenes for a lightweight, fixed-height placeholder instead of a live editor.
//
// rootMargin is large (not just a few hundred px) so scrolling — including a fast
// flick — almost always finds the next scene already mounted, not a placeholder that
// pops in a frame late. UNMOUNT_GRACE_MS debounces the *unmount* transition only (not
// mount), so a scene that briefly crosses the margin boundary and back doesn't
// thrash its SceneEditor subtree.
const ROOT_MARGIN = '1600px 0px 1600px 0px'
const UNMOUNT_GRACE_MS = 500

export function useSceneWindow(scrollContainerRef) {
  const supported = typeof IntersectionObserver !== 'undefined'
  const [inView, setInView] = useState(() => new Set())
  const observerRef = useRef(null)
  const elementsRef = useRef(new Map())
  const graceTimersRef = useRef(new Map())

  useEffect(() => {
    if (!supported) return undefined
    const root = scrollContainerRef.current
    if (!root) return undefined

    const observer = new IntersectionObserver(entries => {
      setInView(prev => {
        const next = new Set(prev)
        let changed = false
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-scene-id')
          if (!id) continue
          const timers = graceTimersRef.current
          if (entry.isIntersecting) {
            const pendingTimer = timers.get(id)
            if (pendingTimer) { clearTimeout(pendingTimer); timers.delete(id) }
            if (!next.has(id)) { next.add(id); changed = true }
          } else if (next.has(id) && !timers.has(id)) {
            const timer = setTimeout(() => {
              timers.delete(id)
              setInView(curr => {
                if (!curr.has(id)) return curr
                const dropped = new Set(curr)
                dropped.delete(id)
                return dropped
              })
            }, UNMOUNT_GRACE_MS)
            timers.set(id, timer)
          }
        }
        return changed ? next : prev
      })
    }, { root, rootMargin: ROOT_MARGIN, threshold: 0 })

    observerRef.current = observer
    elementsRef.current.forEach(el => observer.observe(el))

    return () => {
      observer.disconnect()
      graceTimersRef.current.forEach(timer => clearTimeout(timer))
      graceTimersRef.current.clear()
      observerRef.current = null
    }
    // Deliberately only depends on the container ref/support flag — re-running this on
    // every scene add/remove would tear down and rebuild the observer for the whole
    // manuscript. Elements register themselves individually via registerElement below.
  }, [scrollContainerRef, supported])

  const registerElement = useCallback((sceneId, el) => {
    const prevEl = elementsRef.current.get(sceneId)
    if (prevEl && observerRef.current) observerRef.current.unobserve(prevEl)
    if (el) {
      elementsRef.current.set(sceneId, el)
      observerRef.current?.observe(el)
    } else {
      elementsRef.current.delete(sceneId)
    }
  }, [])

  return { inView, registerElement, supported }
}
