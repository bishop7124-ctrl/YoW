import { describe, expect, it } from 'vitest'
import {
  normalizeThread, pickThreadFields, projectThreads, nextThreadOrder, getSceneThreadLinks, setThreadLinkPatch,
  removeThreadLinkPatch, scenesWithoutThreadLinks, remapThreadLinks, mergeThreadLists, MAX_LINKS_PER_SCENE, MAX_THREAD_NAME,
  threadSceneStats, suggestThreadsForScene, dismissThreadSuggestionPatch, threadKindLabel, nextThreadColor, THREAD_COLORS,
  buildThreadGrid, threadAppearances,
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

describe('threadSceneStats', () => {
  it('counts scenes and roles for one thread', () => {
    const scenes = [
      { threadLinks: [{ threadId: 't', role: 'setup' }] }, { threadLinks: [{ threadId: 't', role: 'payoff' }, { threadId: 'x', role: 'setup' }] },
      { threadLinks: [{ threadId: 'x', role: 'setup' }] }, {},
    ]
    expect(threadSceneStats('t', scenes)).toEqual({ count: 2, byRole: { setup: 1, development: 0, payoff: 1, mention: 0 } })
    expect(threadSceneStats('t', null).count).toBe(0)
  })
})

describe('suggestThreadsForScene', () => {
  const threads = [
    { id: 'a', status: 'open', characterIds: ['c1'] }, { id: 'b', status: 'dropped', characterIds: ['c1'] },
    { id: 'c', status: 'open', characterIds: ['c2'] }, { id: 'd', status: 'open', characterIds: [] },
  ]
  it('suggests open threads that share a character with the scene', () => {
    expect(suggestThreadsForScene({ characterIds: ['c1'] }, threads).map(t => t.id)).toEqual(['a'])
    expect(suggestThreadsForScene({ characterIds: [] }, threads)).toEqual([])
    expect(suggestThreadsForScene(null, threads)).toEqual([])
  })
  it('skips attached and dismissed threads', () => {
    expect(suggestThreadsForScene({ characterIds: ['c1'], threadLinks: [{ threadId: 'a', role: 'setup' }] }, threads)).toEqual([])
    expect(suggestThreadsForScene({ characterIds: ['c1'], dismissedLinks: ['thread:a'] }, threads)).toEqual([])
  })
  it('records a dismissal once and keeps the other dismissals', () => {
    expect(dismissThreadSuggestionPatch({ dismissedLinks: ['character:x'] }, 'a')).toEqual({ dismissedLinks: ['character:x', 'thread:a'] })
    expect(dismissThreadSuggestionPatch({ dismissedLinks: ['thread:a'] }, 'a')).toEqual({})
  })
})

describe('labels and colours', () => {
  it('uses the custom label for custom threads and cycles colours', () => {
    expect(threadKindLabel({ kind: 'custom', customLabel: 'Heist' })).toBe('Heist')
    expect(threadKindLabel({ kind: 'romance' })).toBe('Romance')
    expect(nextThreadColor([])).toBe(THREAD_COLORS[0])
    expect(nextThreadColor(new Array(THREAD_COLORS.length).fill({}))).toBe(THREAD_COLORS[0])
  })
})

describe('buildThreadGrid', () => {
  const outline = {
    acts: [
      { act: { id: 'a1', title: 'Act I' }, chapters: [
        { chapter: { id: 'c1', title: 'One' }, scenes: [{ id: 's1', title: 'Opening' }, { id: 's2', title: 'Gate' }] },
        { chapter: { id: 'c2', title: 'Two' }, scenes: [{ id: 's3', title: 'Chase' }] },
      ] },
      { act: { id: 'a2', title: 'Act II' }, chapters: [{ chapter: { id: 'c3', title: 'Three' }, scenes: [] }] },
      { act: { id: 'a3', title: 'Empty act' }, chapters: [] },
    ],
  }
  const scenes = [
    { id: 's1', threadLinks: [{ threadId: 't1', role: 'setup' }, { threadId: 't2', role: 'mention' }] },
    { id: 's2', threadLinks: [{ threadId: 't1', role: 'payoff' }] },
    { id: 's3', threadLinks: [{ threadId: 't2', role: 'development' }] },
  ]
  const threads = [{ id: 't1', name: 'Heir' }, { id: 't2', name: 'Romance' }, { id: 't3', name: 'Unused' }]

  it('lays out chapters in manuscript order, grouped by act, skipping acts with nothing in them', () => {
    const grid = buildThreadGrid({ threads, outline, scenes })
    expect(grid.columns.map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(grid.groups).toEqual([{ id: 'a1', label: 'Act I', span: 2 }, { id: 'a2', label: 'Act II', span: 1 }])
  })
  it('shows the strongest role in a chapter cell and how many scenes hit it', () => {
    const grid = buildThreadGrid({ threads, outline, scenes })
    const heir = grid.rows.find(r => r.thread.id === 't1')
    expect(heir.cells.map(c => [c.role, c.count])).toEqual([['payoff', 2], [null, 0], [null, 0]]) // setup + payoff in chapter 1: payoff wins
    expect(heir.total).toBe(2)
    expect(grid.rows.find(r => r.thread.id === 't3').total).toBe(0)
  })
  it('switches to one column per scene', () => {
    const grid = buildThreadGrid({ threads, outline, scenes, by: 'scene' })
    expect(grid.columns.map(c => c.id)).toEqual(['s1', 's2', 's3'])
    expect(grid.rows[0].cells.map(c => c.role)).toEqual(['setup', 'payoff', null])
    expect(grid.groups).toEqual([{ id: 'a1', label: 'Act I', span: 3 }])
  })
  it('ignores links to threads that do not exist and survives junk', () => {
    expect(buildThreadGrid({ threads: [{ id: 't1' }], outline, scenes: [{ id: 's1', threadLinks: [{ threadId: 'gone', role: 'setup' }] }] }).rows[0].total).toBe(0)
    expect(buildThreadGrid({})).toEqual({ columns: [], groups: [], rows: [] })
    expect(buildThreadGrid({ threads: [null, { name: 'no id' }], outline: null, scenes: 'x' }).rows).toEqual([])
  })
  it('lists appearances in order for narrow screens', () => {
    const grid = buildThreadGrid({ threads, outline, scenes })
    const romance = grid.rows.find(r => r.thread.id === 't2')
    expect(threadAppearances(romance, grid.columns)).toEqual([
      { label: 'One', role: 'mention', count: 1, sceneId: 's1' }, { label: 'Two', role: 'development', count: 1, sceneId: 's3' },
    ])
  })
})
