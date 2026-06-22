import { describe, expect, it } from 'vitest'
import { clearJourneyLinks, moveJourneyBeat, normalizeJourney, upsertJourneyBeat } from './characterJourney'

describe('character journey helpers', () => {
  it('normalizes and orders beats', () => {
    const journey = normalizeJourney({ beats: [{ id: 'b', sortOrder: 2 }, { id: 'a', sortOrder: 0 }] })
    expect(journey.beats.map(beat => beat.id)).toEqual(['a', 'b'])
    expect(journey.beats.map(beat => beat.sortOrder)).toEqual([0, 1])
  })

  it('adds, updates, and moves beats', () => {
    let journey = upsertJourneyBeat({}, { id: 'a', title: 'Opening' })
    journey = upsertJourneyBeat(journey, { id: 'b', title: 'Climax' })
    journey = moveJourneyBeat(journey, 'b', -1)
    expect(journey.beats.map(beat => beat.id)).toEqual(['b', 'a'])
    journey = upsertJourneyBeat(journey, { ...journey.beats[0], title: 'Crisis' })
    expect(journey.beats[0].title).toBe('Crisis')
  })

  it('clears deleted record links without deleting beats', () => {
    const journey = clearJourneyLinks({ beats: [{ id: 'a', timelineEventId: 'event', sceneId: 'scene', linkedCharacterId: 'char' }] }, {
      timelineEventIds: ['event'], sceneIds: ['scene'], characterIds: ['char'],
    })
    expect(journey.beats).toHaveLength(1)
    expect(journey.beats[0]).toMatchObject({ timelineEventId: '', sceneId: '', linkedCharacterId: '' })
  })
})
