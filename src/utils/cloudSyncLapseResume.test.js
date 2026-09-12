import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage'
import { reconcileCloudSyncData } from './cloudSyncReconcile'
import { persistReviewedCloudSyncResume } from './cloudSyncResume'
import {
  clearDesktopLapseSnapshot,
  loadDesktopLapseSnapshot,
  saveDesktopLapseSnapshot,
} from './storageMode'

// These tests exercise the same pipeline App.jsx's automatic
// resume-on-renewal effect runs: capture a base snapshot when a desktop
// account's hosting lapses (`saveDesktopLapseSnapshot`), then — once
// `membership.isLocalMode` clears again — three-way-merge the local state
// against fresh cloud data using that base (`reconcileCloudSyncData`) and
// persist the reviewed result (`persistReviewedCloudSyncResume`). Unlike the
// individual unit tests for each piece, this proves the composition actually
// closes the gap: a web-only edit made while this device was lapsed must
// survive, and a genuine same-field clash must be surfaced, not silently
// dropped either direction.

beforeEach(() => {
  setStorageBackend(createMemoryBackend())
})

afterEach(() => {
  resetStorageBackend()
})

function runAutoResume({ base, local, cloud }) {
  const { mergedData, conflicts } = reconcileCloudSyncData(local, cloud, base)
  return persistReviewedCloudSyncResume('user-1', mergedData, {
    replaceUserData: () => Promise.resolve(),
    loadUserData: () => Promise.resolve(mergedData),
    trackSync: promise => promise,
  }).then(reviewedData => ({ reviewedData, conflicts }))
}

describe('automatic cloud-sync resume-on-renewal reconcile', () => {
  it('captures a base snapshot exactly once when hosting lapses', () => {
    const atLapseStart = { novels: [{ id: 'project-1', title: 'Project' }] }
    const laterInTheLapse = { novels: [{ id: 'project-1', title: 'Edited while still lapsed' }] }

    expect(saveDesktopLapseSnapshot('user-1', atLapseStart)).toBe(true)
    // A second "lapse began" signal (e.g. a membership refetch flicker)
    // before the first one is ever consumed must not clobber the real base.
    expect(saveDesktopLapseSnapshot('user-1', laterInTheLapse)).toBe(false)
    expect(loadDesktopLapseSnapshot('user-1')).toEqual(atLapseStart)
  })

  it('survives a cloud-only (web) edit made while this device was lapsed', async () => {
    const base = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Antagonist', notes: 'original' }],
    }
    // Nothing changed on this device during the lapse (it was closed/idle).
    const local = base
    // The account kept syncing on the web (Free-cloud-fallback) during the
    // lapse and picked up a real edit there.
    const cloud = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Antagonist', notes: 'edited on web during the lapse' }],
    }

    const { reviewedData, conflicts } = await runAutoResume({ base, local, cloud })

    expect(conflicts).toEqual([])
    expect(reviewedData.characters[0].notes).toBe('edited on web during the lapse')
  })

  it('surfaces a genuine same-field conflict instead of silently picking a side', async () => {
    const base = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Antagonist', notes: 'original' }],
    }
    const local = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Antagonist', notes: 'edited on this device before it lapsed' }],
    }
    const cloud = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Antagonist', notes: 'edited on web during the lapse' }],
    }

    const { conflicts } = await runAutoResume({ base, local, cloud })

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      table: 'characters',
      recordId: 'char-1',
      source: 'cloud-sync-resume',
    })
    expect(conflicts[0].fields.some(f => f.key === 'notes')).toBe(true)
  })

  it('is a no-op for the normal single-device case (no web activity during the lapse)', async () => {
    const data = {
      novels: [{ id: 'project-1', title: 'Project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Antagonist', notes: 'unchanged' }],
    }

    const { reviewedData, conflicts } = await runAutoResume({ base: data, local: data, cloud: data })

    expect(conflicts).toEqual([])
    expect(reviewedData.characters).toEqual(data.characters)
  })

  it('consumes the lapse snapshot once the resume completes', async () => {
    const base = { novels: [{ id: 'project-1', title: 'Project' }] }
    saveDesktopLapseSnapshot('user-1', base)

    await runAutoResume({ base, local: base, cloud: base })
    clearDesktopLapseSnapshot('user-1')

    expect(loadDesktopLapseSnapshot('user-1')).toBeNull()
    // A later lapse can now capture its own fresh base.
    expect(saveDesktopLapseSnapshot('user-1', { novels: [{ id: 'project-1', title: 'Next lapse' }] })).toBe(true)
  })
})
