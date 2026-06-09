import { useState, useMemo } from 'react'
import { getTemplatesForProjectType } from './manuscriptTemplates'

// ─── Genre badge colours ───────────────────────────────────────────────────────

const GENRE_COLORS = {
  'General Fiction':               { bg: 'rgba(148,163,184,0.12)', text: '#94a3b8' },
  'Epic / Adventure / Fantasy':    { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa' },
  'Commercial Fiction / Screenwriting': { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24' },
  'Romantasy / Fantasy Romance':   { bg: 'rgba(244,114,182,0.12)', text: '#f472b6' },
  'Mystery / Thriller / Suspense': { bg: 'rgba(248,113,113,0.12)', text: '#f87171' },
  'Serialized / Series / TV Adaptation': { bg: 'rgba(52,211,153,0.12)', text: '#34d399' },
  'Any':                           { bg: 'rgba(148,163,184,0.08)', text: '#64748b' },
}

function genreStyle(genre) {
  return GENRE_COLORS[genre] ?? { bg: 'rgba(148,163,184,0.1)', text: 'var(--text-muted)' }
}

// ─── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, isSelected, onClick }) {
  const gs = genreStyle(template.genre)
  const actCount = template.acts.length
  const chapterCount = template.acts.reduce((acc, a) => acc + a.chapters.length, 0)

  return (
    <button
      className={`ms-tpl-card${isSelected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <div className="ms-tpl-card-inner">
        <span className="ms-tpl-genre-badge" style={{ background: gs.bg, color: gs.text }}>
          {template.genre}
        </span>
        <div className="ms-tpl-card-name">{template.name}</div>
        <div className="ms-tpl-card-desc">{template.description}</div>
        <div className="ms-tpl-card-meta">
          {actCount} {actCount === 1 ? 'act' : 'acts'} · {chapterCount} beats
          {template.targetWords > 0 && (
            <> · {(template.targetWords / 1000).toFixed(0)}k words</>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Template preview ──────────────────────────────────────────────────────────

function TemplatePreview({ template, withChapters, withScenes }) {
  const [expandedActs, setExpandedActs] = useState(() => new Set(template.acts.map(a => a.title)))

  const toggleAct = (title) => {
    setExpandedActs(prev => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  return (
    <div className="ms-tpl-preview">
      <div className="ms-tpl-preview-header">
        <div className="ms-tpl-preview-name">{template.name}</div>
        {template.targetWords > 0 && (
          <div className="ms-tpl-preview-target">
            ~{(template.targetWords / 1000).toFixed(0)}k words
          </div>
        )}
      </div>

      <div className="ms-tpl-preview-tree">
        {template.acts.map((act, ai) => {
          const isOpen = expandedActs.has(act.title)
          return (
            <div key={ai} className="ms-tpl-act-block">
              <button
                className="ms-tpl-act-row"
                onClick={() => toggleAct(act.title)}
              >
                <span className="ms-tpl-chevron">{isOpen ? '▾' : '▸'}</span>
                <span className="ms-tpl-act-label">{act.title}</span>
              </button>

              {act.guidance && (
                <div className="ms-tpl-act-guidance">{act.guidance}</div>
              )}

              {isOpen && withChapters && (
                <div className="ms-tpl-chapter-list">
                  {act.chapters.map((chap, ci) => (
                    <div key={ci} className="ms-tpl-chapter-block">
                      <div className="ms-tpl-chapter-row">
                        <span className="ms-tpl-chapter-dot" />
                        <span className="ms-tpl-chapter-title">{chap.title}</span>
                      </div>
                      {chap.guidance && (
                        <div className="ms-tpl-chapter-guidance">{chap.guidance}</div>
                      )}
                      {withScenes && (
                        <div className="ms-tpl-scene-placeholder">
                          <span className="ms-tpl-scene-dot" />
                          <span className="ms-tpl-scene-label">Scene 1</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isOpen && !withChapters && (
                <div className="ms-tpl-chapter-list">
                  {act.chapters.map((chap, ci) => (
                    <div key={ci} className="ms-tpl-chapter-row" style={{ opacity: 0.4 }}>
                      <span className="ms-tpl-chapter-dot" />
                      <span className="ms-tpl-chapter-title">{chap.title}</span>
                    </div>
                  ))}
                  <div className="ms-tpl-preview-hint">
                    Toggle "Include chapters" to add these
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Root modal ────────────────────────────────────────────────────────────────

export default function TemplateModal({
  onClose,
  onApply,
  hasExistingContent,
  projectType = 'novel',
}) {
  const templates = useMemo(() => getTemplatesForProjectType(projectType), [projectType])
  const [selectedId, setSelectedId] = useState(() => templates[0]?.id)
  const [withChapters, setWithChapters] = useState(true)
  const [withScenes, setWithScenes] = useState(true)
  const [applying, setApplying] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const selected = useMemo(
    () => templates.find(t => t.id === selectedId),
    [templates, selectedId]
  )

  const handleApplyClick = () => {
    if (hasExistingContent) {
      setConfirmOpen(true)
    } else {
      doApply()
    }
  }

  const doApply = async () => {
    setApplying(true)
    try {
      await onApply(selected, { withChapters, withScenes })
      onClose()
    } finally {
      setApplying(false)
    }
  }

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="ms-tpl-backdrop" onMouseDown={handleBackdrop}>
      <div className="ms-tpl-modal" role="dialog" aria-modal="true" aria-label="Choose a structural template">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="ms-tpl-modal-header">
          <div>
            <div className="ms-tpl-modal-title">Choose a structure</div>
            <div className="ms-tpl-modal-subtitle">
              Templates scaffold your manuscript — every act, beat, and note is fully editable after you apply.
            </div>
          </div>
          <button className="ms-tpl-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="ms-tpl-modal-body">

          {/* Template grid */}
          <div className="ms-tpl-grid-col">
            <div className="ms-tpl-grid">
              {templates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  isSelected={t.id === selectedId}
                  onClick={() => setSelectedId(t.id)}
                />
              ))}
            </div>
          </div>

          {/* Preview + options */}
          <div className="ms-tpl-preview-col">
            {selected && (
              <TemplatePreview
                template={selected}
                withChapters={withChapters}
                withScenes={withScenes}
              />
            )}

            {/* Options */}
            <div className="ms-tpl-options">
              <div className="ms-tpl-options-title">Options</div>

              <label className="ms-tpl-option-row">
                <span className="ms-tpl-option-toggle">
                  <input
                    type="checkbox"
                    checked={withChapters}
                    onChange={e => {
                      setWithChapters(e.target.checked)
                      if (!e.target.checked) setWithScenes(false)
                    }}
                    className="ms-tpl-checkbox"
                  />
                  <span className="ms-tpl-option-knob" />
                </span>
                <span>
                  <span className="ms-tpl-option-label">Include chapters</span>
                  <span className="ms-tpl-option-hint">
                    Add chapter beats from the template as starting points
                  </span>
                </span>
              </label>

              <label className={`ms-tpl-option-row${!withChapters ? ' is-disabled' : ''}`}>
                <span className="ms-tpl-option-toggle">
                  <input
                    type="checkbox"
                    checked={withScenes && withChapters}
                    disabled={!withChapters}
                    onChange={e => setWithScenes(e.target.checked)}
                    className="ms-tpl-checkbox"
                  />
                  <span className="ms-tpl-option-knob" />
                </span>
                <span>
                  <span className="ms-tpl-option-label">Include placeholder scenes</span>
                  <span className="ms-tpl-option-hint">
                    Add an empty first scene inside each chapter
                  </span>
                </span>
              </label>
            </div>

            {/* Apply button */}
            <div className="ms-tpl-footer">
              <button
                className="ms-tpl-apply-btn"
                onClick={handleApplyClick}
                disabled={applying}
              >
                {applying ? 'Applying…' : `Apply ${selected?.name}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation dialog for overwrite */}
      {confirmOpen && (
        <div className="ms-tpl-confirm-backdrop">
          <div className="ms-tpl-confirm-dialog">
            <div className="ms-tpl-confirm-title">Replace existing structure?</div>
            <div className="ms-tpl-confirm-body">
              Your manuscript already has acts, chapters, or scenes. Applying this template will{' '}
              <strong>add to</strong> your existing structure — it won't delete anything. You can
              reorganise or remove the new acts afterward.
            </div>
            <div className="ms-tpl-confirm-actions">
              <button
                className="ms-tpl-confirm-cancel"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="ms-tpl-apply-btn"
                onClick={() => { setConfirmOpen(false); doApply() }}
              >
                Yes, apply template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
