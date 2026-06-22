export const ARC_TYPE_OPTIONS = [
  'Positive Change',
  'Negative Change',
  'Flat Arc',
  'Fall Arc',
  'Redemption Arc',
  'Corruption Arc',
  'Custom',
]

export const STORY_PHASE_OPTIONS = [
  'Beginning',
  'Inciting Incident',
  'First Act Turn',
  'Midpoint',
  'Crisis',
  'Climax',
  'Resolution',
  'Custom',
]

export const EMPTY_JOURNEY = {
  arcType: 'Positive Change',
  scope: 'project',
  startingState: '',
  endingState: '',
  coreWound: '',
  fear: '',
  lieBelieved: '',
  truthLearned: '',
  want: '',
  need: '',
  fatalFlaw: '',
  strength: '',
  internalConflict: '',
  externalConflict: '',
  beginningBelief: '',
  endingBelief: '',
  beginningGoal: '',
  endingGoal: '',
  beginningFear: '',
  endingFear: '',
  beginningRelationships: '',
  endingRelationships: '',
  notes: '',
  beats: [],
}

export const createJourneyId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export function normalizeJourney(journey) {
  const value = journey && typeof journey === 'object' ? journey : {}
  const beats = Array.isArray(value.beats) ? value.beats : []
  return {
    ...EMPTY_JOURNEY,
    ...value,
    beats: beats
      .filter(beat => beat && typeof beat === 'object')
      .map((beat, index) => ({
        id: beat.id || createJourneyId(),
        title: '',
        description: '',
        storyPhase: 'Beginning',
        customPhase: '',
        emotionalState: '',
        belief: '',
        goal: '',
        conflict: '',
        choiceMade: '',
        consequence: '',
        timelineEventId: '',
        chapterId: '',
        sceneId: '',
        linkedCharacterId: '',
        isMajorTurningPoint: false,
        ...beat,
        sortOrder: Number.isFinite(beat.sortOrder) ? beat.sortOrder : index,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((beat, index) => ({ ...beat, sortOrder: index })),
  }
}

export function hasJourneyContent(journey) {
  const value = normalizeJourney(journey)
  return value.beats.length > 0 || Object.entries(value).some(([key, field]) => (
    !['arcType', 'scope', 'beats', 'createdAt', 'updatedAt'].includes(key) && Boolean(String(field || '').trim())
  ))
}

export function upsertJourneyBeat(journey, beat) {
  const value = normalizeJourney(journey)
  const now = new Date().toISOString()
  const nextBeat = {
    ...beat,
    id: beat.id || createJourneyId(),
    createdAt: beat.createdAt || now,
    updatedAt: now,
  }
  const exists = value.beats.some(item => item.id === nextBeat.id)
  const beats = exists
    ? value.beats.map(item => item.id === nextBeat.id ? nextBeat : item)
    : [...value.beats, { ...nextBeat, sortOrder: value.beats.length }]
  return normalizeJourney({ ...value, beats, updatedAt: now, createdAt: value.createdAt || now })
}

export function removeJourneyBeat(journey, beatId) {
  const value = normalizeJourney(journey)
  return normalizeJourney({
    ...value,
    beats: value.beats.filter(beat => beat.id !== beatId),
    updatedAt: new Date().toISOString(),
  })
}

export function moveJourneyBeat(journey, beatId, direction) {
  const value = normalizeJourney(journey)
  const index = value.beats.findIndex(beat => beat.id === beatId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= value.beats.length) return value
  const beats = [...value.beats]
  ;[beats[index], beats[target]] = [beats[target], beats[index]]
  return normalizeJourney({ ...value, beats: beats.map((beat, beatIndex) => ({ ...beat, sortOrder: beatIndex })), updatedAt: new Date().toISOString() })
}

export function clearJourneyLinks(journey, { timelineEventIds = [], chapterIds = [], sceneIds = [], characterIds = [] }) {
  const value = normalizeJourney(journey)
  const timelineSet = new Set(timelineEventIds)
  const chapterSet = new Set(chapterIds)
  const sceneSet = new Set(sceneIds)
  const characterSet = new Set(characterIds)
  return {
    ...value,
    beats: value.beats.map(beat => ({
      ...beat,
      timelineEventId: timelineSet.has(beat.timelineEventId) ? '' : beat.timelineEventId,
      chapterId: chapterSet.has(beat.chapterId) ? '' : beat.chapterId,
      sceneId: sceneSet.has(beat.sceneId) ? '' : beat.sceneId,
      linkedCharacterId: characterSet.has(beat.linkedCharacterId) ? '' : beat.linkedCharacterId,
    })),
  }
}
