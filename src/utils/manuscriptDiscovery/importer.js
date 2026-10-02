import { makeFamilyLink } from '../familyRelationships.js'
import { normalizeDiscoveryName } from './index.js'

const COLLECTION_BY_TYPE = {
  character: 'characters', location: 'locations', faction: 'factions', lore: 'loreEntries', timeline: 'timeline',
}

const displayName = (item, type) => type === 'lore' ? item.title : item.name

export function createDiscoveryProject(store, { title, type }) {
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) return null
  return store.addNovel({
    title: normalizedTitle,
    description: 'Created from local Manuscript Discovery',
    type,
  }, { seedManuscript: false })
}

export function findExistingEntity(type, name, store) {
  const collection = store[COLLECTION_BY_TYPE[type]] || []
  const key = normalizeDiscoveryName(name)
  const exact = collection.find(item => normalizeDiscoveryName(displayName(item, type)) === key)
  if (exact) return exact
  if (key.length < 4) return null
  const possible = collection.filter(item => {
    const existingKey = normalizeDiscoveryName(displayName(item, type))
    return existingKey.length >= 4 && (existingKey.split(' ').includes(key) || key.split(' ').includes(existingKey))
  })
  return possible.length === 1 ? possible[0] : null
}

export function annotateExistingMatches(candidateGroups, store) {
  return Object.fromEntries(Object.entries(candidateGroups).map(([group, items]) => [group, items.map(item => {
    const type = item.category || item.type
    const existing = findExistingEntity(type, item.name, store)
    return { ...item, existingMatch: existing ? { id: existing.id, name: displayName(existing, type) } : null, existingAction: existing ? 'keep' : 'create' }
  })]))
}

const blankPatch = (existing, proposed) => Object.fromEntries(Object.entries(proposed).filter(([key, value]) => {
  if (['id', 'novelId', 'createdAt'].includes(key)) return false
  const current = existing?.[key]
  return (current == null || current === '' || (Array.isArray(current) && current.length === 0)) && value != null && value !== ''
}))

function evidenceText(item) {
  const lines = (item.evidence || []).slice(0, 3).map(evidence => `${evidence.chapterTitle}: “${evidence.excerpt}”`)
  return lines.length ? `Discovered from manuscript evidence:\n${lines.join('\n')}` : ''
}

function createOrMerge(item, type, store, key, resolved) {
  const existing = item.existingMatch ? findExistingEntity(type, item.existingMatch.name, store) : findExistingEntity(type, item.name, store)
  if (existing && item.existingAction === 'keep') {
    resolved.set(normalizeDiscoveryName(item.name), existing.id)
    ;(item.aliases || []).forEach(alias => resolved.set(normalizeDiscoveryName(alias), existing.id))
    return { status: 'skipped', id: existing.id }
  }
  const metadata = { discoveryImportKey: key, discoveryEvidence: item.evidence || [] }
  let proposed
  let save
  if (type === 'character') {
    proposed = { name: item.name, keywords: item.aliases || [], bio: evidenceText(item), ...metadata }
    save = (data, id) => store.saveCharacter(data, id)
  } else if (type === 'location') {
    proposed = { name: item.name, category: 'Other', description: evidenceText(item), tags: ['Manuscript discovery'], ...metadata }
    save = (data, id) => store.saveLocation(data, id)
  } else if (type === 'faction') {
    proposed = { name: item.name, description: evidenceText(item), ...metadata }
    save = (data, id) => store.saveFaction(data, id)
  } else if (type === 'lore') {
    proposed = { title: item.name, category: item.categoryName || 'Other', content: evidenceText(item), tags: ['Manuscript discovery'], ...metadata }
    save = (data, id) => id ? store.updateLoreEntry(id, data) : store.addLoreEntry(data)
  } else if (type === 'timeline') {
    proposed = { title: item.name.slice(0, 100), date: item.dateLabel || '', dateRange: item.dateLabel || '', description: item.name, content: item.name, tags: ['Manuscript discovery'], ...metadata }
    save = (data, id) => id ? store.updateEvent(id, data) : store.addEvent(data, { createHistory: false })
  } else return { status: 'skipped' }

  if (existing && item.existingAction === 'update') {
    const saved = save(blankPatch(existing, proposed), existing.id)
    if (!saved) return { status: 'failed', message: `Could not update ${item.name}` }
    resolved.set(normalizeDiscoveryName(item.name), existing.id)
    return { status: 'merged', id: existing.id }
  }
  const alreadyImported = (store[COLLECTION_BY_TYPE[type]] || []).find(entity => entity.discoveryImportKey === key)
  if (alreadyImported) { resolved.set(normalizeDiscoveryName(item.name), alreadyImported.id); return { status: 'skipped', id: alreadyImported.id } }
  const saved = save(proposed)
  const id = typeof saved === 'string' ? saved : saved?.id
  if (!id) return { status: 'failed', message: `Could not create ${item.name}` }
  resolved.set(normalizeDiscoveryName(item.name), id)
  ;(item.aliases || []).forEach(alias => resolved.set(normalizeDiscoveryName(alias), id))
  return { status: 'imported', id }
}

function addRelationship(item, store, resolved, key) {
  const sourceId = resolved.get(normalizeDiscoveryName(item.sourceName)) || findExistingEntity('character', item.sourceName, store)?.id
  const targetId = resolved.get(normalizeDiscoveryName(item.targetName)) || findExistingEntity('character', item.targetName, store)?.id
  if (!sourceId || !targetId || sourceId === targetId) return { status: 'failed', message: `Relationship needs both ${item.sourceName} and ${item.targetName}` }
  const source = store.characters.find(character => character.id === sourceId) || {}
  const type = item.relationshipType
  if (['mother', 'father', 'parent'].includes(type)) {
    const saved = store.saveCharacter({ parentIds: [...new Set([...(source.parentIds || []), targetId])] }, sourceId)
    return saved ? { status: 'imported' } : { status: 'failed', message: item.name }
  }
  if (['daughter', 'son', 'child'].includes(type)) {
    const saved = store.saveCharacter({ childIds: [...new Set([...(source.childIds || []), targetId])] }, sourceId)
    return saved ? { status: 'imported' } : { status: 'failed', message: item.name }
  }
  if (['husband', 'wife', 'spouse'].includes(type)) {
    const saved = store.saveCharacter({ spouseIds: [...new Set([...(source.spouseIds || []), targetId])] }, sourceId)
    return saved ? { status: 'imported' } : { status: 'failed', message: item.name }
  }
  if (['brother', 'sister'].includes(type)) {
    if ((source.familyLinks || []).some(link => link.discoveryImportKey === key)) return { status: 'skipped' }
    const link = { ...makeFamilyLink({ sourceCharacterId: sourceId, targetCharacterId: targetId, kind: 'sibling', type: 'unknown', notes: evidenceText(item) }), discoveryImportKey: key }
    const saved = store.saveCharacter({ familyLinks: [...(source.familyLinks || []), link] }, sourceId)
    return saved ? { status: 'imported' } : { status: 'failed', message: item.name }
  }
  const linkType = ['friend', 'enemy'].includes(type) ? type : 'relative'
  const saved = store.saveRelationship(sourceId, targetId, linkType)
  return saved ? { status: 'imported' } : { status: 'failed', message: item.name }
}

function importStructure(acts, selectedOutline, document, store, importId) {
  const chapterBySource = new Map(document.chapters.map(chapter => [`${chapter.sourceActIndex}:${chapter.sourceChapterIndex}`, chapter]))
  const results = []
  acts.forEach((act, actIndex) => {
    const included = (act.chapters || []).map((chapter, chapterIndex) => ({ chapter, doc: chapterBySource.get(`${actIndex}:${chapterIndex}`) })).filter(entry => entry.doc && selectedOutline.has(entry.doc.id))
    if (!included.length) return
    const actKey = `${importId}:act:${actIndex}`
    let savedAct = store.acts.find(item => item.discoveryImportKey === actKey)
    if (!savedAct) {
      savedAct = store.addAct(act.title)
      if (savedAct) store.updateAct(savedAct.id, { discoveryImportKey: actKey })
    }
    if (!savedAct) { results.push({ status: 'failed', message: `Could not import ${act.title}` }); return }
    included.forEach(({ chapter, doc }) => {
      const outline = selectedOutline.get(doc.id)
      const chapterKey = `${importId}:chapter:${doc.order}`
      let savedChapter = store.chapters.find(item => item.discoveryImportKey === chapterKey)
      if (!savedChapter) {
        savedChapter = store.addChapter(savedAct.id, outline?.name || chapter.title, {
          discoveryImportKey: chapterKey,
          discovery: {
            possiblePov: outline?.possiblePov || '',
            characters: outline?.characters || [],
            locations: outline?.locations || [],
            newCharacters: outline?.newCharacters || [],
            newLocations: outline?.newLocations || [],
            timelineReferences: outline?.timelineReferences || [],
            wordCount: outline?.wordCount || doc.wordCount,
          },
        })
        ;(chapter.scenes || []).forEach((scene, sceneIndex) => {
          const savedScene = store.addScene(savedChapter?.id, scene.title || `Scene ${sceneIndex + 1}`)
          if (savedScene && scene.content?.trim()) store.updateSceneContent(savedScene.id, scene.content)
        })
        if (savedChapter && !(chapter.scenes || []).length) store.addScene(savedChapter.id, 'Scene')
      }
      results.push(savedChapter ? { status: 'imported' } : { status: 'failed', message: `Could not import ${chapter.title}` })
    })
  })
  return results
}

export async function importDiscoveries({ acts, document, candidateGroups, store, importId }) {
  const summary = { imported: {}, merged: {}, skipped: 0, failed: [] }
  const resolved = new Map(store.characters.map(character => [normalizeDiscoveryName(character.name), character.id]))
  const record = (type, result) => {
    if (result.status === 'failed') summary.failed.push(result.message || type)
    else if (result.status === 'skipped') summary.skipped += 1
    else {
      const bucket = result.status === 'merged' ? summary.merged : summary.imported
      bucket[type] = (bucket[type] || 0) + 1
    }
  }
  const all = Object.values(candidateGroups).flat().filter(item => item.selected && !item.mergedInto)
  const outline = all.filter(item => item.type === 'outline')
  importStructure(acts, new Map(outline.map(item => [item.chapterId, item])), document, store, importId).forEach(result => record('outline chapters', result))
  for (const item of all.filter(item => !['outline', 'relationship'].includes(item.type))) {
    const type = item.category || item.type
    record(type, createOrMerge(item, type, store, `${importId}:${item.id}`, resolved))
  }
  all.filter(item => item.type === 'relationship').forEach(item => record('relationships', addRelationship(item, store, resolved, `${importId}:${item.id}`)))
  return summary
}
