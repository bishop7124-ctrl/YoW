import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const queryResult = { value: { data: [], error: null } }
const chain = () => {
  const q = {}
  ;['select', 'eq', 'is', 'not', 'order', 'limit'].forEach(name => { q[name] = vi.fn(() => q) })
  q.maybeSingle = vi.fn(() => Promise.resolve(queryResult.value))
  q.then = (resolve, reject) => Promise.resolve(queryResult.value).then(resolve, reject)
  return q
}
const from = vi.fn(() => chain())
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpc(...args), from: (...args) => from(...args) } }))
vi.mock('./offlineMock', () => ({ OFFLINE_MODE: false }))

import {
  configureCloudSceneVersions, isCloudSceneHistoryActive, pushCloudSceneVersion, listCloudSceneVersions,
  listRecentlyDeletedScenes, markCloudScenesDeleted, markCloudNovelDeleted, sceneVersionHash,
} from './cloudSceneVersions'
import { saveSceneVersion } from './sceneVersions'

const version = { sceneId: 's1', novelId: 'n1', title: 'T', content: 'hello', timestamp: Date.now() + 3_600_000 }
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null })
  from.mockClear()
  queryResult.value = { data: [], error: null }
  configureCloudSceneVersions({ enabled: false, userId: null })
  rpc.mockClear()
})

describe('cloud scene versions', () => {
  it('does nothing unless enabled for a signed-in user', async () => {
    expect(isCloudSceneHistoryActive()).toBe(false)
    expect(await pushCloudSceneVersion(version)).toBe(false)
    markCloudScenesDeleted(['s1']); markCloudNovelDeleted('n1')
    expect(await listCloudSceneVersions('s1')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    configureCloudSceneVersions({ enabled: true, userId: null })
    expect(isCloudSceneHistoryActive()).toBe(false)
  })

  it('pushes a snapshot through the save RPC with a validated source', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    expect(await pushCloudSceneVersion(version, 'bogus')).toBe(true)
    expect(rpc).toHaveBeenCalledWith('save_scene_version', {
      p_scene_id: 's1', p_novel_id: 'n1', p_title: 'T', p_content: 'hello', p_source: 'auto',
    })
    await pushCloudSceneVersion(version, 'restore')
    expect(rpc.mock.calls[1][1].p_source).toBe('restore')
  })

  it('a failed call never throws and pauses cloud calls for a while', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    rpc.mockResolvedValueOnce({ data: null, error: new Error('down') })
    expect(await pushCloudSceneVersion(version)).toBe(false)
    expect(await pushCloudSceneVersion(version)).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('discards a result that arrives after the account changed', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    let finish
    rpc.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const pending = pushCloudSceneVersion(version)
    configureCloudSceneVersions({ enabled: true, userId: 'u2' })
    finish({ data: true, error: null })
    expect(await pending).toBe(false)
  })

  it('local snapshots flow to the cloud when active, and local saving works when it is off', async () => {
    const scene = { id: 'flow-1', novelId: 'n1', title: 'A', content: 'one two three' }
    saveSceneVersion(scene)
    await flush()
    expect(rpc).not.toHaveBeenCalled()
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    saveSceneVersion({ ...scene, content: 'one two three four' }, 'replace')
    await flush()
    expect(rpc).toHaveBeenCalledWith('save_scene_version', expect.objectContaining({ p_scene_id: 'flow-1', p_source: 'replace', p_content: 'one two three four' }))
  })

  it('marks scenes and projects deleted instead of removing them', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    markCloudScenesDeleted(['a', 'a', 'b']); markCloudNovelDeleted('n1')
    await flush()
    expect(rpc.mock.calls.filter(([name]) => name === 'mark_scenes_versions_deleted')).toEqual([
      ['mark_scenes_versions_deleted', { p_scene_ids: ['a', 'b'] }],
    ])
    expect(rpc).toHaveBeenCalledWith('mark_novel_versions_deleted', { p_novel_id: 'n1' })
  })

  it('sends large deletions in batches instead of one request per scene', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    markCloudScenesDeleted(Array.from({ length: 1200 }, (_, i) => `s${i}`))
    await flush()
    const calls = rpc.mock.calls.filter(([name]) => name === 'mark_scenes_versions_deleted')
    expect(calls.map(([, args]) => args.p_scene_ids.length)).toEqual([500, 500, 200])
  })

  it('never sends a snapshot written before this account\'s session began', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u2' })
    rpc.mockClear()
    expect(await pushCloudSceneVersion({ ...version, timestamp: Date.now() - 60_000 })).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(await pushCloudSceneVersion({ ...version, timestamp: Date.now() + 1 })).toBe(true)
  })

  it('a rejected request (e.g. scene too large) does not pause history for other scenes', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    rpc.mockClear()
    rpc.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('too large'), { code: '54000' }) })
    expect(await pushCloudSceneVersion({ ...version, timestamp: Date.now() + 1 })).toBe(false)
    expect(await pushCloudSceneVersion({ ...version, sceneId: 's2', timestamp: Date.now() + 2 })).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('lists versions without content and keeps only the newest deleted version per scene', async () => {
    configureCloudSceneVersions({ enabled: true, userId: 'u1' })
    queryResult.value = { data: [{ id: 'x1', scene_id: 's1', title: 'T', word_count: 5, content_hash: 'h', source: 'auto', created_at: '2026-11-09T10:00:00Z' }], error: null }
    const list = await listCloudSceneVersions('s1')
    expect(list[0]).toMatchObject({ id: 'cloud:x1', cloudId: 'x1', wordCount: 5, hash: 'h', cloud: true })
    expect(list[0].content).toBeUndefined()

    queryResult.value = { data: [
      { id: 'd2', scene_id: 'sA', title: 'New', word_count: 9, created_at: '2026-11-09T09:00:00Z', deleted_at: '2026-11-09T11:00:00Z' },
      { id: 'd1', scene_id: 'sA', title: 'Old', word_count: 3, created_at: '2026-11-08T09:00:00Z', deleted_at: '2026-11-09T11:00:00Z' },
      { id: 'd3', scene_id: 'sB', title: 'Other', word_count: 1, created_at: '2026-11-07T09:00:00Z', deleted_at: '2026-11-09T12:00:00Z' },
    ], error: null }
    const deleted = await listRecentlyDeletedScenes('n1')
    expect(deleted.map(item => [item.sceneId, item.title])).toEqual([['sB', 'Other'], ['sA', 'New']])
  })

  it('hashes title and text the same way the database does', async () => {
    // sha256("T\nhello") — matches encode(sha256(convert_to(title || E'\\n' || content,'UTF8')),'hex')
    const { createHash } = await import('node:crypto')
    expect(await sceneVersionHash('T', 'hello')).toBe(createHash('sha256').update('T\nhello').digest('hex'))
  })
})
