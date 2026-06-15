import { useState } from 'react'
import { PROJECT_TYPES, DEFAULT_TYPE, getProjectType, getProjectTypeStage } from '../../constants/projectTypes'

const TYPE_OPTIONS = Object.entries(PROJECT_TYPES).map(([id, cfg]) => ({ id, ...cfg }))

const TYPE_ICONS = {
  novel:        { emoji: '📖', color: '#a78bfa' },
  novella:      { emoji: '📕', color: '#60a5fa' },
  short_story:  { emoji: '📄', color: '#34d399' },
  dnd_campaign: { emoji: '🎲', color: '#f97316' },
  tabletop_rpg: { emoji: '🗺️', color: '#fb923c' },
  comic:        { emoji: '💬', color: '#e879f9' },
}

const WORKSPACE_HIGHLIGHTS = {
  novel:        ['Manuscript editor with acts, chapters & scenes', 'Characters, locations & lore encyclopedia', 'Timeline, world history & ideas board'],
  novella:      ['Manuscript editor with parts & chapters', 'Characters, locations & lore', 'Ideas board & writing schedule'],
  short_story:  ['Streamlined manuscript editor', 'Characters & locations', 'Compact planning tools'],
  dnd_campaign: ['Session planner with encounter tracking', 'Character builder with dice roller', 'Maps, factions, lore & world history'],
  tabletop_rpg: ['Session planner for any ruleset', 'Character builder with dice roller', 'Maps, factions, lore & world history'],
  comic:        ['Volume & issue structure planner', 'Page & panel scripting tools', 'Characters, locations & ideas board'],
}

export default function WelcomeWizard({ store, onOpenProject, onSkip }) {
  const [step, setStep] = useState(0)
  const [type, setType] = useState(DEFAULT_TYPE)
  const [title, setTitle] = useState('')
  const [wordTarget, setWordTarget] = useState('')
  const [busy, setBusy] = useState(false)

  const typeCfg = getProjectType(type)
  const typeIcon = TYPE_ICONS[type] || { emoji: '📖', color: '#a78bfa' }
  const highlights = WORKSPACE_HIGHLIGHTS[type] || WORKSPACE_HIGHLIGHTS.novel

  const handleCreate = () => {
    if (!title.trim() || busy) return
    setBusy(true)
    const novel = store.addNovel({
      title: title.trim(),
      type,
      wordTarget: wordTarget ? Number(wordTarget) : (typeCfg.defaultWordTarget || null),
      wordCountTarget: wordTarget ? Number(wordTarget) : (typeCfg.defaultWordTarget || null),
      enabledSections: typeCfg.defaultSections || null,
      seriesId: null,
    })
    if (novel) onOpenProject(novel.id)
  }

  return (
    <div className="wizard-backdrop" onClick={onSkip}>
      <div className="wizard-modal" onClick={e => e.stopPropagation()}>

        {/* Progress bar */}
        <div className="wizard-progress">
          {[0, 1, 2].map(i => (
            <div key={i} className={`wizard-progress-step${i <= step ? ' wizard-progress-step--done' : ''}`} />
          ))}
        </div>

        {/* Step 0 — Choose format */}
        {step === 0 && (
          <div className="wizard-step">
            <div className="wizard-header">
              <p className="wizard-eyebrow">Welcome to Your Own World</p>
              <h2 className="wizard-title">What are you working on?</h2>
              <p className="wizard-subtitle">Choose a format and we'll set up the right workspace for you.</p>
            </div>
            <div className="wizard-type-grid">
              {TYPE_OPTIONS.map(t => {
                const stage = getProjectTypeStage(t.id)
                const icon = TYPE_ICONS[t.id] || { emoji: '📖', color: '#a78bfa' }
                const selected = type === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`wizard-type-card${selected ? ' wizard-type-card--selected' : ''}`}
                    style={{ '--type-color': icon.color }}
                    onClick={() => setType(t.id)}
                  >
                    <span className="wizard-type-emoji">{icon.emoji}</span>
                    <span className="wizard-type-label">{t.label}</span>
                    {stage.stage === 'beta' && <span className="wizard-type-beta">Beta</span>}
                    <span className="wizard-type-desc">{t.description}</span>
                  </button>
                )
              })}
            </div>
            <div className="wizard-footer">
              <button className="wizard-skip-link" onClick={onSkip}>Skip for now</button>
              <button className="wizard-btn wizard-btn--primary" onClick={() => setStep(1)}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 1 — Name it */}
        {step === 1 && (
          <div className="wizard-step">
            <div className="wizard-header">
              <span className="wizard-type-badge-large" style={{ '--type-color': typeIcon.color }}>
                {typeIcon.emoji}
              </span>
              <h2 className="wizard-title">Name your {typeCfg.label.toLowerCase()}</h2>
              <p className="wizard-subtitle">You can change this any time from project settings.</p>
            </div>
            <div className="wizard-fields">
              <label className="wizard-label">
                Title
                <input
                  autoFocus
                  className="wizard-input"
                  placeholder={`My ${typeCfg.label}…`}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && title.trim() && setStep(2)}
                  maxLength={120}
                />
              </label>
              <label className="wizard-label">
                Word count target
                <input
                  className="wizard-input"
                  placeholder={typeCfg.defaultWordTarget ? typeCfg.defaultWordTarget.toLocaleString() : 'Optional'}
                  value={wordTarget}
                  onChange={e => setWordTarget(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                />
                {typeCfg.defaultWordTarget && (
                  <span className="wizard-field-hint">Default for {typeCfg.label}: {typeCfg.defaultWordTarget.toLocaleString()} words</span>
                )}
              </label>
            </div>
            <div className="wizard-footer">
              <button className="wizard-btn wizard-btn--ghost" onClick={() => setStep(0)}>← Back</button>
              <button
                className="wizard-btn wizard-btn--primary"
                disabled={!title.trim()}
                onClick={() => setStep(2)}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Ready */}
        {step === 2 && (
          <div className="wizard-step wizard-step--ready">
            <div className="wizard-ready-icon" style={{ '--type-color': typeIcon.color }}>
              {typeIcon.emoji}
            </div>
            <h2 className="wizard-title">{title || 'Your project'} is ready</h2>
            <p className="wizard-subtitle">Your workspace will include:</p>
            <ul className="wizard-highlights">
              {highlights.map(h => (
                <li key={h}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {h}
                </li>
              ))}
            </ul>
            <p className="wizard-ready-note">You can add or remove sections any time from project settings.</p>
            <div className="wizard-footer">
              <button className="wizard-btn wizard-btn--ghost" onClick={() => setStep(1)}>← Back</button>
              <button
                className="wizard-btn wizard-btn--primary wizard-btn--large"
                disabled={busy}
                onClick={handleCreate}
              >
                {busy ? 'Opening…' : 'Start writing →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
