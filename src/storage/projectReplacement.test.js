import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from './projectStorage.js'
import { buildProjectReplacementEntries, replaceProjectStorageAtomically } from './projectReplacement.js'

describe('atomic project storage replacement', () => {
  beforeEach(() => resetStorageBackend())

  it('serializes scene prose separately and supplies complete defaults', () => {
    const trackedChanges = {
      baseContent: 'Prose',
      proposedContent: 'Revised prose',
      segments: [
        { type: 'delete', text: 'Prose' },
        { type: 'insert', text: 'Revised prose' },
      ],
      createdAt: 'now',
      updatedAt: 'now',
    }
    const entries = buildProjectReplacementEntries({
      novels: [{ id: 'novel-1' }],
      scenes: [{ id: 'scene-1', novelId: 'novel-1', title: 'Opening', content: 'Prose', trackedChanges }],
      activeNovelId: 'novel-1',
    }, { ownerId: 'user-1', writtenAt: 123 })

    expect(JSON.parse(entries.nf_scenes)).toEqual([
      { id: 'scene-1', novelId: 'novel-1', title: 'Opening', trackedChanges: { stored: true, createdAt: 'now', updatedAt: 'now' } },
    ])
    expect(entries['nf_scene_content:scene-1']).toBe('Prose')
    expect(JSON.parse(entries['nf_scene_tracked_changes:scene-1'])).toEqual(trackedChanges)
    expect(entries.nf_characters).toBe('[]')
    expect(entries.nf_activeMapByNovel).toBe('{}')
    // Version history is no longer part of the replacement payload at all —
    // it lives under its own per-scene `nf_scene_versions:<id>` keys (see
    // src/utils/sceneVersions.js) and is only ever swept, never rewritten,
    // by a replacement (see the next test).
    expect(entries.nf_scene_versions).toBeUndefined()
    expect(entries.nf_localOwner).toBe('user-1')
    expect(entries.nf_localWriteAt).toBe('123')
  })

  it('removes stale scene prose in the same backend operation', async () => {
    const backend = createMemoryBackend({
      'nf_scene_content:stale': 'old prose',
      'nf_scene_tracked_changes:stale': '{"baseContent":"old","proposedContent":"new"}',
      nf_localWriteFailed: '["nf_scenes"]',
    })
    backend.replaceItems = vi.fn(backend.replaceItems)
    setStorageBackend(backend)

    await replaceProjectStorageAtomically({
      scenes: [{ id: 'kept', content: 'new prose' }],
    }, { ownerId: 'user-1', writtenAt: 456 })

    expect(backend.replaceItems).toHaveBeenCalledOnce()
    const [, removed] = backend.replaceItems.mock.calls[0]
    expect(removed).toEqual(expect.arrayContaining(['nf_localWriteFailed', 'nf_scene_content:stale', 'nf_scene_tracked_changes:stale']))
    expect(backend.getItem('nf_scene_content:stale')).toBeNull()
    expect(backend.getItem('nf_scene_tracked_changes:stale')).toBeNull()
    expect(backend.getItem('nf_scene_content:kept')).toBe('new prose')
  })

  // Regression coverage for audit finding #16's nf_scene_versions half
  // (docs/QA_PLAN.md's Priority -1 section, 2026-09-24 fix): a scene's
  // version-history key is swept the same way a stale content key is, based
  // on whether its scene id still exists in the complete authoritative
  // dataset being written — never rewritten with the replacement's own data,
  // since version history for a *retained* scene is untouched local recovery
  // data, not something a project replacement/deletion has any business
  // regenerating.
  it('sweeps stale per-scene version-history keys, keeping retained scenes\' history untouched', async () => {
    const backend = createMemoryBackend({
      'nf_scene_versions:stale': JSON.stringify([{ id: 'v-stale', sceneId: 'stale' }]),
      'nf_scene_versions:kept': JSON.stringify([{ id: 'v-kept', sceneId: 'kept' }]),
    })
    backend.replaceItems = vi.fn(backend.replaceItems)
    setStorageBackend(backend)

    await replaceProjectStorageAtomically({
      scenes: [{ id: 'kept', content: 'new prose' }],
    }, { ownerId: 'user-1', writtenAt: 456 })

    const [, removed] = backend.replaceItems.mock.calls[0]
    expect(removed).toEqual(expect.arrayContaining(['nf_scene_versions:stale']))
    expect(removed).not.toContain('nf_scene_versions:kept')
    expect(backend.getItem('nf_scene_versions:stale')).toBeNull()
    expect(JSON.parse(backend.getItem('nf_scene_versions:kept'))).toEqual([{ id: 'v-kept', sceneId: 'kept' }])
  })

  // Regression coverage for a review finding on the fix above: a replacement
  // must fold the legacy single-blob `nf_scene_versions` key into per-scene
  // keys *before* computing its sweep, not rely on some other code path
  // having already done so. Otherwise a scene whose history is still only in
  // the legacy blob at the moment its project is deleted would be invisible
  // to the sweep (no `nf_scene_versions:<id>` key exists for it yet), and a
  // later, unrelated access to any other scene's history would migrate that
  // already-deleted scene's stale data into a freshly-orphaned key with
  // nothing left to ever clean it up.
  it('folds the legacy shared nf_scene_versions blob into per-scene keys before sweeping, even on the very first touch this session', async () => {
    const backend = createMemoryBackend({
      nf_scene_versions: JSON.stringify([
        { id: 'v-deleted', sceneId: 'deleted-scene', timestamp: 1 }, // belongs to the project being deleted right now
        { id: 'v-kept', sceneId: 'kept', timestamp: 1 }, // belongs to a retained scene
      ]),
    })
    setStorageBackend(backend)

    await replaceProjectStorageAtomically({
      scenes: [{ id: 'kept', content: 'new prose' }],
    }, { ownerId: 'user-1', writtenAt: 456 })

    // The legacy blob is gone, folded into per-scene keys...
    expect(backend.getItem('nf_scene_versions')).toBeNull()
    // ...and the deleted scene's freshly-migrated key was swept in the very
    // same operation, not left behind to be resurrected later.
    expect(backend.getItem('nf_scene_versions:deleted-scene')).toBeNull()
    expect(JSON.parse(backend.getItem('nf_scene_versions:kept'))).toEqual([{ id: 'v-kept', sceneId: 'kept', timestamp: 1 }])
  })
})
