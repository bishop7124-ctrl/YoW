import { useState } from 'react'
import { StudioButton, StudioEmpty, StudioNote } from '../presentation/Studio'
import CharacterJourneyForm from './CharacterJourneyForm'
import JourneyBeatModal from './JourneyBeatModal'
import { hasJourneyContent, moveJourneyBeat, normalizeJourney, removeJourneyBeat, upsertJourneyBeat } from '../../utils/characterJourney'

const overviewFields = [
  ['startingState', 'Starting state'], ['endingState', 'Ending state'], ['coreWound', 'Core wound'], ['fear', 'Core fear'],
  ['lieBelieved', 'Lie believed'], ['truthLearned', 'Truth to learn'], ['want', 'Want'], ['need', 'Need'],
  ['fatalFlaw', 'Fatal flaw'], ['strength', 'Strength'], ['internalConflict', 'Internal conflict'], ['externalConflict', 'External conflict'],
]

const comparisons = [
  ['Belief', 'beginningBelief', 'endingBelief', 'lieBelieved', 'truthLearned'],
  ['Goal', 'beginningGoal', 'endingGoal', 'want', 'need'],
  ['Fear', 'beginningFear', 'endingFear', 'fear', ''],
  ['Relationship to self & others', 'beginningRelationships', 'endingRelationships', '', ''],
]

function Value({ children, fallback = 'Not mapped yet' }) {
  return <p className={children ? 'whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-main)]' : 'text-sm italic text-[var(--text-muted)]'}>{children || fallback}</p>
}

export default function CharacterJourney({ character, characters, timeline, chapters, scenes, onSave }) {
  const journey = normalizeJourney(character.journey)
  const [showJourneyForm, setShowJourneyForm] = useState(false)
  const [beatTarget, setBeatTarget] = useState(undefined)
  const [expanded, setExpanded] = useState(() => new Set())

  const saveJourney = value => {
    onSave({ journey: { ...normalizeJourney(value), updatedAt: new Date().toISOString(), createdAt: value.createdAt || new Date().toISOString() } })
    setShowJourneyForm(false)
  }
  const saveBeat = beat => {
    saveJourney(upsertJourneyBeat(journey, beat))
    setBeatTarget(undefined)
  }
  const deleteBeat = beatId => {
    if (!confirm('Delete this journey beat?')) return
    saveJourney(removeJourneyBeat(journey, beatId))
  }
  const moveBeat = (beatId, direction) => saveJourney(moveJourneyBeat(journey, beatId, direction))
  const toggle = beatId => setExpanded(current => {
    const next = new Set(current)
    if (next.has(beatId)) next.delete(beatId)
    else next.add(beatId)
    return next
  })
  const lookup = (items, id, fallback) => items.find(item => item.id === id)?.title || items.find(item => item.id === id)?.name || fallback

  if (!hasJourneyContent(journey)) {
    return (
      <div className="lg:col-span-2">
        <StudioEmpty
          title="Map how this character changes across your story."
          body="Name what they believe, what the story asks of them, and the choices that turn them into someone new—or reveal who they have always been."
          action={<StudioButton tone="primary" className="mt-4" onClick={() => setShowJourneyForm(true)}>Begin the journey</StudioButton>}
        />
        {showJourneyForm && <CharacterJourneyForm character={character} onSave={saveJourney} onClose={() => setShowJourneyForm(false)} />}
      </div>
    )
  }

  return (
    <div className="lg:col-span-2 space-y-6">
      <StudioNote>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap gap-2"><span className="chip chip-accent">{journey.arcType}</span><span className="chip">{journey.scope === 'series' ? 'Series-spanning journey' : 'This project'}</span></div>
            <h2 className="font-serif text-2xl text-[var(--text-main)]">The shape of the change</h2>
            <p className="text-sm text-[var(--text-muted)]">The emotional engine beneath {character.name}’s plot.</p>
          </div>
          <StudioButton tone="secondary" size="sm" onClick={() => setShowJourneyForm(true)}>Edit overview</StudioButton>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {overviewFields.map(([field, label]) => journey[field] ? (
            <div key={field} className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/45 p-3">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
              <Value>{journey[field]}</Value>
            </div>
          ) : null)}
        </div>
        {journey.notes && <div className="mt-4 border-t border-[var(--border)] pt-4"><span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Journey notes</span><Value>{journey.notes}</Value></div>}
      </StudioNote>

      <StudioNote>
        <h2 className="font-serif text-xl text-[var(--text-main)]">Before & after</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">A quick view of the distance travelled.</p>
        <div className="space-y-3">
          {comparisons.map(([label, beforeKey, afterKey, beforeFallback, afterFallback]) => (
            <div key={label} className="grid gap-2 rounded-xl border border-[var(--border)] p-3 md:grid-cols-[130px_1fr_28px_1fr] md:items-center">
              <strong className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{label}</strong>
              <div><span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Beginning</span><Value>{journey[beforeKey] || journey[beforeFallback]}</Value></div>
              <span className="hidden text-center text-[var(--accent)] md:block">→</span>
              <div><span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Ending</span><Value>{journey[afterKey] || journey[afterFallback]}</Value></div>
            </div>
          ))}
        </div>
      </StudioNote>

      <StudioNote>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-serif text-xl text-[var(--text-main)]">Journey beats</h2><p className="text-xs text-[var(--text-muted)]">The choices and turning points that earn the change.</p></div>
          <StudioButton tone="primary" size="sm" onClick={() => setBeatTarget(null)}>Add beat</StudioButton>
        </div>
        {journey.beats.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
            <p className="text-sm text-[var(--text-main)]">No turning points mapped yet.</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Begin with the moment their old way of seeing the world is challenged.</p>
          </div>
        ) : (
          <ol className="relative ml-3 border-l border-[var(--accent)]/35 pl-6">
            {journey.beats.map((beat, index) => {
              const isOpen = expanded.has(beat.id)
              const phase = beat.storyPhase === 'Custom' ? beat.customPhase || 'Custom phase' : beat.storyPhase
              const links = [
                beat.timelineEventId && `Timeline: ${lookup(timeline, beat.timelineEventId, 'Missing event')}`,
                beat.chapterId && `Chapter: ${lookup(chapters, beat.chapterId, 'Missing chapter')}`,
                beat.sceneId && `Scene: ${lookup(scenes, beat.sceneId, 'Missing scene')}`,
                beat.linkedCharacterId && `Character: ${lookup(characters, beat.linkedCharacterId, 'Missing character')}`,
              ].filter(Boolean)
              return (
                <li key={beat.id} className="relative pb-5 last:pb-0">
                  <span className={`absolute -left-[31px] top-4 h-3 w-3 rounded-full border-2 border-[var(--surface)] ${beat.isMajorTurningPoint ? 'bg-[var(--accent)] ring-4 ring-[var(--accent-fade)]' : 'bg-[var(--text-muted)]'}`} />
                  <article className={`rounded-xl border p-4 ${beat.isMajorTurningPoint ? 'border-[var(--accent)]/55 bg-[var(--accent-fade)]/30' : 'border-[var(--border)]'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => toggle(beat.id)}>
                        <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-[10px] uppercase tracking-widest text-[var(--accent)]">{phase}</span>{beat.isMajorTurningPoint && <span className="chip chip-accent">Turning point</span>}</div>
                        <h3 className="font-serif text-lg text-[var(--text-main)]">{beat.title}</h3>
                        {beat.emotionalState && <p className="text-xs text-[var(--text-muted)]">Feeling: {beat.emotionalState}</p>}
                      </button>
                      <div className="flex gap-1">
                        <button type="button" aria-label="Move beat earlier" disabled={index === 0} onClick={() => moveBeat(beat.id, -1)} className="chip disabled:opacity-30">↑</button>
                        <button type="button" aria-label="Move beat later" disabled={index === journey.beats.length - 1} onClick={() => moveBeat(beat.id, 1)} className="chip disabled:opacity-30">↓</button>
                        <button type="button" onClick={() => setBeatTarget(beat)} className="chip">Edit</button>
                        <button type="button" onClick={() => deleteBeat(beat.id)} className="chip">Delete</button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 md:grid-cols-2">
                        {[
                          ['What happens', beat.description], ['Belief', beat.belief], ['Goal', beat.goal], ['Conflict', beat.conflict], ['Choice', beat.choiceMade], ['Consequence', beat.consequence],
                        ].filter(([, value]) => value).map(([label, value]) => <div key={label}><span className="mb-1 block text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</span><Value>{value}</Value></div>)}
                        {links.length > 0 && <div className="md:col-span-2 flex flex-wrap gap-1 border-t border-[var(--border)] pt-3">{links.map(link => <span key={link} className="chip">{link}</span>)}</div>}
                      </div>
                    )}
                  </article>
                </li>
              )
            })}
          </ol>
        )}
      </StudioNote>

      {showJourneyForm && <CharacterJourneyForm character={character} onSave={saveJourney} onClose={() => setShowJourneyForm(false)} />}
      {beatTarget !== undefined && <JourneyBeatModal beat={beatTarget} character={character} characters={characters} timeline={timeline} chapters={chapters} scenes={scenes} onSave={saveBeat} onClose={() => setBeatTarget(undefined)} />}
    </div>
  )
}
