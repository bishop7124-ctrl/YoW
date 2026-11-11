import { useFeatureFlag } from '../../utils/useFeatureFlag'
import {
  THREAD_ROLES, THREAD_ROLE_LABELS, getSceneThreadLinks, setThreadLinkPatch, removeThreadLinkPatch,
  suggestThreadsForScene, dismissThreadSuggestionPatch,
} from '../../utils/plotThreads'

// "Plot threads" for the open scene (roadmap B1): which storylines this scene serves, and how (sets up, develops,
// pays off, mentioned). Threads are created in the Outline room. Suggestions come only from characters the
// thread lists and the scene links, and nothing is added until the writer confirms it. Hidden unless the
// `plot_threads` flag is on for the signed-in user.

export default function ScenePlotThreads({ scene, onUpdateScene, threads = [] }) {
  const enabled = useFeatureFlag('plot_threads')
  if (!enabled || !scene) return null

  const links = getSceneThreadLinks(scene)
  const byId = new Map(threads.map(thread => [thread.id, thread]))
  const attached = new Set(links.map(link => link.threadId))
  const available = threads.filter(thread => thread.status !== 'dropped' && !attached.has(thread.id))
  const suggestions = suggestThreadsForScene(scene, threads)
  const apply = patch => { if (Object.keys(patch).length) onUpdateScene(scene.id, patch) }

  return (
    <div className="ms-insp-group ms-links" data-testid="scene-plot-threads">
      <div className="ms-insp-label">Plot threads <em className="ms-links-beta">Beta</em></div>

      {threads.length === 0 && links.length === 0 && (
        <p className="ms-links-note">No plot threads yet. Create them in the Outline room, under Threads.</p>
      )}

      {links.length > 0 && (
        <ul className="ms-thread-links" aria-label="Plot threads in this scene">
          {links.map(link => {
            const thread = byId.get(link.threadId)
            const name = thread?.name || 'Deleted thread'
            return (
              <li key={link.threadId} className={thread ? '' : 'is-missing'}>
                <span className="ms-thread-name">
                  <span className="ms-thread-dot" style={thread?.color ? { background: thread.color } : undefined} aria-hidden="true" />
                  {name}
                </span>
                <select
                  aria-label={`How this scene serves ${name}`}
                  value={link.role}
                  onChange={event => apply(setThreadLinkPatch(scene, link.threadId, event.target.value))}
                >
                  {THREAD_ROLES.map(role => <option key={role} value={role}>{THREAD_ROLE_LABELS[role]}</option>)}
                </select>
                <button type="button" aria-label={`Remove ${name} from this scene`} onClick={() => apply(removeThreadLinkPatch(scene, link.threadId))}>×</button>
              </li>
            )
          })}
        </ul>
      )}

      {available.length > 0 && (
        <select
          className="ms-links-add"
          aria-label="Add a plot thread…"
          value=""
          onChange={event => { if (event.target.value) apply(setThreadLinkPatch(scene, event.target.value, 'development')) }}
        >
          <option value="">Add a plot thread…</option>
          {available.map(thread => <option key={thread.id} value={thread.id}>{thread.name}</option>)}
        </select>
      )}

      {suggestions.length > 0 && (
        <div className="ms-links-suggest" aria-label="Suggested plot threads">
          <div className="ms-links-heading">Suggested from this scene's characters</div>
          <p className="ms-links-note">Nothing is added until you confirm it.</p>
          <ul>
            {suggestions.map(thread => (
              <li key={thread.id}>
                <span><strong>{thread.name}</strong> <em>(lists a character in this scene)</em></span>
                <button type="button" aria-label={`Add ${thread.name}`} onClick={() => apply(setThreadLinkPatch(scene, thread.id, 'development'))}>Add</button>
                <button type="button" aria-label={`Dismiss suggestion ${thread.name}`} onClick={() => apply(dismissThreadSuggestionPatch(scene, thread.id))}>Dismiss</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
