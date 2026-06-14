import { useState, useRef, useEffect, useCallback } from 'react'
import { optimizeImageToDataUrl } from '../../utils/imageOptimize'
import './ComicPlanner.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

const sortByOrder = (arr) => [...(arr ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

const PAGE_TYPES = ['standard', 'splash', 'double-page spread', 'cover', 'backmatter', 'recap', 'credits']
const PAGE_TURNS = ['none', 'reveal', 'cliffhanger', 'joke', 'emotional beat', 'action beat']
const PAGE_STATUSES = ['outline', 'draft', 'revised', 'final']
const SHOT_TYPES = ['establishing', 'wide', 'medium', 'close-up', 'extreme close-up', 'POV', 'over-shoulder', 'detail']
const LAYOUT_HINTS = ['standard', 'full width', 'tall', 'wide', 'inset', 'borderless']
const PANEL_STATUSES = ['outline', 'draft', 'revised', 'final']
const CAPTION_TYPES = ['narration', 'location', 'time', 'thought', 'editorial']

// ─── Image / PDF upload ────────────────────────────────────────────────────────

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf'
const MAX_PDF_BYTES = 8 * 1024 * 1024 // 8 MB — warn beyond this

function ImageUpload({ label = 'Reference', value, sessionPdf, onImage, onPdf, onRemove }) {
  const inputRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // sessionPdfUrl is an object URL valid only for this browser session
  const [sessionPdfUrl, setSessionPdfUrl] = useState(null)

  // Revoke old object URL on unmount or when sessionPdf changes
  useEffect(() => {
    if (!sessionPdf) { setSessionPdfUrl(null); return }
    const url = URL.createObjectURL(sessionPdf)
    setSessionPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [sessionPdf])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError('')
    setLoading(true)
    try {
      if (file.type === 'application/pdf') {
        if (file.size > MAX_PDF_BYTES) {
          setError(`PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB — large PDFs may impact performance.`)
        }
        onPdf(file)
      } else if (file.type.startsWith('image/')) {
        const dataUrl = await optimizeImageToDataUrl(file, { maxDimension: 1200, maxOutputBytes: 2 * 1024 * 1024 })
        onImage(dataUrl)
      } else {
        setError('Please upload an image (PNG, JPG, WebP, GIF) or a PDF.')
      }
    } catch (err) {
      setError(err.message || 'Could not process that file.')
    } finally {
      setLoading(false)
    }
  }, [onImage, onPdf])

  const handleChange = (e) => {
    handleFile(e.target.files?.[0])
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  const hasContent = value || sessionPdfUrl

  return (
    <div className="cp-upload-field">
      <div className="cp-label">{label}</div>

      {hasContent ? (
        <div className="cp-upload-preview">
          {value && (
            <img src={value} alt="reference" className="cp-upload-img" />
          )}
          {!value && sessionPdfUrl && (
            <div className="cp-pdf-preview">
              <iframe src={sessionPdfUrl} className="cp-pdf-iframe" title="PDF reference" />
              <div className="cp-pdf-badge">Session only — not saved on refresh</div>
            </div>
          )}
          <div className="cp-upload-preview-actions">
            <label className="cp-btn-ghost cp-btn-xs cp-upload-replace" title="Replace">
              Replace
              <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} onChange={handleChange} style={{ display: 'none' }} />
            </label>
            <button className="cp-btn-ghost cp-btn-xs cp-danger" onClick={onRemove}>Remove</button>
          </div>
        </div>
      ) : (
        <label
          className="cp-upload-drop"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {loading ? (
            <span className="cp-upload-hint">Processing…</span>
          ) : (
            <>
              <span className="cp-upload-icon">🖼</span>
              <span className="cp-upload-hint">Drop image or PDF, or <span className="cp-upload-browse">browse</span></span>
              <span className="cp-upload-sub">Images are saved · PDFs are session-only</span>
            </>
          )}
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} onChange={handleChange} style={{ display: 'none' }} />
        </label>
      )}

      {error && <div className="cp-upload-error">{error}</div>}
    </div>
  )
}

// ─── Panel editor ─────────────────────────────────────────────────────────────

function DialogueLine({ line, onChange, onDelete }) {
  return (
    <div className="cp-dialogue-row">
      <input
        className="cp-input cp-input-sm cp-speaker"
        placeholder="Speaker"
        value={line.speaker || ''}
        onChange={e => onChange({ ...line, speaker: e.target.value })}
      />
      <input
        className="cp-input cp-input-sm cp-flex1"
        placeholder="Dialogue text…"
        value={line.text || ''}
        onChange={e => onChange({ ...line, text: e.target.value })}
      />
      <button className="cp-icon-btn" onClick={onDelete} title="Remove">×</button>
    </div>
  )
}

function CaptionLine({ line, onChange, onDelete }) {
  return (
    <div className="cp-dialogue-row">
      <select
        className="cp-select cp-input-sm cp-caption-type"
        value={line.type || 'narration'}
        onChange={e => onChange({ ...line, type: e.target.value })}
      >
        {CAPTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <input
        className="cp-input cp-input-sm cp-flex1"
        placeholder="Caption text…"
        value={line.text || ''}
        onChange={e => onChange({ ...line, text: e.target.value })}
      />
      <button className="cp-icon-btn" onClick={onDelete} title="Remove">×</button>
    </div>
  )
}

function SFXLine({ line, onChange, onDelete }) {
  return (
    <div className="cp-dialogue-row">
      <input
        className="cp-input cp-input-sm cp-flex1"
        placeholder="Sound effect…"
        value={line.text || ''}
        onChange={e => onChange({ ...line, text: e.target.value })}
      />
      <button className="cp-icon-btn" onClick={onDelete} title="Remove">×</button>
    </div>
  )
}

function PanelEditor({ panel, characters, locations, onUpdate, onDelete }) {
  const [open, setOpen] = useState(true)
  const [sessionPdf, setSessionPdf] = useState(null)

  const update = (patch) => onUpdate({ ...panel, ...patch })

  const addDialogue = () => update({ dialogue: [...(panel.dialogue ?? []), { id: uid(), speaker: '', text: '' }] })
  const updateDialogue = (id, data) => update({ dialogue: (panel.dialogue ?? []).map(l => l.id === id ? data : l) })
  const deleteDialogue = (id) => update({ dialogue: (panel.dialogue ?? []).filter(l => l.id !== id) })

  const addCaption = () => update({ captions: [...(panel.captions ?? []), { id: uid(), type: 'narration', text: '' }] })
  const updateCaption = (id, data) => update({ captions: (panel.captions ?? []).map(l => l.id === id ? data : l) })
  const deleteCaption = (id) => update({ captions: (panel.captions ?? []).filter(l => l.id !== id) })

  const addSfx = () => update({ sfx: [...(panel.sfx ?? []), { id: uid(), text: '' }] })
  const updateSfx = (id, data) => update({ sfx: (panel.sfx ?? []).map(l => l.id === id ? data : l) })
  const deleteSfx = (id) => update({ sfx: (panel.sfx ?? []).filter(l => l.id !== id) })

  const panelChars = characters.filter(c => (panel.characterIds ?? []).includes(c.id))

  return (
    <div className={`cp-panel-card ${open ? 'is-open' : ''}`}>
      <div className="cp-panel-header">
        <button className="cp-panel-toggle" onClick={() => setOpen(o => !o)}>
          <span className="cp-panel-chevron">{open ? '▾' : '▸'}</span>
          <span className="cp-panel-num">Panel {(panel.order ?? 0) + 1}</span>
          {panel.shotType && <span className="cp-panel-meta">{panel.shotType}</span>}
          {panel.status && panel.status !== 'outline' && <span className={`cp-status-chip cp-status-${panel.status}`}>{panel.status}</span>}
        </button>
        <button className="cp-icon-btn cp-danger" onClick={() => onDelete(panel.id)} title="Delete panel">×</button>
      </div>

      {open && (
        <div className="cp-panel-body">
          <div className="cp-row-2">
            <div className="cp-field">
              <label className="cp-label">Shot type</label>
              <select className="cp-select" value={panel.shotType || 'medium'} onChange={e => update({ shotType: e.target.value })}>
                {SHOT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="cp-field">
              <label className="cp-label">Layout</label>
              <select className="cp-select" value={panel.layoutHint || 'standard'} onChange={e => update({ layoutHint: e.target.value })}>
                {LAYOUT_HINTS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="cp-field">
              <label className="cp-label">Status</label>
              <select className="cp-select" value={panel.status || 'outline'} onChange={e => update({ status: e.target.value })}>
                {PANEL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="cp-field">
            <label className="cp-label">Description <span className="cp-sublabel">what the reader sees</span></label>
            <textarea
              className="cp-textarea"
              rows={2}
              placeholder="Describe the panel's visual content…"
              value={panel.description || ''}
              onChange={e => update({ description: e.target.value })}
            />
          </div>

          <div className="cp-field">
            <label className="cp-label">Art notes</label>
            <textarea
              className="cp-textarea"
              rows={2}
              placeholder="Composition, expression, props, motion, references…"
              value={panel.artNotes || ''}
              onChange={e => update({ artNotes: e.target.value })}
            />
          </div>

          {characters.length > 0 && (
            <div className="cp-field">
              <label className="cp-label">Characters in panel</label>
              <div className="cp-char-chips">
                {characters.map(c => (
                  <button
                    key={c.id}
                    className={`cp-char-chip ${(panel.characterIds ?? []).includes(c.id) ? 'active' : ''}`}
                    onClick={() => {
                      const ids = panel.characterIds ?? []
                      update({ characterIds: ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id] })
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="cp-section-label">
            Dialogue
            <button className="cp-add-inline" onClick={addDialogue}>+ balloon</button>
          </div>
          {(panel.dialogue ?? []).map(line => (
            <DialogueLine key={line.id} line={line} onChange={d => updateDialogue(line.id, d)} onDelete={() => deleteDialogue(line.id)} />
          ))}

          <div className="cp-section-label">
            Captions
            <button className="cp-add-inline" onClick={addCaption}>+ caption</button>
          </div>
          {(panel.captions ?? []).map(line => (
            <CaptionLine key={line.id} line={line} onChange={d => updateCaption(line.id, d)} onDelete={() => deleteCaption(line.id)} />
          ))}

          <div className="cp-section-label">
            SFX
            <button className="cp-add-inline" onClick={addSfx}>+ sfx</button>
          </div>
          {(panel.sfx ?? []).map(line => (
            <SFXLine key={line.id} line={line} onChange={d => updateSfx(line.id, d)} onDelete={() => deleteSfx(line.id)} />
          ))}

          <div className="cp-field">
            <label className="cp-label">Continuity notes</label>
            <input
              className="cp-input"
              placeholder="Props, costume, time continuity…"
              value={panel.continuityNotes || ''}
              onChange={e => update({ continuityNotes: e.target.value })}
            />
          </div>

          <ImageUpload
            label="Panel reference"
            value={panel.referenceImage || null}
            sessionPdf={sessionPdf}
            onImage={dataUrl => update({ referenceImage: dataUrl })}
            onPdf={file => setSessionPdf(file)}
            onRemove={() => { update({ referenceImage: null }); setSessionPdf(null) }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Page editor ──────────────────────────────────────────────────────────────

function PageEditor({ page, panels, characters, locations, pageNumber, onUpdatePage, onDeletePage, onAddPanel, onUpdatePanel, onDeletePanel, onDuplicatePage }) {
  const sortedPanels = sortByOrder(panels)
  const [pageSessionPdf, setPageSessionPdf] = useState(null)

  return (
    <div className="cp-page-editor">
      <div className="cp-page-editor-header">
        <div className="cp-page-title-row">
          <span className="cp-page-number">Page {pageNumber}</span>
          <input
            className="cp-input cp-page-title-input"
            placeholder="Page title (optional)"
            value={page.title || ''}
            onChange={e => onUpdatePage(page.id, { title: e.target.value })}
          />
          <div className="cp-page-actions">
            <button className="cp-btn-ghost" onClick={() => onDuplicatePage(page.id)} title="Duplicate page">Duplicate</button>
            <button className="cp-btn-ghost cp-danger" onClick={() => onDeletePage(page.id)} title="Delete page">Delete</button>
          </div>
        </div>

        <div className="cp-row-3">
          <div className="cp-field">
            <label className="cp-label">Page type</label>
            <select className="cp-select" value={page.pageType || 'standard'} onChange={e => onUpdatePage(page.id, { pageType: e.target.value })}>
              {PAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="cp-field">
            <label className="cp-label">Status</label>
            <select className="cp-select" value={page.status || 'outline'} onChange={e => onUpdatePage(page.id, { status: e.target.value })}>
              {PAGE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="cp-field">
            <label className="cp-label">Page turn</label>
            <select className="cp-select" value={page.pageTurn || 'none'} onChange={e => onUpdatePage(page.id, { pageTurn: e.target.value })}>
              {PAGE_TURNS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="cp-field">
          <label className="cp-label">Page summary</label>
          <textarea
            className="cp-textarea"
            rows={2}
            placeholder="What happens on this page?"
            value={page.summary || ''}
            onChange={e => onUpdatePage(page.id, { summary: e.target.value })}
          />
        </div>

        <div className="cp-row-2">
          <div className="cp-field">
            <label className="cp-label">Visual direction</label>
            <textarea
              className="cp-textarea"
              rows={2}
              placeholder="Composition, mood, palette, references…"
              value={page.visualDirection || ''}
              onChange={e => onUpdatePage(page.id, { visualDirection: e.target.value })}
            />
          </div>
          <div className="cp-field">
            <label className="cp-label">Production notes</label>
            <textarea
              className="cp-textarea"
              rows={2}
              placeholder="Editor, artist, or letterer notes…"
              value={page.productionNotes || ''}
              onChange={e => onUpdatePage(page.id, { productionNotes: e.target.value })}
            />
          </div>
        </div>

        {characters.length > 0 && (
          <div className="cp-field">
            <label className="cp-label">Characters on page</label>
            <div className="cp-char-chips">
              {characters.map(c => (
                <button
                  key={c.id}
                  className={`cp-char-chip ${(page.characterIds ?? []).includes(c.id) ? 'active' : ''}`}
                  onClick={() => {
                    const ids = page.characterIds ?? []
                    onUpdatePage(page.id, { characterIds: ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id] })
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <ImageUpload
          label="Page reference"
          value={page.referenceImage || null}
          sessionPdf={pageSessionPdf}
          onImage={dataUrl => onUpdatePage(page.id, { referenceImage: dataUrl })}
          onPdf={file => setPageSessionPdf(file)}
          onRemove={() => { onUpdatePage(page.id, { referenceImage: null }); setPageSessionPdf(null) }}
        />
      </div>

      <div className="cp-panels-section">
        <div className="cp-panels-header">
          <span className="cp-panels-count">{sortedPanels.length} panel{sortedPanels.length !== 1 ? 's' : ''}</span>
          <button className="cp-btn-primary" onClick={() => onAddPanel(page.id)}>+ Add panel</button>
        </div>

        {sortedPanels.length === 0 && (
          <div className="cp-empty-panels">
            <p>No panels yet.</p>
            <button className="cp-btn-primary" onClick={() => onAddPanel(page.id)}>Add your first panel</button>
          </div>
        )}

        {sortedPanels.map(panel => (
          <PanelEditor
            key={panel.id}
            panel={panel}
            characters={characters}
            locations={locations}
            onUpdate={(updated) => onUpdatePanel(panel.id, updated)}
            onDelete={(id) => onDeletePanel(id)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Page list (issue view) ────────────────────────────────────────────────────

function PageRow({ page, panels, pageNumber, isActive, onClick }) {
  const panelCount = panels.length
  const dialogueCount = panels.reduce((n, p) => n + (p.dialogue?.length ?? 0), 0)

  return (
    <button className={`cp-page-row ${isActive ? 'is-active' : ''}`} onClick={onClick}>
      <span className="cp-page-row-num">{pageNumber}</span>
      <div className="cp-page-row-body">
        <span className="cp-page-row-title">{page.title || <em>Untitled page</em>}</span>
        <div className="cp-page-row-meta">
          {page.pageType !== 'standard' && <span className="cp-meta-chip">{page.pageType}</span>}
          <span className="cp-meta-chip">{panelCount} panel{panelCount !== 1 ? 's' : ''}</span>
          {dialogueCount > 0 && <span className="cp-meta-chip">{dialogueCount} balloon{dialogueCount !== 1 ? 's' : ''}</span>}
          {page.pageTurn && page.pageTurn !== 'none' && <span className="cp-meta-chip cp-turn-chip">↳ {page.pageTurn}</span>}
          {page.status && page.status !== 'outline' && <span className={`cp-status-chip cp-status-${page.status}`}>{page.status}</span>}
        </div>
      </div>
    </button>
  )
}

// ─── Structure sidebar ────────────────────────────────────────────────────────

function StructureSidebar({ volumes, issues, selectedIssueId, onSelectIssue, onAddVolume, onAddIssue, onUpdateVolume, onUpdateIssue, onDeleteVolume, onDeleteIssue, comicPages }) {
  const [expandedVolumes, setExpandedVolumes] = useState(() => new Set(volumes.map(v => v.id)))
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')

  const toggleVolume = (id) => setExpandedVolumes(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const startEdit = (id, title) => { setEditingId(id); setEditingTitle(title) }
  const commitEdit = (type, id) => {
    if (type === 'volume') onUpdateVolume(id, { title: editingTitle })
    else onUpdateIssue(id, { title: editingTitle })
    setEditingId(null)
  }

  const issuePageCount = (issueId) => comicPages.filter(p => p.issueId === issueId).length

  return (
    <div className="cp-sidebar">
      <div className="cp-sidebar-header">
        <span className="cp-sidebar-title">Structure</span>
        <button className="cp-btn-ghost cp-btn-xs" onClick={onAddVolume}>+ Volume</button>
      </div>

      {volumes.length === 0 && (
        <div className="cp-sidebar-empty">
          <p>No volumes yet.</p>
          <button className="cp-btn-primary cp-btn-sm" onClick={onAddVolume}>Add volume</button>
        </div>
      )}

      {volumes.map(volume => {
        const volumeIssues = sortByOrder(issues.filter(i => i.actId === volume.id))
        const isExpanded = expandedVolumes.has(volume.id)

        return (
          <div key={volume.id} className="cp-sidebar-volume">
            <div className="cp-sidebar-volume-row">
              <button className="cp-sidebar-chevron" onClick={() => toggleVolume(volume.id)}>
                {isExpanded ? '▾' : '▸'}
              </button>
              {editingId === volume.id ? (
                <input
                  className="cp-inline-edit"
                  value={editingTitle}
                  autoFocus
                  onChange={e => setEditingTitle(e.target.value)}
                  onBlur={() => commitEdit('volume', volume.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit('volume', volume.id); if (e.key === 'Escape') setEditingId(null) }}
                />
              ) : (
                <span className="cp-sidebar-volume-title" onDoubleClick={() => startEdit(volume.id, volume.title || '')}>
                  {volume.title || 'Untitled Volume'}
                </span>
              )}
              <div className="cp-sidebar-row-actions">
                <button className="cp-icon-btn" onClick={() => onAddIssue(volume.id)} title="Add issue">+</button>
                <button className="cp-icon-btn cp-danger" onClick={() => onDeleteVolume(volume.id)} title="Delete volume">×</button>
              </div>
            </div>

            {isExpanded && volumeIssues.map(issue => (
              <div key={issue.id} className={`cp-sidebar-issue-row ${selectedIssueId === issue.id ? 'is-active' : ''}`}>
                <button className="cp-sidebar-issue-btn" onClick={() => onSelectIssue(issue.id)}>
                  {editingId === issue.id ? (
                    <input
                      className="cp-inline-edit"
                      value={editingTitle}
                      autoFocus
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={() => commitEdit('issue', issue.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit('issue', issue.id); if (e.key === 'Escape') setEditingId(null) }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span onDoubleClick={e => { e.stopPropagation(); startEdit(issue.id, issue.title || '') }}>
                      {issue.title || 'Untitled Issue'}
                    </span>
                  )}
                  <span className="cp-issue-page-count">{issuePageCount(issue.id)}p</span>
                </button>
                <button className="cp-icon-btn cp-danger" onClick={() => onDeleteIssue(issue.id)} title="Delete issue">×</button>
              </div>
            ))}

            {isExpanded && volumeIssues.length === 0 && (
              <div className="cp-sidebar-no-issues">
                <button className="cp-btn-ghost cp-btn-xs" onClick={() => onAddIssue(volume.id)}>Add issue</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function ComicPlanner({ store }) {
  const {
    acts, chapters,
    addAct, updateAct, deleteAct,
    addChapter, updateChapter, deleteChapter,
    comicPages, comicPanels,
    addComicPage, updateComicPage, deleteComicPage, duplicateComicPage,
    addComicPanel, updateComicPanel, deleteComicPanel,
    characters, locations,
    activeNovel,
  } = store

  const novelId = activeNovel?.id

  const volumes = sortByOrder(acts.filter(a => a.novelId === novelId))
  const issues = sortByOrder(chapters.filter(c => c.novelId === novelId))

  const [selectedIssueId, setSelectedIssueId] = useState(() => issues[0]?.id ?? null)
  const [selectedPageId, setSelectedPageId] = useState(null)

  const selectedIssue = issues.find(i => i.id === selectedIssueId) ?? null
  const issuePages = sortByOrder(comicPages.filter(p => p.issueId === selectedIssueId))
  const selectedPage = issuePages.find(p => p.id === selectedPageId) ?? null
  const pagePanels = comicPanels.filter(p => p.pageId === selectedPageId)

  const handleAddVolume = () => {
    const vol = addAct(`Volume ${volumes.length + 1}`)
    if (vol) {
      const issue = addChapter(vol.id, `Issue 1`)
      if (issue) setSelectedIssueId(issue.id)
    }
  }

  const handleAddIssue = (actId) => {
    const volumeIssues = issues.filter(i => i.actId === actId)
    const issue = addChapter(actId, `Issue ${volumeIssues.length + 1}`)
    if (issue) setSelectedIssueId(issue.id)
  }

  const handleDeleteVolume = (actId) => {
    const volumeIssues = issues.filter(i => i.actId === actId)
    volumeIssues.forEach(i => {
      comicPages.filter(p => p.issueId === i.id).forEach(p => deleteComicPage(p.id))
      deleteChapter(i.id)
    })
    deleteAct(actId)
    if (volumeIssues.some(i => i.id === selectedIssueId)) setSelectedIssueId(null)
  }

  const handleDeleteIssue = (issueId) => {
    comicPages.filter(p => p.issueId === issueId).forEach(p => deleteComicPage(p.id))
    deleteChapter(issueId)
    if (selectedIssueId === issueId) { setSelectedIssueId(null); setSelectedPageId(null) }
  }

  const handleAddPage = () => {
    if (!selectedIssueId) return
    const page = addComicPage(selectedIssueId)
    if (page) setSelectedPageId(page.id)
  }

  const handleDeletePage = (pageId) => {
    deleteComicPage(pageId)
    if (selectedPageId === pageId) setSelectedPageId(issuePages.find(p => p.id !== pageId)?.id ?? null)
  }

  const handleDuplicatePage = (pageId) => {
    const newPage = duplicateComicPage(pageId)
    if (newPage) setSelectedPageId(newPage.id)
  }

  const handleSelectIssue = (issueId) => {
    setSelectedIssueId(issueId)
    setSelectedPageId(null)
  }

  // When active issue changes, auto-select first page if none selected
  const prevIssueId = useRef(selectedIssueId)
  if (prevIssueId.current !== selectedIssueId) {
    prevIssueId.current = selectedIssueId
    const firstPage = sortByOrder(comicPages.filter(p => p.issueId === selectedIssueId))[0]
    if (firstPage) setSelectedPageId(firstPage.id)
  }

  return (
    <div className="cp-root">
      <StructureSidebar
        volumes={volumes}
        issues={issues}
        selectedIssueId={selectedIssueId}
        onSelectIssue={handleSelectIssue}
        onAddVolume={handleAddVolume}
        onAddIssue={handleAddIssue}
        onUpdateVolume={(id, data) => updateAct(id, data)}
        onUpdateIssue={(id, data) => updateChapter(id, data)}
        onDeleteVolume={handleDeleteVolume}
        onDeleteIssue={handleDeleteIssue}
        comicPages={comicPages}
      />

      <div className="cp-main">
        {!selectedIssueId ? (
          <div className="cp-no-issue">
            <div className="cp-empty-state">
              <h3>No issue selected</h3>
              <p>Add a volume and issue in the sidebar to start planning pages.</p>
              <button className="cp-btn-primary" onClick={handleAddVolume}>Add volume</button>
            </div>
          </div>
        ) : (
          <>
            <div className="cp-page-list">
              <div className="cp-page-list-header">
                <span className="cp-page-list-title">
                  {selectedIssue?.title || 'Issue'} — {issuePages.length} page{issuePages.length !== 1 ? 's' : ''}
                </span>
                <button className="cp-btn-primary" onClick={handleAddPage}>+ Page</button>
              </div>

              {issuePages.length === 0 && (
                <div className="cp-empty-state cp-empty-state-sm">
                  <p>No pages yet. Add your first page to start planning panels.</p>
                  <button className="cp-btn-primary" onClick={handleAddPage}>Add first page</button>
                </div>
              )}

              {issuePages.map((page, i) => (
                <PageRow
                  key={page.id}
                  page={page}
                  panels={comicPanels.filter(p => p.pageId === page.id)}
                  pageNumber={i + 1}
                  isActive={selectedPageId === page.id}
                  onClick={() => setSelectedPageId(page.id)}
                />
              ))}
            </div>

            <div className="cp-editor-area">
              {!selectedPage ? (
                <div className="cp-empty-state">
                  <p>Select a page to edit its panels and details.</p>
                </div>
              ) : (
                <PageEditor
                  page={selectedPage}
                  panels={pagePanels}
                  characters={characters}
                  locations={locations}
                  pageNumber={issuePages.indexOf(selectedPage) + 1}
                  onUpdatePage={updateComicPage}
                  onDeletePage={handleDeletePage}
                  onAddPanel={(pageId) => addComicPanel(pageId)}
                  onUpdatePanel={(panelId, data) => updateComicPanel(panelId, data)}
                  onDeletePanel={deleteComicPanel}
                  onDuplicatePage={handleDuplicatePage}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
