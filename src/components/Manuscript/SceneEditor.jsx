import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import {
  SCRIPT_TYPES, SCENE_STATUSES, nextStatus,
  buildScriptBlocks, getScriptElements, getScriptElementLabel, getNextScriptElementAfterEnter,
  getScriptBlockIndexAtOffset, syncScriptBlocks,
  useDebouncedCallback, persistSceneDraftToLocalStorage, uid,
} from './manuscriptUtils.js'
import { useCaretComfortScroll } from './useCaretComfortScroll.js'

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

export const SceneEditor = ({
  scene, sceneIndex,
  onUpdate, onUpdateScene, onSplit,
  innerRef, onFocus: onFocusExternal,
  entityMap, onEntityClick,
  onOpenNotes, onNoteClick,
  formatSettings, characterNames, locationNames,
  onPersistDraft,
  onOpenVersionHistory,
  projectType,
  focusedWriting = false,
  scrollContainerRef,
  pageZoom = 1,
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

  // Resize before paint so caret measurement always uses the settled textarea height.
  useLayoutEffect(() => {
    if (!focused || !textareaRef.current) return
    const ta = textareaRef.current
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }, [localContent, focused, formatSettings.fontFamily, formatSettings.fontSize, formatSettings.lineHeight, pageZoom])

  const scheduleCaretFollow = useCaretComfortScroll({
    textareaRef,
    scrollContainerRef,
    enabled: focusedWriting && focused,
    scale: pageZoom,
  })

  useLayoutEffect(() => {
    if (focusedWriting && focused) scheduleCaretFollow()
  }, [focusedWriting, focused, localContent, formatSettings, pageZoom, scheduleCaretFollow])

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
    <div ref={wrapperRef} className={`relative group/scene${focused ? ' is-editing' : ''}`} id={`ms-scene-${scene.id}`}>
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
