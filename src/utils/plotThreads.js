// Plot threads (roadmap Release B). A thread is a named storyline in one project; scenes attach to threads with a
// role (set up, develop, pay off, mention). Pure helpers only: no storage, no React. Everything here tolerates
// missing and malformed data, because threads arrive from imports, older exports and other devices.
// Design: docs/planning/future-release/10_RELEASE_B_PLOT_THREADS_DESIGN.md

export const THREAD_KINDS = ['main', 'subplot', 'romance', 'mystery', 'character-arc', 'custom']
export const THREAD_STATUSES = ['open', 'resolved', 'dropped']
export const THREAD_ROLES = ['setup', 'development', 'payoff', 'mention']

export const MAX_THREAD_NAME = 120
export const MAX_THREAD_TEXT = 5000
export const MAX_THREADS_PER_PROJECT = 100
export const MAX_LINKS_PER_SCENE = 20

const text = (value, max) => (typeof value === 'string' ? value : '').trim().slice(0, max)
const oneOf = (value, list, fallback) => (list.includes(value) ? value : fallback)
const isId = value => typeof value === 'string' && value.length > 0
const COLOR = /^#[0-9a-fA-F]{6}$/

// A usable thread record from anything stored. Never throws; unknown extra fields are kept.
export function normalizeThread(raw, fallbackNovelId = '') {
  const source = raw && typeof raw === 'object' ? raw : {}
  const kind = oneOf(source.kind, THREAD_KINDS, 'subplot')
  return {
    ...source,
    id: isId(source.id) ? source.id : '',
    novelId: isId(source.novelId) ? source.novelId : fallbackNovelId,
    name: text(source.name, MAX_THREAD_NAME) || 'Untitled thread',
    kind,
    customLabel: kind === 'custom' ? text(source.customLabel, MAX_THREAD_NAME) : '',
    color: COLOR.test(source.color) ? source.color : '',
    status: oneOf(source.status, THREAD_STATUSES, 'open'),
    description: text(source.description, MAX_THREAD_TEXT),
    characterIds: Array.isArray(source.characterIds) ? [...new Set(source.characterIds.filter(isId))] : [],
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
    createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : 0,
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : 0,
  }
}

// Fields a caller may set. id, novelId and the timestamps are always controlled by the store.
const EDITABLE = ['name', 'kind', 'customLabel', 'color', 'status', 'description', 'characterIds', 'order']
export function pickThreadFields(data) {
  const out = {}
  EDITABLE.forEach(field => { if (data && Object.hasOwn(data, field)) out[field] = data[field] })
  return out
}

export function projectThreads(threads, novelId) {
  return (Array.isArray(threads) ? threads : [])
    .filter(thread => thread && thread.novelId === novelId)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name)))
}

export const nextThreadOrder = threads => (Array.isArray(threads) ? threads : []).reduce((max, thread) => Math.max(max, Number(thread?.order) || 0), 0) + 1

// ---- scene links -----------------------------------------------------------------------------------------

// A scene's thread links as a clean list: valid roles only, one entry per thread (the first wins), capped.
export function getSceneThreadLinks(scene) {
  const seen = new Set()
  const out = []
  ;(Array.isArray(scene?.threadLinks) ? scene.threadLinks : []).forEach(link => {
    if (!link || !isId(link.threadId) || seen.has(link.threadId)) return
    seen.add(link.threadId)
    out.push({ threadId: link.threadId, role: oneOf(link.role, THREAD_ROLES, 'mention') })
  })
  return out.slice(0, MAX_LINKS_PER_SCENE)
}

// Attach a thread to a scene, or change its role if already attached. Returns the scene patch ({} for no change).
export function setThreadLinkPatch(scene, threadId, role) {
  if (!isId(threadId)) return {}
  const nextRole = oneOf(role, THREAD_ROLES, 'mention')
  const links = getSceneThreadLinks(scene)
  const existing = links.find(link => link.threadId === threadId)
  if (existing?.role === nextRole) return {}
  if (!existing && links.length >= MAX_LINKS_PER_SCENE) return {}
  return { threadLinks: existing ? links.map(link => (link.threadId === threadId ? { threadId, role: nextRole } : link)) : [...links, { threadId, role: nextRole }] }
}

export function removeThreadLinkPatch(scene, threadId) {
  const links = getSceneThreadLinks(scene)
  return links.some(link => link.threadId === threadId) ? { threadLinks: links.filter(link => link.threadId !== threadId) } : {}
}

// Deleting threads removes them from every scene. Returns only the scenes that changed: [{ id, patch }].
export function scenesWithoutThreadLinks(scenes, threadIds) {
  const gone = new Set(threadIds || [])
  if (!gone.size) return []
  const changed = []
  ;(Array.isArray(scenes) ? scenes : []).forEach(scene => {
    if (!Array.isArray(scene?.threadLinks) || !scene.threadLinks.some(link => gone.has(link?.threadId))) return
    changed.push({ id: scene.id, patch: { threadLinks: scene.threadLinks.filter(link => !gone.has(link?.threadId)) } })
  })
  return changed
}

// Point a scene's links at new thread ids after an import or merge; links to threads that were not imported drop.
export function remapThreadLinks(scene, idMap) {
  if (!Array.isArray(scene?.threadLinks)) return {}
  return { threadLinks: scene.threadLinks.map(link => (link && idMap?.[link.threadId] ? { ...link, threadId: idMap[link.threadId] } : null)).filter(Boolean) }
}

// Threads that did not exist when the other device last saved: the record from `remote` wins only when it is
// newer. Used when merging cloud threads into local ones; never removes anything.
export function mergeThreadLists(local, remote) {
  const byId = new Map((Array.isArray(local) ? local : []).filter(thread => thread?.id).map(thread => [thread.id, thread]))
  ;(Array.isArray(remote) ? remote : []).forEach(thread => {
    if (!thread?.id) return
    const mine = byId.get(thread.id)
    if (!mine || (Number(thread.updatedAt) || 0) > (Number(mine.updatedAt) || 0)) byId.set(thread.id, thread)
  })
  return [...byId.values()]
}

// ---- B1 helpers (panel and Inspector) --------------------------------------------------------------------

export const THREAD_COLORS = ['#e07a5f', '#3d85c6', '#6aa84f', '#f1c232', '#8e7cc3', '#c27ba0', '#45b8ac', '#9e9e9e']
export const nextThreadColor = threads => THREAD_COLORS[(Array.isArray(threads) ? threads.length : 0) % THREAD_COLORS.length]

export const THREAD_KIND_LABELS = {
  main: 'Main plot', subplot: 'Subplot', romance: 'Romance', mystery: 'Mystery', 'character-arc': 'Character arc', custom: 'Custom',
}
export const THREAD_STATUS_LABELS = { open: 'Open', resolved: 'Resolved', dropped: 'Dropped' }
export const THREAD_ROLE_LABELS = { setup: 'Sets up', development: 'Develops', payoff: 'Pays off', mention: 'Mentioned' }

export const threadKindLabel = thread => (thread?.kind === 'custom' && thread.customLabel ? thread.customLabel : THREAD_KIND_LABELS[thread?.kind] || 'Subplot')

// How a thread is used across a set of scenes: { count, byRole: { setup, development, payoff, mention } }.
export function threadSceneStats(threadId, scenes) {
  const byRole = { setup: 0, development: 0, payoff: 0, mention: 0 }
  let count = 0
  ;(Array.isArray(scenes) ? scenes : []).forEach(scene => {
    const link = getSceneThreadLinks(scene).find(item => item.threadId === threadId)
    if (!link) return
    count += 1
    byRole[link.role] += 1
  })
  return { count, byRole }
}

const dismissKey = threadId => `thread:${threadId}`

// Threads that list a character who is linked to this scene, are not dropped, and are not already attached or
// dismissed. Only explicit data is used (the thread's character list and the scene's linked characters); the
// writer always confirms.
export function suggestThreadsForScene(scene, threads) {
  const sceneCharacters = new Set(Array.isArray(scene?.characterIds) ? scene.characterIds.filter(isId) : [])
  if (!sceneCharacters.size) return []
  const attached = new Set(getSceneThreadLinks(scene).map(link => link.threadId))
  const dismissed = new Set(Array.isArray(scene?.dismissedLinks) ? scene.dismissedLinks : [])
  return (Array.isArray(threads) ? threads : []).filter(thread => (
    thread?.id && thread.status !== 'dropped' && !attached.has(thread.id) && !dismissed.has(dismissKey(thread.id))
    && Array.isArray(thread.characterIds) && thread.characterIds.some(id => sceneCharacters.has(id))
  ))
}

export function dismissThreadSuggestionPatch(scene, threadId) {
  const dismissed = Array.isArray(scene?.dismissedLinks) ? scene.dismissedLinks.filter(isId) : []
  return dismissed.includes(dismissKey(threadId)) ? {} : { dismissedLinks: [...dismissed, dismissKey(threadId)] }
}
