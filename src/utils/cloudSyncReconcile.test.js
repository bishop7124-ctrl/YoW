import { describe, expect, it } from 'vitest'
import { reconcileCloudSyncData } from './cloudSyncReconcile'

const options = { now: 123, conflictId: () => 'conflict-1' }

describe('reconcileCloudSyncData', () => {
  it('merges local-only and cloud-only edits when Cloud Sync resumes', () => {
    const base = {
      novels: [{ id: 'project-1', title: 'Base project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Base' }],
    }
    const local = {
      ...base,
      characters: [
        { id: 'char-1', novelId: 'project-1', name: 'Local' },
        { id: 'char-local', novelId: 'project-1', name: 'Local only' },
      ],
    }
    const cloud = {
      ...base,
      locations: [{ id: 'loc-cloud', novelId: 'project-1', name: 'Cloud only' }],
    }

    const { mergedData, conflicts } = reconcileCloudSyncData(local, cloud, base, options)

    expect(conflicts).toHaveLength(0)
    expect(mergedData.characters).toEqual([
      { id: 'char-1', novelId: 'project-1', name: 'Local' },
      { id: 'char-local', novelId: 'project-1', name: 'Local only' },
    ])
    expect(mergedData.locations).toEqual([
      { id: 'loc-cloud', novelId: 'project-1', name: 'Cloud only' },
    ])
  })

  it('merges different fields on the same record without a conflict', () => {
    const base = {
      novels: [{ id: 'project-1', title: 'Base project' }],
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Alice', role: 'Base role', bio: 'Base bio' }],
    }
    const local = {
      ...base,
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Alice', role: 'Local role', bio: 'Base bio' }],
    }
    const cloud = {
      ...base,
      characters: [{ id: 'char-1', novelId: 'project-1', name: 'Alice', role: 'Base role', bio: 'Cloud bio' }],
    }

    const { mergedData, conflicts } = reconcileCloudSyncData(local, cloud, base, options)

    expect(conflicts).toHaveLength(0)
    expect(mergedData.characters[0]).toMatchObject({ role: 'Local role', bio: 'Cloud bio' })
  })

  it('keeps the device version and queues a review conflict when the same field changed locally and in cloud', () => {
    const base = {
      novels: [{ id: 'project-1', title: 'Base project' }],
      scenes: [{ id: 'scene-1', novelId: 'project-1', title: 'Scene', content: 'Base text' }],
    }
    const local = {
      ...base,
      scenes: [{ id: 'scene-1', novelId: 'project-1', title: 'Scene', content: 'Local text' }],
    }
    const cloud = {
      ...base,
      scenes: [{ id: 'scene-1', novelId: 'project-1', title: 'Scene', content: 'Cloud text' }],
    }

    const { mergedData, conflicts } = reconcileCloudSyncData(local, cloud, base, options)

    expect(mergedData.scenes[0].content).toBe('Local text')
    expect(conflicts).toEqual([
      expect.objectContaining({
        id: 'conflict-1',
        table: 'scenes',
        recordId: 'scene-1',
        label: 'Scene',
        mine: expect.objectContaining({ content: 'Local text' }),
        theirs: expect.objectContaining({ content: 'Cloud text' }),
      }),
    ])
  })
})
