import { useState, useRef, useCallback } from 'react'
import { parseDocxToStructure, countImportStats } from '../../utils/docxImport'

// ─── Structure preview tree ───────────────────────────────────────────────────

function StructurePreview({ acts }) {
  const [expanded, setExpanded] = useState(() => new Set(acts.map(a => a.title)))

  const toggle = (title) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(title)) next.delete(title); else next.add(title)
    return next
  })

  return (
    <div className="ms-tpl-preview-tree">
      {acts.map((act, ai) => {
        const open = expanded.has(act.title)
        return (
          <div key={ai} className="ms-tpl-act-block">
            <button className="ms-tpl-act-row" onClick={() => toggle(act.title)}>
              <span className="ms-tpl-chevron">{open ? '▾' : '▸'}</span>
              <span className="ms-tpl-act-label">{act.title}</span>
              <span className="ms-import-count">{act.chapters.length} {act.chapters.length === 1 ? 'ch' : 'chs'}</span>
            </button>
            {open && (
              <div className="ms-tpl-chapter-list">
                {act.chapters.map((chap, ci) => (
                  <div key={ci} className="ms-tpl-chapter-block">
                    <div className="ms-tpl-chapter-row">
                      <span className="ms-tpl-chapter-dot" />
                      <span className="ms-tpl-chapter-title">{chap.title}</span>
                      <span className="ms-import-count">{chap.scenes.length} sc</span>
                    </div>
                  </div>
                ))}
                {act.chapters.length === 0 && (
                  <div className="ms-tpl-chapter-row" style={{ opacity: 0.4 }}>
                    <span className="ms-tpl-chapter-dot" />
                    <span className="ms-tpl-chapter-title" style={{ fontStyle: 'italic' }}>No chapters detected</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Root modal ───────────────────────────────────────────────────────────────

export default function DocxImportModal({ onClose, onImport, hasExistingContent }) {
  const [stage, setStage] = useState('idle') // idle | parsing | ready | importing | error
  const [parsedActs, setParsedActs] = useState(null)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [importMode, setImportMode] = useState('merge')
  const fileInputRef = useRef(null)

  const processFile = useCallback(async (file) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Please select a .docx file.')
      setStage('error')
      return
    }

    setFileName(file.name)
    setStage('parsing')
    setError('')
    setParsedActs(null)

    try {
      const acts = await parseDocxToStructure(file)
      setParsedActs(acts)
      setStage('ready')
    } catch (err) {
      setError(err.message || 'Failed to parse the file.')
      setStage('error')
    }
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleImport = async () => {
    if (!parsedActs) return
    setStage('importing')
    try {
      await onImport(parsedActs, { mode: importMode })
      onClose()
    } catch (err) {
      setError(err.message || 'Import failed.')
      setStage('error')
    }
  }

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  const stats = parsedActs ? countImportStats(parsedActs) : null
  const isReady = stage === 'ready' && parsedActs

  return (
    <div className="ms-tpl-backdrop" onMouseDown={handleBackdrop}>
      <div className="ms-import-modal ms-tpl-modal" role="dialog" aria-modal="true" aria-label="Import manuscript">

        {/* Header */}
        <div className="ms-tpl-modal-header">
          <div>
            <div className="ms-tpl-modal-title">Import manuscript</div>
            <div className="ms-tpl-modal-subtitle">
              Upload a .docx file — acts, chapters, and scenes are detected from headings and scene breaks automatically.
            </div>
          </div>
          <button className="ms-tpl-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="ms-import-body">

          {/* Drop zone */}
          <div
            className={`ms-import-dropzone${isDragOver ? ' is-over' : ''}${isReady ? ' is-ready' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {stage === 'idle' && (
              <>
                <div className="ms-import-dz-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <polyline points="9 15 12 12 15 15"/>
                  </svg>
                </div>
                <div className="ms-import-dz-label">Drop a .docx file here</div>
                <div className="ms-import-dz-sub">or click to browse</div>
              </>
            )}

            {stage === 'parsing' && (
              <>
                <div className="ms-import-dz-label">{fileName}</div>
                <div className="ms-import-dz-sub">Parsing structure…</div>
              </>
            )}

            {isReady && (
              <>
                <div className="ms-import-dz-icon ms-import-dz-icon--ok">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div className="ms-import-dz-label">{fileName}</div>
                <div className="ms-import-dz-sub">Click to choose a different file</div>
              </>
            )}

            {stage === 'error' && (
              <>
                <div className="ms-import-dz-icon ms-import-dz-icon--err">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <div className="ms-import-dz-label ms-import-dz-label--err">{error}</div>
                <div className="ms-import-dz-sub">Click to try again</div>
              </>
            )}

            {stage === 'importing' && (
              <div className="ms-import-dz-label">Importing…</div>
            )}
          </div>

          {/* Preview panel — shown once parsing succeeded */}
          {isReady && (
            <div className="ms-import-preview">

              {/* Stats row */}
              <div className="ms-import-stats">
                <div className="ms-import-stat">
                  <span className="ms-import-stat-value">{stats.totalActs}</span>
                  <span className="ms-import-stat-label">{stats.totalActs === 1 ? 'act' : 'acts'}</span>
                </div>
                <span className="ms-import-stat-sep">·</span>
                <div className="ms-import-stat">
                  <span className="ms-import-stat-value">{stats.totalChapters}</span>
                  <span className="ms-import-stat-label">{stats.totalChapters === 1 ? 'chapter' : 'chapters'}</span>
                </div>
                <span className="ms-import-stat-sep">·</span>
                <div className="ms-import-stat">
                  <span className="ms-import-stat-value">{stats.totalScenes}</span>
                  <span className="ms-import-stat-label">{stats.totalScenes === 1 ? 'scene' : 'scenes'}</span>
                </div>
                <span className="ms-import-stat-sep">·</span>
                <div className="ms-import-stat">
                  <span className="ms-import-stat-value">{stats.totalWords.toLocaleString()}</span>
                  <span className="ms-import-stat-label">words</span>
                </div>
              </div>

              {/* Tree */}
              <div className="ms-import-tree">
                <StructurePreview acts={parsedActs} />
              </div>

              {/* Existing-manuscript strategy */}
              {hasExistingContent && (
                <fieldset className="ms-import-strategy">
                  <legend>Where should the imported text go?</legend>
                  <label>
                    <input type="radio" name="import-mode" value="merge" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />
                    <span><strong>Merge into matching chapters</strong><small>Recommended. Fills empty scenes in matching acts and chapters, then adds any remaining scenes. Existing prose is never overwritten.</small></span>
                  </label>
                  <label>
                    <input type="radio" name="import-mode" value="append" checked={importMode === 'append'} onChange={() => setImportMode('append')} />
                    <span><strong>Add as a separate structure</strong><small>Creates new acts, chapters, and scenes after the current manuscript.</small></span>
                  </label>
                </fieldset>
              )}

              {/* Import button */}
              <div className="ms-tpl-footer">
                <button
                  className="ms-tpl-apply-btn"
                  onClick={handleImport}
                  disabled={stage === 'importing'}
                >
                  {stage === 'importing' ? 'Importing…' : `Import ${stats.totalWords.toLocaleString()} words`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
