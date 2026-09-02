import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react'
import {
  SCRIPT_TYPES, SCENE_STATUSES, nextStatus,
  buildScriptBlocks, getScriptElements, getScriptElementLabel, getNextScriptElementAfterEnter,
  getScriptBlockIndexAtOffset, syncScriptBlocks,
  useDebouncedCallback, persistSceneDraftToLocalStorage, uid,
  copyTextToClipboard,
} from './manuscriptUtils.js'
import { useCaretComfortScroll } from './useCaretComfortScroll.js'
import { useTextareaCaretRect } from './useTextareaCaretRect.js'
import { useTabPresence } from '../../utils/useTabPresence.js'
import EditingElsewhereWarning from '../shared/EditingElsewhereWarning.jsx'
import Modal from '../shared/Modal.jsx'

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

// `baseOffset` is this text's start position within the scene's raw content, so every
// rendered piece can carry a data-raw-start/end pair. Clicking the preview uses those
// attributes to map a pixel position back to a raw content offset (see resolveRawOffsetFromRange).
function renderInlineMarkdown(text, keyPrefix = '', baseOffset = 0) {
  if (!text) return []
  const parts = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  let last = 0, m, idx = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(
        <span key={`${keyPrefix}-t${idx}`} data-raw-start={baseOffset + last} data-raw-end={baseOffset + m.index}>
          {text.slice(last, m.index)}
        </span>
      )
    }
    // Which alternative matched must be read from which capture group is
    // populated, not sniffed from the raw match text — `m[0].startsWith('**')`
    // is also true when the *italic* alternative matches a stretch whose
    // captured content itself starts with a stray `*` (e.g. unbalanced
    // asterisks like "**bold*"), leaving m[2] undefined and throwing on
    // m[2].length.
    if (m[2] !== undefined) {
      const innerStart = baseOffset + m.index + 2
      parts.push(<strong key={`${keyPrefix}-b${idx}`} data-raw-start={innerStart} data-raw-end={innerStart + m[2].length}>{m[2]}</strong>)
    } else if (m[3] !== undefined) {
      const innerStart = baseOffset + m.index + 1
      parts.push(<em key={`${keyPrefix}-i${idx}`} data-raw-start={innerStart} data-raw-end={innerStart + m[3].length}>{m[3]}</em>)
    } else {
      const innerStart = baseOffset + m.index + 1
      parts.push(<u key={`${keyPrefix}-u${idx}`} data-raw-start={innerStart} data-raw-end={innerStart + m[4].length}>{m[4]}</u>)
    }
    last = m.index + m[0].length
    idx++
  }
  if (last < text.length) {
    parts.push(
      <span key={`${keyPrefix}-t${idx}`} data-raw-start={baseOffset + last} data-raw-end={baseOffset + text.length}>
        {text.slice(last)}
      </span>
    )
  }
  return parts
}

// ─── Preview click → caret offset mapping ─────────────────────────────────────
// Every rendered leaf in the preview carries data-raw-start/data-raw-end (see
// renderInlineMarkdown and the entity/line offsets below). To place the caret exactly
// where the user clicked, we resolve the browser's caret hit-test to one of those leaves
// and translate the in-node offset back to a raw content offset.

function resolveRawOffsetFromRange(range, container) {
  if (!range || !container) return null
  const { startContainer, startOffset } = range
  if (!container.contains(startContainer)) return null

  const findTagged = node => {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
    while (el && el !== container) {
      if (el.hasAttribute?.('data-raw-start')) return el
      el = el.parentElement
    }
    return null
  }

  if (startContainer.nodeType === Node.TEXT_NODE) {
    const el = findTagged(startContainer)
    if (!el) return null
    return Number(el.getAttribute('data-raw-start')) + startOffset
  }

  const children = startContainer.childNodes
  const after = children[startOffset]
  const before = children[startOffset - 1]
  const target = after || before
  if (!target) return null
  const el = findTagged(target)
  if (!el) return null
  return Number(el.getAttribute(after ? 'data-raw-start' : 'data-raw-end'))
}

function caretRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y)
    if (!pos) return null
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    return range
  }
  return null
}

// ─── Preview-backed visual caret ──────────────────────────────────────────────

// The native WebKit textarea caret stretches to the full line box. With the
// manuscript's deliberately generous line spacing that produces a 40px+ bar,
// even though the type itself is around 19px. The visible text already exists
// in the rich-preview layer, so use that DOM for a cheap caret coordinate rather
// than rebuilding/mirroring the full scene on every keystroke (the latter was a
// previously confirmed source of severe lag in very large scenes).
function findPreviewCaretPosition(preview, rawOffset) {
  const candidates = [...preview.querySelectorAll('[data-raw-start][data-raw-end]')]
    .map(element => ({
      element,
      start: Number(element.getAttribute('data-raw-start')),
      end: Number(element.getAttribute('data-raw-end')),
    }))
    .filter(candidate => Number.isFinite(candidate.start) && Number.isFinite(candidate.end))

  if (!candidates.length) return null

  // Prefer the deepest tagged leaves. Paragraph/note wrappers can span raw
  // markdown delimiters that are intentionally absent from their visible text;
  // using a leaf maps those delimiter offsets to the nearest visible boundary
  // instead of drifting the caret into the formatted word.
  const leaves = candidates.filter(({ element }) => !element.querySelector('[data-raw-start][data-raw-end]'))
  const preciseCandidates = leaves.length ? leaves : candidates
  const containing = preciseCandidates.filter(({ start, end }) => rawOffset >= start && rawOffset <= end)
  const pool = containing.length ? containing : preciseCandidates
  pool.sort((a, b) => {
    if (!containing.length) {
      const distanceA = rawOffset < a.start ? a.start - rawOffset : rawOffset - a.end
      const distanceB = rawOffset < b.start ? b.start - rawOffset : rawOffset - b.end
      if (distanceA !== distanceB) return distanceA - distanceB
    }
    // At a paragraph boundary, prefer the paragraph beginning at the caret
    // over the one ending there. This puts a newly inserted paragraph's caret
    // on its own indented line.
    const startsAtCaretA = a.start === rawOffset ? 1 : 0
    const startsAtCaretB = b.start === rawOffset ? 1 : 0
    if (startsAtCaretA !== startsAtCaretB) return startsAtCaretB - startsAtCaretA
    const spanA = a.end - a.start
    const spanB = b.end - b.start
    if (spanA !== spanB) return spanA - spanB
    // Nested tagged spans are more precise than their tagged paragraph parent.
    if (a.element.contains(b.element)) return 1
    if (b.element.contains(a.element)) return -1
    return 0
  })

  const { element, start, end } = pool[0]
  const textLength = element.textContent?.length || 0
  const rawSpan = Math.max(0, end - start)
  const localOffset = rawSpan === 0
    ? 0
    : Math.max(0, Math.min(textLength, rawOffset - start))

  const walker = document.createTreeWalker(element, 4) // NodeFilter.SHOW_TEXT
  let remaining = localOffset
  let textNode = walker.nextNode()
  while (textNode && remaining > textNode.data.length) {
    remaining -= textNode.data.length
    textNode = walker.nextNode()
  }

  if (!textNode) {
    textNode = element.lastChild?.nodeType === 3 ? element.lastChild : null
    remaining = textNode?.data.length || 0
  }

  return { element, textNode, offset: remaining }
}

function rangeRectAtPosition(textNode, offset) {
  if (!textNode) return null
  const range = document.createRange()
  const safeOffset = Math.max(0, Math.min(offset, textNode.data.length))
  range.setStart(textNode, safeOffset)
  range.collapse(true)
  const collapsedRects = range.getClientRects?.()
  if (collapsedRects?.length) return collapsedRects[collapsedRects.length - 1]

  // Some engines do not expose a rectangle for a collapsed range at a wrap or
  // newline boundary. A one-character neighbour still supplies the correct line
  // box; only its left/right edge needs translating back to the caret boundary.
  if (safeOffset < textNode.data.length) {
    range.setEnd(textNode, safeOffset + 1)
    const nextRects = range.getClientRects?.()
    if (nextRects?.length) {
      const rect = nextRects[0]
      return {
        top: rect.top, bottom: rect.bottom, height: rect.height,
        left: rect.left, right: rect.left, width: 0,
      }
    }
  }
  if (safeOffset > 0) {
    range.setStart(textNode, safeOffset - 1)
    range.setEnd(textNode, safeOffset)
    const previousRects = range.getClientRects?.()
    if (previousRects?.length) {
      const rect = previousRects[previousRects.length - 1]
      return {
        top: rect.top, bottom: rect.bottom, height: rect.height,
        left: rect.right, right: rect.right, width: 0,
      }
    }
  }
  return null
}

function getPreviewCaretRect(preview, rawOffset) {
  if (!preview) return null
  const position = findPreviewCaretPosition(preview, rawOffset)
  if (!position) {
    const placeholder = preview.querySelector('.ms-placeholder') || preview
    return placeholder.getBoundingClientRect()
  }
  return rangeRectAtPosition(position.textNode, position.offset)
    || position.element.getBoundingClientRect()
}

// ─── Entity / note parsing ────────────────────────────────────────────────────

const NOTE_MARKER_RE = /\s?\[\[(\d+)\]\]\s?/g

function stripNoteMarkers(content) {
  return (content || '').replace(NOTE_MARKER_RE, (match, _seq, offset, text) => {
    const before = text[offset - 1]
    const after = text[offset + match.length]
    return before && after && /\S/.test(before) && /\S/.test(after) ? ' ' : ''
  })
}

function parseSegments(content, entityNames, entityMap, notes = []) {
  if (!content) return []
  const entityTokens = []

  if (entityNames.length > 0) {
    const escaped = entityNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const ep = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
    let m
    while ((m = ep.exec(content)) !== null) {
      const key = Object.keys(entityMap).find(k => k.toLowerCase() === m[1].toLowerCase())
      if (key) entityTokens.push({ type: 'entity', start: m.index, end: m.index + m[1].length, value: m[1], entity: entityMap[key] })
    }
  }
  entityTokens.sort((a, b) => a.start - b.start)
  const filteredEntities = []
  let entityLastEnd = 0
  for (const t of entityTokens) {
    if (t.start >= entityLastEnd) { filteredEntities.push(t); entityLastEnd = t.end }
  }

  const noteTokens = []
  for (const note of notes) {
    const start = Math.max(0, Math.min(note.anchorOffset ?? content.length, content.length))
    const rawEnd = note.anchorEndOffset ?? note.anchorOffset
    const end = Math.max(start, Math.min(rawEnd ?? start, content.length))
    if (end > start) {
      noteTokens.push({ type: 'noteRange', start, end, note })
      noteTokens.push({ type: 'note', start: end, end, seq: note.seq })
    } else {
      noteTokens.push({ type: 'note', start, end: start, seq: note.seq })
    }
  }
  NOTE_MARKER_RE.lastIndex = 0
  let m
  while ((m = NOTE_MARKER_RE.exec(content)) !== null) {
    noteTokens.push({ type: 'note', start: m.index, end: m.index + m[0].length, seq: parseInt(m[1], 10) })
  }

  // Notes are zero-width (a caret position, not a text range) and always win
  // a tie against an entity match starting at that exact position — the old
  // single merged-and-filtered pass silently dropped a note anchored right
  // at an entity match's start (e.g. a note added before the very first
  // word, when that word is also a character name), since the entity's
  // wider span "won" the overlap check first. A note anchored a few
  // characters *inside* an entity match (rather than exactly at its start)
  // can still be dropped by the `continue` below — splitting the entity
  // token around it would fix that too, but that's a rarer case than "added
  // at the start of a sentence/scene" and not worth the extra complexity
  // here.
  const allTokens = [...filteredEntities, ...noteTokens]
    .sort((a, b) => a.start - b.start || (a.type === 'note' ? -1 : 1))

  const segs = []
  let pos = 0
  for (const t of allTokens) {
    if (t.start < pos) continue
    if (t.start > pos) segs.push({ type: 'text', value: content.slice(pos, t.start), start: pos, end: t.start })
    segs.push(t)
    pos = Math.max(pos, t.end)
  }
  if (pos < content.length) segs.push({ type: 'text', value: content.slice(pos), start: pos, end: content.length })
  return segs
}

function buildWritingBlocks(content, notes) {
  const length = (content || '').length
  const blocks = []
  let pos = 0

  for (const note of notes) {
    const anchor = Math.max(0, Math.min(note.anchorOffset ?? length, length))
    if (anchor > pos) {
      blocks.push({ type: 'text', start: pos, end: anchor, key: `text-${pos}-${anchor}` })
    }
    blocks.push({ type: 'note', note, key: `note-${note.id}` })
    pos = anchor
  }

  if (pos < length || !blocks.some(block => block.type === 'text') || blocks[blocks.length - 1]?.type === 'note') {
    blocks.push({ type: 'text', start: pos, end: length, key: `text-${pos}-${length}` })
  }

  return blocks
}

// ─── Content preview ──────────────────────────────────────────────────────────

// Script blocks are rebuilt from `content` by trimming around blank-line separators, so
// their exact raw offsets aren't kept on the block objects. Recover them here by locating
// each block's text in order — good enough for mapping a click back to a raw offset.
function locateScriptBlockOffsets(content, blocks) {
  let cursor = 0
  return blocks.map(block => {
    const text = block.text || ''
    const idx = content.indexOf(text, cursor)
    const start = idx >= 0 ? idx : cursor
    cursor = start + text.length
    return { start, end: cursor }
  })
}

const ScriptPreview = ({ content, blocks, elementType, projectType, entityNames, entityMap, notesBySeq, highlightedNoteSeq, onEntityClick, onNoteClick, onUpdateNote, onDeleteNote, onOpenNotes }) => {
  const resolvedBlocks = blocks?.length ? blocks : buildScriptBlocks('', elementType)
  if (!resolvedBlocks.length) return <span className="ms-placeholder">Begin writing here…</span>
  const blockOffsets = locateScriptBlockOffsets(content || '', resolvedBlocks)

  return (
    <div className="ms-script-preview">
      {resolvedBlocks.map((block, index) => {
        const type = block.type || elementType || 'action'
        const blockStart = blockOffsets[index]?.start || 0
        const segs = parseSegments(block.text || '', entityNames, entityMap)
        return (
          <div key={block.id || index} className={`ms-script-block ms-script-${type}`}>
            <span className="ms-script-block-label">{getScriptElementLabel(projectType, type)}</span>
            <p>
              {segs.map((seg, i) => {
                if (seg.type === 'entity') return <EntityLink key={i} seg={{ ...seg, start: blockStart + seg.start, end: blockStart + seg.end }} onOpen={onEntityClick} />
                if (seg.type === 'note') {
                  const note = notesBySeq.get(seg.seq)
                  if (!note) return null
                  return (
                    <InlineNoteBlock
                      key={i}
                      note={note}
                      embedded
                      highlighted={highlightedNoteSeq === note.seq}
                      onUpdate={onUpdateNote}
                      onDelete={onDeleteNote}
                      onOpen={seq => { onNoteClick(seq); onOpenNotes() }}
                    />
                  )
                }
                if (seg.type === 'noteRange') return <span key={i} className={`ms-note-highlight${highlightedNoteSeq === seg.note.seq ? ' is-highlighted' : ''}`} data-raw-start={blockStart + seg.start} data-raw-end={blockStart + seg.end}>{renderInlineMarkdown(seg.value ?? block.text.slice(seg.start, seg.end), `sr${index}-${i}`, blockStart + seg.start)}</span>
                return <span key={i}>{renderInlineMarkdown(seg.value, `sb${index}-${i}`, blockStart + seg.start)}</span>
              })}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function EntityLink({ seg, onOpen }) {
  const entity = seg.entity
  const label = entity?.name || seg.value
  const preview = entity?.preview || 'No preview yet.'
  const openEntity = event => {
    event.preventDefault()
    event.stopPropagation()
    if (entity) onOpen(entity)
  }
  return (
    <span className="ms-entity-wrap" onClick={openEntity}>
      <span
        className="ms-entity"
        data-raw-start={seg.start}
        data-raw-end={seg.end}
        role="button"
        tabIndex={0}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openEntity(event) }}
      >
        {seg.value}
      </span>
      <span className="ms-entity-popover font-sans">
        <b>{label}</b>
        <small>{entity?.sectionLabel || entity?.section}</small>
        <span>{preview}</span>
        <button type="button" onClick={openEntity}>Open in side panel</button>
      </span>
    </span>
  )
}

const ContentPreview = ({
  content, entityMap, notesBySeq, highlightedNoteSeq,
  onEntityClick, onNoteClick, onUpdateNote, onDeleteNote, onOpenNotes,
  isBullets, isScript, scriptBlocks, scriptElement, projectType,
  mode = 'edit',
  indentParagraphs = false,
  baseOffset = 0,
}) => {
  const entityNames = useMemo(
    () => Object.keys(entityMap).sort((a, b) => b.length - a.length),
    [entityMap]
  )

  if (!content) return <span className="ms-placeholder">Begin writing here…</span>

  if (isScript) {
    return (
      <ScriptPreview
        content={content}
        blocks={scriptBlocks?.length ? scriptBlocks : buildScriptBlocks(content, scriptElement)}
        elementType={scriptElement}
        projectType={projectType}
        entityNames={entityNames}
        entityMap={entityMap}
        onEntityClick={onEntityClick}
        onNoteClick={onNoteClick}
        notesBySeq={notesBySeq}
        highlightedNoteSeq={highlightedNoteSeq}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
        onOpenNotes={onOpenNotes}
      />
    )
  }

  if (isBullets) {
    const lineInfos = content.split('\n').reduce((acc, line) => {
      const start = acc.length ? acc[acc.length - 1].end : 0
      acc.push({ line, start, end: start + line.length + 1 })
      return acc
    }, []).filter(info => info.line.trim())
    if (!lineInfos.length) return <span className="ms-placeholder">One item per line…</span>
    return (
      <ul className="ms-bullets">
        {lineInfos.map((info, i) => <li key={i}>{renderInlineMarkdown(info.line, `bl${i}`, baseOffset + info.start)}</li>)}
      </ul>
    )
  }

  if (indentParagraphs) {
    const paragraphs = []
    const separator = /\n{2,}/g
    let start = 0
    let match
    while ((match = separator.exec(content)) !== null) {
      paragraphs.push({ start, end: match.index, text: content.slice(start, match.index) })
      start = match.index + match[0].length
    }
    paragraphs.push({ start, end: content.length, text: content.slice(start) })

    const notes = [...notesBySeq.values()]
    return (
      <div className="ms-prose-paragraphs">
        {paragraphs.map((paragraph, paragraphIndex) => {
          const isLast = paragraphIndex === paragraphs.length - 1
          const paragraphNotes = new Map(notes.flatMap(note => {
            const rawStart = note.anchorOffset ?? content.length
            const rawEnd = note.anchorEndOffset ?? rawStart
            const isPointNote = rawStart === rawEnd
            const overlaps = isPointNote
              ? rawStart >= paragraph.start && (rawStart < paragraph.end || (isLast && rawStart <= paragraph.end))
              : rawEnd > paragraph.start && rawStart < paragraph.end
            if (!overlaps) return []
            return [[note.seq, {
              ...note,
              anchorOffset: Math.max(paragraph.start, rawStart) - paragraph.start,
              anchorEndOffset: Math.min(paragraph.end, Math.max(rawStart, rawEnd)) - paragraph.start,
            }]]
          }))

          return (
            <div
              key={`${paragraph.start}-${paragraph.end}-${paragraphIndex}`}
              className="ms-prose-paragraph"
              data-raw-start={baseOffset + paragraph.start}
              data-raw-end={baseOffset + paragraph.end}
            >
              {paragraph.text ? (
                <ContentPreview
                  content={paragraph.text}
                  entityMap={entityMap}
                  notesBySeq={paragraphNotes}
                  highlightedNoteSeq={highlightedNoteSeq}
                  onEntityClick={onEntityClick}
                  onNoteClick={onNoteClick}
                  onUpdateNote={onUpdateNote}
                  onDeleteNote={onDeleteNote}
                  onOpenNotes={onOpenNotes}
                  isBullets={false}
                  isScript={false}
                  projectType={projectType}
                  mode={mode}
                  indentParagraphs={false}
                  baseOffset={baseOffset + paragraph.start}
                />
              ) : (
                <span data-raw-start={baseOffset + paragraph.start} data-raw-end={baseOffset + paragraph.end}>{'\u00a0'}</span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const segs = parseSegments(content, entityNames, entityMap, [...notesBySeq.values()])
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === 'entity') return <EntityLink key={i} seg={{ ...seg, start: baseOffset + seg.start, end: baseOffset + seg.end }} onOpen={onEntityClick} />
        if (seg.type === 'note') {
          // Write mode: notes exist only as this inline box. Edit mode: notes
          // exist only as the gutter's floating icon (rendered by the parent,
          // see .ms-scene-gutter below) — skip the anchor here entirely
          // rather than show both at once.
          if (mode !== 'write') return null
          const note = notesBySeq.get(seg.seq)
          if (!note) return null
          return (
            <InlineNoteBlock
              key={i}
              note={note}
              embedded
              highlighted={highlightedNoteSeq === note.seq}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
              onOpen={seq => { onNoteClick(seq); onOpenNotes() }}
            />
          )
        }
        if (seg.type === 'noteRange') {
          return (
            <span
              key={i}
              className={`ms-note-highlight${highlightedNoteSeq === seg.note.seq ? ' is-highlighted' : ''}`}
              data-raw-start={baseOffset + seg.start}
              data-raw-end={baseOffset + seg.end}
              title={`Note ${seg.note.seq}`}
            >
              {renderInlineMarkdown(content.slice(seg.start, seg.end), `nr${i}`, baseOffset + seg.start)}
            </span>
          )
        }
        return <span key={i}>{renderInlineMarkdown(seg.value, `s${i}`, baseOffset + seg.start)}</span>
      })}
    </>
  )
}

// SceneMetaBar (POV/location/status inline row) was removed here — those
// fields now live in the inspector's Scene tab (ManuscriptInspector.jsx); the
// status chip alone stays inline in the scene header below.

// Edit mode's gutter icon — a comment bubble, always visible per note rather
// than only on hover, matching Write mode's always-visible inline box below.
const NoteIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)

// `defaultOpen` isn't a real React/DOM prop for <details> (only `open` is —
// there's no uncontrolled-via-"defaultX" convention for it the way there is
// for <input defaultValue>), so it silently did nothing: every note has
// always mounted closed regardless of whether it had text yet, needing an
// extra click just to start typing into a brand new note. Fixed by making
// `open` genuinely controlled, seeded once from !note.text and then kept in
// sync with the user's own toggling via onToggle.
//
// The textarea also gets its own local buffer + debounce (same pattern as
// NotesPanel in ManuscriptToolbar.jsx, and the same reason: a fully
// controlled textarea bound straight to the store means every keystroke
// waits on a full onUpdateScene round-trip and re-render before the next
// one lands, which reads as "typing into it doesn't save" on anything but
// a trivially small project).
const InlineNoteBlock = ({ note, embedded = false, highlighted, onUpdate, onDelete, onOpen }) => {
  const [open, setOpen] = useState(!note.text)
  const [title, setTitle] = useState(note.title || '')
  const [text, setText] = useState(note.text || '')
  const debouncedSaveText = useDebouncedCallback(value => onUpdate(note.id, { text: value }), 300)
  const debouncedSaveTitle = useDebouncedCallback(value => onUpdate(note.id, { title: value }), 300)
  return (
    <details
      className={`ms-inline-note${embedded ? ' ms-inline-note--embedded' : ''}${highlighted ? ' is-highlighted' : ''}`}
      open={open}
      onToggle={e => setOpen(e.target.open)}
      onClick={e => e.stopPropagation()}
    >
      <summary>
        <input
          className="ms-inline-note-title"
          value={title}
          onChange={e => { setTitle(e.target.value); debouncedSaveTitle.schedule(e.target.value) }}
          onBlur={debouncedSaveTitle.flush}
          onClick={e => e.stopPropagation()}
          placeholder={`Note ${note.seq}`}
        />
        <div className="ms-inline-note-actions">
          <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onOpen(note.seq) }}>Open</button>
          <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete(note.id) }}>Delete</button>
        </div>
      </summary>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); debouncedSaveText.schedule(e.target.value) }}
        onBlur={debouncedSaveText.flush}
        placeholder="Write a manuscript note..."
        rows={3}
      />
    </details>
  )
}

// Edit mode's gutter card (see .ms-scene-gutter below) — its own component
// (rather than inline in the .map() below) because the title input needs
// its own local buffer + debounce, same reasoning as InlineNoteBlock above,
// and hooks can't live inside a .map() callback.
function GutterNoteCard({ note, highlighted, onUpdateNote, onOpen }) {
  const [title, setTitle] = useState(note.title || '')
  const debouncedSaveTitle = useDebouncedCallback(value => onUpdateNote(note.id, { title: value }), 300)
  return (
    <div className={`ms-gutter-note-card${highlighted ? ' is-highlighted' : ''}`}>
      <div className="ms-gutter-note-card-head">
        <NoteIcon />
        <input
          className="ms-gutter-note-card-title"
          value={title}
          onChange={e => { setTitle(e.target.value); debouncedSaveTitle.schedule(e.target.value) }}
          onBlur={debouncedSaveTitle.flush}
          placeholder={`Note ${note.seq}`}
        />
      </div>
      <button
        type="button"
        className="ms-gutter-note-card-body"
        onClick={onOpen}
        aria-label={`Note ${note.seq}${note.text ? `: ${note.text}` : ' (empty)'}`}
      >
        {note.text || 'Empty note — click to add text'}
      </button>
    </div>
  )
}

function NoteModal({ note, onUpdate, onDelete, onClose }) {
  const [title, setTitle] = useState(note.title || '')
  const [text, setText] = useState(note.text || '')
  const saveAndClose = () => {
    onUpdate(note.id, { title, text })
    onClose()
  }
  return (
    <Modal title={title || `Note ${note.seq}`} onClose={saveAndClose} wide={false}>
      <div className="ms-note-modal">
        {note.selectedText && (
          <blockquote>{note.selectedText}</blockquote>
        )}
        <label>
          <span>Title</span>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`Note ${note.seq}`} />
        </label>
        <label>
          <span>Note</span>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8} placeholder="Write a manuscript note..." />
        </label>
        <div className="ms-note-modal-actions">
          <button type="button" className="ai-btn ai-btn--muted" onClick={() => { onDelete(note.id); onClose() }}>Delete</button>
          <button type="button" className="ai-btn ai-btn--primary" onClick={saveAndClose}>Save</button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Scene editor ─────────────────────────────────────────────────────────────

// Every keystroke in any one scene touches manuscript-wide state (live word count,
// autosave indicator, etc.), which re-renders the whole scene list. In an 80k+ word
// manuscript that's dozens of unfocused scenes each re-running ContentPreview's regex
// entity/markdown parsing over their full text — the actual source of the typing lag.
// Memoize so a keystroke only re-renders the scene whose `scene` prop actually changed;
// everything else here (callbacks recreated per-render, refs) is either already stable
// or is a per-scene closure that behaves identically as long as `scene` itself is
// unchanged, so it's safe to leave out of the comparison.
//
// entityMap is (surprisingly) NOT a reliably stable reference even though
// Manuscript.jsx memoizes it off `characters`/`locations` — something
// elsewhere in the store re-creates those arrays every few seconds during
// normal use (independent of anything this file controls), which was
// silently defeating this memo entirely: every scene bailed out on
// `entityMap` alone, every time. Compare it by cheap shape (entry count)
// instead of reference — a renamed character mid-burst going unhighlighted
// for a moment is a fine trade for not re-running full-scene regex parsing
// on 38 other scenes every few seconds.
// (characterNames/locationNames used to need the same treatment when
// SceneMetaBar rendered its own POV/location inputs inline; that row moved
// to the inspector's Scene tab in the redesign, so this component no longer
// receives or compares them at all.)
const sameShape = (a, b) => (a?.length ?? Object.keys(a || {}).length) === (b?.length ?? Object.keys(b || {}).length)

function shiftNoteForEdit(note, editStart, editEnd, delta, previousLength) {
  const anchor = note.anchorOffset ?? previousLength
  const anchorEnd = note.anchorEndOffset ?? anchor
  const shift = value => {
    if (value >= editEnd && !(editEnd === editStart && value === editStart)) return Math.max(0, value + delta)
    if (value > editStart && value < editEnd) return editStart
    return value
  }
  return { ...note, anchorOffset: shift(anchor), anchorEndOffset: Math.max(shift(anchor), shift(anchorEnd)) }
}

const sceneEditorPropsEqual = (prev, next) => (
  prev.scene === next.scene &&
  prev.sceneIndex === next.sceneIndex &&
  sameShape(prev.entityMap, next.entityMap) &&
  prev.highlightedNoteSeq === next.highlightedNoteSeq &&
  prev.formatSettings === next.formatSettings &&
  prev.projectType === next.projectType &&
  prev.caretFollowEnabled === next.caretFollowEnabled &&
  prev.scrollContainerRef === next.scrollContainerRef &&
  prev.pageZoom === next.pageZoom &&
  prev.keepEditingOnExternalBlur === next.keepEditingOnExternalBlur &&
  prev.mode === next.mode
)

const SceneEditorImpl = ({
  scene, sceneIndex,
  onUpdate, onUpdateScene, onSplit,
  innerRef, onFocus: onFocusExternal,
  entityMap, onEntityClick,
  onOpenNotes, onNoteClick,
  highlightedNoteSeq = null,
  formatSettings,
  onPersistDraft,
  onLiveContentChange = () => {},
  onSelectionContextChange = () => {},
  onOpenVersionHistory,
  onOpenSceneDetails,
  onAskAI,
  // 'write' | 'edit' — spec §8's mode table. Only these two matter here:
  // Finalised mode never mounts a real SceneEditor (Manuscript.jsx swaps the
  // whole body for a read-only render). Defaults to 'edit' so every existing
  // caller/test that doesn't pass this keeps today's full-apparatus behavior.
  mode = 'edit',
  projectType,
  caretFollowEnabled = false,
  scrollContainerRef,
  pageZoom = 1,
  keepEditingOnExternalBlur = false,
}) => {
  const [localContent, setLocalContent] = useState(() => stripNoteMarkers(scene.content || ''))
  const [localScriptBlocks, setLocalScriptBlocks] = useState(() => scene.scriptBlocks?.length
    ? scene.scriptBlocks
    : buildScriptBlocks(stripNoteMarkers(scene.content || ''), scene.scriptElement || 'action'))
  const [activeScriptBlockIndex, setActiveScriptBlockIndex] = useState(0)
  const [focused, setFocused] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [floatingNotePos, setFloatingNotePos] = useState(null)
  const [openNoteId, setOpenNoteId] = useState(null)
  // Warn up front rather than reconcile after the fact — see
  // EditingElsewhereWarning and the 2026-08-02/03 Bugs table row in
  // docs/ROADMAP.md for why silent post-hoc merging kept finding new gaps.
  const otherEditorsCount = useTabPresence(`scene:${scene.id}`, focused)
  const [showEditingElsewhereWarning, setShowEditingElsewhereWarning] = useState(false)
  const warnedThisFocusRef = useRef(false)
  const textareaRef = useRef(null)
  const wrapperRef = useRef(null)
  const visualCaretFrameRef = useRef(null)
  const activeVisualCaretRef = useRef({ marker: null, textarea: null })
  const localContentRef = useRef(localContent)
  // Manuscript.jsx overlays live (uncommitted) content onto the `scene` prop for
  // whichever scene is actively being edited, which means `scene` gets a brand new
  // object identity on every keystroke. Any effect keyed on `scene` itself therefore
  // re-runs every keystroke too — see the exit-flush effect below, where that used to
  // mean its cleanup (an unthrottled `onPersistDraft(..., {immediate:true})` plus a
  // forced `debouncedUpdate.flush()`, i.e. the full localStorage/store-commit cost)
  // fired on every single character typed, silently defeating the draft-persist
  // throttle above. Track `scene` via a ref instead so effects can read the latest
  // value without depending on its identity.
  const sceneRef = useRef(scene)
  useEffect(() => { sceneRef.current = scene }, [scene])
  const lastSelectionRef = useRef({ start: localContent.length, end: localContent.length })
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const burstActiveRef = useRef(false)
  const burstTimeoutRef = useRef(null)
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  const [sceneCopied, setSceneCopied] = useState(false)
  const isScript = SCRIPT_TYPES.has(projectType)
  const isBullets = !isScript && scene.textMode === 'bullets'
  const scriptElement = localScriptBlocks[activeScriptBlockIndex]?.type || scene.scriptElement || 'action'
  const scriptElements = getScriptElements(projectType)

  const hideVisualCaret = useCallback(() => {
    const { marker, textarea } = activeVisualCaretRef.current
    marker?.classList.remove('is-visible')
    textarea?.classList.remove('ms-textarea--custom-caret')
    activeVisualCaretRef.current = { marker: null, textarea: null }
  }, [])

  const syncVisualCaret = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || document.activeElement !== textarea || textarea.selectionStart !== textarea.selectionEnd) {
      hideVisualCaret()
      return
    }

    const editor = textarea.closest('.ms-rich-edit')
    const preview = editor?.querySelector('.ms-rich-preview')
    const marker = editor?.querySelector('.ms-editor-caret')
    if (!editor || !preview || !marker) {
      hideVisualCaret()
      return
    }

    const base = Number(textarea.dataset.msStart) || 0
    const caretRect = getPreviewCaretRect(preview, base + textarea.selectionEnd)
    if (!caretRect) {
      hideVisualCaret()
      return
    }

    const editorRect = editor.getBoundingClientRect()
    const fallbackScale = Number(pageZoom) || 1
    const scaleX = editor.offsetWidth > 0 && editorRect.width > 0
      ? editorRect.width / editor.offsetWidth
      : fallbackScale
    const scaleY = editor.offsetHeight > 0 && editorRect.height > 0
      ? editorRect.height / editor.offsetHeight
      : fallbackScale
    const computed = window.getComputedStyle(textarea)
    const fontSize = Number.parseFloat(computed.fontSize) || Number(formatSettings.fontSize) || 16
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.2
    const measuredLineHeight = caretRect.height > 0 ? caretRect.height / scaleY : lineHeight
    const top = (caretRect.top - editorRect.top) / scaleY + Math.max(0, (measuredLineHeight - fontSize) / 2)
    const left = (caretRect.left - editorRect.left) / scaleX

    const previous = activeVisualCaretRef.current
    if (previous.marker && previous.marker !== marker) previous.marker.classList.remove('is-visible')
    if (previous.textarea && previous.textarea !== textarea) previous.textarea.classList.remove('ms-textarea--custom-caret')

    marker.style.left = `${left}px`
    marker.style.top = `${top}px`
    marker.style.height = `${fontSize}px`
    marker.classList.add('is-visible')
    textarea.classList.add('ms-textarea--custom-caret')
    activeVisualCaretRef.current = { marker, textarea }
  }, [formatSettings.fontSize, hideVisualCaret, pageZoom])

  const scheduleVisualCaret = useCallback(() => {
    if (visualCaretFrameRef.current) window.cancelAnimationFrame(visualCaretFrameRef.current)
    visualCaretFrameRef.current = window.requestAnimationFrame(() => {
      visualCaretFrameRef.current = null
      syncVisualCaret()
    })
  }, [syncVisualCaret])

  useEffect(() => () => {
    if (visualCaretFrameRef.current) window.cancelAnimationFrame(visualCaretFrameRef.current)
    hideVisualCaret()
  }, [hideVisualCaret])

  const hasMetadata = !!(scene.pov || scene.locationTag || (scene.status && scene.status !== 'draft'))
  const showSceneMeta = formatSettings.showSceneMetadata !== false
  const statusCfg = SCENE_STATUSES.find(s => s.value === (scene.status || 'draft')) ?? SCENE_STATUSES[0]
  // Derived from `scene.content` (the debounced store prop), not `localContent`
  // (the live per-keystroke buffer) — same safe pattern the old SceneMetaBar's
  // inline word count already used. Recomputing a full split/trim on every
  // keystroke for a large scene would reintroduce exactly the typing-lag cost
  // this file's virtualization/debouncing exists to avoid.
  const wordCount = useMemo(() => {
    const trimmed = scene.content?.trim()
    return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  }, [scene.content])
  const sortedNotes = useMemo(
    () => [...(scene.notes || [])].sort((a, b) => (a.anchorOffset ?? 0) - (b.anchorOffset ?? 0) || a.seq - b.seq),
    [scene.notes]
  )
  const notesBySeq = useMemo(
    () => new Map((scene.notes || []).map(note => [note.seq, note])),
    [scene.notes]
  )
  const openNote = useMemo(
    () => (scene.notes || []).find(note => note.id === openNoteId) || null,
    [openNoteId, scene.notes]
  )
  const writingBlocks = useMemo(
    () => buildWritingBlocks(localContent, sortedNotes),
    [localContent, sortedNotes]
  )
  useEffect(() => {
    if (focused) return undefined
    const sync = window.requestAnimationFrame(() => {
      const content = stripNoteMarkers(scene.content || '')
      setLocalContent(content)
      setLocalScriptBlocks(scene.scriptBlocks?.length ? scene.scriptBlocks : buildScriptBlocks(content, scene.scriptElement || 'action'))
      setActiveScriptBlockIndex(0)
    })
    return () => window.cancelAnimationFrame(sync)
  }, [scene.content, scene.scriptBlocks, scene.scriptElement, focused])

  useEffect(() => {
    if (!focused) { warnedThisFocusRef.current = false; return }
    if (otherEditorsCount > 0 && !warnedThisFocusRef.current) {
      warnedThisFocusRef.current = true
      setShowEditingElsewhereWarning(true)
    }
  }, [focused, otherEditorsCount])


  // `ta.style.height = 'auto'` followed by reading `scrollHeight` forces the browser
  // to lay out the textarea's entire content to find its natural height — cheap for a
  // normal scene, but measured at 40ms+ for a scene in the tens of thousands of words,
  // on every single keystroke (useLayoutEffect re-runs on every `localContent` change).
  // Below the threshold, resize exactly as before. Above it, avoid the layout-forcing
  // read on every keystroke: grow a generous, purely-cheap buffer once per typing burst
  // (`ta.style.height` here is a plain CSSOM string read/write, not a layout query — it
  // doesn't force reflow) so newly typed text is never clipped (the textarea has
  // `overflow: hidden`), then correct to the exact height on a short debounce once
  // typing pauses.
  const RESIZE_PRECISE_THRESHOLD = 20000
  const RESIZE_GROWTH_BUFFER_PX = 600
  // hasResizeBaselineRef: true once this focus session has an accurate
  // scrollHeight-measured height to grow from. Must start (and reset on blur) false —
  // without a real baseline, the cheap growth path would read a stale/empty
  // `ta.style.height` and undersize a large scene's textarea straight into clipped
  // content. growthAppliedRef: true once the cheap buffer has been applied for the
  // *current* typing burst, so repeated keystrokes before the debounce fires don't
  // keep stacking +600px on top of each other — one buffer bump per burst is enough,
  // and preciseResize (on the debounce, or via the threshold/no-baseline branch)
  // always clears it.
  const hasResizeBaselineRef = useRef(false)
  const growthAppliedRef = useRef(false)

  const preciseResize = useCallback(() => {
    const textareas = wrapperRef.current?.querySelectorAll('textarea.ms-textarea') || []
    textareas.forEach(ta => {
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
    })
    hasResizeBaselineRef.current = true
    growthAppliedRef.current = false
  }, [])
  const debouncedPreciseResize = useDebouncedCallback(preciseResize, 200)

  useEffect(() => {
    if (!focused) hasResizeBaselineRef.current = false
  }, [focused])

  useLayoutEffect(() => {
    if (!focused) return
    const textareas = wrapperRef.current?.querySelectorAll('textarea.ms-textarea') || []
    if (!textareas.length) return

    if (localContent.length <= RESIZE_PRECISE_THRESHOLD || !hasResizeBaselineRef.current) {
      textareas.forEach(ta => {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
      hasResizeBaselineRef.current = true
      growthAppliedRef.current = false
      return
    }

    if (!growthAppliedRef.current) {
      textareas.forEach(ta => {
        const current = Number.parseFloat(ta.style.height) || 0
        ta.style.height = (current + RESIZE_GROWTH_BUFFER_PX) + 'px'
      })
      growthAppliedRef.current = true
    }
    debouncedPreciseResize.schedule()
  }, [localContent, focused, formatSettings.fontFamily, formatSettings.fontSize, formatSettings.lineHeight, pageZoom, writingBlocks, debouncedPreciseResize])

  const scheduleCaretFollow = useCaretComfortScroll({
    textareaRef,
    scrollContainerRef,
    enabled: caretFollowEnabled && focused,
    focused,
    scale: pageZoom,
  })

  useLayoutEffect(() => {
    if (focused) {
      scheduleCaretFollow()
      scheduleVisualCaret()
    }
  }, [caretFollowEnabled, focused, localContent, formatSettings, pageZoom, scheduleCaretFollow, scheduleVisualCaret])

  // The store's own conflict detection (mergeSceneUpdateWithPersistedCopy in
  // useStore.js) treats any mismatch between localStorage's `nf_scenes` and its
  // in-memory copy as "another tab changed this" — it has no way to know that
  // persistSceneDraftToLocalStorage (a *separate* write path to that same
  // localStorage key) is this same tab's own throttled draft, just lagging behind.
  // Before that draft write was throttled, it ran on every keystroke and was
  // always in lockstep with this debounced commit, so the mismatch never came up.
  // Now it can lag up to DRAFT_THROTTLE_MS behind, so on a normal typing pause the
  // store reads a stale draft, sees it differ from the fresh content it's about to
  // save, and raises a false "edited in two tabs" conflict — every pause, in a
  // single tab. Flushing the draft immediately right here, synchronously before
  // the store read, guarantees they're identical at the moment that comparison
  // happens — and since this only runs once per debounce (not per keystroke), it
  // doesn't reintroduce the per-keystroke cost the throttle was fixing.
  const debouncedUpdate = useDebouncedCallback(text => {
    onPersistDraft(sceneRef.current, text, { immediate: true })
    onUpdate(scene.id, text)
  }, 400)

  const measureCaret = useTextareaCaretRect(textareaRef, pageZoom)

  const rememberSelection = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    const base = Number(ta.dataset.msStart) || 0
    const selection = {
      start: base + (ta.selectionStart ?? localContentRef.current.length),
      end: base + (ta.selectionEnd ?? ta.selectionStart ?? localContentRef.current.length),
    }
    lastSelectionRef.current = selection
    const start = Math.max(0, Math.min(selection.start, localContentRef.current.length))
    const end = Math.max(start, Math.min(selection.end, localContentRef.current.length))
    onSelectionContextChange(start === end ? '' : localContentRef.current.slice(start, end))
  }, [onSelectionContextChange])

  // hasSelection here (not a separate measurement pass) is what switches the
  // floating "+" note button into the selection bar (Note/Ask AI/B/I) below —
  // reusing this already-debounced position sync instead of adding a second,
  // parallel `selectionchange`-driven measurement path.
  const syncFloatingNoteButton = useCallback(() => {
    const ta = textareaRef.current
    const wrapper = wrapperRef.current
    if (!ta || !wrapper || document.activeElement !== ta) return
    const caret = measureCaret()
    if (!caret) return
    const wrapperRect = wrapper.getBoundingClientRect()
    const side = caret.left - wrapperRect.left > wrapperRect.width / 2 ? 'left' : 'right'
    const top = Math.max(24, Math.min(wrapperRect.height - 34, caret.top - wrapperRect.top - 2))
    setFloatingNotePos({ top, side, hasSelection: ta.selectionStart !== ta.selectionEnd })
  }, [measureCaret])

  // measureCaret's mirror-div technique (useTextareaCaretRect.js) has to mirror
  // every character before the cursor and read its layout back — on a large scene
  // that's a full reflow of the manuscript's DOM (all scenes are mounted at once,
  // unvirtualized), measured at 400-500ms+ for a ~245k-character scene. Calling it
  // synchronously on every keystroke — which the un-debounced version below did,
  // from handleChange *and* onKeyUp *and* onSelect (all three fire per keystroke) —
  // was the real, dominant cause of the "still super laggy" typing reports on large
  // manuscripts; the earlier React re-render and localStorage fixes were real but
  // secondary next to this. Debounce it: the floating "+" note button only needs to
  // catch up once typing pauses, not track every character, and clicks still feel
  // instant since a deliberate click is followed by a pause anyway.
  const debouncedSyncFloatingNoteButton = useDebouncedCallback(syncFloatingNoteButton, 300)

  const syncCursorTools = useCallback(() => {
    rememberSelection()
    syncFloatingNoteButton()
    scheduleVisualCaret()
  }, [rememberSelection, scheduleVisualCaret, syncFloatingNoteButton])

  const focusRange = useCallback((start, end = start) => {
    window.setTimeout(() => {
      const candidates = [...(wrapperRef.current?.querySelectorAll('textarea.ms-textarea[data-ms-start]') || [])]
      const ta = [...candidates].reverse().find(node => {
        const base = Number(node.dataset.msStart) || 0
        const limit = Number(node.dataset.msEnd) || base
        return start >= base && start <= limit
      }) || textareaRef.current
      if (!ta) return
      setFocused(true)
      // preventScroll: without it, .focus() triggers the browser's own default
      // "scroll this element into view" — its own heuristic, not ours, and it
      // fires on *every* call here regardless of whether `ta` was already
      // focused (this runs after essentially every discrete edit: Enter with
      // auto-indent — on by default — undo/redo, note insert/delete, script
      // paragraph insert, AI content insert). This alone wasn't enough, though
      // (see below) — confirmed via a user-supplied screen recording of the
      // *regular* editor (not Focused Writing) still jumping after this fix
      // shipped on its own.
      ta.focus({ preventScroll: true })
      textareaRef.current = ta
      const base = Number(ta.dataset.msStart) || 0
      ta.setSelectionRange(Math.max(0, start - base), Math.max(0, end - base))
      lastSelectionRef.current = { start, end }
      syncFloatingNoteButton()
      scheduleVisualCaret()
      // `preventScroll` only governs `.focus()` — it does nothing for the
      // `setSelectionRange` call just above, which can *independently* trigger
      // the browser's own "scroll the selection into view." Confirmed live by
      // instrumenting `Element.prototype.scrollTop`/`scrollTo`/`scrollIntoView`
      // at the prototype level: none of them fire, yet the container's
      // scrollTop measurably jumps — this native reveal happens inside the
      // browser engine below the DOM API surface entirely, so there is no
      // option (unlike `preventScroll`) to suppress it going in. The only way
      // to deal with it is reactively: let it happen, then immediately correct.
      // `immediate` always runs here — deliberately unconditional, not gated on
      // `caretFollowEnabled` (see that flag's own gating in the hook call
      // below, and the comment on `schedule`'s `immediate` option in
      // useCaretComfortScroll.js) — because this native jump happens in every
      // mode, and it's a correction for a browser glitch, not the "keep caret
      // centered while typing" feature `caretFollowEnabled` toggles.
      scheduleCaretFollow({ immediate: true })
    }, 0)
  }, [scheduleCaretFollow, scheduleVisualCaret, syncFloatingNoteButton])

  // ─── Undo / redo ─────────────────────────────────────────────────────────
  // Snapshots cover raw content (+ script blocks, for script projects) and the caret
  // position to restore. Rapid keystrokes are grouped into one undo step via a short
  // pause-based "burst" window; discrete actions (formatting, Enter, AI inserts, note
  // deletion) always start a new step regardless of timing.

  const snapshotNow = useCallback(() => ({
    content: localContentRef.current,
    scriptBlocks: localScriptBlocks,
    scriptElement,
    selection: lastSelectionRef.current,
  }), [localScriptBlocks, scriptElement])

  const recordBeforeEdit = useCallback((forceNewEntry = false) => {
    clearTimeout(burstTimeoutRef.current)
    if (!forceNewEntry && burstActiveRef.current) {
      burstTimeoutRef.current = setTimeout(() => { burstActiveRef.current = false }, 600)
      return
    }
    undoStackRef.current.push(snapshotNow())
    if (undoStackRef.current.length > 200) undoStackRef.current.shift()
    redoStackRef.current = []
    burstActiveRef.current = true
    burstTimeoutRef.current = setTimeout(() => { burstActiveRef.current = false }, 600)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(0)
  }, [snapshotNow])

  const applySnapshot = useCallback(snap => {
    localContentRef.current = snap.content
    onPersistDraft(scene, snap.content)
    onLiveContentChange(scene.id, snap.content)
    setLocalContent(snap.content)
    debouncedUpdate.schedule(snap.content)
    if (isScript) {
      setLocalScriptBlocks(snap.scriptBlocks)
      onUpdateScene(scene.id, { scriptBlocks: snap.scriptBlocks, scriptElement: snap.scriptElement, textMode: 'script' })
    }
    setFocused(true)
    const end = snap.selection?.end ?? snap.content.length
    const start = snap.selection?.start ?? end
    focusRange(start, end)
  }, [debouncedUpdate, focusRange, isScript, onLiveContentChange, onPersistDraft, onUpdateScene, scene])

  const handleUndo = useCallback(() => {
    if (!undoStackRef.current.length) return
    const current = snapshotNow()
    const prev = undoStackRef.current.pop()
    redoStackRef.current.push(current)
    burstActiveRef.current = false
    clearTimeout(burstTimeoutRef.current)
    applySnapshot(prev)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }, [applySnapshot, snapshotNow])

  const handleRedo = useCallback(() => {
    if (!redoStackRef.current.length) return
    const current = snapshotNow()
    const next = redoStackRef.current.pop()
    undoStackRef.current.push(current)
    burstActiveRef.current = false
    clearTimeout(burstTimeoutRef.current)
    applySnapshot(next)
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }, [applySnapshot, snapshotNow])

  // "Copy whole scene" — the accepted product decision (2026-08-08, see
  // docs/ROADMAP.md's single-very-large-scene typing-lag row) for scenes big
  // enough that the browser's own native `<textarea>` selection (drag-select,
  // Shift-click, Ctrl+A) can get slow or unreliable. Reads `localContentRef`
  // directly — the in-memory content model is a single string regardless of
  // scene length or how it's rendered — so this never touches native DOM
  // selection at all, sidestepping that cost entirely rather than trying to
  // work around it. Harmless (just copies a short string) for ordinary scenes.
  const copyFeedbackTimeoutRef = useRef(null)
  const handleCopyWholeScene = useCallback(async () => {
    const ok = await copyTextToClipboard(localContentRef.current)
    if (!ok) return
    setSceneCopied(true)
    clearTimeout(copyFeedbackTimeoutRef.current)
    copyFeedbackTimeoutRef.current = window.setTimeout(() => setSceneCopied(false), 1500)
  }, [])

  useEffect(() => () => clearTimeout(copyFeedbackTimeoutRef.current), [])

  useEffect(() => {
    if (!innerRef) return
    innerRef({
      focus: ({ placeCursor = 'end' } = {}) => {
        setFocused(true)
        setTimeout(() => {
          const ta = textareaRef.current
          if (!ta) return
          // preventScroll: Manuscript.jsx's callers of this already do their own
          // deliberate scrollIntoView around this focus() call — see the
          // preventScroll comment on focusRange above for why the browser's own
          // competing scroll-on-focus needs to be suppressed here too.
          ta.focus({ preventScroll: true })
	          if (placeCursor === 'end') {
	            const end = localContentRef.current.length
	            ta.setSelectionRange(end, end)
	            lastSelectionRef.current = { start: end, end }
	          }
	          syncFloatingNoteButton()
	        }, 0)
	      },
	      scrollIntoView: opts => wrapperRef.current?.scrollIntoView(opts),
	      appendContent: (text) => {
        recordBeforeEdit(true)
	        const cur = localContentRef.current ?? ''
	        const selection = lastSelectionRef.current || { start: cur.length, end: cur.length }
	        const rawStart = Number.isFinite(selection.start) ? selection.start : cur.length
	        const rawEnd = Number.isFinite(selection.end) ? selection.end : rawStart
	        const selectionStart = Math.max(0, Math.min(rawStart, cur.length))
	        const selectionEnd = Math.max(selectionStart, Math.min(rawEnd, cur.length))
	        const insertAt = selectionEnd
	        const insertion = insertAt === cur.length && cur.trim()
	          ? `\n\n${text}`
	          : text
	        const next = cur.slice(0, insertAt) + insertion + cur.slice(insertAt)
	        const insertedStart = insertAt + insertion.length - text.length
	        const insertedEnd = insertedStart + text.length
	        localContentRef.current = next
	        persistSceneDraftToLocalStorage(scene, next)
	        onLiveContentChange(scene.id, next)
	        if (scene.notes?.length) {
	          onUpdateScene(scene.id, {
	            notes: scene.notes.map(note => {
	              const anchor = note.anchorOffset ?? cur.length
	              return anchor >= insertAt
	                ? { ...note, anchorOffset: anchor + insertion.length, anchorEndOffset: (note.anchorEndOffset ?? anchor) + insertion.length }
	                : note
	            }),
	          })
	        }
	        setFocused(true)
	        setLocalContent(next)
	        debouncedUpdate.schedule(next)
	        focusRange(insertedStart, insertedEnd)
	      },
	      replaceSelection: (text) => {
	        recordBeforeEdit(true)
	        const cur = localContentRef.current ?? ''
	        const selection = lastSelectionRef.current || { start: cur.length, end: cur.length }
	        const rawStart = Number.isFinite(selection.start) ? selection.start : cur.length
	        const rawEnd = Number.isFinite(selection.end) ? selection.end : rawStart
	        const selectionStart = Math.max(0, Math.min(rawStart, cur.length))
	        const selectionEnd = Math.max(selectionStart, Math.min(rawEnd, cur.length))
	        const next = cur.slice(0, selectionStart) + text + cur.slice(selectionEnd)
	        const delta = text.length - (selectionEnd - selectionStart)
	        localContentRef.current = next
	        onPersistDraft(scene, next)
	        onLiveContentChange(scene.id, next)
	        if (scene.notes?.length) {
	          onUpdateScene(scene.id, {
	            notes: scene.notes.map(note => shiftNoteForEdit(note, selectionStart, selectionEnd, delta, cur.length)),
	          })
	        }
	        setFocused(true)
	        setLocalContent(next)
	        debouncedUpdate.schedule(next)
	        focusRange(selectionStart, selectionStart + text.length)
	      },
	    })
	    // Manuscript.jsx's scene-virtualization (useSceneWindow.js) mounts/unmounts
	    // this component per scene as it scrolls in and out of view, keeping a map of
	    // these ref objects for programmatic focus/scrollIntoView/appendContent
	    // (jumping from the Outline, splitting a scene, AI inserts). Without this
	    // cleanup, unmounting left a stale entry behind whose closures point at a
	    // detached textarea — harmless (a silent no-op if ever called) but worth
	    // clearing so a re-mount always gets a fresh object.
	    return () => innerRef?.(null)
	  }, [innerRef, scene, debouncedUpdate, focusRange, onLiveContentChange, onUpdateScene, onPersistDraft, syncFloatingNoteButton, recordBeforeEdit])

  useEffect(() => {
    localContentRef.current = localContent
  }, [localContent])

  useEffect(() => {
    if (!focused) return undefined
    const flushDraft = () => {
      onPersistDraft(sceneRef.current, localContentRef.current, { immediate: true })
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
    // Deliberately NOT depending on `scene` — see sceneRef above. This effect should
    // only re-subscribe when focus starts/ends, not on every keystroke.
  }, [focused, debouncedUpdate, onPersistDraft])

	  const handleChange = e => {
	    recordBeforeEdit()
	    const base = Number(e.target.dataset.msStart) || 0
	    const previousEnd = Number(e.target.dataset.msEnd)
	    const oldEnd = Number.isFinite(previousEnd) ? previousEnd : localContent.length
	    const nextValue = e.target.value
	    const nextContent = base === 0 && oldEnd === localContent.length
	      ? nextValue
	      : localContent.slice(0, base) + nextValue + localContent.slice(oldEnd)
	    const delta = nextValue.length - (oldEnd - base)
	    lastSelectionRef.current = {
	      start: base + e.target.selectionStart,
	      end: base + e.target.selectionEnd,
	    }
	    localContentRef.current = nextContent
	    onPersistDraft(scene, nextContent)
	    onLiveContentChange(scene.id, nextContent)
	    setLocalContent(nextContent)
	    debouncedUpdate.schedule(nextContent)
	    debouncedSyncFloatingNoteButton.schedule()
	    if (!isScript && delta !== 0 && scene.notes?.length) {
	      onUpdateScene(scene.id, {
	        notes: scene.notes.map(note => {
	          const anchor = note.anchorOffset ?? localContent.length
	          const shouldShift = anchor >= oldEnd && !(oldEnd === base && anchor === base)
	          return shouldShift ? shiftNoteForEdit(note, base, oldEnd, delta, localContent.length) : note
	        }),
	      })
	    }
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
	    rememberSelection()
	    debouncedSyncFloatingNoteButton.schedule()
	    scheduleVisualCaret()
	    if (!isScript || !textareaRef.current) return
	    const nextIndex = getScriptBlockIndexAtOffset(localContentRef.current, textareaRef.current.selectionStart)
	    setActiveScriptBlockIndex(Math.min(nextIndex, Math.max(0, localScriptBlocks.length - 1)))
	  }, [isScript, localScriptBlocks.length, rememberSelection, debouncedSyncFloatingNoteButton, scheduleVisualCaret])

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
    window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 0)
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
    recordBeforeEdit(true)
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
    onLiveContentChange(scene.id, nextContent)
    setLocalContent(nextContent)
    setLocalScriptBlocks(nextBlocks)
    setActiveScriptBlockIndex(Math.min(newIndex, Math.max(0, nextBlocks.length - 1)))
    debouncedUpdate.schedule(nextContent)
    onUpdateScene(scene.id, {
      scriptElement: nextType,
      scriptBlocks: nextBlocks,
      textMode: 'script',
    })
	    focusRange(start + insertion.length)
	  }, [debouncedUpdate, focusRange, localContent, localScriptBlocks, onLiveContentChange, onPersistDraft, onUpdateScene, recordBeforeEdit, scene, scriptElement])

  const wrapSelection = useCallback((syntax) => {
    const ta = textareaRef.current
    if (!ta) return
    recordBeforeEdit(true)
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = localContent.slice(start, end)
    const wrapped = selected ? `${syntax}${selected}${syntax}` : `${syntax}${syntax}`
    const newContent = localContent.slice(0, start) + wrapped + localContent.slice(end)
    localContentRef.current = newContent
    onPersistDraft(scene, newContent)
    onLiveContentChange(scene.id, newContent)
    setLocalContent(newContent)
    debouncedUpdate.schedule(newContent)
	    setTimeout(() => {
	      if (!ta) return
	      if (selected) { ta.selectionStart = start + syntax.length; ta.selectionEnd = start + syntax.length + selected.length }
	      else { ta.selectionStart = ta.selectionEnd = start + syntax.length }
	      ta.focus({ preventScroll: true })
	      rememberSelection()
	      syncFloatingNoteButton()
	    }, 0)
	  }, [localContent, debouncedUpdate, onLiveContentChange, onPersistDraft, recordBeforeEdit, rememberSelection, scene, syncFloatingNoteButton])

	  const handleKeyDown = e => {
	    const base = Number(e.target.dataset.msStart) || 0
	    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
	      e.preventDefault()
	      if (e.shiftKey) handleRedo(); else handleUndo()
	      return
	    }
	    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); return }
	    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**'); return }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); wrapSelection('*'); return }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); wrapSelection('_'); return }
    // ⌘'/Ctrl+' — spec §5.5's keyboard shortcut for the selection bar's Note
    // action; handleAddNote already anchors at the current selection/caret via
    // lastSelectionRef, so this is the same code path the Note button uses.
    if ((e.ctrlKey || e.metaKey) && e.key === "'") { e.preventDefault(); handleAddNote(); return }

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
	      const pos = base + e.target.selectionStart
	      const before = localContent.slice(0, pos).replace('/scene', '').trim()
      const after = localContent.slice(pos).replace('/scene', '').trim()
      localContentRef.current = before
      onPersistDraft(scene, before)
      onLiveContentChange(scene.id, before)
      setLocalContent(before)
      onSplit(scene.id, scene.chapterId, before, after)
      return
    }

    if (isScript && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      insertScriptParagraph(getNextScriptElementAfterEnter(scriptElement))
      return
    }

    if (e.key === 'Enter' && !isScript && !isBullets && !e.shiftKey) {
      e.preventDefault()
      recordBeforeEdit(true)
      const start = base + e.target.selectionStart
      const end = base + e.target.selectionEnd
      // A paragraph break is semantic data, not a run of presentation spaces.
      // The editor/final reader/exporters render first-line indentation; keeping
      // the stored prose as `\n\n` also preserves copy/paste and DOCX paragraphs.
      const insertion = '\n\n'
	      const nextContent = localContent.slice(0, start) + insertion + localContent.slice(end)
      localContentRef.current = nextContent
      onPersistDraft(scene, nextContent)
      onLiveContentChange(scene.id, nextContent)
      setLocalContent(nextContent)
      debouncedUpdate.schedule(nextContent)
	      if (scene.notes?.length) {
	        onUpdateScene(scene.id, {
	          notes: scene.notes.map(note => {
	            const anchor = note.anchorOffset ?? localContent.length
	            const shouldShift = anchor >= end && !(end === base && anchor === base)
	            return shouldShift ? shiftNoteForEdit(note, start, end, insertion.length - (end - start), localContent.length) : note
	          }),
	        })
	      }
	      focusRange(start + insertion.length)
	    }
	  }

	  // All three read/write scene.notes through sceneRef (see sceneRef above,
	  // already the established fix for this exact class of bug elsewhere in
	  // this file — onPersistDraft(sceneRef.current, …) below is the same
	  // pattern). Closing over the `scene` prop directly here was a real,
	  // pre-existing bug: two note edits fired close enough together that
	  // React hadn't re-rendered SceneEditor with the first one's updated
	  // `scene` prop yet would have the second edit recompute its new notes
	  // array from the *stale* pre-first-edit notes, silently reverting it —
	  // reachable just by typing normally into a note, not only under
	  // synthetic/rapid input.
	  const handleAddNote = useCallback(() => {
	    const currentNotes = sceneRef.current.notes || []
	    const nextSeq = currentNotes.length + 1
	    const selection = lastSelectionRef.current || { start: localContent.length, end: localContent.length }
	    const start = Math.max(0, Math.min(selection.start, localContent.length))
	    const end = Math.max(start, Math.min(selection.end ?? start, localContent.length))
	    const nextNote = {
	      id: uid(),
	      seq: nextSeq,
	      title: '',
	      text: '',
	      anchorOffset: start,
	      anchorEndOffset: end,
	      selectedText: end > start ? localContent.slice(start, end) : '',
	    }
	    setFocused(true)
	    onUpdateScene(sceneRef.current.id, {
	      notes: [...currentNotes, nextNote],
	    })
	    focusRange(start)
	    // Write mode shows the new note inline (opens itself since it starts
	    // empty — see InlineNoteBlock's own `open` state) right in the flow,
	    // so the cursor can stay put. Edit mode no longer renders that inline
	    // box at all (gutter icon only, see ContentPreview below) — open the
	    // inspector's Notes tab so there's somewhere to actually type the text.
	    if (mode !== 'write') onOpenNotes()
	  }, [localContent, focusRange, onUpdateScene, mode, onOpenNotes])

	  // Pass an updater (prevNotes => nextNotes) rather than a precomputed array, and
	  // `data` is a partial note patch — {text: '...'} or {title: '...'} — so
	  // one handler covers both the body textarea and the title input below,
	  // each with its own local buffer/debounce (same reasoning as the text
	  // buffering fix above: title edits go through the same store round-trip
	  // and shouldn't fully controlled-input themselves into the same lag). The
	  // updater composes rapid edits against the latest notes array instead of
	  // overwriting sibling edits from a stale render.
	  const handleUpdateNote = useCallback((noteId, data) => {
	    onUpdateScene(sceneRef.current.id, {
	      notes: prevNotes => (prevNotes || []).map(note => note.id === noteId ? { ...note, ...data } : note),
	    })
	  }, [onUpdateScene])

	  const handleDeleteNote = useCallback((noteId) => {
	    const removed = (sceneRef.current.notes || []).find(note => note.id === noteId)
	    if (removed) {
	      const marker = `[[${removed.seq}]]`
	      const markerIndex = localContentRef.current.indexOf(marker)
	      if (markerIndex >= 0) {
	        recordBeforeEdit(true)
	        const nextContent = localContentRef.current.slice(0, markerIndex) + localContentRef.current.slice(markerIndex + marker.length)
	        localContentRef.current = nextContent
	        onPersistDraft(sceneRef.current, nextContent)
	        onLiveContentChange(sceneRef.current.id, nextContent)
	        setLocalContent(nextContent)
	        debouncedUpdate.schedule(nextContent)
	        focusRange(markerIndex)
	      }
	    }
	    onUpdateScene(sceneRef.current.id, {
	      notes: (sceneRef.current.notes || []).filter(note => note.id !== noteId),
	    })
	  }, [debouncedUpdate, focusRange, onLiveContentChange, onPersistDraft, onUpdateScene, recordBeforeEdit])

	  // Clicking the preview should drop the caret exactly where the mouse landed, not at
	  // the end of the scene. The preview's rendered spans carry data-raw-start/end (see
	  // renderInlineMarkdown / ScriptPreview / the bullets and prose branches above), so we
	  // hit-test the click point against the DOM and translate that back to a raw offset.
	  const activateAt = e => {
	    const container = e.currentTarget
	    const range = caretRangeFromPoint(e.clientX, e.clientY)
	    const resolved = range ? resolveRawOffsetFromRange(range, container) : null
	    const target = resolved == null
	      ? localContentRef.current.length
	      : Math.max(0, Math.min(resolved, localContentRef.current.length))
	    setFocused(true)
	    focusRange(target, target)
	  }

  const displayTitle = scene.title && scene.title !== 'Scene'
    ? scene.title
    : `Scene ${sceneIndex + 1}`

  const autoIndentEnabled = !isScript && !isBullets && formatSettings.autoIndent
  const textStyle = {
    fontFamily: formatSettings.fontFamily,
    fontSize: formatSettings.fontSize,
    lineHeight: formatSettings.lineHeight,
    textAlign: formatSettings.textAlign,
    '--ms-paragraph-indent': `${formatSettings.indentSize}ch`,
    '--ms-paragraph-edit-gap': `${formatSettings.lineHeight}em`,
  }

	  // Replaces the `autoFocus` attribute the real textarea(s) used to have.
	  // `autoFocus` calls the browser's native, uncontrollable focus() under the
	  // hood — no `preventScroll` option — so every preview-to-editable
	  // transition (e.g. clicking into a scene) triggered the browser's own
	  // "scroll this into view" heuristic, independent of anything above and
	  // independent of Focused Writing mode: this is what a user-supplied
	  // screen recording showed as "the page jumps," reproduced in the regular
	  // (non-Focused-Writing) editor. `focusRange`'s own explicit, precisely
	  // targeted, `preventScroll`-safe focus call (used by click-to-position,
	  // undo/redo, notes, etc.) already covers placing the caret correctly a
	  // tick later — this effect only needs to grab initial focus, without the
	  // native scroll, for the cases that don't go through focusRange (mainly:
	  // Tab-focusing into a scene via the hidden placeholder textarea below).
	  useLayoutEffect(() => {
	    if (!focused) return
	    const wrapper = wrapperRef.current
	    if (!wrapper || wrapper.contains(document.activeElement)) return
	    wrapper.querySelector('textarea.ms-textarea')?.focus({ preventScroll: true })
	  }, [focused])

	  const handleEditorBlur = () => {
	    burstActiveRef.current = false
	    hideVisualCaret()
	    onPersistDraft(scene, localContentRef.current, { immediate: true })
	    debouncedUpdate.flush()
	    window.setTimeout(() => {
	      if (wrapperRef.current?.contains(document.activeElement)) return
	      if (keepEditingOnExternalBlur) return
	      setFocused(false)
	      setFloatingNotePos(null)
	    }, 0)
	  }

	  // `id="ms-scene-{id}"` used to live on this wrapper; it's now on the stable
	  // SceneSlot wrapper in Manuscript.jsx, since that wrapper survives this
	  // component mounting/unmounting under scene virtualization
	  // (useSceneWindow.js), and Manuscript.jsx's/StructureSidebar.jsx's
	  // scrollIntoView-by-id callers need a target that's always present.
	  return (
	    <div ref={wrapperRef} className={`relative group/scene${focused ? ' is-editing' : ''}`}>
	      {/* Scene header — one quiet line (number · title · status) above a
	          hairline; word count, POV, and the secondary format/history/undo
	          controls reveal on hover or focus rather than sitting in a second
	          row. POV/location/summary now live in the inspector's Scene tab
	          (see ManuscriptInspector.jsx) — Details opens it there; the status
	          chip stays here too since it's cheap to show at a glance. */}
	      <div className={`ms-scene-header ${focused || hasMetadata ? 'is-visible' : ''}${mode === 'write' ? ' ms-scene-header--write' : ''}`}>
        <div className="ms-scene-header-line">
          <span className="ms-scene-n">Scene {sceneIndex + 1}</span>

          {editingTitle ? (
            <InlineInput
              value={scene.title && scene.title !== 'Scene' ? scene.title : ''}
              placeholder={`Scene ${sceneIndex + 1}`}
              onSave={t => { onUpdateScene(scene.id, { title: t || 'Scene' }); setEditingTitle(false) }}
              className="text-[13px] font-semibold text-[var(--text-main)] w-40"
            />
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="ms-scene-title-btn"
              title="Click to rename scene"
            >
              {displayTitle}
            </button>
          )}

          <button
            type="button"
            className="ms-meta-chip ms-meta-status"
            onClick={() => onUpdateScene(scene.id, { status: nextStatus(scene.status || 'draft') })}
            title={`Status: ${statusCfg.label} (click to change)`}
            style={{ '--dot-color': statusCfg.color }}
          >
            <span className="ms-meta-dot" />
            {statusCfg.label}
          </button>

          <div className="flex-1 h-px bg-[var(--border)]" />

          {showSceneMeta && (
            <div className="ms-scene-header-hover">
              {wordCount > 0 && <span className="ms-meta-words">{wordCount.toLocaleString()} words</span>}
              {scene.pov && <span className="ms-chip" title={`POV: ${scene.pov}`}>{scene.pov}</span>}

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
                <button onMouseDown={e => e.preventDefault()} onClick={handleUndo} disabled={!undoCount} className="px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors disabled:opacity-30 disabled:pointer-events-none" title="Undo (Ctrl+Z)">↶</button>
                <button onMouseDown={e => e.preventDefault()} onClick={handleRedo} disabled={!redoCount} className="px-2 py-0.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors disabled:opacity-30 disabled:pointer-events-none" title="Redo (Ctrl+Shift+Z)">↷</button>
              </div>

              <div className="flex items-center gap-0.5 border border-[var(--border)] rounded overflow-hidden">
                <button onMouseDown={e => { e.preventDefault(); wrapSelection('**') }} className="px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors" title="Bold (Ctrl+B)">B</button>
                <button onMouseDown={e => { e.preventDefault(); wrapSelection('*') }} className="px-2 py-0.5 text-[11px] italic text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors" title="Italic (Ctrl+I)">I</button>
                <button onMouseDown={e => { e.preventDefault(); wrapSelection('_') }} className="px-2 py-0.5 text-[11px] underline text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-fade)] transition-colors" title="Underline (Ctrl+U)">U</button>
              </div>

              <button
                type="button"
                onClick={handleCopyWholeScene}
                className="ms-meta-chip"
                title="Copy this scene's full text to the clipboard — reliable even on very long scenes where native Select All can be slow or fail to grab everything"
              >{sceneCopied ? 'Copied!' : 'Copy scene'}</button>

              {onOpenVersionHistory && (
                <button
                  onClick={() => onOpenVersionHistory(scene.id)}
                  className="ms-meta-chip"
                  title="View and restore previous versions of this scene"
                >History</button>
              )}

              {onOpenSceneDetails && (
                <button
                  onClick={() => onOpenSceneDetails(scene.id)}
                  className="ms-meta-chip"
                  title="Open this scene's details (status, POV, location, summary) in the inspector"
                >Details</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Prose column (620px) + note gutter (188px) — spec §4/§5.3, refined
          per a later note: Edit and Write never show a note the same way at
          once. Edit shows a floating icon per note in the gutter, always
          visible, in document order rather than pixel-aligned to its exact
          line (measuring each note mark's offsetTop against the prose
          column would mean a layout read in the scene render path, exactly
          what useSceneWindow's virtualization exists to avoid across dozens
          of mounted scenes). Write shows the note only as the inline box,
          anchored right in the text, and never renders the gutter at all.
          Container-query drop-out (per the handoff spec, not a viewport
          media query) lands in step 7 once the scroll container gets
          `container-type: inline-size`; a plain breakpoint covers it in
          the meantime. */}
      <div className={`ms-scene-body${!isScript && sortedNotes.length > 0 && mode !== 'write' ? ' has-gutter' : ''}${mode === 'write' ? ' ms-scene-body--write' : ''}`}>
        <div className="ms-scene-prose-col">
	      {focused ? (
	        !isScript && sortedNotes.length > 0 && mode === 'write' ? (
	          <div className="ms-block-editor">
	            {writingBlocks.map(block => {
	              if (block.type === 'note') {
	                return (
	                  <InlineNoteBlock
	                    key={block.key}
	                    note={block.note}
	                    highlighted={highlightedNoteSeq === block.note.seq}
	                    onUpdate={handleUpdateNote}
	                    onDelete={handleDeleteNote}
	                onOpen={seq => { onNoteClick(seq); setOpenNoteId(block.note.id) }}
	                  />
	                )
	              }
	                return (
	                  <div key={block.key} className="ms-rich-edit">
	                    <div className="ms-rich-preview ms-preview" aria-hidden="true" style={textStyle}>
	                      <ContentPreview
	                        content={localContent.slice(block.start, block.end)}
	                        entityMap={entityMap}
	                        notesBySeq={new Map()}
	                        highlightedNoteSeq={highlightedNoteSeq}
	                        onEntityClick={onEntityClick}
	                        onNoteClick={() => {}}
	                        onUpdateNote={handleUpdateNote}
	                        onDeleteNote={handleDeleteNote}
	                        onOpenNotes={onOpenNotes}
	                        isBullets={false}
	                        isScript={false}
	                        projectType={projectType}
	                        mode={mode}
	                        indentParagraphs={autoIndentEnabled}
	                        baseOffset={block.start}
	                      />
	                    </div>
	                    <span className="ms-editor-caret" aria-hidden="true" />
	                    <textarea
	                      ref={node => {
	                        if (node && (!textareaRef.current || document.activeElement === node)) textareaRef.current = node
	                      }}
	                      value={localContent.slice(block.start, block.end)}
	                      data-ms-start={block.start}
	                      data-ms-end={block.end}
	                      onFocus={e => { textareaRef.current = e.currentTarget; setFocused(true); onFocusExternal(); window.requestAnimationFrame(syncCursorTools) }}
	                      onBlur={handleEditorBlur}
	                      onChange={handleChange}
	                      onKeyDown={e => { handleKeyDown(e); window.setTimeout(syncActiveScriptBlock, 0) }}
	                      onClick={syncActiveScriptBlock}
	                      onKeyUp={syncActiveScriptBlock}
	                      onSelect={syncActiveScriptBlock}
	                      placeholder={isBullets ? 'One item per line...' : 'Begin writing here...'}
	                      spellCheck
	                      rows={1}
	                      className={`ms-textarea ms-textarea-block ms-textarea--rich${autoIndentEnabled ? ' ms-prose-auto-indent' : ''}`}
	                      style={textStyle}
	                    />
	                  </div>
	              )
	            })}
	          </div>
	        ) : (
	          <div className="ms-rich-edit">
	            <div className={`ms-rich-preview ms-preview${isScript ? ' ms-script-mode' : ''}`} aria-hidden="true" style={isScript ? { ...textStyle, fontFamily: 'Courier New, Courier, monospace' } : textStyle}>
	              <ContentPreview
	                content={localContent}
	                entityMap={entityMap}
	                notesBySeq={notesBySeq}
	                highlightedNoteSeq={highlightedNoteSeq}
	                onEntityClick={onEntityClick}
	                onNoteClick={() => {}}
	                onUpdateNote={handleUpdateNote}
	                onDeleteNote={handleDeleteNote}
	                onOpenNotes={onOpenNotes}
	                isBullets={isBullets}
	                isScript={isScript}
	                scriptBlocks={localScriptBlocks.length ? localScriptBlocks : scene.scriptBlocks}
	                scriptElement={scriptElement}
	                projectType={projectType}
	                mode={mode}
	                indentParagraphs={autoIndentEnabled}
	              />
	            </div>
	            <span className="ms-editor-caret" aria-hidden="true" />
	            <textarea
	              ref={textareaRef}
	              value={localContent}
	              data-ms-start={0}
	              data-ms-end={localContent.length}
	              onFocus={e => { textareaRef.current = e.currentTarget; setFocused(true); onFocusExternal(); window.requestAnimationFrame(syncCursorTools) }}
	              onBlur={handleEditorBlur}
	              onChange={handleChange}
	              onKeyDown={e => { handleKeyDown(e); window.setTimeout(syncActiveScriptBlock, 0) }}
	              onClick={syncActiveScriptBlock}
	              onKeyUp={syncActiveScriptBlock}
	              onSelect={syncActiveScriptBlock}
	              placeholder={isBullets ? 'One item per line…' : 'Begin writing here…'}
	              spellCheck
	              rows={1}
	              className={`ms-textarea ms-textarea--rich${autoIndentEnabled ? ' ms-prose-auto-indent' : ''}`}
	              style={isScript ? { ...textStyle, fontFamily: 'Courier New, Courier, monospace' } : textStyle}
	            />
	          </div>
	        )
	      ) : (
        <div className={`ms-preview${isScript ? ' ms-script-mode' : ''}`} style={isScript ? { ...textStyle, fontFamily: 'Courier New, Courier, monospace' } : textStyle} onClick={activateAt}>
	          <ContentPreview
	            content={localContent}
	            entityMap={entityMap}
	            notesBySeq={notesBySeq}
	            highlightedNoteSeq={highlightedNoteSeq}
	            onEntityClick={onEntityClick}
	            onNoteClick={seq => { onNoteClick(seq); setOpenNoteId(notesBySeq.get(seq)?.id || null) }}
	            onUpdateNote={handleUpdateNote}
	            onDeleteNote={handleDeleteNote}
	            onOpenNotes={onOpenNotes}
	            isBullets={isBullets}
            isScript={isScript}
            scriptBlocks={localScriptBlocks.length ? localScriptBlocks : scene.scriptBlocks}
            scriptElement={scriptElement}
            projectType={projectType}
            mode={mode}
            indentParagraphs={autoIndentEnabled}
          />
	        </div>
	      )}
        </div>

        {!isScript && sortedNotes.length > 0 && mode !== 'write' && (
          <div className="ms-scene-gutter">
            {sortedNotes.map(note => (
              <GutterNoteCard
                key={note.id}
                note={note}
                highlighted={highlightedNoteSeq === note.seq}
                onUpdateNote={handleUpdateNote}
                onOpen={() => { onNoteClick(note.seq); setOpenNoteId(note.id) }}
              />
            ))}
          </div>
        )}
      </div>

	      {/* Selecting prose expands the same floating anchor (already positioned
	          off `measureCaret`, already debounced — see syncFloatingNoteButton
	          above) into a small bar instead of just the "+" button: Note anchors
	          at the selection per spec §5.3, Ask AI opens the AI surface with the
	          selection already tracked via onSelectionContextChange, B/I reuse
	          the exact same wrapSelection the header's B/I buttons call. */}
	      {focused && floatingNotePos && (
	        floatingNotePos.hasSelection ? (
	          <div
	            className="ms-selbar font-sans"
	            style={{ top: floatingNotePos.top, [floatingNotePos.side]: -36 }}
	          >
	            {/* Note stays available in every mode -- Write just shows it
	                inline instead of via the gutter (see handleAddNote/
	                ContentPreview above). Ask AI is still an editing-tool-only
	                affordance per spec §5.4/§8: Write's selection bar otherwise
	                offers formatting only. */}
	            <button type="button" onMouseDown={e => e.preventDefault()} onClick={handleAddNote} title="Note (⌘')">Note</button>
	            {mode !== 'write' && onAskAI && (
	              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => onAskAI(scene.id)} title="Ask AI about this selection">Ask AI</button>
	            )}
	            <span className="ms-selbar-sep" />
	            <button type="button" onMouseDown={e => { e.preventDefault(); wrapSelection('**') }} title="Bold (Ctrl+B)"><b>B</b></button>
	            <button type="button" onMouseDown={e => { e.preventDefault(); wrapSelection('*') }} title="Italic (Ctrl+I)"><em>I</em></button>
	          </div>
	        ) : (
	          <button
	            type="button"
	            className="ms-floating-note-btn font-sans"
	            style={{
	              top: floatingNotePos.top,
	              [floatingNotePos.side]: -36,
	            }}
	            onMouseDown={e => e.preventDefault()}
	            onClick={handleAddNote}
	            title="Add note at cursor"
	            aria-label="Add note at cursor"
	          >
	            +
	          </button>
	        )
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

      {showEditingElsewhereWarning && (
        <EditingElsewhereWarning
          label="scene"
          onClose={() => {
            setShowEditingElsewhereWarning(false)
            textareaRef.current?.blur()
            setFocused(false)
          }}
          onEditAnyway={() => {
            setShowEditingElsewhereWarning(false)
            // The dialog auto-focuses itself on mount (StudioSheet), which blurs the
            // textarea and drops `focused` to false — the editable textarea then
            // unmounts entirely (see the focused ? <textarea> : <preview> branch
            // below), so textareaRef can be stale/detached here. Re-render focused
            // first, then look the fresh node up by class once it's back in the DOM,
            // so "Edit anyway" actually leaves the user able to keep typing.
            setFocused(true)
            window.setTimeout(() => {
              const ta = wrapperRef.current?.querySelector('textarea.ms-textarea')
              if (ta) { textareaRef.current = ta; ta.focus({ preventScroll: true }) }
            }, 0)
          }}
        />
      )}
      {openNote && (
        <NoteModal
          note={openNote}
          onUpdate={handleUpdateNote}
          onDelete={handleDeleteNote}
          onClose={() => setOpenNoteId(null)}
        />
      )}
    </div>
  )
}

export const SceneEditor = memo(SceneEditorImpl, sceneEditorPropsEqual)

// ─── Format settings panel ────────────────────────────────────────────────────
