// Native Story Check rules (roadmap A1, design: docs/planning/future-release/06).
//
// Every rule is a pure function over structured project records. No prose is
// read, no network is used, and nothing is guessed: a value that does not parse
// to a year is reported as "missing", never compared.
//
// Finding kinds (never merged):
//   confirmed - the data contradicts itself
//   possible  - suspicious, but there are legitimate reasons (ghosts, prophecy…)
//   missing   - the check could not run because data is absent or unparseable
//   info      - an observation, not a problem

import { getTimelineYear, parseTimelineYear } from '../timelineYear.js'
import { getSceneLinks, sceneStoryYear } from '../sceneLinks.js'
import { getSceneThreadLinks } from '../plotThreads.js'

export const DEFAULT_SETTINGS = { minParentGap: 12, maxThreadGap: 12 }

// Plot-thread checks (roadmap B3). Named so they are easy to tune after real use.
export const THREAD_ENDING_MIN_SCENES = 8 // fewer scenes than this and "the end of the manuscript" is not meaningful
export const THREAD_ENDING_FRACTION = 0.1 // the closing stretch is at least this share of the scenes...
export const THREAD_ENDING_CHAPTERS = 3 // ...or the scenes of the last this-many chapters, whichever is more

const str = value => (value == null ? '' : String(value))
const hasText = value => str(value).trim() !== ''
const label = (record, fallback) => str(record?.name || record?.title).trim() || fallback

const DEAD = new Set(['dead', 'deceased'])
const ALIVE = new Set(['alive', 'living'])
const statusOf = character => str(character?.status).trim().toLowerCase()

const finding = ({ ruleId, kind, title, explanation, evidence, values = [] }) => {
  const ids = evidence.map(item => item.recordId).filter(Boolean).sort()
  return {
    id: `${ruleId}:${ids.join('+')}:${values.join('|')}`,
    source: 'native',
    ruleId,
    kind,
    title,
    explanation,
    evidence,
    // Stable across edits that do not change the facts, so dismissals survive.
    fingerprint: `${ruleId}:${ids.join('+')}:${values.join('|')}`,
  }
}

const characterEvidence = (character, value) => ({
  label: label(character, 'Unnamed character'), recordType: 'character', recordId: character.id, value,
})
const eventEvidence = (event, value) => ({
  label: label(event, 'Untitled event'), recordType: 'timeline', recordId: event.id, value,
})

const sceneEvidence = (scene, value) => ({
  label: label(scene, 'Untitled scene'), recordType: 'scene', recordId: scene.id, value,
})

const birthYear = character => parseTimelineYear(character?.birthDate)
const deathYear = character => parseTimelineYear(character?.deathDate)

// R1 — a character cannot die before they are born.
export function ruleDeathBeforeBirth({ characters }) {
  return characters.flatMap(character => {
    const born = birthYear(character)
    const died = deathYear(character)
    if (born === null || died === null || died >= born) return []
    return [finding({
      ruleId: 'R1', kind: 'confirmed', title: 'Dies before being born',
      explanation: `${label(character, 'A character')} is recorded as born in ${born} but dying in ${died}.`,
      evidence: [characterEvidence(character, `born ${born}, died ${died}`)],
      values: [born, died],
    })]
  })
}

// R2 — status and death date disagree, or a date is present but unreadable.
export function ruleStatusConsistency({ characters }) {
  const out = []
  characters.forEach(character => {
    const status = statusOf(character)
    if (ALIVE.has(status) && hasText(character.deathDate)) {
      out.push(finding({
        ruleId: 'R2', kind: 'confirmed', title: 'Marked alive but has a death date',
        explanation: `${label(character, 'A character')} has status "${status}" and a death date "${str(character.deathDate).trim()}".`,
        evidence: [characterEvidence(character, `status ${status}, death ${str(character.deathDate).trim()}`)],
        values: ['alive-with-death'],
      }))
    }
    if (DEAD.has(status) && !hasText(character.deathDate)) {
      out.push(finding({
        ruleId: 'R2', kind: 'missing', title: 'Marked dead with no death date',
        explanation: `${label(character, 'A character')} is marked dead but has no death date, so death-related checks cannot run for them.`,
        evidence: [characterEvidence(character, `status ${status}`)],
        values: ['dead-no-date'],
      }))
    }
    ;[['birthDate', 'birth'], ['deathDate', 'death']].forEach(([field, name]) => {
      if (hasText(character[field]) && parseTimelineYear(character[field]) === null) {
        out.push(finding({
          ruleId: 'R2', kind: 'missing', title: `Unreadable ${name} date`,
          explanation: `${label(character, 'A character')}'s ${name} date "${str(character[field]).trim()}" has no year, so it is skipped by date checks.`,
          evidence: [characterEvidence(character, str(character[field]).trim())],
          values: [`unreadable-${name}`],
        }))
      }
    })
  })
  return out
}

// R3 / R4 — events involving a character outside their lifetime. Only the
// timeline list is read: the History list mirrors it one-to-one, so reading
// both would report every problem twice.
export function ruleEventsOutsideLifetime({ characters, timeline }) {
  const byId = new Map(characters.map(character => [character.id, character]))
  const out = []
  timeline.forEach(event => {
    const start = getTimelineYear(event)
    if (start === null) return
    const end = parseTimelineYear(event.endYear) ?? start
    ;(Array.isArray(event.linkedCharacters) ? event.linkedCharacters : []).forEach(id => {
      const character = byId.get(id)
      if (!character) return
      const died = deathYear(character)
      const born = birthYear(character)
      if (died !== null && start > died) {
        out.push(finding({
          ruleId: 'R3', kind: 'possible', title: 'Event after a character\'s death',
          explanation: `"${label(event, 'An event')}" (${start}) involves ${label(character, 'a character')}, who died in ${died}. This may be intentional (a funeral, a ghost, a legacy).`,
          evidence: [eventEvidence(event, `year ${start}`), characterEvidence(character, `died ${died}`)],
          values: [start, died],
        }))
      }
      if (born !== null && end < born) {
        out.push(finding({
          ruleId: 'R4', kind: 'possible', title: 'Event before a character\'s birth',
          explanation: `"${label(event, 'An event')}" (${end}) involves ${label(character, 'a character')}, who was born in ${born}. This may be intentional (a prophecy, an ancestral story).`,
          evidence: [eventEvidence(event, `year ${end}`), characterEvidence(character, `born ${born}`)],
          values: [end, born],
        }))
      }
    })
  })
  return out
}

const parentChildPairs = characters => {
  const byId = new Map(characters.map(character => [character.id, character]))
  const seen = new Set()
  const pairs = []
  const add = (parentId, childId) => {
    const key = `${parentId}>${childId}`
    const parent = byId.get(parentId)
    const child = byId.get(childId)
    if (seen.has(key) || !parent || !child || parentId === childId) return
    seen.add(key)
    pairs.push({ parent, child })
  }
  characters.forEach(character => {
    ;(Array.isArray(character.parentIds) ? character.parentIds : []).forEach(id => add(id, character.id))
    ;(Array.isArray(character.childIds) ? character.childIds : []).forEach(id => add(character.id, id))
  })
  return pairs
}

// R5 — parent not older than child / implausibly small gap.
export function ruleParentAge({ characters }, settings = DEFAULT_SETTINGS) {
  const minGap = Number.isFinite(settings.minParentGap) ? settings.minParentGap : DEFAULT_SETTINGS.minParentGap
  const out = []
  parentChildPairs(characters).forEach(({ parent, child }) => {
    const parentBorn = birthYear(parent)
    const childBorn = birthYear(child)
    if (parentBorn === null || childBorn === null) return
    const evidence = [characterEvidence(parent, `born ${parentBorn}`), characterEvidence(child, `born ${childBorn}`)]
    if (parentBorn >= childBorn) {
      out.push(finding({
        ruleId: 'R5', kind: 'confirmed', title: 'Parent is not older than their child',
        explanation: `${label(parent, 'A parent')} (born ${parentBorn}) is recorded as a parent of ${label(child, 'a child')} (born ${childBorn}).`,
        evidence, values: [parentBorn, childBorn],
      }))
    } else if (childBorn - parentBorn < minGap) {
      out.push(finding({
        ruleId: 'R5', kind: 'possible', title: 'Very small age gap between parent and child',
        explanation: `${label(parent, 'A parent')} is only ${childBorn - parentBorn} years older than ${label(child, 'their child')}. The threshold is ${minGap} years; change it for non-human lifespans.`,
        evidence, values: [parentBorn, childBorn, minGap],
      }))
    }
  })
  return out
}

// R6 — child born well after a parent's death (a posthumous birth within a
// year is valid and is not reported).
export function ruleChildAfterParentDeath({ characters }) {
  const out = []
  parentChildPairs(characters).forEach(({ parent, child }) => {
    const died = deathYear(parent)
    const childBorn = birthYear(child)
    if (died === null || childBorn === null || childBorn <= died + 1) return
    out.push(finding({
      ruleId: 'R6', kind: 'confirmed', title: 'Child born after a parent died',
      explanation: `${label(child, 'A child')} was born in ${childBorn}, but their parent ${label(parent, '')} died in ${died}.`,
      evidence: [characterEvidence(parent, `died ${died}`), characterEvidence(child, `born ${childBorn}`)],
      values: [died, childBorn],
    }))
  })
  return out
}

// R7 — event year outside the era it is assigned to; era data gaps.
export function ruleEventOutsideEra({ timeline, eras }) {
  const byId = new Map(eras.map(era => [era.id, era]))
  const out = []
  timeline.forEach(event => {
    if (!event.eraId) return
    const era = byId.get(event.eraId)
    const year = getTimelineYear(event)
    if (!era || year === null) return
    const start = parseTimelineYear(era.startYear)
    const end = parseTimelineYear(era.endYear)
    if (start === null && end === null) {
      out.push(finding({
        ruleId: 'R7', kind: 'missing', title: 'Era has no start or end year',
        explanation: `${label(era, 'An era')} has no readable years, so events assigned to it cannot be checked.`,
        evidence: [{ label: label(era, 'Era'), recordType: 'era', recordId: era.id, value: 'no years' }],
        values: ['era-no-years'],
      }))
      return
    }
    if ((start !== null && year < start) || (end !== null && year > end)) {
      out.push(finding({
        ruleId: 'R7', kind: 'possible', title: 'Event falls outside its era',
        explanation: `"${label(event, 'An event')}" (${year}) is assigned to ${label(era, 'an era')} (${start ?? '…'} to ${end ?? '…'}).`,
        evidence: [eventEvidence(event, `year ${year}`), { label: label(era, 'Era'), recordType: 'era', recordId: era.id, value: `${start ?? '…'} to ${end ?? '…'}` }],
        values: [year, start ?? '', end ?? ''],
      }))
    }
  })
  return out
}

// R8 — links that point at records which no longer exist.
export function ruleDanglingReferences({ characters, locations, timeline, scenes = [] }) {
  const characterIds = new Set(characters.map(character => character.id))
  const locationIds = new Set(locations.map(location => location.id))
  const out = []
  const dangling = (owner, ownerType, field, missingId, evidenceFactory) => out.push(finding({
    ruleId: 'R8', kind: 'confirmed', title: 'Link to a record that no longer exists',
    explanation: `${label(owner, 'A record')} has a ${field} link to a record that has been deleted.`,
    evidence: [evidenceFactory(owner, `${field} → missing`)],
    values: [field, missingId],
  }))
  const idList = value => (Array.isArray(value) ? value : [])
  characters.forEach(character => {
    ;['parentIds', 'childIds', 'spouseIds'].forEach(field => {
      idList(character[field]).forEach(id => { if (!characterIds.has(id)) dangling(character, 'character', field, id, characterEvidence) })
    })
    idList(character.locationIds).forEach(id => { if (!locationIds.has(id)) dangling(character, 'character', 'location', id, characterEvidence) })
    idList(character.relationships).forEach(rel => {
      if (rel?.targetId && !characterIds.has(rel.targetId)) dangling(character, 'character', 'relationship', rel.targetId, characterEvidence)
    })
  })
  timeline.forEach(event => {
    idList(event.linkedCharacters).forEach(id => { if (!characterIds.has(id)) dangling(event, 'timeline', 'character', id, eventEvidence) })
    idList(event.linkedLocations).forEach(id => { if (!locationIds.has(id)) dangling(event, 'timeline', 'location', id, eventEvidence) })
  })
  // Structured scene links (A4). Normally cleaned when a record is deleted; this catches ones that slipped
  // through (another device, an older import).
  const eventIds = new Set(timeline.map(event => event.id))
  scenes.forEach(scene => {
    const links = getSceneLinks(scene)
    links.characterIds.forEach(id => { if (!characterIds.has(id)) dangling(scene, 'scene', 'character', id, sceneEvidence) })
    if (links.povCharacterId && !characterIds.has(links.povCharacterId)) dangling(scene, 'scene', 'point-of-view', links.povCharacterId, sceneEvidence)
    links.locationIds.forEach(id => { if (!locationIds.has(id)) dangling(scene, 'scene', 'location', id, sceneEvidence) })
    links.timelineEventIds.forEach(id => { if (!eventIds.has(id)) dangling(scene, 'scene', 'timeline event', id, sceneEvidence) })
  })
  return out
}

// Manuscript order of scenes: act order, then chapter order within the act, then scene order within the chapter.
// Records that are not placed (no parent) go last, in their stored order.
const orderOf = value => (Number.isFinite(value) ? value : 0)
function orderedScenes({ acts = [], chapters = [], scenes = [] }) {
  const byOrder = list => list.map((item, index) => ({ item, index })).sort((a, b) => orderOf(a.item.order) - orderOf(b.item.order) || a.index - b.index).map(entry => entry.item)
  const actRank = new Map(byOrder(acts).map((act, index) => [act.id, index]))
  const chapterRank = new Map(byOrder(chapters).map((chapter, index) => [chapter.id, { act: actRank.has(chapter.actId) ? actRank.get(chapter.actId) : Infinity, index }]))
  const rank = scene => {
    const chapter = chapterRank.get(scene.chapterId)
    return chapter ? [chapter.act, chapter.index] : [Infinity, Infinity]
  }
  return byOrder(scenes).map((scene, index) => ({ scene, index, rank: rank(scene) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(entry => entry.scene)
}

const timelineLookup = timeline => new Map(timeline.map(event => [event.id, event]))

// R9 — a character linked to a scene that takes place after they died or before they were born.
export function ruleCharacterInSceneOutsideLifetime({ characters, scenes = [], timeline }) {
  const byId = new Map(characters.map(character => [character.id, character]))
  const events = timelineLookup(timeline)
  const out = []
  scenes.forEach(scene => {
    const year = sceneStoryYear(scene, events)
    if (year === null) return
    getSceneLinks(scene).characterIds.forEach(id => {
      const character = byId.get(id)
      if (!character) return
      const died = deathYear(character)
      const born = birthYear(character)
      if (died !== null && year > died) {
        out.push(finding({
          ruleId: 'R9', kind: 'possible', title: 'Appears in a scene after their death',
          explanation: `${label(character, 'A character')} died in ${died}, but ${label(scene, 'a scene')} takes place in ${year}. That can be intended (a ghost, a memory, a vision); mark it intentional if so.`,
          evidence: [characterEvidence(character, `died ${died}`), sceneEvidence(scene, `year ${year}`)],
          values: ['after-death', year, died],
        }))
      } else if (born !== null && year < born) {
        out.push(finding({
          ruleId: 'R9', kind: 'possible', title: 'Appears in a scene before they were born',
          explanation: `${label(character, 'A character')} was born in ${born}, but ${label(scene, 'a scene')} takes place in ${year}.`,
          evidence: [characterEvidence(character, `born ${born}`), sceneEvidence(scene, `year ${year}`)],
          values: ['before-birth', year, born],
        }))
      }
    })
  })
  return out
}

// R10 — a scene set earlier in the story than the scene before it, without being marked as a flashback.
// Scenes marked flashback / flash-forward, and scenes with no known year, are skipped and do not move the baseline.
export function ruleSceneOrderVsChronology({ acts = [], chapters = [], scenes = [], timeline }) {
  const events = timelineLookup(timeline)
  const out = []
  let previous = null
  orderedScenes({ acts, chapters, scenes }).forEach(scene => {
    if (getSceneLinks(scene).timeShift) return
    const year = sceneStoryYear(scene, events)
    if (year === null) return
    if (previous && year < previous.year) {
      out.push(finding({
        ruleId: 'R10', kind: 'possible', title: 'Scene is set earlier than the one before it',
        explanation: `${label(scene, 'A scene')} is set in ${year}, but the scene before it (${label(previous.scene, 'a scene')}) is set in ${previous.year}. If this is a flashback, mark the scene as one; if it is intended, mark it intentional.`,
        evidence: [sceneEvidence(previous.scene, `year ${previous.year}`), sceneEvidence(scene, `year ${year}`)],
        values: [previous.year, year],
      }))
    }
    previous = { scene, year }
  })
  return out
}

const threadEvidence = (thread, value) => ({
  label: label(thread, 'Untitled thread'), recordType: 'thread', recordId: thread.id, value,
})

// Each live thread with where it appears, in manuscript order. Dropped threads are left out of every thread rule:
// the writer has said they are not part of the story.
function threadAppearances({ plotThreads = [], acts = [], chapters = [], scenes = [] }) {
  // Only scenes whose chapter is placed in an act, the same set the Outline and the Threads grid show.
  const placedChapters = new Set(chapters.filter(chapter => acts.some(act => act.id === chapter.actId)).map(chapter => chapter.id))
  const ordered = orderedScenes({ acts, chapters, scenes }).filter(scene => placedChapters.has(scene.chapterId))
  const appearances = new Map(plotThreads.filter(thread => thread?.id && thread.status !== 'dropped').map(thread => [thread.id, []]))
  ordered.forEach((scene, index) => {
    getSceneThreadLinks(scene).forEach(link => { appearances.get(link.threadId)?.push({ scene, index, role: link.role }) })
  })
  return { ordered, appearances, threads: plotThreads.filter(thread => appearances.has(thread.id)) }
}

// R13 — a payoff with no set-up before it, and a thread marked resolved that never pays off.
export function rulePlotThreadPayoff(input) {
  const { appearances, threads } = threadAppearances(input)
  const out = []
  threads.forEach(thread => {
    const found = appearances.get(thread.id)
    const firstPayoff = found.find(item => item.role === 'payoff')
    if (firstPayoff && !found.some(item => item.index < firstPayoff.index && (item.role === 'setup' || item.role === 'development'))) {
      out.push(finding({
        ruleId: 'R13', kind: 'possible', title: 'Pays off a thread that was never set up',
        explanation: `${label(firstPayoff.scene, 'A scene')} pays off "${label(thread, 'a thread')}", but no earlier scene sets it up or develops it. If the set-up is in the text but not marked, attach the thread to that scene.`,
        evidence: [threadEvidence(thread, 'payoff first'), sceneEvidence(firstPayoff.scene, 'pays off')],
        values: ['no-setup', firstPayoff.scene.id],
      }))
    }
    if (thread.status === 'resolved' && found.length > 0 && !firstPayoff) {
      out.push(finding({
        ruleId: 'R13', kind: 'possible', title: 'Marked resolved, but no scene pays it off',
        explanation: `"${label(thread, 'A thread')}" is marked resolved, but none of its ${found.length} scene${found.length === 1 ? '' : 's'} is marked as paying it off.`,
        evidence: [threadEvidence(thread, 'resolved'), ...found.slice(0, 5).map(item => sceneEvidence(item.scene, item.role))],
        values: ['no-payoff'],
      }))
    }
  })
  return out
}

// R14 — an open thread that does not reach the closing stretch of the manuscript.
export function rulePlotThreadOpenAtEnd(input) {
  const { ordered, appearances, threads } = threadAppearances(input)
  const total = ordered.length
  if (total < THREAD_ENDING_MIN_SCENES) return []
  const byChapter = new Map()
  ordered.forEach((scene, index) => { if (!byChapter.has(scene.chapterId)) byChapter.set(scene.chapterId, index) })
  const lastChapterStarts = [...byChapter.values()].sort((a, b) => a - b).slice(-THREAD_ENDING_CHAPTERS)
  const tailStart = Math.min(lastChapterStarts[0] ?? total, total - Math.ceil(total * THREAD_ENDING_FRACTION))
  const out = []
  threads.forEach(thread => {
    if (thread.status !== 'open') return
    const found = appearances.get(thread.id)
    if (!found.length) return
    const last = found[found.length - 1]
    if (last.index >= tailStart) return
    out.push(finding({
      ruleId: 'R14', kind: 'info', title: 'Open thread is absent from the end of the manuscript',
      explanation: `"${label(thread, 'A thread')}" is still open, but its last scene is ${label(last.scene, 'a scene')}, before the closing stretch of the manuscript. If it is meant to end earlier, mark it resolved; if it runs to the end, attach it to a later scene.`,
      evidence: [threadEvidence(thread, 'open'), sceneEvidence(last.scene, 'last appearance')],
      values: ['open-at-end', last.scene.id],
    }))
  })
  return out
}

// R15 — a long stretch of scenes with no sign of a thread. Only the longest gap per thread is reported.
export function rulePlotThreadGap(input, settings = DEFAULT_SETTINGS) {
  const maxGap = Number.isFinite(Number(settings.maxThreadGap)) ? Number(settings.maxThreadGap) : DEFAULT_SETTINGS.maxThreadGap
  const { appearances, threads } = threadAppearances(input)
  const out = []
  threads.forEach(thread => {
    const found = appearances.get(thread.id)
    let worst = null
    for (let i = 1; i < found.length; i += 1) {
      const between = found[i].index - found[i - 1].index - 1
      if (between > maxGap && (!worst || between > worst.between)) worst = { between, from: found[i - 1], to: found[i] }
    }
    if (!worst) return
    out.push(finding({
      ruleId: 'R15', kind: 'info', title: 'Long gap in a plot thread',
      explanation: `"${label(thread, 'A thread')}" does not appear for ${worst.between} scenes between ${label(worst.from.scene, 'a scene')} and ${label(worst.to.scene, 'a scene')}. Long gaps can be intended; a reminder scene is one way to keep the reader with it.`,
      evidence: [threadEvidence(thread, `${worst.between} scenes`), sceneEvidence(worst.from.scene, 'before the gap'), sceneEvidence(worst.to.scene, 'after the gap')],
      values: ['gap', worst.from.scene.id, worst.to.scene.id],
    }))
  })
  return out
}

// R16 — a thread nothing is attached to.
export function rulePlotThreadUnused(input) {
  const { appearances, threads } = threadAppearances(input)
  return threads.filter(thread => appearances.get(thread.id).length === 0).map(thread => finding({
    ruleId: 'R16', kind: 'info', title: 'Plot thread has no scenes',
    explanation: `"${label(thread, 'A thread')}" is not attached to any scene yet.`,
    evidence: [threadEvidence(thread, 'no scenes')],
    values: ['unused'],
  }))
}

// Info — observations only.
// ── Character knowledge (R17, R18; Release C). Only facts the writer recorded on a character; nothing is read from
// the prose. Only scenes in chapters placed in an act count, and a flashback or flash-forward is never compared.
const factPreview = fact => { const text = str(fact?.text).trim(); return text.length > 80 ? `${text.slice(0, 77)}...` : text }

function knowledgeFacts({ characters = [], acts = [], chapters = [], scenes = [] }) {
  const placedChapters = new Set(chapters.filter(chapter => acts.some(act => act.id === chapter.actId)).map(chapter => chapter.id))
  const ordered = orderedScenes({ acts, chapters, scenes }).filter(scene => placedChapters.has(scene.chapterId))
  const position = new Map(ordered.map((scene, index) => [scene.id, index]))
  const sceneById = new Map(ordered.map(scene => [scene.id, scene]))
  const facts = []
  characters.forEach(character => {
    ;(Array.isArray(character?.knowledge) ? character.knowledge : []).forEach(fact => {
      if (character?.id && fact?.id && str(fact.text).trim()) facts.push({ character, fact })
    })
  })
  return { position, sceneById, facts }
}

// R17 — a character acts on a fact in a scene that comes before the scene where they learn it.
export function ruleKnowledgeBeforeLearned(input) {
  const { position, sceneById, facts } = knowledgeFacts(input)
  const out = []
  facts.forEach(({ character, fact }) => {
    const learnedAt = sceneById.get(fact.learnedAtSceneId)
    if (!learnedAt || getSceneLinks(learnedAt).timeShift) return
    const learnedIndex = position.get(learnedAt.id)
    const early = (Array.isArray(fact.usedInSceneIds) ? fact.usedInSceneIds : [])
      .map(id => sceneById.get(id))
      .filter(scene => scene && !getSceneLinks(scene).timeShift && position.get(scene.id) < learnedIndex)
      .sort((a, b) => position.get(a.id) - position.get(b.id))[0]
    if (!early) return
    out.push(finding({
      ruleId: 'R17', kind: 'possible', title: 'Acts on something before learning it',
      explanation: `${label(character, 'A character')} acts on "${factPreview(fact)}" in ${label(early, 'a scene')}, but learns it later, in ${label(learnedAt, 'a scene')}. If they already knew it, change where they learn it. If this scene is a flashback or flash-forward, mark its order in the story.`,
      evidence: [characterEvidence(character, factPreview(fact)), sceneEvidence(early, 'acts on it'), sceneEvidence(learnedAt, 'learns it')],
      values: [fact.id, early.id],
    }))
  })
  return out
}

// R18 — a character acts on a fact that the writer never says they learn.
export function ruleKnowledgeNeverLearned(input) {
  const { position, sceneById, facts } = knowledgeFacts(input)
  const out = []
  facts.forEach(({ character, fact }) => {
    if (fact.learnedAtSceneId || fact.learnedAtEventId) return
    const used = (Array.isArray(fact.usedInSceneIds) ? fact.usedInSceneIds : [])
      .map(id => sceneById.get(id)).filter(Boolean)
      .sort((a, b) => position.get(a.id) - position.get(b.id))
    if (!used.length) return
    out.push(finding({
      ruleId: 'R18', kind: 'info', title: 'Acts on something with no recorded source',
      explanation: `${label(character, 'A character')} acts on "${factPreview(fact)}" in ${label(used[0], 'a scene')}${used.length > 1 ? ` and ${used.length - 1} other scene${used.length === 2 ? '' : 's'}` : ''}, but you have not recorded where they learn it. Add the scene or event where they find out.`,
      evidence: [characterEvidence(character, factPreview(fact)), ...used.slice(0, 4).map(scene => sceneEvidence(scene, 'acts on it'))],
      values: [fact.id],
    }))
  })
  return out
}

export function ruleObservations({ timeline, eras }) {
  const out = []
  const undated = timeline.filter(event => getTimelineYear(event) === null)
  if (undated.length) {
    out.push(finding({
      ruleId: 'I1', kind: 'info', title: `${undated.length} timeline event${undated.length === 1 ? ' has' : 's have'} no year`,
      explanation: 'Events with no readable year are left out of every date-based check.',
      evidence: undated.slice(0, 20).map(event => eventEvidence(event, 'no year')),
      values: [undated.length],
    }))
  }
  const dated = eras
    .map(era => ({ era, start: parseTimelineYear(era.startYear), end: parseTimelineYear(era.endYear) }))
    .filter(item => item.start !== null && item.end !== null)
  dated.forEach(({ era, start, end }) => {
    if (start > end) {
      out.push(finding({
        ruleId: 'I2', kind: 'confirmed', title: 'Era ends before it starts',
        explanation: `${label(era, 'An era')} starts in ${start} but ends in ${end}.`,
        evidence: [{ label: label(era, 'Era'), recordType: 'era', recordId: era.id, value: `${start} to ${end}` }],
        values: [start, end],
      }))
    }
  })
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const a = dated[i]
      const b = dated[j]
      if (a.start <= a.end && b.start <= b.end && a.start <= b.end && b.start <= a.end) {
        out.push(finding({
          ruleId: 'I3', kind: 'info', title: 'Eras overlap',
          explanation: `${label(a.era, 'An era')} and ${label(b.era, 'another era')} cover some of the same years. Events in the overlap cannot be assigned to an era automatically.`,
          evidence: [
            { label: label(a.era, 'Era'), recordType: 'era', recordId: a.era.id, value: `${a.start} to ${a.end}` },
            { label: label(b.era, 'Era'), recordType: 'era', recordId: b.era.id, value: `${b.start} to ${b.end}` },
          ],
          values: [a.start, a.end, b.start, b.end],
        }))
      }
    }
  }
  return out
}

export const RULES = [
  { id: 'R1', name: 'Death before birth', run: ruleDeathBeforeBirth },
  { id: 'R2', name: 'Status and date consistency', run: ruleStatusConsistency },
  { id: 'R3-R4', name: 'Events outside a character\'s lifetime', run: ruleEventsOutsideLifetime },
  { id: 'R5', name: 'Parent and child ages', run: ruleParentAge },
  { id: 'R6', name: 'Child born after parent\'s death', run: ruleChildAfterParentDeath },
  { id: 'R7', name: 'Events outside their era', run: ruleEventOutsideEra },
  { id: 'R8', name: 'Broken links', run: ruleDanglingReferences },
  { id: 'R9', name: 'Characters in scenes outside their lifetime', run: ruleCharacterInSceneOutsideLifetime },
  { id: 'R10', name: 'Scene order against the story timeline', run: ruleSceneOrderVsChronology },
  { id: 'R13', name: 'Plot thread payoff and set-up', run: rulePlotThreadPayoff },
  { id: 'R14', name: 'Open plot threads at the end', run: rulePlotThreadOpenAtEnd },
  { id: 'R15', name: 'Long gaps in a plot thread', run: rulePlotThreadGap },
  { id: 'R16', name: 'Plot threads with no scenes', run: rulePlotThreadUnused },
  { id: 'R17', name: 'Characters acting on something before they learn it', run: ruleKnowledgeBeforeLearned },
  { id: 'R18', name: 'Characters acting on something with no recorded source', run: ruleKnowledgeNeverLearned },
  { id: 'I', name: 'Observations', run: ruleObservations },
]
