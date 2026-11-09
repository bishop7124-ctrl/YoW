import { navigateToFindingRef } from './aiFindingNav'

const switchSection = (section, entryId) =>
  window.dispatchEvent(new CustomEvent('switch-section', { detail: entryId ? { section, entryId } : { section } }))

// Opens the record behind a search result or connection. Reuses the existing navigation for the types the
// AI findings already open, and adds the rest (factions, schedule, ideas, history, maps, acts).
export function openRecord(store, { type, id }) {
  if (!type || !id) return false
  switch (type) {
    case 'character':
    case 'location':
    case 'lore':
    case 'timeline':
    case 'scene':
      navigateToFindingRef(store, { type, id })
      return true
    case 'chapter':
      navigateToFindingRef(store, { type, id })
      if (!(store.scenes || []).some(scene => scene.chapterId === id)) window.dispatchEvent(new CustomEvent('switch-writing'))
      return true
    case 'act': {
      const chapterIds = new Set((store.chapters || []).filter(chapter => chapter.actId === id).map(chapter => chapter.id))
      const first = (store.scenes || []).find(scene => chapterIds.has(scene.chapterId))
      if (first) store.setSelectedSceneId?.(first.id)
      window.dispatchEvent(new CustomEvent('switch-writing'))
      return true
    }
    case 'faction': switchSection('factions', id); return true
    case 'schedule': switchSection('schedule', id); return true
    case 'idea': store.setSelectedIdeaEntryId?.(id); switchSection('ideas'); return true
    case 'history': store.setSelectedHistoryEntryId?.(id); switchSection('worldhistory'); return true
    case 'map': store.selectMap?.(id); switchSection('map'); return true
    default: return false
  }
}
