import { useMemo, useState } from 'react'
import { useFeatureFlag } from '../../utils/useFeatureFlag'
import { runStoryCheck, KIND_ORDER, KIND_LABELS, DEFAULT_SETTINGS, RULES } from '../../utils/storyCheck'
import { navigateToFindingRef } from '../../utils/aiFindingNav'

// Plain-text markers so the kind is never conveyed by colour alone.
const KIND_MARK = { confirmed: '!', possible: '?', missing: '…', info: 'i' }
const KIND_HELP = {
  confirmed: 'The recorded facts contradict each other.',
  possible: 'Looks odd, but there can be good story reasons. Mark it intentional if so.',
  missing: 'A check could not run because a date or value is absent or unreadable.',
  info: 'Observations about the data. Not problems.',
}
const OPENABLE = new Set(['character', 'timeline', 'scene'])
const EMPTY_LIST = []
const nowMs = () => Date.now()

// Native, deterministic consistency check over structured project data. It never
// reads manuscript prose, never calls the network, and never needs an AI key.
// Hidden unless the `story_check` flag is on for the signed-in user.
export default function StoryCheckPanel({ store }) {
  const enabled = useFeatureFlag('story_check')
  const project = store?.activeProjectStats?.project
  const stats = store?.activeProjectStats
  const settings = project?.storyCheck
  const [showDismissed, setShowDismissed] = useState(false)
  const [showRules, setShowRules] = useState(false)

  const dismissed = settings?.dismissed
  const mutedRules = settings?.mutedRules || EMPTY_LIST
  const minParentGap = settings?.minParentGap
  const eras = store?.eras
  const projectId = project?.id
  const result = useMemo(() => {
    if (!enabled || !stats) return null
    return runStoryCheck(
      {
        characters: stats.characters,
        locations: stats.locations,
        timeline: stats.timeline,
        eras: (eras || EMPTY_LIST).filter(era => era.novelId === projectId),
        acts: stats.acts,
        chapters: stats.chapters,
        scenes: stats.scenes,
      },
      { dismissed, mutedRules, minParentGap },
    )
  }, [enabled, stats, eras, projectId, dismissed, mutedRules, minParentGap])

  if (!enabled || !project || !result) return null

  const save = patch => store.updateNovel?.(project.id, {
    storyCheck: { ...(settings || {}), ...patch },
  })
  const dismiss = finding => save({
    dismissed: { ...(settings?.dismissed || {}), [finding.fingerprint]: { at: nowMs(), title: finding.title } },
  })
  const restore = finding => {
    const next = { ...(settings?.dismissed || {}) }
    delete next[finding.fingerprint]
    save({ dismissed: next })
  }
  const toggleRule = ruleId => save({
    mutedRules: mutedRules.includes(ruleId) ? mutedRules.filter(id => id !== ruleId) : [...mutedRules, ruleId],
  })
  const total = result.findings.length
  const problemCount = result.counts.confirmed + result.counts.possible

  return (
    <div className="analytics-card analytics-card-wide story-check" data-testid="story-check">
      <div className="analytics-card-head">
        <span>Story Check <em className="story-check-beta">Beta</em></span>
        <strong>{problemCount}</strong>
      </div>
      <p className="story-check-intro">
        Checks your characters, timeline, eras and family links for contradictions. It runs on your device and works without any AI.
        It does not read your manuscript text.
      </p>

      <div className="story-check-scroll" tabIndex={0} role="region" aria-label="Story Check results">
      {total === 0 ? (
        <p className="analytics-empty">Nothing to report. Add birth and death years to characters and years to timeline events to give it more to check.</p>
      ) : KIND_ORDER.filter(kind => result.grouped[kind].length).map(kind => (
        <section key={kind} className="story-check-group" aria-label={`${KIND_LABELS[kind]} findings`}>
          <h4 className={`story-check-kind story-check-kind-${kind}`}>
            <span aria-hidden="true" className="story-check-mark">{KIND_MARK[kind]}</span>
            {KIND_LABELS[kind]} ({result.grouped[kind].length})
          </h4>
          <p className="story-check-kind-help">{KIND_HELP[kind]}</p>
          <ul className="story-check-list">
            {result.grouped[kind].map(finding => (
              <li key={finding.fingerprint} className="story-check-item">
                <strong>{finding.title}</strong>
                <p>{finding.explanation}</p>
                <div className="story-check-actions">
                  {finding.evidence.filter(item => OPENABLE.has(item.recordType)).map(item => (
                    <button
                      key={`${item.recordType}:${item.recordId}`}
                      type="button"
                      className="story-check-link"
                      onClick={() => navigateToFindingRef(store, { type: item.recordType, id: item.recordId })}
                    >
                      Open {item.label}
                    </button>
                  ))}
                  <button type="button" className="story-check-link" onClick={() => dismiss(finding)}>
                    {kind === 'info' ? 'Dismiss' : 'Mark intentional'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {showDismissed && (
        <ul className="story-check-list">
          {result.dismissed.map(finding => (
            <li key={finding.fingerprint} className="story-check-item">
              <strong>{finding.title}</strong>
              <p>{finding.explanation}</p>
              <button type="button" className="story-check-link" onClick={() => restore(finding)}>Show again</button>
            </li>
          ))}
        </ul>
      )}

      {showRules && (
        <div className="story-check-rules">
          {RULES.map(rule => (
            <label key={rule.id}>
              <input type="checkbox" checked={!mutedRules.includes(rule.id)} onChange={() => toggleRule(rule.id)} />
              {rule.name}
            </label>
          ))}
          <label>
            Smallest believable parent–child age gap (years)
            <input
              type="number"
              min="0"
              max="200"
              value={Number.isFinite(minParentGap) ? minParentGap : DEFAULT_SETTINGS.minParentGap}
              onChange={event => {
                const value = Math.max(0, Math.min(200, Math.round(Number(event.target.value) || 0)))
                save({ minParentGap: value })
              }}
            />
          </label>
        </div>
      )}
      </div>

      <div className="story-check-footer">
        {result.dismissed.length > 0 && (
          <button type="button" className="story-check-link" onClick={() => setShowDismissed(open => !open)} aria-expanded={showDismissed}>
            {showDismissed ? 'Hide' : 'Show'} {result.dismissed.length} dismissed or intentional
          </button>
        )}
        <button type="button" className="story-check-link" onClick={() => setShowRules(open => !open)} aria-expanded={showRules}>
          Rules{mutedRules.length ? ` (${mutedRules.length} off)` : ''}
        </button>
      </div>
    </div>
  )
}
