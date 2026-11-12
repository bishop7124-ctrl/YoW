import { useEffect, useMemo, useState } from 'react'
import { useFeatureFlag } from '../../utils/useFeatureFlag'
import {
  TIME_SHIFTS, getSceneLinks, suggestSceneLinks, countSuggestions, addLinkPatch, removeLinkPatch,
  dismissSuggestionPatch, setPovPatch, sceneStoryYear, parseStoryYearInput,
} from '../../utils/sceneLinks'
import { formatTimelineDate } from '../../utils/timelineYear'

// "Story links" for the open scene (roadmap A4): who is in it, where, which events it shows, and when in the
// story it happens. Suggestions come from names in the scene text and are only ever applied when the writer
// confirms them. Hidden unless the `scene_links` flag is on for the signed-in user.

const GROUPS = [
  { type: 'character', field: 'characterIds', label: 'Characters', addLabel: 'Add a character…' },
  { type: 'location', field: 'locationIds', label: 'Locations', addLabel: 'Add a location…' },
  { type: 'timeline', field: 'timelineEventIds', label: 'Timeline events', addLabel: 'Add an event…' },
]
// Release C (C1d): what else a scene can be about. Offered only while the `connected_refs` flag is on.
const EXTRA_GROUPS = [
  { type: 'lore', field: 'loreIds', label: 'Lore', addLabel: 'Add a lore entry…' },
  { type: 'faction', field: 'factionIds', label: 'Factions', addLabel: 'Add a faction…' },
  { type: 'history', field: 'historyEntryIds', label: 'History', addLabel: 'Add a history entry…' },
]
const TYPE_WORDS = { timeline: 'event', history: 'history entry', lore: 'lore entry' }
const typeWord = type => TYPE_WORDS[type] || type
const nameOf = record => record?.name || record?.title || 'Untitled'
const SUGGEST_DELAY_MS = 1200

// Scanning the whole scene for every character, place and event on each keystroke would compete with typing,
// so suggestions follow the prose a moment after the writer pauses. Link changes still update immediately.
function useSettledValue(value, delay) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

export default function SceneLinksPanel({ scene, onUpdateScene, characters = [], locations = [], timeline = [], loreEntries = [], factions = [], worldHistory = [] }) {
  const enabled = useFeatureFlag('scene_links')
  const connectedRefs = useFeatureFlag('connected_refs')
  const links = getSceneLinks(scene)
  const lists = { character: characters, location: locations, timeline, lore: loreEntries, faction: factions, history: worldHistory }
  const groups = connectedRefs ? [...GROUPS, ...EXTRA_GROUPS] : GROUPS
  const byId = useMemo(() => ({
    character: new Map(characters.map(item => [item.id, item])),
    location: new Map(locations.map(item => [item.id, item])),
    timeline: new Map(timeline.map(item => [item.id, item])),
    lore: new Map(loreEntries.map(item => [item.id, item])),
    faction: new Map(factions.map(item => [item.id, item])),
    history: new Map(worldHistory.map(item => [item.id, item])),
  }), [characters, locations, timeline, loreEntries, factions, worldHistory])
  const settledContent = useSettledValue(scene?.content, SUGGEST_DELAY_MS)
  const suggestions = useMemo(
    () => (enabled && scene ? suggestSceneLinks({ ...scene, content: settledContent }, { characters, locations, timeline, ...(connectedRefs ? { lore: loreEntries, factions, history: worldHistory } : {}) }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, connectedRefs, scene?.id, settledContent, scene?.title, scene?.synopsis, scene?.notes, scene?.characterIds, scene?.locationIds, scene?.timelineEventIds, scene?.loreIds, scene?.factionIds, scene?.historyEntryIds, scene?.dismissedLinks, scene?.pov, scene?.locationTag, scene?.povCharacterId, characters, locations, timeline, loreEntries, factions, worldHistory],
  )
  const shownYear = links.storyYear === null ? '' : String(links.storyYear)
  const [yearState, setYearState] = useState({ from: shownYear, text: shownYear, dirty: false })
  const [yearError, setYearError] = useState('')
  // Follow the saved year (undo, another tab, a restore) unless the writer is mid-edit in the box.
  if (yearState.from !== shownYear && !yearState.dirty) setYearState({ from: shownYear, text: shownYear, dirty: false })
  const yearDraft = yearState.text
  if (!enabled || !scene) return null

  const apply = patch => { if (Object.keys(patch).length) onUpdateScene(scene.id, patch) }
  const derivedYear = links.storyYear === null ? sceneStoryYear(scene, byId.timeline) : null
  const acceptAll = () => {
    let draft = { ...scene }
    const merged = {}
    const take = patch => { Object.assign(merged, patch); draft = { ...draft, ...patch } }
    if (suggestions.pov) take(setPovPatch(draft, suggestions.pov.id))
    // Events are left out: linking one sets the scene's story year, so each is added on purpose.
    ;[...suggestions.characters, ...suggestions.locations].forEach(item => take(addLinkPatch(draft, item.type, item.id)))
    apply(merged)
  }
  const commitYear = () => {
    if (!yearState.dirty) return // nothing typed: never write a stale box value over the saved year
    const parsed = parseStoryYearInput(yearDraft)
    if (!parsed.ok) { setYearError('Use a year such as 40, Year 40 or 300 BC.'); return }
    setYearError('')
    const text = parsed.value === null ? '' : String(parsed.value)
    setYearState({ from: text, text, dirty: false })
    if (parsed.value !== links.storyYear) apply({ storyYear: parsed.value })
  }

  return (
    <div className="ms-insp-group ms-links" data-testid="scene-links">
      <div className="ms-insp-label">Story links <em className="ms-links-beta">Beta</em></div>

      <label className="ms-insp-field">
        <span>Point-of-view character</span>
        <select value={links.povCharacterId || ''} onChange={event => apply(setPovPatch(scene, event.target.value))}>
          <option value="">Not set</option>
          {characters.map(character => <option key={character.id} value={character.id}>{nameOf(character)}</option>)}
        </select>
      </label>

      {groups.map(group => {
        const ids = links[group.field]
        const available = lists[group.type].filter(record => record?.id && !ids.includes(record.id))
        return (
          <div key={group.type} className="ms-links-group">
            <div className="ms-links-heading">{group.label}</div>
            {ids.length > 0 && (
              <div className="ms-insp-row" role="list" aria-label={`${group.label} in this scene`}>
                {ids.map(id => {
                  const record = byId[group.type].get(id)
                  return (
                    <span key={id} role="listitem" className={`ms-link-chip${record ? '' : ' is-missing'}`}>
                      {record ? nameOf(record) : `Deleted ${typeWord(group.type)}`}
                      <button type="button" aria-label={`Remove ${record ? nameOf(record) : 'deleted link'} from this scene`} onClick={() => apply(removeLinkPatch(scene, group.type, id))}>×</button>
                    </span>
                  )
                })}
              </div>
            )}
            {available.length > 0 && (
              <select
                className="ms-links-add"
                aria-label={group.addLabel}
                value=""
                onChange={event => { if (event.target.value) apply(addLinkPatch(scene, group.type, event.target.value)) }}
              >
                <option value="">{group.addLabel}</option>
                {available.map(record => <option key={record.id} value={record.id}>{nameOf(record)}</option>)}
              </select>
            )}
          </div>
        )
      })}

      {suggestions && countSuggestions(suggestions) > 0 && (
        <div className="ms-links-suggest" aria-label="Suggested links">
          <div className="ms-links-heading">Suggested from your text</div>
          <p className="ms-links-note">Nothing is added until you confirm it.</p>
          <ul>
            {suggestions.pov && (
              <li>
                <span>Point of view: <strong>{suggestions.pov.name}</strong> <em>({suggestions.pov.reason})</em></span>
                <button type="button" onClick={() => apply(setPovPatch(scene, suggestions.pov.id))}>Use</button>
                <button type="button" aria-label={`Dismiss suggestion ${suggestions.pov.name}`} onClick={() => apply(dismissSuggestionPatch(scene, 'pov', suggestions.pov.id))}>Dismiss</button>
              </li>
            )}
            {[...suggestions.characters, ...suggestions.locations, ...suggestions.events, ...suggestions.lore, ...suggestions.factions, ...suggestions.history].map(item => (
              <li key={`${item.type}:${item.id}`}>
                <span><strong>{item.name}</strong> <em>({typeWord(item.type)}; {item.reason.toLowerCase()})</em></span>
                <button type="button" aria-label={`Add ${item.name}`} onClick={() => apply(addLinkPatch(scene, item.type, item.id))}>Add</button>
                <button type="button" aria-label={`Dismiss suggestion ${item.name}`} onClick={() => apply(dismissSuggestionPatch(scene, item.type, item.id))}>Dismiss</button>
              </li>
            ))}
          </ul>
          {countSuggestions(suggestions) > 1 && <button type="button" className="ms-links-all" onClick={acceptAll}>Add all suggestions</button>}
        </div>
      )}

      <div className="ms-links-group">
        <div className="ms-links-heading">When in the story</div>
        <label className="ms-insp-field">
          <span>Story year</span>
          <input
            value={yearDraft}
            inputMode="text"
            placeholder={derivedYear !== null ? `From linked events: ${formatTimelineDate({ startYear: derivedYear })}` : 'e.g. 40 or 300 BC'}
            aria-invalid={yearError ? 'true' : undefined}
            onChange={event => { setYearState(state => ({ ...state, text: event.target.value, dirty: true })); setYearError('') }}
            onBlur={commitYear}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
          />
        </label>
        {yearError && <p className="ms-links-error" role="alert">{yearError}</p>}
        <label className="ms-insp-field">
          <span>Order in the story</span>
          <select value={links.timeShift || ''} onChange={event => apply({ timeShift: event.target.value || null })}>
            {TIME_SHIFTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
