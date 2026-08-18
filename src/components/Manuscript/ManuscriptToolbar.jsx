// FormatContent + AlignIcon (the old slider-based format panel) were removed
// here — ManuscriptInspector.jsx's FormatTab replaced them with .ms-opt pill
// rows per the handoff spec §4, and nothing else imported either export.

import { useState } from 'react'
import { useDebouncedCallback } from './manuscriptUtils.js'

// ─── Notes panel ──────────────────────────────────────────────────────────────

// A note's own local, un-debounced buffer for its textarea, mirroring the
// pattern the main scene content editor already uses (SceneEditor.jsx's
// localContent + debouncedUpdate) for the same reason: binding a textarea's
// value straight to the store (a fully controlled input with no local
// state) means every keystroke has to round-trip through onUpdateScene and
// a re-render before the next keystroke lands, and on a big project that
// round-trip is exactly slow enough to read as "typing into it doesn't
// stick" — characters visibly drop or the field appears to not save.
// key={note.id} on the call site (below) resets this on note swap/delete,
// the same "remount to reset local draft state" pattern already used for
// InlineTitleField elsewhere in this redesign.
function NoteTextarea({ note, onUpdateText }) {
  const [text, setText] = useState(note.text || '')
  const debouncedSave = useDebouncedCallback(value => onUpdateText(note.id, value), 300)
  return (
    <textarea
      value={text}
      onChange={e => { setText(e.target.value); debouncedSave.schedule(e.target.value) }}
      onBlur={debouncedSave.flush}
      placeholder="Write your note here…"
      className="w-full bg-transparent text-[var(--text-main)] text-sm outline-none resize-none min-h-[60px]"
      rows={3}
    />
  )
}

export const NotesPanel = ({ scene, onUpdateScene, highlightedSeq }) => {
  if (!scene) return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-xs px-4 text-center">Focus a scene to see its notes</div>
    </div>
  )

  const notes = scene.notes || []
  const updateNoteText = (noteId, text) => onUpdateScene(scene.id, { notes: (scene.notes || []).map(n => n.id === noteId ? { ...n, text } : n) })
  const deleteNote = noteId => onUpdateScene(scene.id, { notes: (scene.notes || []).filter(n => n.id !== noteId) })

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {notes.length === 0 && (
          <p className="text-[var(--text-muted)] text-xs text-center py-6">
	            No notes yet.<br />Use the <span className="text-[var(--accent)] font-mono">+</span> beside the cursor.
          </p>
        )}
        {notes.map(note => (
          <div key={note.id} className={`rounded-lg border p-3 transition-colors ${highlightedSeq === note.seq ? 'border-[var(--accent)] bg-[var(--accent-fade)]' : 'border-[var(--border)] bg-[var(--bg-main)]'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">Note {note.seq}</span>
              <button onClick={() => deleteNote(note.id)} className="text-[var(--text-muted)] hover:text-red-400 text-xs">✕</button>
            </div>
            <NoteTextarea key={note.id} note={note} onUpdateText={updateNoteText} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Save indicator ───────────────────────────────────────────────────────────

export const SaveIndicator = ({ state }) => {
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
