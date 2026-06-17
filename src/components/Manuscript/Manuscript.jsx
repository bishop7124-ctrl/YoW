import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { getProjectType } from '../../constants/projectTypes'
import WritingSidebar from './WritingSidebar'
import TemplateModal from './TemplateModal'
import DocxImportModal from './DocxImportModal'
import AISuggestionPanel from './AISuggestionPanel'
import SceneVersionHistory from './SceneVersionHistory'
import ManuscriptSearch from './ManuscriptSearch'
import PacingChart from './PacingChart'
import { saveSceneVersion } from '../../utils/sceneVersions'
import ComicPlanner from '../comic/ComicPlanner'

const SCRIPT_TYPES = new Set(['play', 'screenplay', 'tv_show'])

const SCRIPT_ELEMENT_SETS = {
  play: [
    { value: 'scene_heading', label: 'Scene' },
    { value: 'action', label: 'Direction' },
    { value: 'character', label: 'Character' },
    { value: 'dialogue', label: 'Dialogue' },
    { value: 'parenthetical', label: 'Aside' },
    { value: 'transition', label: 'Curtain' },
  ],
  screenplay: [
    { value: 'scene_heading', label: 'Slugline' },
    { value: 'action', label: 'Action' },
    { value: 'character', label: 'Character' },
    { value: 'dialogue', label: 'Dialogue' },
    { value: 'parenthetical', label: 'Paren' },
    { value: 'transition', label: 'Transition' },
  ],
  tv_show: [
    { value: 'scene_heading', label: 'Scene' },
    { value: 'action', label: 'Action' },
    { value: 'character', label: 'Character' },
    { value: 'dialogue', label: 'Dialogue' },
    { value: 'parenthetical', label: 'Paren' },
    { value: 'transition', label: 'Act Out' },
  ],
}

const getScriptElements = (type) => SCRIPT_ELEMENT_SETS[type] || SCRIPT_ELEMENT_SETS.screenplay

const getScriptElementLabel = (type, value) =>
  getScriptElements(type).find(item => item.value === value)?.label || 'Action'

const getNextScriptElementAfterEnter = (current) => {
  if (current === 'character') return 'dialogue'
  if (current === 'parenthetical') return 'dialogue'
  if (current === 'dialogue') return 'action'
  if (current === 'transition') return 'scene_heading'
  return 'action'
}

const splitTextBlocks = (content = '') =>
  String(content).split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

const buildScriptBlocks = (content = '', element = 'action') =>
  splitTextBlocks(content).map((text, index) => ({ id: `block-${index}`, type: element, text }))

const syncScriptBlocks = (content = '', previous = [], fallback = 'action') =>
  splitTextBlocks(content).map((text, index) => ({
    id: previous[index]?.id || `block-${index}`,
    type: previous[index]?.type || fallback,
    text,
  }))

const getScriptBlockIndexAtOffset = (content = '', offset = 0) => {
  const text = String(content)
  const clamped = Math.max(0, Math.min(offset, text.length))
  const before = text.slice(0, clamped)
  const blocksBefore = before.split(/\n{2,}/)
  return Math.max(0, blocksBefore.length - 1)
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebouncedCallback(callback, delay) {
  const timeoutRef = useRef(null)
  const argsRef = useRef(null)
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  const cancel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    argsRef.current = null
  }, [])

  const flush = useCallback(() => {
    if (!timeoutRef.current || !argsRef.current) return
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    const args = argsRef.current
    argsRef.current = null
    callbackRef.current(...args)
  }, [])

  const schedule = useCallback((...args) => {
    argsRef.current = args
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      const latestArgs = argsRef.current
      argsRef.current = null
      if (latestArgs) callbackRef.current(...latestArgs)
    }, delay)
  }, [delay])

  useEffect(() => flush, [flush])

  return useMemo(() => ({ schedule, flush, cancel }), [schedule, flush, cancel])
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)
const countWords = value => {
  if (!value || typeof value !== 'string') return 0
  return value.trim().match(/\S+/g)?.length || 0
}
const dateKey = value => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function persistSceneDraftToLocalStorage(scene, content) {
  if (!scene?.id) return
  try {
    const now = Date.now()
    const today = dateKey(now)
    localStorage.setItem('nf_localWriteAt', String(now))
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    if (!Array.isArray(scenes)) return

    const nextScenes = scenes.map(item => {
      if (item.id !== scene.id) return item
      const history = Array.isArray(item.wordHistory) ? [...item.wordHistory] : []
      const entry = { date: today, words: countWords(content), timestamp: now }
      const lastIndex = history.findLastIndex(day => day.date === today)
      const wordHistory = lastIndex >= 0
        ? history.map((day, index) => index === lastIndex ? entry : day)
        : [...history, entry].slice(-120)
      return { ...item, content, lastModified: now, wordHistory }
    })

    if (!nextScenes.some(item => item.id === scene.id)) {
      nextScenes.push({ ...scene, content, lastModified: now, wordHistory: [{ date: today, words: countWords(content), timestamp: now }] })
    }
    localStorage.setItem('nf_scenes', JSON.stringify(nextScenes))

    // Save a version snapshot on blur/page-hide so history builds up naturally
    import('../../utils/sceneVersions').then(m => {
      m.saveSceneVersion({ ...scene, content })
    }).catch(() => {})
  } catch (error) {
    console.warn('Could not save latest scene draft before leaving the page.', error)
  }
}

// ─── Format settings ──────────────────────────────────────────────────────────

const FONTS = [
  { label: 'Georgia',  value: 'Georgia, "Times New Roman", serif' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Times',    value: '"Times New Roman", Times, serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", serif' },
  { label: 'Courier',  value: '"Courier New", Courier, monospace' },
  { label: 'Sans',     value: 'system-ui, -apple-system, sans-serif' },
]

const LINE_SPACINGS = [
  { label: '1.5', value: 1.5 },
  { label: '1.75', value: 1.75 },
  { label: '2.0',  value: 2 },
  { label: '2.5',  value: 2.5 },
]

const INDENT_SIZES = [2, 4, 6, 8]

const DEFAULT_FORMAT = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 19,
  lineHeight: 2,
  textAlign: 'left',
  autoIndent: true,
  indentSize: 4,
}

function loadFormat() {
  try {
    const s = localStorage.getItem('nf-format-settings')
    return s ? { ...DEFAULT_FORMAT, ...JSON.parse(s) } : DEFAULT_FORMAT
  } catch { return DEFAULT_FORMAT }
}

// ─── Scene statuses ───────────────────────────────────────────────────────────

const SCENE_STATUSES = [
  { value: 'draft',    label: 'Draft',    color: 'var(--text-muted)' },
  { value: 'writing',  label: 'Writing',  color: '#60a5fa' },
  { value: 'complete', label: 'Done',     color: '#4ade80' },
  { value: 'revision', label: 'Revision', color: '#fb923c' },
]

const nextStatus = (current) => {
  const idx = SCENE_STATUSES.findIndex(s => s.value === current)
  return SCENE_STATUSES[(idx + 1) % SCENE_STATUSES.length].value
}

// ─── Final draft reader helpers ──────────────────────────────────────────────

function wordCountForScenes(scenes) {
  return scenes.reduce((sum, scene) => sum + countWords(scene.content || ''), 0)
}

function buildFinalizedDraft({ novel, acts, chapters, scenes, labels, title }) {
  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  const snapshotActs = sortedActs.map((act, actIndex) => {
    const actChapters = chapters
      .filter(chapter => chapter.actId === act.id)
      .sort((a, b) => a.order - b.order)
      .map((chapter, chapterIndex) => {
        const chapterScenes = scenes
          .filter(scene => scene.chapterId === chapter.id)
          .sort((a, b) => a.order - b.order)
          .map((scene, sceneIndex) => ({
            id: scene.id,
            title: scene.title || `${labels.level3} ${sceneIndex + 1}`,
            content: scene.content || '',
            textMode: scene.textMode || 'prose',
            scriptElement: scene.scriptElement || 'action',
            scriptBlocks: scene.scriptBlocks || [],
          }))

        return {
          id: chapter.id,
          title: chapter.title || `${labels.level2} ${chapterIndex + 1}`,
          order: chapterIndex,
          scenes: chapterScenes,
        }
      })

    return {
      id: act.id,
      title: act.title || `${labels.level1} ${actIndex + 1}`,
      order: actIndex,
      chapters: actChapters,
    }
  })

  return {
    id: uid(),
    title,
    projectTitle: novel?.title || 'Untitled',
    finalizedAt: new Date().toISOString(),
    wordCount: wordCountForScenes(scenes),
    structure: labels,
    acts: snapshotActs,
  }
}

function formatFinalizedDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Final draft'
  }
}

const FINAL_PAGE_WORD_TARGET = 230

function getFinalizedContentBlocks(draft) {
  const blocks = [{ type: 'cover', id: 'cover' }]
  const visibleActs = (draft.acts || []).filter(act =>
    (act.chapters || []).some(chapter => (chapter.scenes || []).some(scene => scene.content?.trim()))
  )

  visibleActs.forEach((act, actIndex) => {
    if (visibleActs.length > 1) {
      blocks.push({ type: 'act', id: `act-${act.id || actIndex}`, text: act.title })
    }

    ;(act.chapters || []).forEach((chapter, chapterIndex) => {
      const scenesWithText = (chapter.scenes || []).filter(scene => scene.content?.trim())
      if (!scenesWithText.length) return
      blocks.push({ type: 'chapter', id: `chapter-${chapter.id || chapterIndex}`, text: chapter.title })

      scenesWithText.forEach((scene, sceneIndex) => {
        if (sceneIndex > 0) blocks.push({ type: 'break', id: `break-${scene.id || sceneIndex}` })
        scene.content.trim().split(/\n{2,}/).forEach((block, blockIndex) => {
          const text = block.split('\n').map(line => line.trim()).filter(Boolean).join(' ')
          if (text) blocks.push({ type: 'paragraph', id: `p-${scene.id || sceneIndex}-${blockIndex}`, text })
        })
      })
    })
  })

  if (blocks.length === 1) blocks.push({ type: 'empty', id: 'empty' })
  return blocks
}

function paginateFinalizedDraft(draft) {
  const blocks = getFinalizedContentBlocks(draft)
  const pages = [{ id: 'page-cover', blocks: [blocks[0]] }]
  let current = []
  let currentWords = 0

  const pushCurrent = () => {
    if (!current.length) return
    pages.push({ id: `page-${pages.length + 1}`, blocks: current })
    current = []
    currentWords = 0
  }

  blocks.slice(1).forEach(block => {
    if (block.type === 'act' || block.type === 'chapter') {
      if (currentWords > FINAL_PAGE_WORD_TARGET * 0.68) pushCurrent()
      current.push(block)
      return
    }

    if (block.type === 'break') {
      current.push(block)
      return
    }

    const words = countWords(block.text || '')
    if (currentWords && currentWords + words > FINAL_PAGE_WORD_TARGET) pushCurrent()
    current.push(block)
    currentWords += words
  })

  pushCurrent()
  return pages
}

function FinalPage({ page, draft, pageNumber }) {
  if (!page) return <div className="ms-final-page ms-final-page-blank" aria-hidden="true" />

  return (
    <section className="ms-final-page" aria-label={`Page ${pageNumber}`}>
      <div className="ms-final-page-content">
        {page.blocks.map(block => {
          if (block.type === 'cover') return (
            <div key={block.id} className="ms-final-page-cover">
              <p className="ms-final-kicker">Finalized draft</p>
              <h1>{draft.projectTitle || 'Untitled'}</h1>
              <p>{draft.title}</p>
              <span>{formatFinalizedDate(draft.finalizedAt)}</span>
            </div>
          )
          if (block.type === 'act') return <h2 key={block.id}>{block.text}</h2>
          if (block.type === 'chapter') return <h3 key={block.id}>{block.text}</h3>
          if (block.type === 'break') return <div key={block.id} className="ms-final-break" aria-hidden="true">* * *</div>
          if (block.type === 'empty') return <div key={block.id} className="ms-final-empty">This finalized draft does not contain any manuscript text.</div>
          return <p key={block.id}>{renderInlineMarkdown(block.text, block.id)}</p>
        })}
      </div>
      <footer>{pageNumber}</footer>
    </section>
  )
}

function FinalizedPageReader({ draft, pageIndex, onPageIndexChange }) {
  const pages = useMemo(() => paginateFinalizedDraft(draft), [draft])
  const maxIndex = Math.max(0, pages.length - 1)
  const currentIndex = Math.min(Math.max(0, pageIndex), maxIndex)
  const leftPage = pages[currentIndex]
  const rightPage = pages[currentIndex + 1] || null
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex + 2 < pages.length
  const currentLabel = rightPage
    ? `${currentIndex + 1}-${currentIndex + 2}`
    : `${currentIndex + 1}`

  return (
    <main className="manuscript-page ms-final-reader ms-final-reader-paged workspace-page flex-1 overflow-y-auto min-w-0">
      <div className="ms-final-page-shell">
        <div className="ms-final-page-controls font-sans">
          <button
            className="ms-final-page-btn"
            onClick={() => onPageIndexChange(Math.max(0, currentIndex - 2))}
            disabled={!canGoPrev}
            aria-label="Previous pages"
          >
            Previous
          </button>
          <span>Pages {currentLabel} of {pages.length}</span>
          <button
            className="ms-final-page-btn"
            onClick={() => onPageIndexChange(Math.min(maxIndex, currentIndex + 2))}
            disabled={!canGoNext}
            aria-label="Next pages"
          >
            Next
          </button>
        </div>

        <div className="ms-final-book-spread">
          <FinalPage page={leftPage} draft={draft} pageNumber={currentIndex + 1} />
          <FinalPage page={rightPage} draft={draft} pageNumber={currentIndex + 2} />
        </div>
      </div>
    </main>
  )
}

function FinalizedReader({ draft, viewMode, pageIndex, onPageIndexChange }) {
  if (!draft) return null

  if (viewMode === 'pages') {
    return (
      <FinalizedPageReader
        draft={draft}
        pageIndex={pageIndex}
        onPageIndexChange={onPageIndexChange}
      />
    )
  }

  const visibleActs = (draft.acts || []).filter(act =>
    (act.chapters || []).some(chapter => (chapter.scenes || []).some(scene => scene.content?.trim()))
  )

  return (
    <main className="manuscript-page ms-final-reader workspace-page flex-1 overflow-y-auto scroll-smooth min-w-0">
      <article className="ms-final-book" aria-label="Finalized manuscript">
        <header className="ms-final-title-page">
          <p className="ms-final-kicker">Finalized draft</p>
          <h1>{draft.projectTitle || 'Untitled'}</h1>
          <p>{draft.title}</p>
          <span>{formatFinalizedDate(draft.finalizedAt)}</span>
        </header>

        {visibleActs.length === 0 && (
          <div className="ms-final-empty">This finalized draft does not contain any manuscript text.</div>
        )}

        {visibleActs.map((act, actIndex) => (
          <section key={act.id || actIndex} className="ms-final-act">
            {visibleActs.length > 1 && <h2>{act.title}</h2>}
            {(act.chapters || []).map((chapter, chapterIndex) => {
              const scenesWithText = (chapter.scenes || []).filter(scene => scene.content?.trim())
              if (!scenesWithText.length) return null
              return (
                <section key={chapter.id || chapterIndex} className="ms-final-chapter">
                  <h3>{chapter.title}</h3>
                  {scenesWithText.map((scene, sceneIndex) => (
                    <div key={scene.id || sceneIndex} className="ms-final-scene">
                      {sceneIndex > 0 && <div className="ms-final-break" aria-hidden="true">* * *</div>}
                      {scene.content.trim().split(/\n{2,}/).map((block, blockIndex) => {
                        const text = block.split('\n').map(line => line.trim()).filter(Boolean).join(' ')
                        if (!text) return null
                        return <p key={blockIndex}>{renderInlineMarkdown(text, `${scene.id}-${blockIndex}`)}</p>
                      })}
                    </div>
                  ))}
                </section>
              )
            })}
          </section>
        ))}
      </article>
    </main>
  )
}

// ─── Export ──────────────────────────────────────────────────────────────────

async function exportToDocx(novel, acts, chapters, scenes, chapterGlobalNumbers) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, PageBreak } = await import('docx')
  const labels = getProjectType(novel?.type).structure || {}
  const isScriptProject = SCRIPT_TYPES.has(novel?.type)

  const children = []

  children.push(
    new Paragraph({
      children: [new TextRun({ text: novel?.title || 'Untitled', bold: true, size: 56, font: 'Times New Roman' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  )

  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  let firstAct = true

  sortedActs.forEach(act => {
    const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order)
    if (!actChapters.length) return

    if (!firstAct) children.push(new Paragraph({ children: [new PageBreak()] }))
    firstAct = false

    children.push(
      new Paragraph({
        text: act.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 0, after: 240 },
      })
    )

    actChapters.forEach((chap, chapIndex) => {
      const num = chapterGlobalNumbers[chap.id]
      const l2 = (labels.level2 || 'Chapter').toLowerCase()
      const isDefault = !chap.title || chap.title.toLowerCase().startsWith(l2)
      const chapTitle = isDefault ? `${labels.level2 || 'Chapter'} ${num}` : `${labels.level2 || 'Chapter'} ${num}: ${chap.title}`

      if (chapIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }))

      children.push(
        new Paragraph({
          text: chapTitle,
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 0, after: 360 },
        })
      )

      const chapScenes = scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order)

      chapScenes.forEach((scene, sceneIndex) => {
        if (sceneIndex > 0) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: '* * *' })],
              alignment: AlignmentType.CENTER,
              spacing: { before: 240, after: 240 },
            })
          )
        }

        const content = scene.content?.trim()
        if (!content) return

        if (isScriptProject) {
          const blocks = scene.scriptBlocks?.length
            ? scene.scriptBlocks
            : buildScriptBlocks(content, scene.scriptElement || 'action')
          blocks.forEach(block => {
            if (!block.text?.trim()) return
            const type = block.type || scene.scriptElement || 'action'
            const text = block.text.split('\n').map(l => l.trim()).filter(Boolean).join(' ')
            const isCentered = type === 'character' || type === 'transition'
            children.push(
              new Paragraph({
                children: [new TextRun({ text, font: 'Courier New', size: 24, bold: type === 'character' || type === 'scene_heading' || type === 'transition' })],
                alignment: isCentered ? AlignmentType.CENTER : AlignmentType.LEFT,
                indent: type === 'dialogue'
                  ? { left: 1800, right: 1440 }
                  : type === 'parenthetical'
                    ? { left: 2160, right: 1800 }
                    : { left: 720, right: 720 },
                spacing: { before: type === 'scene_heading' ? 260 : 80, after: 80, line: 300 },
              })
            )
          })
          return
        }

        const blocks = content.split(/\n{2,}/)
        blocks.forEach(block => {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
          if (!lines.length) return
          children.push(
            new Paragraph({
              children: [new TextRun({ text: lines.join(' '), font: 'Times New Roman', size: 24 })],
              indent: { firstLine: 720 },
              spacing: { after: 0, line: 360 },
            })
          )
        })
      })
    })
  })

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const exportName = getProjectType(novel?.type).workspaceLabel || 'manuscript'
  a.download = `${(novel?.title || exportName).replace(/[^a-z0-9 ]/gi, '_')}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Inline title input ───────────────────────────────────────────────────────

const InlineInput = ({ value, onSave, className, placeholder }) => {
  const [temp, setTemp] = useState(value)
  const saved = useRef(false)
  const commit = () => {
    if (saved.current) return
    saved.current = true
    onSave(temp.trim() || value)
  }
  return (
    <input
      autoFocus
      className={`bg-transparent outline-none border-b border-[var(--accent)] ${className}`}
      value={temp}
      placeholder={placeholder}
      onChange={e => setTemp(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') { saved.current = true; onSave(value) } }}
      onBlur={commit}
    />
  )
}

// ─── Inline markdown renderer ─────────────────────────────────────────────────

function renderInlineMarkdown(text, keyPrefix = '') {
  if (!text) return []
  const parts = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  let last = 0, m, idx = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[0].startsWith('**')) parts.push(<strong key={`${keyPrefix}-b${idx}`}>{m[2]}</strong>)
    else if (m[0].startsWith('*')) parts.push(<em key={`${keyPrefix}-i${idx}`}>{m[3]}</em>)
    else parts.push(<u key={`${keyPrefix}-u${idx}`}>{m[4]}</u>)
    last = m.index + m[0].length
    idx++
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

// ─── Entity / note parsing ────────────────────────────────────────────────────

function parseSegments(content, entityNames, entityMap) {
  if (!content) return []
  const tokens = []

  if (entityNames.length > 0) {
    const escaped = entityNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const ep = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
    let m
    while ((m = ep.exec(content)) !== null) {
      const key = Object.keys(entityMap).find(k => k.toLowerCase() === m[1].toLowerCase())
      if (key) tokens.push({ type: 'entity', start: m.index, end: m.index + m[1].length, value: m[1], entity: entityMap[key] })
    }
  }

  const np = /\[\[(\d+)\]\]/g
  let m
  while ((m = np.exec(content)) !== null) {
    tokens.push({ type: 'note', start: m.index, end: m.index + m[0].length, seq: parseInt(m[1]) })
  }

  tokens.sort((a, b) => a.start - b.start)
  const filtered = []
  let lastEnd = 0
  for (const t of tokens) {
    if (t.start >= lastEnd) { filtered.push(t); lastEnd = t.end }
  }

  const segs = []
  let pos = 0
  for (const t of filtered) {
    if (t.start > pos) segs.push({ type: 'text', value: content.slice(pos, t.start) })
    segs.push(t)
    pos = t.end
  }
  if (pos < content.length) segs.push({ type: 'text', value: content.slice(pos) })
  return segs
}

// ─── Content preview ──────────────────────────────────────────────────────────

const ScriptPreview = ({ blocks, elementType, projectType, entityNames, entityMap, onEntityClick, onNoteClick }) => {
  const resolvedBlocks = blocks?.length ? blocks : buildScriptBlocks('', elementType)
  if (!resolvedBlocks.length) return <span className="ms-placeholder">Begin writing here…</span>

  return (
    <div className="ms-script-preview">
      {resolvedBlocks.map((block, index) => {
        const type = block.type || elementType || 'action'
        const segs = parseSegments(block.text || '', entityNames, entityMap)
        return (
          <div key={block.id || index} className={`ms-script-block ms-script-${type}`}>
            <span className="ms-script-block-label">{getScriptElementLabel(projectType, type)}</span>
            <p>
              {segs.map((seg, i) => {
                if (seg.type === 'entity') return (
                  <span key={i} className="ms-entity" onClick={e => { e.stopPropagation(); onEntityClick(seg.entity) }} title={`${seg.entity.section}: ${seg.value}`}>{seg.value}</span>
                )
                if (seg.type === 'note') return (
                  <sup key={i} className="ms-note-marker" onClick={e => { e.stopPropagation(); onNoteClick(seg.seq) }} title={`Note ${seg.seq}`}>{seg.seq}</sup>
                )
                return <span key={i}>{renderInlineMarkdown(seg.value, `sb${index}-${i}`)}</span>
              })}
            </p>
          </div>
        )
      })}
    </div>
  )
}

const ContentPreview = ({ content, entityMap, onEntityClick, onNoteClick, isBullets, isScript, scriptBlocks, scriptElement, projectType }) => {
  const entityNames = useMemo(
    () => Object.keys(entityMap).sort((a, b) => b.length - a.length),
    [entityMap]
  )

  if (!content) return <span className="ms-placeholder">Begin writing here…</span>

  if (isScript) {
    return (
      <ScriptPreview
        blocks={scriptBlocks?.length ? scriptBlocks : buildScriptBlocks(content, scriptElement)}
        elementType={scriptElement}
        projectType={projectType}
        entityNames={entityNames}
        entityMap={entityMap}
        onEntityClick={onEntityClick}
        onNoteClick={onNoteClick}
      />
    )
  }

  if (isBullets) {
    const lines = content.split('\n').filter(l => l.trim())
    if (!lines.length) return <span className="ms-placeholder">One item per line…</span>
    return (
      <ul className="ms-bullets">
        {lines.map((line, i) => <li key={i}>{renderInlineMarkdown(line, `bl${i}`)}</li>)}
      </ul>
    )
  }

  const segs = parseSegments(content, entityNames, entityMap)
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === 'entity') return (
          <span key={i} className="ms-entity" onClick={e => { e.stopPropagation(); onEntityClick(seg.entity) }} title={`${seg.entity.section}: ${seg.value}`}>{seg.value}</span>
        )
        if (seg.type === 'note') return (
          <sup key={i} className="ms-note-marker" onClick={e => { e.stopPropagation(); onNoteClick(seg.seq) }} title={`Note ${seg.seq}`}>{seg.seq}</sup>
        )
        return <span key={i}>{renderInlineMarkdown(seg.value, `s${i}`)}</span>
      })}
    </>
  )
}

// ─── Scene metadata bar ───────────────────────────────────────────────────────

const SceneMetaBar = ({ scene, onUpdate, characterNames, locationNames }) => {
  const status = scene.status || 'draft'
  const statusCfg = SCENE_STATUSES.find(s => s.value === status) ?? SCENE_STATUSES[0]

  return (
    <div className="ms-scene-meta font-sans">
      {/* Status chip */}
      <button
        className="ms-meta-chip ms-meta-status"
        onClick={() => onUpdate({ status: nextStatus(status) })}
        title={`Status: ${statusCfg.label} (click to change)`}
        style={{ '--dot-color': statusCfg.color }}
      >
        <span className="ms-meta-dot" />
        {statusCfg.label}
      </button>

      {/* POV */}
      <label className="ms-meta-field" title="Point of view character">
        <span className="ms-meta-label">POV</span>
        <input
          className="ms-meta-input"
          value={scene.pov || ''}
          onChange={e => onUpdate({ pov: e.target.value })}
          placeholder="—"
          list={`pov-list-${scene.id}`}
        />
        {characterNames?.length > 0 && (
          <datalist id={`pov-list-${scene.id}`}>
            {characterNames.map(n => <option key={n} value={n} />)}
          </datalist>
        )}
      </label>

      {/* Location */}
      <label className="ms-meta-field" title="Scene location">
        <span className="ms-meta-label">Location</span>
        <input
          className="ms-meta-input"
          value={scene.locationTag || ''}
          onChange={e => onUpdate({ locationTag: e.target.value })}
          placeholder="—"
          list={`loc-list-${scene.id}`}
        />
        {locationNames?.length > 0 && (
          <datalist id={`loc-list-${scene.id}`}>
            {locationNames.map(n => <option key={n} value={n} />)}
          </datalist>
        )}
      </label>

      {/* Word count for this scene */}
      {scene.content?.trim() && (
        <span className="ms-meta-words">
          {scene.content.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
        </span>
      )}
    </div>
  )
}

// ─── Scene editor ─────────────────────────────────────────────────────────────

const SceneEditor = ({
  scene, sceneIndex,
  onUpdate, onUpdateScene, onSplit,
  innerRef, onFocus: onFocusExternal,
  entityMap, onEntityClick,
  onOpenNotes, onNoteClick,
  formatSettings, characterNames, locationNames,
  onPersistDraft,
  onOpenVersionHistory,
  projectType,
}) => {
  const [localContent, setLocalContent] = useState(scene.content || '')
  const [localScriptBlocks, setLocalScriptBlocks] = useState(() => scene.scriptBlocks?.length
    ? scene.scriptBlocks
    : buildScriptBlocks(scene.content || '', scene.scriptElement || 'action'))
  const [activeScriptBlockIndex, setActiveScriptBlockIndex] = useState(0)
  const [focused, setFocused] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const textareaRef = useRef(null)
  const wrapperRef = useRef(null)
  const localContentRef = useRef(localContent)
  const isScript = SCRIPT_TYPES.has(projectType)
  const isBullets = !isScript && scene.textMode === 'bullets'
  const scriptElement = localScriptBlocks[activeScriptBlockIndex]?.type || scene.scriptElement || 'action'
  const scriptElements = getScriptElements(projectType)

  const hasMetadata = !!(scene.pov || scene.locationTag || (scene.status && scene.status !== 'draft'))

  useEffect(() => {
    if (focused) return undefined
    const sync = window.requestAnimationFrame(() => {
      const content = scene.content || ''
      setLocalContent(content)
      setLocalScriptBlocks(scene.scriptBlocks?.length ? scene.scriptBlocks : buildScriptBlocks(content, scene.scriptElement || 'action'))
      setActiveScriptBlockIndex(0)
    })
    return () => window.cancelAnimationFrame(sync)
  }, [scene.content, scene.scriptBlocks, scene.scriptElement, focused])

  // Auto-resize + scroll to keep cursor near vertical centre while typing
  useEffect(() => {
    if (!focused || !textareaRef.current) return
    const ta = textareaRef.current
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'

    const scrollEl = ta.closest('.ms-scroll-container')
    if (!scrollEl) return

    const scrollElRect = scrollEl.getBoundingClientRect()
    const taRect = ta.getBoundingClientRect()

    // Approximate cursor position within textarea
    const text = ta.value.substring(0, ta.selectionEnd)
    const lineCount = Math.max(text.split('\n').length, 1)
    const totalLines = Math.max(ta.value.split('\n').length, 1)
    const cursorRatio = lineCount / totalLines

    const taTopInScroll = taRect.top - scrollElRect.top + scrollEl.scrollTop
    const cursorYInScroll = taTopInScroll + taRect.height * cursorRatio

    // Centre of scroll container
    const targetScroll = cursorYInScroll - scrollEl.clientHeight * 0.42

    // Only scroll if cursor is outside a comfortable zone (avoid constant jumping)
    const cursorVisibleY = taRect.top + taRect.height * cursorRatio - scrollElRect.top
    const topZone = scrollEl.clientHeight * 0.25
    const bottomZone = scrollEl.clientHeight * 0.75
    if (cursorVisibleY < topZone || cursorVisibleY > bottomZone) {
      scrollEl.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
    }
  }, [localContent, focused])

  const debouncedUpdate = useDebouncedCallback(text => onUpdate(scene.id, text), 400)

  useEffect(() => {
    if (!innerRef) return
    innerRef({
      focus: () => { setFocused(true); setTimeout(() => textareaRef.current?.focus(), 0) },
      scrollIntoView: opts => wrapperRef.current?.scrollIntoView(opts),
      appendContent: (text) => {
        const cur = localContentRef.current ?? ''
        const next = cur.trimEnd() + (cur.trim() ? '\n\n' : '') + text
        localContentRef.current = next
        persistSceneDraftToLocalStorage(scene, next)
        setLocalContent(next)
        debouncedUpdate.schedule(next)
      },
    })
  }, [innerRef, scene, debouncedUpdate])

  useEffect(() => {
    localContentRef.current = localContent
  }, [localContent])

  useEffect(() => {
    if (!focused) return undefined
    const flushDraft = () => {
      onPersistDraft(scene, localContentRef.current)
      debouncedUpdate.flush()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraft()
    }
    window.addEventListener('pagehide', flushDraft)
    window.addEventListener('beforeunload', flushDraft)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushDraft)
      window.removeEventListener('beforeunload', flushDraft)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushDraft()
    }
  }, [focused, scene, debouncedUpdate, onPersistDraft])

  const handleChange = e => {
    const nextContent = e.target.value
    localContentRef.current = nextContent
    onPersistDraft(scene, nextContent)
    setLocalContent(nextContent)
    debouncedUpdate.schedule(nextContent)
    if (isScript) {
      const nextBlocks = syncScriptBlocks(nextContent, localScriptBlocks, scriptElement)
      const nextIndex = getScriptBlockIndexAtOffset(nextContent, e.target.selectionStart)
      setLocalScriptBlocks(nextBlocks)
      setActiveScriptBlockIndex(Math.min(nextIndex, Math.max(0, nextBlocks.length - 1)))
      onUpdateScene(scene.id, {
        scriptBlocks: nextBlocks,
        scriptElement: nextBlocks[nextIndex]?.type || scriptElement,
        textMode: 'script',
      })
    }
  }

  const syncActiveScriptBlock = useCallback(() => {
    if (!isScript || !textareaRef.current) return
    const nextIndex = getScriptBlockIndexAtOffset(localContentRef.current, textareaRef.current.selectionStart)
    setActiveScriptBlockIndex(Math.min(nextIndex, Math.max(0, localScriptBlocks.length - 1)))
  }, [isScript, localScriptBlocks.length])

  const setActiveScriptElement = useCallback((type) => {
    if (!isScript) return
    const nextBlocks = localScriptBlocks.length
      ? localScriptBlocks.map((block, index) => index === activeScriptBlockIndex ? { ...block, type } : block)
      : buildScriptBlocks(localContent, type)
    setLocalScriptBlocks(nextBlocks)
    onUpdateScene(scene.id, {
      scriptElement: type,
      scriptBlocks: nextBlocks,
      textMode: 'script',
    })
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [activeScriptBlockIndex, isScript, localContent, localScriptBlocks, onUpdateScene, scene.id])

  const cycleScriptElement = useCallback((direction = 1) => {
    if (!isScript) return
    const currentIndex = scriptElements.findIndex(item => item.value === scriptElement)
    const nextIndex = (currentIndex + direction + scriptElements.length) % scriptElements.length
    setActiveScriptElement(scriptElements[nextIndex].value)
  }, [isScript, scriptElement, scriptElements, setActiveScriptElement])

  const insertScriptParagraph = useCallback((nextType) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const insertion = '\n\n'
    const nextContent = localContent.slice(0, start) + insertion + localContent.slice(end)
    const newIndex = getScriptBlockIndexAtOffset(nextContent, start + insertion.length)
    const synced = syncScriptBlocks(nextContent, localScriptBlocks, scriptElement)
    const padded = [...synced]
    while (padded.length <= newIndex) {
      padded.push({ id: `block-${padded.length}`, type: nextType, text: '' })
    }
    const nextBlocks = padded.map((block, index) => index === newIndex ? { ...block, type: nextType } : block)

    localContentRef.current = nextContent
    onPersistDraft(scene, nextContent)
    setLocalContent(nextContent)
    setLocalScriptBlocks(nextBlocks)
    setActiveScriptBlockIndex(Math.min(newIndex, Math.max(0, nextBlocks.length - 1)))
    debouncedUpdate.schedule(nextContent)
    onUpdateScene(scene.id, {
      scriptElement: nextType,
      scriptBlocks: nextBlocks,
      textMode: 'script',
    })
    window.setTimeout(() => {
      if (!textareaRef.current) return
      textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertion.length
    }, 0)
  }, [debouncedUpdate, localContent, localScriptBlocks, onPersistDraft, onUpdateScene, scene, scriptElement])

  const wrapSelection = useCallback((syntax) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = localContent.slice(start, end)
    const wrapped = selected ? `${syntax}${selected}${syntax}` : `${syntax}${syntax}`
    const newContent = localContent.slice(0, start) + wrapped + localContent.slice(end)
    localContentRef.current = newContent
    onPersistDraft(scene, newContent)
    setLocalContent(newContent)
    debouncedUpdate.schedule(newContent)
    setTimeout(() => {
      if (!ta) return
      if (selected) { ta.selectionStart = start + syntax.length; ta.selectionEnd = start + syntax.length + selected.length }
      else { ta.selectionStart = ta.selectionEnd = start + syntax.length }
      ta.focus()
    }, 0)
  }, [localContent, debouncedUpdate, onPersistDraft, scene])

  const handleKeyDown = e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**'); return }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); wrapSelection('*'); return }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); wrapSelection('_'); return }

    if (isScript && (e.ctrlKey || e.metaKey) && /^[1-6]$/.test(e.key)) {
      const next = scriptElements[Number(e.key) - 1]
      if (next) {
        e.preventDefault()
        setActiveScriptElement(next.value)
        return
      }
    }

    if (isScript && e.key === 'Tab') {
      e.preventDefault()
      cycleScriptElement(e.shiftKey ? -1 : 1)
      return
    }

    if (e.key === 'Enter' && localContent.includes('/scene')) {
      e.preventDefault()
      debouncedUpdate.cancel()
      const pos = e.target.selectionStart
      const before = localContent.slice(0, pos).replace('/scene', '').trim()
      const after = localContent.slice(pos).replace('/scene', '').trim()
      localContentRef.current = before
      onPersistDraft(scene, before)
      setLocalContent(before)
      onSplit(scene.id, scene.chapterId, before, after)
      return
    }

    if (isScript && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      insertScriptParagraph(getNextScriptElementAfterEnter(scriptElement))
      return
    }

    if (e.key === 'Enter' && formatSettings.autoIndent && !isBullets && !e.shiftKey) {
      e.preventDefault()
      const start = e.target.selectionStart
      const end = e.target.selectionEnd
      const insertion = '\n' + ' '.repeat(formatSettings.indentSize)
      const nextContent = localContent.slice(0, start) + insertion + localContent.slice(end)
      localContentRef.current = nextContent
      onPersistDraft(scene, nextContent)
      setLocalContent(nextContent)
      debouncedUpdate.schedule(nextContent)
      window.setTimeout(() => {
        if (!textareaRef.current) return
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + insertion.length
      }, 0)
    }
  }

  const handleAddNote = useCallback(() => {
    const nextSeq = (scene.notes?.length || 0) + 1
    const marker = `[[${nextSeq}]]`
    const ta = textareaRef.current
    if (ta) {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newContent = localContent.slice(0, start) + marker + localContent.slice(end)
      localContentRef.current = newContent
      onPersistDraft(scene, newContent)
      setLocalContent(newContent)
      debouncedUpdate.schedule(newContent)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + marker.length; ta.focus() }, 0)
    }
    onUpdateScene(scene.id, { notes: [...(scene.notes || []), { id: uid(), seq: nextSeq, text: '' }] })
    onOpenNotes()
  }, [scene, localContent, debouncedUpdate, onPersistDraft, onUpdateScene, onOpenNotes])

  const activate = () => { setFocused(true); setTimeout(() => textareaRef.current?.focus(), 0) }

  const displayTitle = scene.title && scene.title !== 'Scene'
    ? scene.title
    : `Scene ${sceneIndex + 1}`

  const textStyle = {
    fontFamily: formatSettings.fontFamily,
    fontSize: formatSettings.fontSize,
    lineHeight: formatSettings.lineHeight,
    textAlign: formatSettings.textAlign,
  }

  return (
    <div ref={wrapperRef} className="relative group/scene" id={`ms-scene-${scene.id}`}>
      {/* Scene header — title + controls */}
      <div className={`ms-scene-header ${focused || hasMetadata ? 'is-visible' : ''}`}>
        <div className="ms-scene-header-row">
          {editingTitle ? (
            <InlineInput
              value={scene.title && scene.title !== 'Scene' ? scene.title : ''}
              placeholder={`Scene ${sceneIndex + 1}`}
              onSave={t => { onUpdateScene(scene.id, { title: t || 'Scene' }); setEditingTitle(false) }}
              className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] w-40"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              title="Click to rename scene"
            >
              {displayTitle}
            </button>
          )}

          <div className="flex-1 h-px bg-[var(--border)]" />

          <div className="flex rounded overflow-hidden border border-[var(--border)] text-[9px] font-bold uppercase tracking-wider">
            {isScript ? (
              <select
                value={scriptElement}
                onChange={e => setActiveScriptElement(e.target.value)}
                className="ms-script-select"
                title="Script element type for the current paragraph. Tab cycles; Ctrl/Cmd+1-6 jumps directly."
              >
                {scriptElements.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            ) : (
              <>
                <button
                  onClick={() => onUpdateScene(scene.id, { textMode: 'prose' })}
                  className={`px-2 py-0.5 transition-colors ${!isBullets ? 'bg-[var(--accent)] text-[var(--bg-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >Prose</button>
                <button
                  onClick={() => onUpdateScene(scene.id, { textMode: 'bullets' })}
                  className={`px-2 py-0.5 transition-colors ${isBullets ? 'bg-[var(--accent)] text-[var(--bg-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                >Bullets</button>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 border border-[var(--border)] rounded overflow-hidden">
            <button onMouseDown={e => { e.preventDefault(); wrapSelection('**') }} className="px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors" title="Bold (Ctrl+B)">B</button>
            <button onMouseDown={e => { e.preventDefault(); wrapSelection('*') }} className="px-2 py-0.5 text-[11px] italic text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors" title="Italic (Ctrl+I)">I</button>
            <button onMouseDown={e => { e.preventDefault(); wrapSelection('_') }} className="px-2 py-0.5 text-[11px] underline text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors" title="Underline (Ctrl+U)">U</button>
          </div>

          <button
            onClick={handleAddNote}
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
          >+ Note</button>

          {onOpenVersionHistory && (
            <button
              onClick={() => onOpenVersionHistory(scene.id)}
              className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
              title="View and restore previous versions of this scene"
            >History</button>
          )}
        </div>

        {/* Scene metadata row */}
        {(focused || hasMetadata) && (
          <SceneMetaBar
            scene={scene}
            onUpdate={data => onUpdateScene(scene.id, data)}
            characterNames={characterNames}
            locationNames={locationNames}
          />
        )}
      </div>

      {focused ? (
        <textarea
          ref={textareaRef}
          value={localContent}
          onFocus={() => { setFocused(true); onFocusExternal() }}
          onBlur={() => { onPersistDraft(scene, localContentRef.current); debouncedUpdate.flush(); setFocused(false) }}
          onChange={handleChange}
          onKeyDown={e => { handleKeyDown(e); window.setTimeout(syncActiveScriptBlock, 0) }}
          onClick={syncActiveScriptBlock}
          onKeyUp={syncActiveScriptBlock}
          onSelect={syncActiveScriptBlock}
          placeholder={isBullets ? 'One item per line…' : 'Begin writing here…'}
          spellCheck
          rows={1}
          className="ms-textarea"
          style={isScript ? { ...textStyle, fontFamily: 'Courier New, Courier, monospace' } : textStyle}
          autoFocus
        />
      ) : (
        <div className={`ms-preview${isScript ? ' ms-script-mode' : ''}`} style={isScript ? { ...textStyle, fontFamily: 'Courier New, Courier, monospace' } : textStyle} onClick={activate}>
          <ContentPreview
            content={localContent}
            entityMap={entityMap}
            onEntityClick={onEntityClick}
            onNoteClick={seq => { onNoteClick(seq); onOpenNotes() }}
            isBullets={isBullets}
            isScript={isScript}
            scriptBlocks={localScriptBlocks.length ? localScriptBlocks : scene.scriptBlocks}
            scriptElement={scriptElement}
            projectType={projectType}
          />
        </div>
      )}

      {!focused && (
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={() => {}}
          onFocus={() => { setFocused(true); onFocusExternal() }}
          rows={1}
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', height: 1, width: 1, top: 0, left: 0 }}
          tabIndex={-1}
        />
      )}
    </div>
  )
}

// ─── Format settings panel ────────────────────────────────────────────────────

const FormatContent = ({ settings, onChange }) => {
  const set = (key, value) => onChange({ ...settings, [key]: value })

  return (
    <div className="ms-panel-scroll">
      <div className="ms-format-section">
        <div className="ms-format-label">Font</div>
        <div className="ms-format-row flex-wrap gap-1">
          {FONTS.map(f => (
            <button key={f.label} onClick={() => set('fontFamily', f.value)} className={`ms-format-chip ${settings.fontFamily === f.value ? 'active' : ''}`} style={{ fontFamily: f.value }}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="ms-format-section">
        <div className="ms-format-label">Size</div>
        <div className="ms-format-row items-center gap-2">
          <button onClick={() => set('fontSize', Math.max(12, settings.fontSize - 1))} className="ms-format-chip w-7 flex items-center justify-center text-base leading-none" disabled={settings.fontSize <= 12}>−</button>
          <span className="text-[var(--text-main)] text-sm w-8 text-center tabular-nums">{settings.fontSize}px</span>
          <button onClick={() => set('fontSize', Math.min(30, settings.fontSize + 1))} className="ms-format-chip w-7 flex items-center justify-center text-base leading-none" disabled={settings.fontSize >= 30}>+</button>
          <div className="flex-1" />
          <input type="range" min={12} max={30} value={settings.fontSize} onChange={e => set('fontSize', Number(e.target.value))} className="ms-range w-24" />
        </div>
      </div>

      <div className="ms-format-section">
        <div className="ms-format-label">Spacing</div>
        <div className="ms-format-row gap-1">
          {LINE_SPACINGS.map(s => (
            <button key={s.label} onClick={() => set('lineHeight', s.value)} className={`ms-format-chip ${settings.lineHeight === s.value ? 'active' : ''}`}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="ms-format-section">
        <div className="ms-format-label">Alignment</div>
        <div className="ms-format-row gap-1">
          {[{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Justify', value: 'justify' }].map(a => (
            <button key={a.value} onClick={() => set('textAlign', a.value)} className={`ms-format-chip gap-1 ${settings.textAlign === a.value ? 'active' : ''}`}>
              <AlignIcon type={a.value} /><span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ms-format-section">
        <div className="ms-format-label flex items-center gap-2">
          <span>Indent on Enter</span>
          <button onClick={() => set('autoIndent', !settings.autoIndent)} className={`ms-toggle ${settings.autoIndent ? 'active' : ''}`} title={settings.autoIndent ? 'Disable' : 'Enable'}>
            <span className="ms-toggle-thumb" />
          </button>
        </div>
        {settings.autoIndent && (
          <div className="ms-format-row gap-1 mt-1">
            {INDENT_SIZES.map(n => (
              <button key={n} onClick={() => set('indentSize', n)} className={`ms-format-chip ${settings.indentSize === n ? 'active' : ''}`}>{n} spaces</button>
            ))}
          </div>
        )}
      </div>

      <div className="ms-format-section border-t border-[var(--border)] pt-2 mt-1">
        <button onClick={() => onChange(DEFAULT_FORMAT)} className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors">Reset to defaults</button>
      </div>
    </div>
  )
}

const AlignIcon = ({ type }) => {
  if (type === 'left') return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
      <rect x="0" y="0" width="12" height="1.5" rx="0.75"/><rect x="0" y="3" width="9" height="1.5" rx="0.75"/>
      <rect x="0" y="6" width="12" height="1.5" rx="0.75"/><rect x="0" y="9" width="7" height="1.5" rx="0.75"/>
    </svg>
  )
  if (type === 'center') return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
      <rect x="0" y="0" width="12" height="1.5" rx="0.75"/><rect x="1.5" y="3" width="9" height="1.5" rx="0.75"/>
      <rect x="0" y="6" width="12" height="1.5" rx="0.75"/><rect x="2.5" y="9" width="7" height="1.5" rx="0.75"/>
    </svg>
  )
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="currentColor">
      <rect x="0" y="0" width="12" height="1.5" rx="0.75"/><rect x="0" y="3" width="12" height="1.5" rx="0.75"/>
      <rect x="0" y="6" width="12" height="1.5" rx="0.75"/><rect x="0" y="9" width="12" height="1.5" rx="0.75"/>
    </svg>
  )
}

// ─── Notes panel ──────────────────────────────────────────────────────────────

const NotesPanel = ({ scene, onUpdateScene, onClose, highlightedSeq }) => {
  if (!scene) return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Notes</span>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm">✕</button>
      </div>
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs px-4 text-center">Focus a scene to see its notes</div>
    </div>
  )

  const notes = scene.notes || []
  const updateNoteText = (noteId, text) => onUpdateScene(scene.id, { notes: notes.map(n => n.id === noteId ? { ...n, text } : n) })
  const deleteNote = noteId => onUpdateScene(scene.id, { notes: notes.filter(n => n.id !== noteId) })

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Notes</span>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)] text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {notes.length === 0 && (
          <p className="text-[var(--text-muted)] text-xs text-center py-6">
            No notes yet.<br />Use <span className="text-[var(--accent)] font-mono">+ Note</span> in the scene toolbar.
          </p>
        )}
        {notes.map(note => (
          <div key={note.id} className={`rounded-lg border p-3 transition-colors ${highlightedSeq === note.seq ? 'border-[var(--accent)] bg-[var(--accent-fade)]' : 'border-[var(--border)] bg-[var(--bg-main)]'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">Note {note.seq}</span>
              <button onClick={() => deleteNote(note.id)} className="text-[var(--text-muted)] hover:text-red-400 text-xs">✕</button>
            </div>
            <textarea
              value={note.text}
              onChange={e => updateNoteText(note.id, e.target.value)}
              placeholder="Write your note here…"
              className="w-full bg-transparent text-[var(--text-main)] text-sm outline-none resize-none min-h-[60px]"
              rows={3}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Save indicator ───────────────────────────────────────────────────────────

const SaveIndicator = ({ state }) => {
  if (state === 'saving') return (
    <span className="ms-save-indicator is-saving" title="Saving…">
      <span className="ms-save-dot" />
      <span className="ms-save-label">Saving</span>
    </span>
  )
  if (state === 'saved') return (
    <span className="ms-save-indicator is-saved" title="All changes saved">
      <span className="ms-save-dot" />
      <span className="ms-save-label">Saved</span>
    </span>
  )
  return null
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function Manuscript({ store }) {
  const {
    acts, chapters, scenes,
    addAct, addChapter, addScene,
    updateSceneContent, updateScene, updateAct, updateChapter,
    deleteAct, deleteChapter, deleteScene,
    moveAct, moveChapter, moveScene,
    characters, locations,
    setSelectedCharacterId, setSelectedLocationId,
    activeNovel, updateNovel,
  } = store

  const projectTypeConfig = getProjectType(activeNovel?.type)
  const labels = projectTypeConfig.structure

  const [activeSceneId, setActiveSceneId] = useState(null)
  const [activeSidebarTab, setActiveSidebarTab] = useState('structure') // null | 'structure' | 'goals' | 'progress' | 'notes'
  const [highlightedNoteSeq, setHighlightedNoteSeq] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [formatSettings, setFormatSettings] = useState(loadFormat)
  const [fullscreen, setFullscreen] = useState(false)
  const [saveState, setSaveState] = useState('saved') // 'saving' | 'saved'
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [readerDraft, setReaderDraft] = useState({ projectId: null, draftId: null })
  const [finalizedReaderView, setFinalizedReaderView] = useState('scroll')
  const [finalizedPageIndex, setFinalizedPageIndex] = useState(0)
  const [versionHistorySceneId, setVersionHistorySceneId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pacingOpen, setPacingOpen] = useState(false)

  const containerRef = useRef(null)
  const saveTimer = useRef(null)
  const editorRefs = useRef({})

  const activeScene = scenes.find(s => s.id === activeSceneId) ?? null
  const isScriptProject = SCRIPT_TYPES.has(activeNovel?.type)
  const isNovelProject = (activeNovel?.type || 'novel') === 'novel'
  const isComicProject = activeNovel?.type === 'comic'

  const workspaceLabel = projectTypeConfig.workspaceLabel || 'Manuscript'
  const importTitle = isScriptProject
    ? 'Import a .docx draft into script beta'
    : `Import a .docx ${workspaceLabel.toLowerCase()}`
  const exportTitle = isScriptProject
    ? 'Export readable beta script as .docx'
    : `Export ${workspaceLabel.toLowerCase()} as .docx`
  const exportButtonLabel = isScriptProject ? 'Export Script' : 'Export'
  const finalizedDrafts = useMemo(
    () => Array.isArray(activeNovel?.finalizedDrafts) ? activeNovel.finalizedDrafts : [],
    [activeNovel]
  )
  const readerDraftId = readerDraft.projectId === activeNovel?.id ? readerDraft.draftId : null
  const activeFinalizedDraft = useMemo(
    () => finalizedDrafts.find(draft => draft.id === readerDraftId) || null,
    [finalizedDrafts, readerDraftId]
  )

  // Derived entity lists for autocomplete
  const characterNames = useMemo(() => characters.map(c => c.name).filter(Boolean), [characters])
  const locationNames = useMemo(() => locations.map(l => l.name).filter(Boolean), [locations])

  const entityMap = useMemo(() => {
    const map = {}
    ;(characters || []).forEach(c => {
      if (c.name?.length >= 2) map[c.name.toLowerCase()] = { id: c.id, section: 'characters', name: c.name }
      ;(c.keywords || []).forEach(kw => { if (kw?.length >= 2) map[kw.toLowerCase()] = { id: c.id, section: 'characters', name: c.name } })
    })
    ;(locations || []).forEach(l => {
      if (l.name?.length >= 2) map[l.name.toLowerCase()] = { id: l.id, section: 'locations', name: l.name }
    })
    return map
  }, [characters, locations])

  // Autosave state tracking — wraps updateSceneContent with UI feedback
  const handleContentUpdate = useCallback((sceneId, content) => {
    updateSceneContent(sceneId, content)
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('saved'), 2000)
  }, [updateSceneContent])

  const handleRestoreVersion = useCallback((version) => {
    const scene = scenes.find(s => s.id === version.sceneId)
    if (!scene) return
    // Snapshot current state before restoring
    saveSceneVersion(scene)
    updateScene(scene.id, { content: version.content, title: version.title })
    setSaveState('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSaveState('saved'), 2000)
  }, [scenes, updateScene])

  const handleReplaceInScene = useCallback((sceneId, newContent) => {
    handleContentUpdate(sceneId, newContent)
  }, [handleContentUpdate])

  // Fullscreen management
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch { /* Safari/iOS may reject */ }
  }, [])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const handleFormatChange = useCallback((next) => {
    setFormatSettings(next)
    localStorage.setItem('nf-format-settings', JSON.stringify(next))
  }, [])

  const handleEntityClick = useCallback(entity => {
    if (entity.section === 'characters') setSelectedCharacterId(entity.id)
    if (entity.section === 'locations') setSelectedLocationId(entity.id)
    window.dispatchEvent(new CustomEvent('switch-section', { detail: { section: entity.section } }))
  }, [setSelectedCharacterId, setSelectedLocationId])

  const chapterGlobalNumbers = useMemo(() => {
    const map = {}
    let count = 1
    acts.forEach(act => {
      chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order).forEach(chap => { map[chap.id] = count++ })
    })
    return map
  }, [acts, chapters])

  const getChapterTitle = useCallback(chap => {
    const num = chapterGlobalNumbers[chap.id]
    const l2lower = labels.level2.toLowerCase()
    const isDefault = !chap.title || chap.title.toLowerCase().startsWith(l2lower)
    return isDefault ? `${labels.level2} ${num}` : `${labels.level2} ${num}: ${chap.title}`
  }, [chapterGlobalNumbers, labels])

  const totalWordCount = useMemo(() =>
    scenes.reduce((acc, s) => acc + (s.content?.trim().split(/\s+/).filter(Boolean).length || 0), 0)
  , [scenes])

  const handleFinaliseDraft = useCallback(() => {
    if (!activeNovel?.id || !isNovelProject) return
    const now = new Date()
    const defaultTitle = `Final draft ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
    const title = window.prompt('Name this finalized draft copy', defaultTitle)
    if (title === null) return

    const draft = buildFinalizedDraft({
      novel: activeNovel,
      acts,
      chapters,
      scenes,
      labels,
      title: title.trim() || defaultTitle,
    })

    const confirmed = window.confirm(
      `Create an uneditable reading copy of the current manuscript?\n\nThis will not lock your working draft.`
    )
    if (!confirmed) return

    updateNovel(activeNovel.id, {
      finalizedDrafts: [draft, ...finalizedDrafts].slice(0, 20),
      lastFinalizedDraftAt: draft.finalizedAt,
    })
    setReaderDraft({ projectId: activeNovel.id, draftId: draft.id })
    setFinalizedReaderView('pages')
    setFinalizedPageIndex(0)
  }, [activeNovel, isNovelProject, acts, chapters, scenes, labels, finalizedDrafts, updateNovel])

  const orderedContent = useMemo(() => {
    const result = []
    acts.forEach(act => {
      const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order)
      result.push({ type: 'act', act, hasChapters: actChapters.length > 0 })
      actChapters.forEach(chap => {
        const chapScenes = scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order)
        result.push({ type: 'chapter', chap, hasScenes: chapScenes.length > 0 })
        chapScenes.forEach((scene, idx) => {
          result.push({ type: 'scene', scene, sceneIndex: idx, chapterSceneCount: chapScenes.length, chap })
        })
      })
    })
    return result
  }, [acts, chapters, scenes])

  const handleSplitScene = (sceneId, chapterId, before, after) => {
    updateSceneContent(sceneId, before)
    const newScene = addScene(chapterId, labels.level3)
    setTimeout(() => {
      updateSceneContent(newScene.id, after)
      editorRefs.current[newScene.id]?.focus()
      editorRefs.current[newScene.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleAddScene = chapterId => {
    const newScene = addScene(chapterId, labels.level3)
    setTimeout(() => {
      editorRefs.current[newScene.id]?.focus()
      editorRefs.current[newScene.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleNoteClick = seq => {
    setHighlightedNoteSeq(seq)
    setTimeout(() => setHighlightedNoteSeq(null), 2000)
  }

  const handleAppendToScene = useCallback((sceneId, text) => {
    const ref = editorRefs.current[sceneId]
    if (ref?.appendContent) {
      ref.appendContent(text)
    } else {
      // Fallback: write directly to store (editor syncs on next blur)
      const scene = scenes.find(s => s.id === sceneId)
      if (!scene) return
      const cur = scene.content?.trimEnd() || ''
      handleContentUpdate(sceneId, cur + (cur ? '\n\n' : '') + text)
    }
  }, [scenes, handleContentUpdate])

  // Writing goals — persisted on activeNovel via updateNovel
  const activeNovelId = activeNovel?.id
  const writingGoals = useMemo(() => activeNovel?.writingGoals ?? {}, [activeNovel?.writingGoals])

  const handleUpdateGoals = useCallback((newGoals) => {
    if (!activeNovelId) return
    updateNovel(activeNovelId, { writingGoals: newGoals })
  }, [activeNovelId, updateNovel])

  // Template application
  const handleApplyTemplate = useCallback(async (template, { withChapters, withScenes }) => {
    // Create acts sequentially — order matters so we use the template array order
    for (let ai = 0; ai < template.acts.length; ai++) {
      const tAct = template.acts[ai]
      const newAct = addAct(tAct.title)
      if (tAct.guidance) updateAct(newAct.id, { guidance: tAct.guidance })

      if (withChapters) {
        for (let ci = 0; ci < tAct.chapters.length; ci++) {
          const tChap = tAct.chapters[ci]
          const newChap = addChapter(newAct.id, tChap.title)
          if (tChap.guidance) updateChapter(newChap.id, { guidance: tChap.guidance })

          if (withScenes) {
            addScene(newChap.id, labels.level3)
          }
        }
      }
    }

    // Set manuscript word-count goal from template if no goal yet
    if (template.targetWords && !writingGoals.manuscript) {
      handleUpdateGoals({ ...writingGoals, manuscript: template.targetWords })
    }
  }, [addAct, addChapter, addScene, updateAct, updateChapter, labels.level3, writingGoals, handleUpdateGoals])

  const handleDocxImport = useCallback(async (importedActs) => {
    for (const tAct of importedActs) {
      const newAct = addAct(tAct.title)
      for (const tChap of tAct.chapters) {
        const newChap = addChapter(newAct.id, tChap.title)
        for (const tScene of tChap.scenes) {
          const newScene = addScene(newChap.id, tScene.title || labels.level3)
          if (tScene.content?.trim()) {
            updateSceneContent(newScene.id, tScene.content)
          }
        }
        // Ensure at least one empty scene per chapter
        if (tChap.scenes.length === 0) {
          addScene(newChap.id, labels.level3)
        }
      }
    }
  }, [addAct, addChapter, addScene, updateSceneContent, labels.level3])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportToDocx(activeNovel, acts, chapters, scenes, chapterGlobalNumbers)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // Navigate from sidebar click
  const handleSelectScene = useCallback((sceneId) => {
    setActiveSceneId(sceneId)
    requestAnimationFrame(() => {
      document.getElementById(`ms-scene-${sceneId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    setTimeout(() => editorRefs.current[sceneId]?.focus(), 200)
  }, [])

  const handleSelectChapter = useCallback((chapId) => {
    requestAnimationFrame(() => {
      document.getElementById(`ms-chap-${chapId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  if (isComicProject) return <ComicPlanner store={store} />

  return (
    <div ref={containerRef} className={`manuscript-processor flex flex-col h-full bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden font-serif${fullscreen ? ' is-fullscreen' : ''}`}>

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div data-tour="manuscript-toolbar" className="ms-toolbar font-sans flex items-center gap-2 flex-shrink-0 px-3">

        {!activeFinalizedDraft && (
          <>
            {/* Template picker */}
            <button
              onClick={() => setTemplateModalOpen(true)}
              className="ms-toolbar-btn"
              title="Choose a structural template"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="0.9" y="0.9" width="3.5" height="3.5" rx="0.8" />
                <rect x="6.6" y="0.9" width="3.5" height="3.5" rx="0.8" />
                <rect x="0.9" y="6.6" width="3.5" height="3.5" rx="0.8" />
                <rect x="6.6" y="6.6" width="3.5" height="3.5" rx="0.8" />
              </svg>
              Template
            </button>

            {/* Import */}
            <button
              onClick={() => setImportModalOpen(true)}
              className="ms-toolbar-btn"
              title={importTitle}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Import
            </button>

            <div className="w-px h-4 bg-[var(--border)] mx-1" />
          </>
        )}

        {/* Save state */}
        <SaveIndicator state={saveState} />

        {/* Word count */}
        <span data-tour="manuscript-word-count" className="ms-toolbar-wordcount">
          {totalWordCount > 0 ? `${totalWordCount.toLocaleString()} words` : 'No content yet'}
        </span>

        {isScriptProject && !activeFinalizedDraft && (
          <span
            className="ms-toolbar-badge"
            title="Readable script export is available; industry formatting is still in progress."
          >
            Script beta
          </span>
        )}

        <div className="flex-1" />

        {isNovelProject && finalizedDrafts.length > 0 && (
          <select
            className="ms-toolbar-select"
            value={readerDraftId || ''}
            onChange={event => {
              setReaderDraft({ projectId: activeNovel?.id || null, draftId: event.target.value || null })
              setFinalizedPageIndex(0)
            }}
            title="View a finalized draft"
            aria-label="View a finalized draft"
          >
            <option value="">Working draft</option>
            {finalizedDrafts.map(draft => (
              <option key={draft.id} value={draft.id}>
                {draft.title || 'Final draft'}
              </option>
            ))}
          </select>
        )}

        {isNovelProject && !activeFinalizedDraft && (
          <button
            onClick={handleFinaliseDraft}
            className="ms-toolbar-btn"
            title="Copy this manuscript into an uneditable reader view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
              <path d="M8 7h8" /><path d="M8 11h6" />
            </svg>
            Finalise
          </button>
        )}

        {activeFinalizedDraft && (
          <div className="ms-toolbar-segment" role="group" aria-label="Finalized reader view">
            <button
              type="button"
              className={finalizedReaderView === 'scroll' ? 'is-active' : ''}
              onClick={() => setFinalizedReaderView('scroll')}
            >
              Scroll
            </button>
            <button
              type="button"
              className={finalizedReaderView === 'pages' ? 'is-active' : ''}
              onClick={() => {
                setFinalizedReaderView('pages')
                setFinalizedPageIndex(0)
              }}
            >
              Pages
            </button>
          </div>
        )}

        {/* Search */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setSearchOpen(v => !v)}
            className={`ms-toolbar-btn${searchOpen ? ' is-active' : ''}`}
            title="Search and replace across all scenes"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            Search
          </button>
        )}

        {/* Pacing */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setPacingOpen(v => !v)}
            className={`ms-toolbar-btn${pacingOpen ? ' is-active' : ''}`}
            title="Pacing chart — word count by scene or chapter"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 17V13M12 17v-6M16 17V9" />
            </svg>
            Pacing
          </button>
        )}

        {/* Notes toggle */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setActiveSidebarTab(v => v === 'notes' ? null : 'notes')}
            className={`ms-toolbar-btn${activeSidebarTab === 'notes' ? ' is-active' : ''}`}
            title="Scene notes"
          >
            Notes{activeScene?.notes?.length ? ` (${activeScene.notes.length})` : ''}
          </button>
        )}

        {/* AI assistant */}
        {!activeFinalizedDraft && (
          <button
            onClick={() => setActiveSidebarTab(v => v === 'ai' ? null : 'ai')}
            className={`ms-toolbar-btn${activeSidebarTab === 'ai' ? ' is-active' : ''}`}
            title="AI writing assistant"
          >
            AI
          </button>
        )}

        {/* Export */}
        {!activeFinalizedDraft && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="ms-toolbar-btn disabled:opacity-50"
            title={exportTitle}
          >
            {exporting ? 'Exporting…' : (
              <span className="flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exportButtonLabel}
              </span>
            )}
          </button>
        )}

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          className="ms-toolbar-btn"
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {fullscreen ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4.5 1.5H1.5v3M7.5 1.5h3v3M4.5 10.5H1.5v-3M7.5 10.5h3v-3" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1.5 4.5V1.5h3M10.5 4.5V1.5h-3M1.5 7.5v3h3M10.5 7.5v3h-3" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Body: writing area + right sidebar ──────────────── */}
      {activeFinalizedDraft ? (
        <div className="flex flex-1 overflow-hidden">
          <FinalizedReader
            draft={activeFinalizedDraft}
            viewMode={finalizedReaderView}
            pageIndex={finalizedPageIndex}
            onPageIndexChange={setFinalizedPageIndex}
          />
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">

        {/* Writing area */}
        <main data-tour="manuscript-editor" className="manuscript-page ms-scroll-container workspace-page flex-1 overflow-y-auto scroll-smooth min-w-0">
          <div className="manuscript-document mx-auto py-16 px-6 md:px-12">

            {acts.length === 0 && (
              <div className="empty-state mt-32 font-sans">
                <p className="text-lg mb-2 font-semibold">Nothing to write yet.</p>
                <p className="text-sm mb-4 opacity-70">Start from a template or add your first {labels.level1} manually.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <button
                    onClick={() => setTemplateModalOpen(true)}
                    className="btn btn-primary"
                  >
                    Choose a template
                  </button>
                  <button
                    onClick={() => addAct(`${labels.level1} 1`)}
                    className="btn btn-secondary"
                  >
                    + {labels.level1}
                  </button>
                </div>
              </div>
            )}

            {orderedContent.map(item => {
              if (item.type === 'act') return (
                <div key={`act-${item.act.id}`} className="mt-16 first:mt-0 mb-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-[var(--border)]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-[var(--text-muted)]">
                      {item.act.title}
                    </span>
                    <div className="flex-1 h-px bg-[var(--border)]" />
                  </div>
                </div>
              )

              if (item.type === 'chapter') return (
                <div key={`chap-${item.chap.id}`} id={`ms-chap-${item.chap.id}`} className="pt-14 pb-8 text-center font-sans">
                  <h2 className="text-[var(--accent)] text-xs font-black uppercase tracking-[0.5em] mb-1 opacity-80">
                    {getChapterTitle(item.chap)}
                  </h2>
                  {item.chap.title && !item.chap.title.toLowerCase().startsWith(labels.level2.toLowerCase()) && (
                    <p className="text-[var(--text-muted)] text-sm italic mt-1 opacity-70">{item.chap.title}</p>
                  )}
                  <div className="w-8 h-px bg-[var(--border)] mx-auto mt-4 rounded-full" />
                  {!item.hasScenes && (
                    <button onClick={() => handleAddScene(item.chap.id)} className="manuscript-add-scene mt-6 font-sans">
                      + Add {labels.level3}
                    </button>
                  )}
                </div>
              )

              if (item.type === 'scene') {
                const { scene, sceneIndex, chapterSceneCount, chap } = item
                const isLastInChapter = sceneIndex === chapterSceneCount - 1
                return (
                  <div key={`scene-${scene.id}`}>
                    {sceneIndex > 0 && (
                      <div className="py-10 flex items-center justify-center">
                        <div className="flex gap-3 items-center opacity-25 hover:opacity-60 transition-opacity">
                          <div className="w-10 h-px bg-[var(--border)]" />
                          <div className="flex gap-2">
                            <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                            <div className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
                          </div>
                          <div className="w-10 h-px bg-[var(--border)]" />
                        </div>
                      </div>
                    )}

                    <SceneEditor
                      scene={scene}
                      sceneIndex={sceneIndex}
                      onUpdate={handleContentUpdate}
                      onUpdateScene={updateScene}
                      onSplit={handleSplitScene}
                      innerRef={proxy => { editorRefs.current[scene.id] = proxy }}
                      onFocus={() => setActiveSceneId(scene.id)}
                      entityMap={entityMap}
                      onEntityClick={handleEntityClick}
                      onOpenNotes={() => setActiveSidebarTab('notes')}
                      onNoteClick={handleNoteClick}
                      formatSettings={formatSettings}
                      characterNames={characterNames}
                      locationNames={locationNames}
                      onPersistDraft={persistSceneDraftToLocalStorage}
                      onOpenVersionHistory={setVersionHistorySceneId}
                      projectType={activeNovel?.type || 'novel'}
                    />

                    {isLastInChapter && (
                      <div className="mt-10 text-center font-sans">
                        <button onClick={() => handleAddScene(chap.id)} className="manuscript-add-scene">
                          + {labels.level3}
                        </button>
                      </div>
                    )}
                  </div>
                )
              }

              return null
            })}

            {/* Bottom padding for comfortable scrolling */}
            <div className="h-[40vh]" />
          </div>
        </main>

        {/* Right writing sidebar */}
        <WritingSidebar
          activePanelId={activeSidebarTab}
          onSetPanel={setActiveSidebarTab}
          acts={acts}
          chapters={chapters}
          scenes={scenes}
          addAct={addAct}
          addChapter={addChapter}
          addScene={addScene}
          updateAct={updateAct}
          updateChapter={updateChapter}
          updateScene={updateScene}
          deleteAct={deleteAct}
          deleteChapter={deleteChapter}
          deleteScene={deleteScene}
          moveAct={moveAct}
          moveChapter={moveChapter}
          moveScene={moveScene}
          activeSceneId={activeSceneId}
          onSelectScene={handleSelectScene}
          onSelectChapter={handleSelectChapter}
          labels={labels}
          totalWordCount={totalWordCount}
          writingGoals={writingGoals}
          onUpdateGoals={handleUpdateGoals}
          formatSlot={<FormatContent settings={formatSettings} onChange={handleFormatChange} />}
          notesSlot={
            <NotesPanel
              scene={activeScene}
              onUpdateScene={updateScene}
              onClose={() => setActiveSidebarTab(null)}
              highlightedSeq={highlightedNoteSeq}
            />
          }
          aiSlot={
            <AISuggestionPanel
              activeScene={activeScene}
              activeNovel={activeNovel}
              characters={characters}
              locations={locations}
              onAppendToScene={handleAppendToScene}
            />
          }
        />
      </div>
      )}

      {/* Template modal */}
      {templateModalOpen && (
        <TemplateModal
          hasExistingContent={acts.length > 0}
          onClose={() => setTemplateModalOpen(false)}
          onApply={handleApplyTemplate}
          projectType={activeNovel?.type || 'novel'}
        />
      )}

      {/* Import modal */}
      {importModalOpen && (
        <DocxImportModal
          hasExistingContent={acts.length > 0}
          onClose={() => setImportModalOpen(false)}
          onImport={handleDocxImport}
        />
      )}

      {/* Version history modal */}
      {versionHistorySceneId && (
        <SceneVersionHistory
          scene={scenes.find(s => s.id === versionHistorySceneId) ?? null}
          onRestore={handleRestoreVersion}
          onClose={() => setVersionHistorySceneId(null)}
        />
      )}

      {/* Global search & replace */}
      {searchOpen && (
        <ManuscriptSearch
          scenes={scenes}
          chapters={chapters}
          acts={acts}
          activeNovelId={activeNovel?.id}
          onOpenScene={handleSelectScene}
          onReplaceInScene={handleReplaceInScene}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Pacing chart */}
      {pacingOpen && (
        <PacingChart
          scenes={scenes}
          chapters={chapters}
          acts={acts}
          activeNovelId={activeNovel?.id}
          onOpenScene={handleSelectScene}
          onClose={() => setPacingOpen(false)}
        />
      )}
    </div>
  )
}
