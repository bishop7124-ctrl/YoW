import { useState, useRef, useEffect, useCallback } from 'react'

const NOTE_COLORS = ['#fef08a', '#fdba74', '#86efac', '#7dd3fc', '#d8b4fe', '#fda4af', '#a5f3fc', '#fbbf24']
const GROUP_COLORS = ['#7c6af7', '#f7a26a', '#4ecdc4', '#a3d977', '#e882c0', '#82c0e8']
const NOTE_W = 240
const NOTE_H = 200
const NOTE_BASE_FONT = 15
const GROUP_HDR = 36
const GROUP_MIN_W = 220
const GROUP_MIN_H = 160
const GROUP_Z_BASE = 10
const NOTE_Z_BASE = 1000
const ACTIVE_Z = 9999

function uid() { return Math.random().toString(36).slice(2, 10) }

function isNoteInGroup(notePos, noteSize, groupPos, group) {
  const cx = notePos.x + noteSize.w / 2
  const cy = notePos.y + noteSize.h / 2
  return cx >= groupPos.x && cx <= groupPos.x + group.w &&
         cy >= groupPos.y + GROUP_HDR && cy <= groupPos.y + group.h
}

export default function IdeasBoard({ store }) {
  const { activeNovel: project, whiteboard, updateWhiteboard: saveWhiteboard } = store

  const [board, setBoard] = useState({
    notes: whiteboard?.notes || [],
    groups: whiteboard?.groups || [],
  })
  const notes = [...(board.notes || [])].sort((a, b) => (a.z || 0) - (b.z || 0))
  const groups = [...(board.groups || [])].sort((a, b) => (a.z || 0) - (b.z || 0))

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [livePos, setLivePos] = useState({ notes: {}, groups: {}, groupSizes: {}, noteSizes: {} })
  const [editingNote, setEditingNote] = useState(null)
  const [editingGroup, setEditingGroup] = useState(null)
  const [cursor, setCursor] = useState('default')

  const dragRef = useRef(null)
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  // Sync from store only when switching projects
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoard({
      notes: whiteboard?.notes || [],
      groups: whiteboard?.groups || [],
    })
  }, [project?.id, whiteboard?.groups, whiteboard?.notes])

  function getNotePos(n) { return livePos.notes[n.id] ?? { x: n.x, y: n.y } }
  function getNoteSize(n) { return livePos.noteSizes[n.id] ?? { w: n.w || NOTE_W, h: n.h || NOTE_H } }
  function getGroupPos(g) { return livePos.groups[g.id] ?? { x: g.x, y: g.y } }
  function getGroupSize(g) { return livePos.groupSizes[g.id] ?? { w: g.w, h: g.h } }

  function updateWhiteboard(updater) {
    const safeUpdater = (current) => {
      const safeCurrent = {
        ...(current || {}),
        notes: current?.notes || [],
        groups: current?.groups || [],
      }
      const next = updater(safeCurrent)
      return {
        ...next,
        notes: next?.notes || [],
        groups: next?.groups || [],
      }
    }
    setBoard(safeUpdater)
    try {
      saveWhiteboard?.(safeUpdater)
    } catch (err) {
      console.error('Failed to save whiteboard:', err)
    }
  }

  function addNote() {
    const rect = containerRef.current?.getBoundingClientRect?.() || { width: 900, height: 600 }
    const bx = (rect.width / 2 - pan.x) / zoom
    const by = (rect.height / 2 - pan.y) / zoom
    const color = NOTE_COLORS[notes.length % NOTE_COLORS.length]
    const note = { id: uid(), text: '', x: bx - NOTE_W / 2, y: by - NOTE_H / 2, w: NOTE_W, h: NOTE_H, color, groupId: null, z: Date.now(), fontSize: NOTE_BASE_FONT }
    updateWhiteboard(current => ({
      ...current,
      notes: [...(current.notes || []), note],
      groups: current.groups || [],
    }))
    setEditingNote(note.id)
  }

  function addGroup() {
    const rect = containerRef.current?.getBoundingClientRect?.() || { width: 900, height: 600 }
    const bx = (rect.width / 2 - pan.x) / zoom
    const by = (rect.height / 2 - pan.y) / zoom
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length]
    const group = { id: uid(), label: 'Category', x: bx - 200, y: by - 150, w: 400, h: 300, color, z: Date.now() }
    updateWhiteboard(current => ({
      ...current,
      notes: current.notes || [],
      groups: [...(current.groups || []), group],
    }))
    setTimeout(() => setEditingGroup(group.id), 50)
  }

  function deleteNote(id) {
    if (editingNote === id) setEditingNote(null)
    updateWhiteboard(current => ({
      ...current,
      notes: (current.notes || []).filter(n => n.id !== id),
      groups: current.groups || [],
    }))
  }

  function deleteGroup(id) {
    if (editingGroup === id) setEditingGroup(null)
    updateWhiteboard(current => ({
      ...current,
      groups: (current.groups || []).filter(g => g.id !== id),
      notes: (current.notes || []).map(n => n.groupId === id ? { ...n, groupId: null } : n),
    }))
  }

  function commitNoteText(id, text) {
    updateWhiteboard(current => ({
      ...current,
      notes: (current.notes || []).map(n => n.id === id ? { ...n, text } : n),
      groups: current.groups || [],
    }))
  }

  function commitGroupLabel(id, label) {
    updateWhiteboard(current => ({
      ...current,
      notes: current.notes || [],
      groups: (current.groups || []).map(g => g.id === id ? { ...g, label } : g),
    }))
  }

  function changeNoteFontSize(id, delta) {
    updateWhiteboard(current => ({
      ...current,
      notes: (current.notes || []).map(n =>
        n.id === id ? { ...n, fontSize: Math.max(10, Math.min(36, (n.fontSize || NOTE_BASE_FONT) + delta)) } : n
      ),
      groups: current.groups || [],
    }))
  }

  // --- Drag handlers ---

  function startNoteDrag(e, note) {
    if (editingNote === note.id) return
    e.stopPropagation()
    e.preventDefault()
    setEditingNote(null)
    updateWhiteboard(current => ({
      ...current,
      notes: (current.notes || []).map(n => n.id === note.id ? { ...n, z: Date.now() } : n),
      groups: current.groups || [],
    }))
    const pos = getNotePos(note)
    dragRef.current = { type: 'note', id: note.id, startMX: e.clientX, startMY: e.clientY, origX: pos.x, origY: pos.y, moved: false }
    setCursor('grabbing')
  }

  function startGroupDrag(e, group) {
    e.stopPropagation()
    e.preventDefault()
    setEditingGroup(null)
    updateWhiteboard(current => ({
      ...current,
      notes: current.notes || [],
      groups: (current.groups || []).map(g => g.id === group.id ? { ...g, z: Date.now() } : g),
    }))
    const pos = getGroupPos(group)
    const groupNoteSnap = notes.filter(n => n.groupId === group.id).map(n => {
      const np = getNotePos(n)
      return { id: n.id, x: np.x, y: np.y }
    })
    dragRef.current = { type: 'group', id: group.id, startMX: e.clientX, startMY: e.clientY, origX: pos.x, origY: pos.y, groupNotes: groupNoteSnap, moved: false }
    setCursor('grabbing')
  }

  function startGroupResize(e, group) {
    e.stopPropagation()
    e.preventDefault()
    setEditingGroup(null)
    const size = getGroupSize(group)
    dragRef.current = {
      type: 'group-resize',
      id: group.id,
      startMX: e.clientX,
      startMY: e.clientY,
      origW: size.w,
      origH: size.h,
      finalW: size.w,
      finalH: size.h,
      moved: false,
    }
    setCursor('nwse-resize')
  }

  function startNoteResize(e, note) {
    e.stopPropagation()
    e.preventDefault()
    const size = getNoteSize(note)
    dragRef.current = {
      type: 'note-resize',
      id: note.id,
      startMX: e.clientX,
      startMY: e.clientY,
      origW: size.w,
      origH: size.h,
      finalW: size.w,
      finalH: size.h,
      moved: false,
    }
    setCursor('nwse-resize')
  }

  function startPan(e) {
    if (editingNote || editingGroup) return
    const t = e.target
    if (t !== containerRef.current && t !== canvasRef.current) return
    dragRef.current = { type: 'pan', startMX: e.clientX, startMY: e.clientY, origPanX: pan.x, origPanY: pan.y }
    setCursor('grabbing')
  }

  function handleMouseMove(e) {
    const drag = dragRef.current
    if (!drag) return

    const dx = e.clientX - drag.startMX
    const dy = e.clientY - drag.startMY

    if (drag.type === 'pan') {
      setPan({ x: drag.origPanX + dx, y: drag.origPanY + dy })
      return
    }

    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
    drag.moved = true

    const bdx = dx / zoom
    const bdy = dy / zoom

    if (drag.type === 'note') {
      const finalPos = { x: drag.origX + bdx, y: drag.origY + bdy }
      drag.finalX = finalPos.x
      drag.finalY = finalPos.y
      setLivePos(prev => ({
        ...prev,
        notes: { ...prev.notes, [drag.id]: finalPos }
      }))
    } else if (drag.type === 'group') {
      const movedNotes = {}
      drag.groupNotes.forEach(n => { movedNotes[n.id] = { x: n.x + bdx, y: n.y + bdy } })
      drag.finalX = drag.origX + bdx
      drag.finalY = drag.origY + bdy
      drag.finalNotePositions = movedNotes
      setLivePos(prev => ({
        ...prev,
        notes: { ...prev.notes, ...movedNotes },
        groups: { ...prev.groups, [drag.id]: { x: drag.origX + bdx, y: drag.origY + bdy } }
      }))
    } else if (drag.type === 'group-resize') {
      const finalSize = {
        w: Math.max(GROUP_MIN_W, drag.origW + bdx),
        h: Math.max(GROUP_MIN_H, drag.origH + bdy),
      }
      drag.finalW = finalSize.w
      drag.finalH = finalSize.h
      setLivePos(prev => ({
        ...prev,
        groupSizes: { ...prev.groupSizes, [drag.id]: finalSize }
      }))
    } else if (drag.type === 'note-resize') {
      const finalSize = {
        w: Math.max(120, drag.origW + bdx),
        h: Math.max(80, drag.origH + bdy),
      }
      drag.finalW = finalSize.w
      drag.finalH = finalSize.h
      setLivePos(prev => ({
        ...prev,
        noteSizes: { ...prev.noteSizes, [drag.id]: finalSize }
      }))
    }
  }

  function handleMouseUp() {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setCursor('default')

    if (drag.type === 'pan') { setLivePos({ notes: {}, groups: {}, groupSizes: {}, noteSizes: {} }); return }

    if (drag.type === 'note' && drag.moved) {
      const finalPos = { x: drag.finalX ?? drag.origX, y: drag.finalY ?? drag.origY }
      let assignedGroupId = null
      groups.forEach(g => {
        const gp = getGroupPos(g)
        const gs = getGroupSize(g)
        const note = notes.find(n => n.id === drag.id)
        const ns = note ? getNoteSize(note) : { w: NOTE_W, h: NOTE_H }
        if (isNoteInGroup(finalPos, ns, gp, { ...g, ...gs })) assignedGroupId = g.id
      })
      updateWhiteboard(current => ({
        ...current,
        notes: (current.notes || []).map(n =>
          n.id === drag.id ? { ...n, x: finalPos.x, y: finalPos.y, groupId: assignedGroupId } : n
        ),
        groups: current.groups || [],
      }))
    } else if (drag.type === 'group' && drag.moved) {
      const finalGroupPos = { x: drag.finalX ?? drag.origX, y: drag.finalY ?? drag.origY }
      const finalNotePositions = drag.finalNotePositions || {}
      updateWhiteboard(current => ({
        ...current,
        groups: (current.groups || []).map(g =>
          g.id === drag.id ? { ...g, x: finalGroupPos.x, y: finalGroupPos.y } : g
        ),
        notes: (current.notes || []).map(n =>
          finalNotePositions[n.id] ? { ...n, ...finalNotePositions[n.id] } : n
        ),
      }))
    } else if (drag.type === 'group-resize' && drag.moved) {
      const finalSize = { w: drag.finalW ?? drag.origW, h: drag.finalH ?? drag.origH }
      updateWhiteboard(current => ({
        ...current,
        notes: current.notes || [],
        groups: (current.groups || []).map(g =>
          g.id === drag.id ? { ...g, ...finalSize } : g
        ),
      }))
    } else if (drag.type === 'note-resize' && drag.moved) {
      const finalSize = { w: drag.finalW ?? drag.origW, h: drag.finalH ?? drag.origH }
      updateWhiteboard(current => ({
        ...current,
        notes: (current.notes || []).map(n =>
          n.id === drag.id ? { ...n, ...finalSize } : n
        ),
        groups: current.groups || [],
      }))
    }

    setLivePos({ notes: {}, groups: {}, groupSizes: {}, noteSizes: {} })
  }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setZoom(prevZoom => {
      const factor = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.2, Math.min(3, prevZoom * factor))
      const boardX = (mx - pan.x) / prevZoom
      const boardY = (my - pan.y) / prevZoom
      setPan({ x: mx - boardX * newZoom, y: my - boardY * newZoom })
      return newZoom
    })
  }, [pan])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  if (!project) return null

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div className="studio-topbar" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ marginRight: 'auto' }}>
          <div className="eyebrow">Idea wall</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700 }}>Whiteboard</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addNote}>Note</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addGroup}>Group</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }} onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}>−</button>
          <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }} onClick={() => setZoom(z => Math.min(3, z + 0.1))}>+</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Reset view">↺</button>
        </div>
      </div>

      {/* Board */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(circle at 12px 12px, rgba(255,255,255,.06) 1px, transparent 1.5px), var(--bg-main)',
          backgroundSize: '22px 22px, auto',
          cursor,
        }}
        onMouseDown={startPan}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >

        {/* Canvas: single CSS transform for uniform zoom */}
        <div
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Dot grid — large fixed SVG in board space */}
          <svg
            style={{
              position: 'absolute',
              left: -5000,
              top: -5000,
              width: 10000,
              height: 10000,
              pointerEvents: 'none',
            }}
          >
            <defs>
              <pattern id="wb-grid" x="1" y="1" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.7" fill="var(--border)" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="10000" height="10000" fill="url(#wb-grid)" />
          </svg>

          {/* Groups (rendered behind notes) */}
          {groups.map(g => {
            const pos = getGroupPos(g)
            const size = getGroupSize(g)
            const isEditLbl = editingGroup === g.id

            return (
              <div
                key={g.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: size.w,
                  height: size.h,
                  border: `2px solid ${g.color}50`,
                  borderRadius: 8,
                  background: `${g.color}12`,
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  zIndex: isEditLbl ? ACTIVE_Z : GROUP_Z_BASE + ((g.z || 0) % 100000),
                }}
              >
                {/* Header (drag handle) */}
                <div
                  style={{
                    height: GROUP_HDR,
                    background: `${g.color}22`,
                    borderBottom: `1px solid ${g.color}30`,
                    borderRadius: '6px 6px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 8px',
                    cursor: 'move',
                    pointerEvents: 'all',
                  }}
                  onMouseDown={e => startGroupDrag(e, g)}
                  onDoubleClick={e => {
                    updateWhiteboard(current => ({
                      ...current,
                      notes: current.notes || [],
                      groups: (current.groups || []).map(item => item.id === g.id ? { ...item, z: Date.now() } : item),
                    }))
                    setEditingGroup(g.id)
                    e.stopPropagation()
                  }}
                >
                  {isEditLbl ? (
                    <input
                      autoFocus
                      defaultValue={g.label}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        color: g.color,
                        fontFamily: 'inherit',
                      }}
                      onBlur={e => { commitGroupLabel(g.id, e.target.value); setEditingGroup(null) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { commitGroupLabel(g.id, e.target.value); setEditingGroup(null) }
                        if (e.key === 'Escape') setEditingGroup(null)
                      }}
                      onMouseDown={e => e.stopPropagation()}
                    />
                  ) : (
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: g.color, userSelect: 'none' }}>
                      {g.label}
                    </span>
                  )}
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', padding: '2px 4px', lineHeight: 1, pointerEvents: 'all' }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { deleteGroup(g.id); e.stopPropagation() }}
                    title="Delete group"
                  >✕</button>
                </div>

                {/* Resize handle */}
                <button
                  type="button"
                  aria-label="Resize group"
                  title="Resize group"
                  style={{
                    position: 'absolute',
                    right: 7,
                    bottom: 7,
                    width: 18,
                    height: 18,
                    border: `1px solid ${g.color}80`,
                    borderRadius: 4,
                    background: `${g.color}40`,
                    cursor: 'nwse-resize',
                    pointerEvents: 'all',
                    padding: 0,
                  }}
                  onMouseDown={e => startGroupResize(e, g)}
                />
              </div>
            )
          })}

          {/* Notes */}
          {notes.map(n => {
            const pos = getNotePos(n)
            const size = getNoteSize(n)
            const isEdit = editingNote === n.id
            const noteFontSize = n.fontSize || NOTE_BASE_FONT

            return (
              <div
                key={n.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: size.w,
                  minHeight: size.h,
                  background: n.color,
                  borderRadius: 5,
                  boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: isEdit ? 'default' : 'grab',
                  zIndex: isEdit ? ACTIVE_Z : NOTE_Z_BASE + ((n.z || 0) % 100000),
                }}
                onMouseDown={e => !isEdit && startNoteDrag(e, n)}
                onDoubleClick={e => {
                  updateWhiteboard(current => ({
                    ...current,
                    notes: (current.notes || []).map(item => item.id === n.id ? { ...item, z: Date.now() } : item),
                    groups: current.groups || [],
                  }))
                  setEditingNote(n.id)
                  e.stopPropagation()
                }}
              >
                {/* Top bar */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 6px',
                  flexShrink: 0,
                  background: 'rgba(0,0,0,0.08)',
                }}>
                  <button
                    style={{ background: 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, color: 'rgba(0,0,0,0.6)', padding: '1px 5px', lineHeight: 1.4, fontWeight: 700, flexShrink: 0 }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); changeNoteFontSize(n.id, -2) }}
                    title="Smaller text"
                  >A−</button>
                  <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.45)', minWidth: 20, textAlign: 'center', fontWeight: 600 }}>
                    {noteFontSize}
                  </span>
                  <button
                    style={{ background: 'rgba(0,0,0,0.12)', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, color: 'rgba(0,0,0,0.6)', padding: '1px 5px', lineHeight: 1.4, fontWeight: 700, flexShrink: 0 }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); changeNoteFontSize(n.id, 2) }}
                    title="Larger text"
                  >A+</button>
                  <div style={{ flex: 1 }} />
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(0,0,0,0.4)', padding: '1px 4px', lineHeight: 1 }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); deleteNote(n.id) }}
                    title="Delete note"
                  >✕</button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, padding: '5px 8px 20px' }}>
                  {isEdit ? (
                    <textarea
                      autoFocus
                      ref={el => {
                        if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
                      }}
                      defaultValue={n.text}
                      style={{
                        display: 'block',
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        resize: 'none',
                        overflow: 'hidden',
                        fontSize: noteFontSize,
                        color: 'rgba(0,0,0,0.82)',
                        fontFamily: 'inherit',
                        lineHeight: 1.5,
                        cursor: 'text',
                      }}
                      onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
                      onBlur={e => { commitNoteText(n.id, e.target.value); setEditingNote(null) }}
                      onKeyDown={e => {
                        if (e.key === 'Escape') { commitNoteText(n.id, e.target.value); setEditingNote(null) }
                      }}
                      onMouseDown={e => e.stopPropagation()}
                    />
                  ) : (
                    <div style={{ fontSize: noteFontSize, color: 'rgba(0,0,0,0.82)', lineHeight: 1.5, wordBreak: 'break-word' }}>
                      {n.text || <span style={{ color: 'rgba(0,0,0,0.3)', fontStyle: 'italic' }}>Double-click to edit</span>}
                    </div>
                  )}
                </div>

                {/* Resize handle */}
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 0,
                    width: 16,
                    height: 16,
                    cursor: 'nwse-resize',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-end',
                    padding: 3,
                  }}
                  onMouseDown={e => startNoteResize(e, n)}
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" style={{ opacity: 0.35 }}>
                    <line x1="2" y1="9" x2="9" y2="2" stroke="rgba(0,0,0,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="5" y1="9" x2="9" y2="5" stroke="rgba(0,0,0,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
            )
          })}
        </div>

        {/* Empty state — outside transform so it stays screen-centered */}
        {notes.length === 0 && groups.length === 0 && (
          <div className="empty-state" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 700, color: 'var(--text-main)' }}>Empty Whiteboard</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Use the toolbar to add notes and groups.</div>
          </div>
        )}
      </div>
    </div>
  )
}
