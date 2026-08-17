import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { decodeHtmlEntities } from './manuscriptUtils.js'

function renderInlineMarkdown(text, keyPrefix = '') {
  if (!text) return []
  const parts = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  let last = 0, m, idx = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[2] !== undefined) parts.push(<strong key={`${keyPrefix}-b${idx}`}>{m[2]}</strong>)
    else if (m[3] !== undefined) parts.push(<em key={`${keyPrefix}-i${idx}`}>{m[3]}</em>)
    else parts.push(<u key={`${keyPrefix}-u${idx}`}>{m[4]}</u>)
    last = m.index + m[0].length
    idx++
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// Same "written scenes only, empty chapters skipped" filter FinalizedReader's
// scroll view uses — kept in sync deliberately rather than sharing a helper,
// since this is the one other place that needs exactly this shape rendered
// as a continuous flow (for column-count) instead of FinalizedReader's own
// section/article markup.
function useVisibleFlow(draft) {
  return useMemo(() => {
    const acts = (draft?.acts || []).filter(act =>
      (act.chapters || []).some(chapter => (chapter.scenes || []).some(scene => scene.content?.trim()))
    )
    const nodes = []
    acts.forEach((act, actIndex) => {
      ;(act.chapters || []).forEach((chapter, chapterIndex) => {
        const scenesWithText = (chapter.scenes || []).filter(scene => scene.content?.trim())
        if (!scenesWithText.length) return
        nodes.push(<h3 key={`h-${act.id || actIndex}-${chapter.id || chapterIndex}`}>{decodeHtmlEntities(chapter.title)}</h3>)
        scenesWithText.forEach((scene, sceneIndex) => {
          if (sceneIndex > 0) nodes.push(<div key={`b-${scene.id}`} className="ms-book-break" aria-hidden="true">···</div>)
          decodeHtmlEntities(scene.content).trim().split(/\n{2,}/).forEach((block, blockIndex) => {
            const text = block.split('\n').map(line => line.trim()).filter(Boolean).join(' ')
            if (!text) return
            nodes.push(<p key={`p-${scene.id}-${blockIndex}`}>{renderInlineMarkdown(text, `${scene.id}-${blockIndex}`)}</p>)
          })
        })
      })
    })
    return nodes
  }, [draft])
}

// Book pagination per the handoff spec: paged by translateX on the column
// flow — never scrollLeft, "the padded overflow:hidden box can't reach an
// aligned final spread". Spread count is Math.ceil(flow.scrollWidth /
// (flow.clientWidth + columnGap)), recomputed on every navigation and from a
// ResizeObserver on the flow — deliberately never cached across a resize.
export default function ManuscriptBookView({ draft, projectTitle }) {
  const nodes = useVisibleFlow(draft)
  const spreadRef = useRef(null)
  const flowRef = useRef(null)
  const [spread, setSpread] = useState(0)
  const [spreadCount, setSpreadCount] = useState(1)

  const measure = useCallback(() => {
    const flow = flowRef.current
    if (!flow) return
    const gap = parseFloat(getComputedStyle(flow).columnGap) || 0
    const step = flow.clientWidth + gap
    const count = step > 0 ? Math.max(1, Math.ceil(flow.scrollWidth / step)) : 1
    setSpreadCount(count)
    setSpread(current => Math.max(0, Math.min(current, count - 1)))
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, nodes])

  useEffect(() => {
    const flow = flowRef.current
    if (!flow || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(flow)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    const flow = flowRef.current
    if (!flow) return
    const gap = parseFloat(getComputedStyle(flow).columnGap) || 0
    const step = flow.clientWidth + gap
    flow.style.transform = `translateX(${-spread * step}px)`
  }, [spread, spreadCount])

  const goPrev = () => setSpread(s => Math.max(0, s - 1))
  const goNext = () => setSpread(s => Math.min(spreadCount - 1, s + 1))

  return (
    <div className="ms-book" aria-label={`${projectTitle || 'Manuscript'} — book view`}>
      <div className="ms-book-spread" ref={spreadRef}>
        <div className="ms-book-flow" ref={flowRef}>
          <h2>{decodeHtmlEntities(projectTitle) || 'Untitled'}</h2>
          {nodes.length === 0 && <p className="ms-book-empty">Nothing finalized to read yet.</p>}
          {nodes}
        </div>
      </div>
      <div className="ms-book-nav font-sans">
        <button type="button" onClick={goPrev} disabled={spread <= 0} aria-label="Previous pages">‹</button>
        <span>Pages {spread * 2 + 1}–{spread * 2 + 2} of {spreadCount * 2}</span>
        <button type="button" onClick={goNext} disabled={spread >= spreadCount - 1} aria-label="Next pages">›</button>
      </div>
    </div>
  )
}
