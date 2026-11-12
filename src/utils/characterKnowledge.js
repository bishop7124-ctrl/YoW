// Character knowledge (Release C, step C3): what a character knows, and when they learn it.
//
// Stored as a `knowledge` list on the character record, the same way a character's journey is, so it syncs,
// exports, imports and merges with the character and needs no database change. A fact is only ever what the
// writer typed: the app never reads the prose to work out who knows what.
//
// fact = {
//   id, text,
//   learnedAtSceneId, learnedAtEventId   where the character learns it (either, both or neither)
//   usedInSceneIds                       scenes where the character acts on it or relies on it
//   via       'told' | 'saw' | 'deduced' | 'read' | 'other' | ''
//   confidence 'believed' | 'verified' | 'false-belief'
//   note, createdAt, updatedAt
// }

export const MAX_FACTS_PER_CHARACTER = 100
export const MAX_FACT_TEXT = 500
export const MAX_FACT_NOTE = 500
export const MAX_USED_SCENES = 50

export const KNOWLEDGE_VIA = [
  { value: '', label: 'Not recorded' },
  { value: 'told', label: 'Told' },
  { value: 'saw', label: 'Saw it' },
  { value: 'deduced', label: 'Worked it out' },
  { value: 'read', label: 'Read it' },
  { value: 'other', label: 'Other' },
]
export const KNOWLEDGE_CONFIDENCE = [
  { value: 'believed', label: 'Believes it' },
  { value: 'verified', label: 'Knows it is true' },
  { value: 'false-belief', label: 'Believes it, but it is false' },
]
const VIA_VALUES = new Set(KNOWLEDGE_VIA.map(item => item.value))
const CONFIDENCE_VALUES = new Set(KNOWLEDGE_CONFIDENCE.map(item => item.value))

const idOf = value => (typeof value === 'string' && value ? value : '')
const textOf = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const newId = () => `k${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`

export function normalizeFact(raw) {
  const text = textOf(raw?.text, MAX_FACT_TEXT)
  if (!text) return null
  const used = []
  for (const id of Array.isArray(raw?.usedInSceneIds) ? raw.usedInSceneIds : []) {
    if (idOf(id) && !used.includes(id) && used.length < MAX_USED_SCENES) used.push(id)
  }
  const now = new Date().toISOString()
  return {
    id: idOf(raw?.id) || newId(),
    text,
    learnedAtSceneId: idOf(raw?.learnedAtSceneId),
    learnedAtEventId: idOf(raw?.learnedAtEventId),
    usedInSceneIds: used,
    via: VIA_VALUES.has(raw?.via) ? raw.via : '',
    confidence: CONFIDENCE_VALUES.has(raw?.confidence) ? raw.confidence : 'believed',
    note: textOf(raw?.note, MAX_FACT_NOTE),
    createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

// A clean list: invalid or empty facts dropped, repeated ids dropped, capped.
export function normalizeKnowledge(list) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const fact = normalizeFact(raw)
    if (!fact || seen.has(fact.id)) continue
    seen.add(fact.id)
    out.push(fact)
    if (out.length >= MAX_FACTS_PER_CHARACTER) break
  }
  return out
}

// Add a fact, or replace the one with the same id. Returns the whole new list (the caller saves it on the character).
export function upsertFact(knowledge, raw) {
  const list = normalizeKnowledge(knowledge)
  const existing = list.find(fact => fact.id === raw?.id)
  const next = normalizeFact({ ...existing, ...raw, createdAt: existing?.createdAt, updatedAt: new Date().toISOString() })
  if (!next) return list
  if (existing) return list.map(fact => (fact.id === next.id ? next : fact))
  return list.length >= MAX_FACTS_PER_CHARACTER ? list : [...list, next]
}

export const removeFact = (knowledge, id) => normalizeKnowledge(knowledge).filter(fact => fact.id !== id)

// Forget deleted scenes and events. A fact whose learning point is deleted stays (with the point cleared), so the
// writer's note is never lost; a deleted scene is simply taken off the scenes it was used in.
export function clearKnowledgeLinks(knowledge, { sceneIds = [], eventIds = [] } = {}) {
  if (!Array.isArray(knowledge) || !knowledge.length) return knowledge
  const scenes = new Set(sceneIds)
  const events = new Set(eventIds)
  if (!scenes.size && !events.size) return knowledge
  let changed = false
  const next = knowledge.map(fact => {
    if (!fact || typeof fact !== 'object') return fact
    const patch = {}
    if (scenes.has(fact.learnedAtSceneId)) patch.learnedAtSceneId = ''
    if (events.has(fact.learnedAtEventId)) patch.learnedAtEventId = ''
    if (Array.isArray(fact.usedInSceneIds) && fact.usedInSceneIds.some(id => scenes.has(id))) patch.usedInSceneIds = fact.usedInSceneIds.filter(id => !scenes.has(id))
    if (!Object.keys(patch).length) return fact
    changed = true
    return { ...fact, ...patch }
  })
  return changed ? next : knowledge
}

// Re-point scene and event ids at newly created records on import; ids of records that were not imported are dropped.
export function remapKnowledgeLinks(knowledge, { scenes = () => '', events = () => '' } = {}) {
  if (!Array.isArray(knowledge)) return knowledge
  return knowledge.map(fact => (fact && typeof fact === 'object'
    ? {
      ...fact,
      learnedAtSceneId: scenes(fact.learnedAtSceneId) || '',
      learnedAtEventId: events(fact.learnedAtEventId) || '',
      usedInSceneIds: (Array.isArray(fact.usedInSceneIds) ? fact.usedInSceneIds : []).map(scenes).filter(Boolean),
    }
    : fact))
}

export const hasKnowledge = character => Array.isArray(character?.knowledge) && character.knowledge.length > 0

// Scenes in manuscript order (act, then chapter, then scene) as picker choices: [{ id, label }]. Scenes whose
// chapter is not placed in an act are listed last so a writer can still pick them.
export function sceneChoices({ acts = [], chapters = [], scenes = [] } = {}) {
  const num = value => (Number.isFinite(value) ? value : 0)
  const actRank = new Map([...acts].sort((a, b) => num(a.order) - num(b.order)).map((act, index) => [act.id, index]))
  const chapterById = new Map(chapters.map(chapter => [chapter.id, chapter]))
  const rank = scene => {
    const chapter = chapterById.get(scene.chapterId)
    const act = chapter ? actRank.get(chapter.actId) : undefined
    return [act === undefined ? Infinity : act, num(chapter?.order), num(scene.order)]
  }
  return [...scenes]
    .map((scene, index) => ({ scene, index, key: rank(scene) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.index - b.index)
    .map(({ scene }) => {
      const chapter = chapterById.get(scene.chapterId)
      const title = String(scene.title || '').trim() || 'Untitled scene'
      return { id: scene.id, label: chapter?.title ? `${chapter.title} · ${title}` : title }
    })
}
