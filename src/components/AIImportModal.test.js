import { describe, it, expect } from 'vitest'
import { populateProject, populateYowProject, relabelActsForType } from './AIImportModal'

// Minimal store double capturing what the populate helpers create.
function mockStore() {
  const calls = {
    characters: [], locations: [], lore: [], history: [], events: [], ideas: [],
    acts: [], chapters: [], scenes: [], comicPages: [], comicPanels: [], rpgCharacters: [],
  }
  let n = 0
  const nid = (p) => `${p}-${++n}`
  return {
    calls,
    activeNovelId: 'novel-new',
    saveCharacter: (data, id) => {
      if (id) { Object.assign(calls.characters.find(c => c.id === id), data); return id }
      const newId = nid('char'); calls.characters.push({ ...data, id: newId }); return newId
    },
    addLocation: (data) => { const item = { ...data, id: nid('loc') }; calls.locations.push(item); return item },
    setFactions: () => {},
    addLoreEntry: (data) => { const item = { ...data, id: nid('lore') }; calls.lore.push(item); return item },
    addHistoryEntry: (data) => { const item = { ...data, id: nid('hist') }; calls.history.push(item); return item },
    addEvent: (data) => { const item = { ...data, id: nid('event') }; calls.events.push(item); return item },
    addIdeaEntry: (data) => { const item = { ...data, id: nid('idea') }; calls.ideas.push(item); return item },
    addAct: (title) => { const a = { id: nid('act'), title }; calls.acts.push(a); return a },
    updateAct: (id, data) => Object.assign(calls.acts.find(a => a.id === id), data),
    addChapter: (actId, title) => { const c = { id: nid('chap'), actId, title }; calls.chapters.push(c); return c },
    updateChapter: (id, data) => Object.assign(calls.chapters.find(c => c.id === id), data),
    addScene: (chapterId, title) => { const s = { id: nid('scene'), chapterId, title }; calls.scenes.push(s); return s },
    updateScene: (id, data) => Object.assign(calls.scenes.find(s => s.id === id), data),
    addComicPage: (issueId, data) => { const p = { id: nid('page'), issueId, ...data }; calls.comicPages.push(p); return p },
    addComicPanel: (pageId, data) => { const p = { id: nid('panel'), pageId, ...data }; calls.comicPanels.push(p); return p },
    saveRpgCharacter: (data) => { const id = nid('rpg'); calls.rpgCharacters.push({ ...data, id }); return id },
    addMap: () => {}, updateActiveMapData: () => {}, addScheduleEvent: () => {},
  }
}

describe('relabelActsForType', () => {
  const acts = [{
    title: 'Act 1',
    chapters: [
      { title: 'Chapter 1', scenes: [{ title: 'Chapter 1', content: 'x' }] },
      { title: 'The Fall of Kings', scenes: [{ title: 'The Fall of Kings', content: 'y' }] },
    ],
  }]

  it('renames generated fallback titles to the target type structure', () => {
    const out = relabelActsForType(acts, 'dnd_campaign')
    expect(out[0].title).toBe('Story Arc 1')
    expect(out[0].chapters[0].title).toBe('Session 1')
    // scene title mirrors its chapter, so it follows the rename
    expect(out[0].chapters[0].scenes[0].title).toBe('Session 1')
  })

  it('keeps titles taken from real document headings', () => {
    const out = relabelActsForType(acts, 'tabletop_rpg')
    expect(out[0].chapters[1].title).toBe('The Fall of Kings')
    expect(out[0].chapters[1].scenes[0].title).toBe('The Fall of Kings')
  })

  it('is a no-op for novel projects', () => {
    const out = relabelActsForType(acts, 'novel')
    expect(out[0].title).toBe('Act 1')
    expect(out[0].chapters[0].title).toBe('Chapter 1')
  })
})

describe('populateProject', () => {
  const proseData = {
    acts: [{
      title: 'Act 1',
      synopsis: 'The setup',
      chapters: [{
        title: 'Chapter 1',
        synopsis: 'It begins',
        scenes: [{ title: 'Chapter 1', synopsis: 'It begins', content: 'Once upon a time.' }],
      }],
    }],
    ideaEntries: [{ title: 'Loose note', description: 'A thought', body: 'A thought' }],
  }

  it('creates scenes with content for non-comic types', () => {
    const store = mockStore()
    populateProject(store, proseData, { acts: true }, 'novella')
    expect(store.calls.acts[0].title).toBe('Part 1')
    expect(store.calls.scenes).toHaveLength(1)
    expect(store.calls.scenes[0].content).toBe('Once upon a time.')
    expect(store.calls.comicPages).toHaveLength(0)
  })

  it('creates comic pages instead of scenes for comic projects', () => {
    const store = mockStore()
    populateProject(store, proseData, { acts: true }, 'comic')
    expect(store.calls.acts[0].title).toBe('Volume 1')
    expect(store.calls.chapters[0].title).toBe('Issue 1')
    expect(store.calls.scenes).toHaveLength(0)
    expect(store.calls.comicPages).toHaveLength(1)
    expect(store.calls.comicPages[0].issueId).toBe(store.calls.chapters[0].id)
    expect(store.calls.comicPages[0].summary).toBe('Once upon a time.')
  })

  it('imports idea entries when selected', () => {
    const store = mockStore()
    populateProject(store, proseData, { ideaEntries: true }, 'novel')
    expect(store.calls.ideas).toHaveLength(1)
    expect(store.calls.ideas[0].title).toBe('Loose note')
  })
})

describe('populateYowProject', () => {
  it('restores comic pages/panels with remapped issue, page, and character ids', () => {
    const store = mockStore()
    const data = {
      characters: [{ id: 'old-char', name: 'Mika' }],
      acts: [{ id: 'old-act', title: 'Volume 1', order: 0 }],
      chapters: [{ id: 'old-chap', actId: 'old-act', title: 'Issue 1', order: 0 }],
      scenes: [],
      comicPages: [{ id: 'old-page', novelId: 'old-novel', issueId: 'old-chap', order: 0, title: 'Page 1', summary: 'Beat', characterIds: ['old-char'] }],
      comicPanels: [{ id: 'old-panel', novelId: 'old-novel', pageId: 'old-page', order: 0, description: 'Close-up', characterIds: ['old-char'] }],
    }
    populateYowProject(store, data, { acts: true, characters: true })
    const page = store.calls.comicPages[0]
    const panel = store.calls.comicPanels[0]
    expect(page.issueId).toBe(store.calls.chapters[0].id)
    expect(page.characterIds).toEqual([store.calls.characters[0].id])
    expect(panel.pageId).toBe(page.id)
    expect(panel.characterIds).toEqual([store.calls.characters[0].id])
  })

  it('restores character builder party members', () => {
    const store = mockStore()
    const data = { rpgCharacters: [{ id: 'old-rpg', novelId: 'old-novel', name: 'Thorn', class: 'Ranger' }] }
    populateYowProject(store, data, { rpgCharacters: true })
    expect(store.calls.rpgCharacters).toHaveLength(1)
    expect(store.calls.rpgCharacters[0].name).toBe('Thorn')
    expect(store.calls.rpgCharacters[0]).not.toHaveProperty('novelId')
  })
})
