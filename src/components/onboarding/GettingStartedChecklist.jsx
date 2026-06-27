import { useEffect } from 'react'

function CheckIcon({ done }) {
  return (
    <span className={`gs-check${done ? ' gs-check--done' : ''}`}>
      {done
        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : null}
    </span>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildMilestones({ allProjectStats, characters, loreEntries, locations, hasExported, onCreateProject }) {
  return [
    {
      id: 'create_project',
      label: 'Create your first project',
      hint: 'Pick a format and give it a name.',
      done: allProjectStats.length > 0,
      action: allProjectStats.length === 0 ? { label: 'New project', onClick: onCreateProject } : null,
    },
    {
      id: 'write_scene',
      label: 'Write your first scene',
      hint: 'Open a project and start drafting in the Manuscript.',
      done: allProjectStats.some(s => s.manuscriptWords > 0),
    },
    {
      id: 'add_character',
      label: 'Add a character',
      hint: 'Visit the Characters section inside any project.',
      done: (characters ?? []).some(c => !c.syncDeleted),
    },
    {
      id: 'build_world',
      label: 'Build your world',
      hint: 'Add a location, lore entry, or timeline event.',
      done: (loreEntries ?? []).some(e => !e.syncDeleted) || (locations ?? []).some(l => !l.syncDeleted),
    },
    {
      id: 'export',
      label: 'Export your project',
      hint: 'Download a Word doc, PDF, or backup ZIP.',
      done: hasExported,
    },
  ]
}

// Full-list modal
export default function GettingStartedChecklist({ milestones, onClose, onDismiss }) {
  const doneCount = milestones.filter(m => m.done).length
  const allDone = doneCount === milestones.length
  const pct = Math.round((doneCount / milestones.length) * 100)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="gs-modal-backdrop" onClick={onClose}>
      <div className="gs-modal" onClick={e => e.stopPropagation()}>
        <div className="gs-modal-header">
          <div>
            <p className="gs-modal-eyebrow">Getting started</p>
            <p className="gs-modal-progress-label">{doneCount} of {milestones.length} complete</p>
          </div>
          <button className="gs-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="gs-modal-bar">
          <div className="gs-modal-bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <ul className="gs-modal-list">
          {milestones.map(m => (
            <li key={m.id} className={`gs-modal-item${m.done ? ' gs-modal-item--done' : ''}`}>
              <CheckIcon done={m.done} />
              <div className="gs-item-copy">
                <span className="gs-item-label">{m.label}</span>
                {!m.done && <span className="gs-item-hint">{m.hint}</span>}
              </div>
              {m.action && !m.done && (
                <button className="gs-item-action" onClick={() => { m.action.onClick(); onClose() }}>
                  {m.action.label}
                </button>
              )}
            </li>
          ))}
        </ul>

        {allDone ? (
          <div className="gs-modal-footer gs-modal-footer--done">
            <span>🎉 You're all set — happy writing!</span>
            <button className="gs-dismiss-text" onClick={onDismiss}>Dismiss</button>
          </div>
        ) : (
          <div className="gs-modal-footer">
            <button className="gs-dismiss-text" onClick={onDismiss}>Don't show again</button>
          </div>
        )}
      </div>
    </div>
  )
}

// Compact inline widget for the snapshot bar
export function GettingStartedSnippet({ milestones, onOpen }) {
  const doneCount = milestones.filter(m => m.done).length
  const total = milestones.length
  const nextStep = milestones.find(m => !m.done)
  const allDone = doneCount === total
  const pct = Math.round((doneCount / total) * 100)

  return (
    <button className="gs-snippet" onClick={onOpen} type="button">
      <div className="gs-snippet-top">
        <span className="gs-snippet-label">Getting started</span>
        <span className="gs-snippet-count">{doneCount}/{total}</span>
      </div>
      <div className="gs-snippet-bottom">
        {!allDone && nextStep && (
          <span className="gs-snippet-next">Next: {nextStep.label}</span>
        )}
        {allDone && (
          <span className="gs-snippet-next gs-snippet-next--done">All steps complete ✓</span>
        )}
        <div className="gs-snippet-bar">
          <div className="gs-snippet-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </button>
  )
}
