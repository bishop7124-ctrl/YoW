import { describe, expect, it } from 'vitest'
import { clearJourneyLinks, moveJourneyBeat, normalizeJourney, upsertJourneyBeat } from './characterJourney'

describe('character journey helpers', () => {
  it('gives missing and duplicate legacy beat IDs stable, collision-safe identities without mutation', () => {
    const source = { fear: 0, beats: [{ title: 42 }, { id: 'legacy-beat-0' }, { id: 'duplicate' }, { id: 'duplicate' }, { id: '', title: null }] }
    const before = structuredClone(source)
    const first = normalizeJourney(source)
    expect(first).toEqual(normalizeJourney(source))
    expect(normalizeJourney(first)).toEqual(first)
    expect(new Set(first.beats.map(beat => beat.id)).size).toBe(5)
    expect(first.beats[0].title).toBe('42')
    expect(first.fear).toBe('0')
    expect(source).toEqual(before)
    expect(moveJourneyBeat(first, first.beats[0].id, 1).beats[1].title).toBe('42')
  })
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
