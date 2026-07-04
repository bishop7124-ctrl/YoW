import { useMemo, useEffect, useRef, useCallback } from 'react'
import { readItem, writeItem } from '../../storage/projectStorage'

// ─── Script types ─────────────────────────────────────────────────────────────

export const SCRIPT_TYPES = new Set(['play', 'screenplay', 'tv_show'])

export const SCRIPT_ELEMENT_SETS = {
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

export const getScriptElements = (type) => SCRIPT_ELEMENT_SETS[type] || SCRIPT_ELEMENT_SETS.screenplay

export const getScriptElementLabel = (type, value) =>
  getScriptElements(type).find(item => item.value === value)?.label || 'Action'

export const getNextScriptElementAfterEnter = (current) => {
  if (current === 'character') return 'dialogue'
  if (current === 'parenthetical') return 'dialogue'
  if (current === 'dialogue') return 'action'
  if (current === 'transition') return 'scene_heading'
  return 'action'
}

export const splitTextBlocks = (content = '') =>
  String(content).split(/\n{2,}/).map(block => block.trim()).filter(Boolean)

export const buildScriptBlocks = (content = '', element = 'action') =>
  splitTextBlocks(content).map((text, index) => ({ id: `block-${index}`, type: element, text }))

export const syncScriptBlocks = (content = '', previous = [], fallback = 'action') =>
  splitTextBlocks(content).map((text, index) => ({
    id: previous[index]?.id || `block-${index}`,
    type: previous[index]?.type || fallback,
    text,
  }))

export const getScriptBlockIndexAtOffset = (content = '', offset = 0) => {
  const text = String(content)
  const clamped = Math.max(0, Math.min(offset, text.length))
  const before = text.slice(0, clamped)
  const blocksBefore = before.split(/\n{2,}/)
  return Math.max(0, blocksBefore.length - 1)
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

export function useDebouncedCallback(callback, delay) {
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

// ─── General utilities ────────────────────────────────────────────────────────

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const countWords = value => {
  if (!value || typeof value !== 'string') return 0
  return value.trim().match(/\S+/g)?.length || 0
}

export const dateKey = value => {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function persistSceneDraftToLocalStorage(scene, content) {
  if (!scene?.id) return
  try {
    const now = Date.now()
    const today = dateKey(now)
    writeItem('nf_localWriteAt', String(now))
    const scenes = JSON.parse(readItem('nf_scenes') || '[]')
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
    writeItem('nf_scenes', JSON.stringify(nextScenes))

    import('../../utils/sceneVersions').then(m => {
      m.saveSceneVersion({ ...scene, content })
    }).catch(() => {})
  } catch (error) {
    console.warn('Could not save latest scene draft before leaving the page.', error)
  }
}

// ─── Format settings ──────────────────────────────────────────────────────────

export const FONTS = [
  { label: 'Georgia',  value: 'Georgia, "Times New Roman", serif' },
  { label: 'Palatino', value: '"Palatino Linotype", Palatino, serif' },
  { label: 'Times',    value: '"Times New Roman", Times, serif' },
  { label: 'Garamond', value: 'Garamond, "EB Garamond", serif' },
  { label: 'Courier',  value: '"Courier New", Courier, monospace' },
  { label: 'Sans',     value: 'system-ui, -apple-system, sans-serif' },
]

export const LINE_SPACINGS = [
  { label: '1.5', value: 1.5 },
  { label: '1.75', value: 1.75 },
  { label: '2.0',  value: 2 },
  { label: '2.5',  value: 2.5 },
]

export const INDENT_SIZES = [2, 4, 6, 8]

export const DEFAULT_FORMAT = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 19,
  lineHeight: 2,
  textAlign: 'left',
  autoIndent: true,
  indentSize: 4,
}

export function loadFormat() {
  try {
    const s = localStorage.getItem('nf-format-settings')
    return s ? { ...DEFAULT_FORMAT, ...JSON.parse(s) } : DEFAULT_FORMAT
  } catch { return DEFAULT_FORMAT }
}

// ─── Scene statuses ───────────────────────────────────────────────────────────

export const SCENE_STATUSES = [
  { value: 'draft',    label: 'Draft',    color: 'var(--text-muted)' },
  { value: 'writing',  label: 'Writing',  color: '#60a5fa' },
  { value: 'complete', label: 'Done',     color: '#4ade80' },
  { value: 'revision', label: 'Revision', color: '#fb923c' },
]

export const nextStatus = (current) => {
  const idx = SCENE_STATUSES.findIndex(s => s.value === current)
  return SCENE_STATUSES[(idx + 1) % SCENE_STATUSES.length].value
}

// ─── Finalized draft helpers ──────────────────────────────────────────────────

export function wordCountForScenes(scenes) {
  return scenes.reduce((sum, scene) => sum + countWords(scene.content || ''), 0)
}

export function buildFinalizedDraft({ novel, acts, chapters, scenes, labels, title }) {
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

export function formatFinalizedDate(value) {
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

export const FINAL_PAGE_WORD_TARGET = 230

export function getFinalizedContentBlocks(draft) {
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

export function paginateFinalizedDraft(draft) {
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
