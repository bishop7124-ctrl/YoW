// Structure coverage (roadmap B5): which beats of a story-structure template the writer has given a chapter to.
// The beats come from the manuscript templates (src/components/Manuscript/manuscriptTemplates.js), so the template
// that scaffolds a project and the template it is checked against are always the same thing. The writer places
// chapters on beats; nothing is inferred from the text. Stored on the project record as `structureMap`:
//   { templateId, byTemplate: { [templateId]: { [beatKey]: [chapterId, ...] } } }
// Per-template maps are kept so switching templates never loses work. Pure helpers, tolerant of junk.

const slug = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'beat'

// Templates with real beats to cover. The blank scaffolds (one placeholder act and chapter) have nothing to check
// against, so templates named "...-blank" and anything with fewer than three beats are left out.
export const MIN_BEATS = 3
export const coverageTemplates = templates => (Array.isArray(templates) ? templates : [])
  .filter(template => !/-blank$/.test(String(template?.id || '')) && templateBeats(template).length >= MIN_BEATS)

// Flat, ordered beats of a template: [{ key, label, guidance, actTitle, index }]. Keys come from the beat's title and
// are made unique within the template, so they stay stable as long as the beat titles do.
export function templateBeats(template) {
  const beats = []
  const used = new Map()
  ;(Array.isArray(template?.acts) ? template.acts : []).forEach(act => {
    ;(Array.isArray(act?.chapters) ? act.chapters : []).forEach(chapter => {
      const base = slug(chapter?.title)
      const count = used.get(base) || 0
      used.set(base, count + 1)
      beats.push({
        key: count === 0 ? base : `${base}-${count + 1}`,
        label: String(chapter?.title || 'Beat'),
        guidance: String(chapter?.guidance || ''),
        actTitle: String(act?.title || ''),
        index: beats.length,
      })
    })
  })
  return beats
}

export function normalizeStructureMap(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const byTemplate = {}
  Object.entries(source.byTemplate && typeof source.byTemplate === 'object' ? source.byTemplate : {}).forEach(([templateId, beats]) => {
    if (!beats || typeof beats !== 'object') return
    byTemplate[templateId] = Object.fromEntries(
      Object.entries(beats)
        .map(([key, ids]) => [key, [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && id))]])
        .filter(([, ids]) => ids.length > 0),
    )
  })
  return { templateId: typeof source.templateId === 'string' ? source.templateId : '', byTemplate }
}

// ---- patches: each returns the whole next structureMap, or null when nothing would change ----------------

export function chooseTemplateMap(raw, templateId) {
  const map = normalizeStructureMap(raw)
  return map.templateId === templateId ? null : { ...map, templateId }
}

export function assignChapterMap(raw, templateId, beatKey, chapterId) {
  if (!templateId || !beatKey || !chapterId) return null
  const map = normalizeStructureMap(raw)
  const beats = map.byTemplate[templateId] || {}
  if ((beats[beatKey] || []).includes(chapterId)) return null
  return { ...map, byTemplate: { ...map.byTemplate, [templateId]: { ...beats, [beatKey]: [...(beats[beatKey] || []), chapterId] } } }
}

export function unassignChapterMap(raw, templateId, beatKey, chapterId) {
  const map = normalizeStructureMap(raw)
  const beats = map.byTemplate[templateId] || {}
  if (!(beats[beatKey] || []).includes(chapterId)) return null
  const remaining = beats[beatKey].filter(id => id !== chapterId)
  const nextBeats = { ...beats }
  if (remaining.length) nextBeats[beatKey] = remaining
  else delete nextBeats[beatKey]
  return { ...map, byTemplate: { ...map.byTemplate, [templateId]: nextBeats } }
}

// Coverage of one template against the manuscript's chapters (in manuscript order).
//   chapters: [{ id, title }] in order. A chapter id that no longer exists is ignored (and not counted).
// Returns { beats: [{ ...beat, chapters: [{ id, title, number }], placed, outOfOrder }], placedCount, total,
//           unmappedChapters: [{ id, title, number }] }
export function buildStructureCoverage({ template, structureMap, chapters }) {
  const beats = templateBeats(template)
  const list = Array.isArray(chapters) ? chapters.filter(chapter => chapter?.id) : []
  const numberById = new Map(list.map((chapter, index) => [chapter.id, index + 1]))
  const chapterById = new Map(list.map(chapter => [chapter.id, chapter]))
  const assigned = normalizeStructureMap(structureMap).byTemplate[template?.id] || {}

  let previousFirst = -1
  const out = beats.map(beat => {
    const found = (assigned[beat.key] || [])
      .filter(id => chapterById.has(id))
      .map(id => ({ id, title: chapterById.get(id).title || 'Untitled chapter', number: numberById.get(id) }))
      .sort((a, b) => a.number - b.number)
    const first = found.length ? found[0].number : null
    // A beat sits "out of order" when its first chapter comes before the first chapter of an earlier beat.
    const outOfOrder = first !== null && previousFirst !== -1 && first < previousFirst
    if (first !== null) previousFirst = Math.max(previousFirst, first)
    return { ...beat, chapters: found, placed: found.length > 0, outOfOrder }
  })

  const used = new Set(out.flatMap(beat => beat.chapters.map(chapter => chapter.id)))
  return {
    beats: out,
    placedCount: out.filter(beat => beat.placed).length,
    total: out.length,
    unmappedChapters: list.filter(chapter => !used.has(chapter.id)).map(chapter => ({ id: chapter.id, title: chapter.title || 'Untitled chapter', number: numberById.get(chapter.id) })),
  }
}
