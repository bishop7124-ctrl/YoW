import { FONTS, LINE_SPACINGS, INDENT_SIZES, DEFAULT_FORMAT } from './manuscriptUtils.js'

export const FormatContent = ({ settings, onChange }) => {
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

export const AlignIcon = ({ type }) => {
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

export const NotesPanel = ({ scene, onUpdateScene, onClose, highlightedSeq }) => {
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
