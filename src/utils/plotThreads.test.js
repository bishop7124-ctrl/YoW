import { describe, expect, it } from 'vitest'
import {
  normalizeThread, pickThreadFields, projectThreads, nextThreadOrder, getSceneThreadLinks, setThreadLinkPatch,
  removeThreadLinkPatch, scenesWithoutThreadLinks, remapThreadLinks, mergeThreadLists, MAX_LINKS_PER_SCENE, MAX_THREAD_NAME,
} from './plotThreads'

describe('normalizeThread', () => {
  it('fills defaults and never throws on junk', () => {
    expect(normalizeThread(null)).toMatchObject({ id: '', name: 'Untitled thread', kind: 'subplot', status: 'open', characterIds: [], order: 0 })
    const t = normalizeThread({ id: 'a', novelId: 'n', name: '  The heist ', kind: 'bogus', status: 'nope', color: 'red', characterIds: ['c1', 'c1', 5, ''] })
    expect(t).toMatchObject({ id: 'a', name: 'The heist', kind: 'subplot', status: 'open', color: '', characterIds: ['c1'] })
  })
  it('keeps a custom label only for custom threads, and caps long names', () => {
    expect(normalizeThread({ kind: 'custom', customLabel: 'Heist' }).customLabel).toBe('Heist')
    expect(normalizeThread({ kind: 'main', customLabel: 'x' }).customLabel).toBe('')
    expect(normalizeThread({ name: 'x'.repeat(500) }).name).toHaveLength(MAX_THREAD_NAME)
  })
  it('keeps unknown fields (older and newer versions of the app share records)', () => {
    expect(normalizeThread({ id: 'a', futureField: 7 }).futureField).toBe(7)
  })
})

describe('pickThreadFields', () => {
  it('lets callers set only editable fields', () => {
    expect(pickThreadFields({ name: 'x', id: 'evil', novelId: 'evil', updatedAt: 1, status: 'resolved' })).toEqual({ name: 'x', status: 'resolved' })
    expect(pickThreadFields(null)).toEqual({})
  })
})

describe('projectThreads', () => {
  it('returns one project\'s threads in order, then by name', () => {
    const all = [{ id: '1', novelId: 'a', order: 2, name: 'B' }, { id: '2', novelId: 'b', order: 1, name: 'Z' }, { id: '3', novelId: 'a', order: 1, name: 'Z' }, { id: '4', novelId: 'a', order: 1, name: 'A' }]
    expect(projectThreads(all, 'a').map(t => t.id)).toEqual(['4', '3', '1'])
    expect(projectThreads(null, 'a')).toEqual([])
    expect(nextThreadOrder(all)).toBe(3)
    expect(nextThreadOrder([])).toBe(1)
  })
})

describe('scene thread links', () => {
  it('normalises junk: bad roles become mention, duplicates and non-ids drop, capped', () => {
    expect(getSceneThreadLinks({ threadLinks: [{ threadId: 't1', role: 'payoff' }, { threadId: 't1', role: 'setup' }, { threadId: 't2', role: 'wat' }, null, { threadId: 5 }] }))
      .toEqual([{ threadId: 't1', role: 'payoff' }, { threadId: 't2', role: 'mention' }])
    expect(getSceneThreadLinks({ threadLinks: 'x' })).toEqual([])
    const many = Array.from({ length: 40 }, (_, i) => ({ threadId: `t${i}`, role: 'setup' }))
    expect(getSceneThreadLinks({ threadLinks: many })).toHaveLength(MAX_LINKS_PER_SCENE)
  })
  it('attaches once, changes the role in place, and reports no change as {}', () => {
    expect(setThreadLinkPatch({}, 't1', 'setup')).toEqual({ threadLinks: [{ threadId: 't1', role: 'setup' }] })
    const scene = { threadLinks: [{ threadId: 't1', role: 'setup' }, { threadId: 't2', role: 'payoff' }] }
    expect(setThreadLinkPatch(scene, 't1', 'setup')).toEqual({})
    expect(setThreadLinkPatch(scene, 't1', 'payoff')).toEqual({ threadLinks: [{ threadId: 't1', role: 'payoff' }, { threadId: 't2', role: 'payoff' }] })
    expect(setThreadLinkPatch(scene, '', 'setup')).toEqual({})
    expect(setThreadLinkPatch(scene, 't3', 'wat')).toEqual({ threadLinks: [...scene.threadLinks, { threadId: 't3', role: 'mention' }] })
  })
  it('does not exceed the per-scene cap', () => {
    const scene = { threadLinks: Array.from({ length: MAX_LINKS_PER_SCENE }, (_, i) => ({ threadId: `t${i}`, role: 'setup' })) }
    expect(setThreadLinkPatch(scene, 'extra', 'setup')).toEqual({})
  })
  it('removes a link', () => {
    expect(removeThreadLinkPatch({ threadLinks: [{ threadId: 't1', role: 'setup' }, { threadId: 't2', role: 'payoff' }] }, 't1')).toEqual({ threadLinks: [{ threadId: 't2', role: 'payoff' }] })
    expect(removeThreadLinkPatch({}, 't1')).toEqual({})
  })
})

describe('scenesWithoutThreadLinks', () => {
  it('clears deleted threads and returns only the scenes that changed', () => {
    const scenes = [
      { id: 'a', threadLinks: [{ threadId: 't1', role: 'setup' }, { threadId: 't2', role: 'payoff' }] },
      { id: 'b', threadLinks: [{ threadId: 't2', role: 'payoff' }] },
      { id: 'c' },
    ]
    expect(scenesWithoutThreadLinks(scenes, ['t1'])).toEqual([{ id: 'a', patch: { threadLinks: [{ threadId: 't2', role: 'payoff' }] } }])
    expect(scenesWithoutThreadLinks(scenes, ['t2']).map(c => c.id)).toEqual(['a', 'b'])
    expect(scenesWithoutThreadLinks(scenes, [])).toEqual([])
    expect(scenesWithoutThreadLinks(null, ['t1'])).toEqual([])
  })
})

describe('remapThreadLinks', () => {
  it('points links at the new ids and drops links to threads that were not imported', () => {
    expect(remapThreadLinks({ threadLinks: [{ threadId: 't1', role: 'setup' }, { threadId: 'gone', role: 'payoff' }] }, { t1: 'N1' }))
      .toEqual({ threadLinks: [{ threadId: 'N1', role: 'setup' }] })
    expect(remapThreadLinks({ title: 'x' }, { t1: 'N1' })).toEqual({})
  })
})

describe('mergeThreadLists', () => {
  it('keeps local-only threads, adds remote-only ones, and takes the newer copy of a shared one', () => {
    const local = [{ id: 'a', name: 'local-new', updatedAt: 20 }, { id: 'b', name: 'local-old', updatedAt: 5 }, { id: 'c', name: 'only-local', updatedAt: 1 }]
    const remote = [{ id: 'a', name: 'remote-old', updatedAt: 10 }, { id: 'b', name: 'remote-new', updatedAt: 9 }, { id: 'd', name: 'only-remote', updatedAt: 1 }]
    const merged = Object.fromEntries(mergeThreadLists(local, remote).map(t => [t.id, t.name]))
    expect(merged).toEqual({ a: 'local-new', b: 'remote-new', c: 'only-local', d: 'only-remote' })
  })
  it('tolerates junk', () => {
    expect(mergeThreadLists(null, [null, { id: 'x' }])).toEqual([{ id: 'x' }])
  })
})
