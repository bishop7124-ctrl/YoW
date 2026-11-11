import { describe, expect, it } from 'vitest'
import {
  normalizeTension, getSceneTension, getScenePurpose, setTensionPatch, setPurposePatch, setPurposeNotePatch,
  tensionCoverage, averageTension, tensionPoints, MAX_PURPOSE_NOTE,
} from './sceneTension'

describe('tension', () => {
  it('accepts whole numbers 1 to 5 only', () => {
    expect([1, 3, 5].map(normalizeTension)).toEqual([1, 3, 5])
    expect([0, 6, 2.5, '3', null, undefined, NaN].map(normalizeTension)).toEqual([null, null, null, null, null, null, null])
    expect(getSceneTension({ tension: 4 })).toBe(4)
    expect(getSceneTension(null)).toBeNull()
  })
  it('sets, changes and clears with minimal patches', () => {
    expect(setTensionPatch({}, 3)).toEqual({ tension: 3 })
    expect(setTensionPatch({ tension: 3 }, 3)).toEqual({})
    expect(setTensionPatch({ tension: 3 }, '4')).toEqual({ tension: 4 })
    expect(setTensionPatch({ tension: 3 }, null)).toEqual({ tension: null })
    expect(setTensionPatch({ tension: 3 }, '')).toEqual({ tension: null })
    expect(setTensionPatch({}, null)).toEqual({})
    expect(setTensionPatch({ tension: 3 }, 9)).toEqual({}) // junk never overwrites a good value
  })
})

describe('purpose', () => {
  it('reads only known purposes and caps the note', () => {
    expect(getScenePurpose({ purpose: 'reveal', purposeNote: 'x'.repeat(500) })).toEqual({ key: 'reveal', note: 'x'.repeat(MAX_PURPOSE_NOTE) })
    expect(getScenePurpose({ purpose: 'bogus' })).toEqual({ key: '', note: '' })
    expect(getScenePurpose(null)).toEqual({ key: '', note: '' })
  })
  it('patches purpose and note, ignoring no-ops and unknown purposes', () => {
    expect(setPurposePatch({}, 'escalate')).toEqual({ purpose: 'escalate' })
    expect(setPurposePatch({ purpose: 'escalate' }, 'escalate')).toEqual({})
    expect(setPurposePatch({ purpose: 'escalate' }, '')).toEqual({ purpose: '' })
    expect(setPurposePatch({}, 'bogus')).toEqual({})
    expect(setPurposeNotePatch({}, 'Rowan learns the truth')).toEqual({ purposeNote: 'Rowan learns the truth' })
    expect(setPurposeNotePatch({ purposeNote: 'a' }, 'a')).toEqual({})
    expect(setPurposeNotePatch({}, 'x'.repeat(300)).purposeNote).toHaveLength(MAX_PURPOSE_NOTE)
  })
})

describe('summaries', () => {
  const scenes = [{ tension: 2 }, { tension: 4 }, {}, { tension: 9 }]
  it('counts rated scenes and averages them', () => {
    expect(tensionCoverage(scenes)).toEqual({ rated: 2, total: 4 })
    expect(tensionCoverage(null)).toEqual({ rated: 0, total: 0 })
    expect(averageTension(scenes)).toBe(3)
    expect(averageTension([{}, {}])).toBeNull()
  })
  it('places points in the middle of equally wide columns, high tension near the top, skipping unrated columns', () => {
    const points = tensionPoints([1, null, 5, 3])
    expect(points.map(p => p.index)).toEqual([0, 2, 3])
    expect(points[0]).toMatchObject({ x: 12.5, y: 90 })
    expect(points[1]).toMatchObject({ x: 62.5, y: 10 })
    expect(points[2].y).toBe(50)
    expect(tensionPoints([])).toEqual([])
  })
})
