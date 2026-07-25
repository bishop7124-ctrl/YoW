import { describe, it, expect } from 'vitest'
import { populateProject, populateYowProject, relabelActsForType, parseManuscriptSections, buildUserMessage, isPromptTooLargeError, CONTENT_CHAR_CAPS, countLabel, stripFrontBackMatter } from './AIImportModal'

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

// ── Manuscript parsing (Gutenberg-style ebooks and plain manuscripts) ─────────

const gutenberg = `The Project Gutenberg eBook of Alice's Adventures in Wonderland

Title: Alice's Adventures in Wonderland
Author: Lewis Carroll

*** START OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***

Alice's Adventures in Wonderland

by Lewis Carroll

Contents

 CHAPTER I.     Down the Rabbit-Hole
 CHAPTER II.    The Pool of Tears
 CHAPTER III.   A Caucus-Race and a Long Tale



CHAPTER I.
Down the Rabbit-Hole


Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading.

CHAPTER II.
The Pool of Tears


"Curiouser and curiouser!" cried Alice; she was so much surprised that for the moment she quite forgot how to speak good English.

CHAPTER III.
A Caucus-Race and a Long Tale


They were indeed a queer-looking party that assembled on the bank — the birds with draggled feathers, the animals with their fur clinging close to them.

THE END

*** END OF THE PROJECT GUTENBERG EBOOK ALICE'S ADVENTURES IN WONDERLAND ***

Updated editions will replace the previous one — the old editions will be renamed. Creating the works from print editions not protected by U.S. copyright law means that no one owns a United States copyright in these works.
`

describe('parseManuscriptSections', () => {
  it('parses a Gutenberg ebook into correctly titled chapters with no boilerplate', () => {
    const sections = parseManuscriptSections(gutenberg)
    expect(sections.map(s => s.title)).toEqual([
      'CHAPTER I. Down the Rabbit-Hole',
      'CHAPTER II. The Pool of Tears',
      'CHAPTER III. A Caucus-Race and a Long Tale',
    ])
    expect(sections[0].content).toMatch(/^Alice was beginning/)
    // License text and TOC must not leak into any chapter
    const all = sections.map(s => s.content).join('\n')
    expect(all).not.toMatch(/Project Gutenberg/i)
    expect(all).not.toMatch(/CHAPTER II\.\s+The Pool/) // TOC line
  })

  it('merges a title line following a bare heading, but not prose', () => {
    const text = `Chapter 1\nThe Beginning\n\n${'Once upon a time there was a kingdom by the sea. '.repeat(5)}\n\nChapter 2\nIt was raining hard that night and the road to the castle\nwas washed out entirely, so the riders turned back.\n\nMore prose here to pad the section out past the minimum length for a section.`
    const sections = parseManuscriptSections(text)
    expect(sections[0].title).toBe('Chapter 1 The Beginning')
    // Chapter 2's next line is wrapped prose (line after it is not blank) — no merge
    expect(sections[1].title).toBe('Chapter 2')
    expect(sections[1].content).toMatch(/^It was raining/)
  })

  it('does not treat an inline-subtitled heading as bare', () => {
    const text = `Chapter 1: The Fall\n\n${'Words of the first chapter go here to pass length checks. '.repeat(3)}\n\nChapter 2: The Rise\n\n${'Words of the second chapter go here to pass length checks. '.repeat(3)}`
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual(['Chapter 1: The Fall', 'Chapter 2: The Rise'])
  })

  it('keeps a "Contents" line that is not followed by a TOC listing', () => {
    const text = `Some preamble text here.\n\nContents\n\nShe opened the box and examined the contents carefully, one item at a time, laying each on the table.`
    expect(stripFrontBackMatter(text)).toContain('Contents')
  })

  it('tolerates a blank line between a bare heading and its subtitle', () => {
    // Some books put a blank line between "CHAPTER SIX" and its subtitle
    // rather than stacking them on consecutive lines.
    const text = `Chapter One\n\nThe Journey Begins\n\n${'Once the travelers set out, nothing was ever quite the same again. '.repeat(4)}`
    const sections = parseManuscriptSections(text)
    expect(sections[0].title).toBe('Chapter One The Journey Begins')
  })
})

describe('buildUserMessage', () => {
  it('sends small files whole', () => {
    const msg = buildUserMessage([{ name: 'a.txt', content: 'Short story text.' }], [])
    expect(msg).toContain('=== a.txt ===')
    expect(msg).toContain('Short story text.')
  })

  it('sends the full manuscript untouched when under the cap, even if long', () => {
    // A book-length manuscript (e.g. Alice in Wonderland, ~145K chars) should
    // go through whole — sampling is a last resort, not the common path.
    const sections = Array.from({ length: 12 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: `UNIQUE_MARKER_${i + 1}_START ` + 'lorem ipsum '.repeat(1000) + ` UNIQUE_MARKER_${i + 1}_END`,
    }))
    const files = [{ name: 'book.txt', content: sections.map(s => `${s.title}\n${s.content}`).join('\n\n') }]
    const msg = buildUserMessage(files, sections)
    expect(msg).toContain('Analyze these writing files')
    expect(msg).toContain('UNIQUE_MARKER_1_START')
    expect(msg).toContain('UNIQUE_MARKER_12_END')
  })

  it('samples the start, middle, and end of every chapter when content exceeds the cap', () => {
    const sections = Array.from({ length: 40 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: `MARKER_${i + 1}_START ` + 'lorem ipsum '.repeat(2000) + ` MARKER_${i + 1}_MID ` + 'lorem ipsum '.repeat(2000) + ` MARKER_${i + 1}_END`,
    }))
    const files = [{ name: 'book.txt', content: sections.map(s => `${s.title}\n${s.content}`).join('\n\n') }]
    const msg = buildUserMessage(files, sections)
    expect(msg.length).toBeLessThan(310000)
    // Truncating at the head would lose late chapters entirely, and a
    // head-only excerpt per chapter would lose each chapter's ending.
    expect(msg).toContain('MARKER_1_START')
    expect(msg).toContain('MARKER_39_START')
    expect(msg).toContain('=== Chapter 40 ===')
  })
})

describe('isPromptTooLargeError', () => {
  it('recognizes the OpenRouter free-tier prompt token cap message', () => {
    expect(isPromptTooLargeError('Prompt tokens limit exceeded: 47195 > 29866. To increase, visit https://openrouter.ai/settings/credits and upgrade to a paid account')).toBe(true)
  })

  it('recognizes generic "maximum context length" style messages', () => {
    expect(isPromptTooLargeError("This model's maximum context length is 16385 tokens")).toBe(true)
    expect(isPromptTooLargeError('input is too long for requested model')).toBe(true)
  })

  it('does not misclassify unrelated errors', () => {
    expect(isPromptTooLargeError('Invalid API key')).toBe(false)
    expect(isPromptTooLargeError('The AI provider is rate-limiting requests')).toBe(false)
    expect(isPromptTooLargeError('')).toBe(false)
    expect(isPromptTooLargeError(undefined)).toBe(false)
  })
})

describe('buildUserMessage with a reduced cap (retry ladder)', () => {
  it('fits a manuscript that overflowed the largest cap into a much smaller one', () => {
    const sections = Array.from({ length: 12 }, (_, i) => ({
      title: `Chapter ${i + 1}`,
      content: `MARKER_${i + 1} ` + 'lorem ipsum '.repeat(1500),
    }))
    const files = [{ name: 'book.txt', content: sections.map(s => `${s.title}\n${s.content}`).join('\n\n') }]
    const smallCap = CONTENT_CHAR_CAPS[CONTENT_CHAR_CAPS.length - 1]
    const msg = buildUserMessage(files, sections, smallCap)
    expect(msg.length).toBeLessThan(smallCap + 5000) // small formatting overhead is fine
    expect(msg).toContain('=== Chapter 12 ===')
    expect(msg).toContain('MARKER_1')
  })
})

describe('countLabel', () => {
  it('pluralizes already-plural keys correctly instead of double-appending "s"', () => {
    expect(countLabel({ characters: Array(34).fill({}) }, 'characters')).toBe('34 characters')
    expect(countLabel({ characters: [{}] }, 'characters')).toBe('1 character')
    expect(countLabel({ locations: Array(9).fill({}) }, 'locations')).toBe('9 locations')
    expect(countLabel({ locations: [{}] }, 'locations')).toBe('1 location')
    expect(countLabel({ factions: Array(5).fill({}) }, 'factions')).toBe('5 factions')
    expect(countLabel({ factions: [{}] }, 'factions')).toBe('1 faction')
  })

  it('gives worldHistory an irregular plural instead of "world historys"', () => {
    expect(countLabel({ worldHistory: Array(2).fill({}) }, 'worldHistory')).toBe('2 world history entries')
    expect(countLabel({ worldHistory: [{}] }, 'worldHistory')).toBe('1 world history entry')
  })

  it('pluralizes timeline as "timeline events"', () => {
    expect(countLabel({ timeline: Array(2).fill({}) }, 'timeline')).toBe('2 timeline events')
    expect(countLabel({ timeline: [{}] }, 'timeline')).toBe('1 timeline event')
  })

  it('keeps lore as "entries"/"entry"', () => {
    expect(countLabel({ lore: Array(7).fill({}) }, 'lore')).toBe('7 entries')
    expect(countLabel({ lore: [{}] }, 'lore')).toBe('1 entry')
  })
})

describe('parseManuscriptSections — decorative headings and false-positive guarding', () => {
  it('recognizes headings wrapped in decorative dashes (e.g. "— CHAPTER ONE —")', () => {
    const text = [
      '— CHAPTER ONE —', '', 'The Boy Who Lived', '',
      `${'Mr and Mrs Dursley were perfectly normal, thank you very much. '.repeat(4)}`,
      '', '— CHAPTER TWO —', '', 'The Vanishing Glass', '',
      `${'Nearly ten years had passed since the Dursleys had found their nephew. '.repeat(4)}`,
    ].join('\n')
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual(['CHAPTER ONE The Boy Who Lived', 'CHAPTER TWO The Vanishing Glass'])
  })

  it('does not split on an in-story ALL-CAPS letterhead once real chapter markers are established', () => {
    // Mirrors a real book: explicit "— CHAPTER N —" markers throughout, plus
    // an in-fiction letter with an ALL-CAPS letterhead and a numbered list —
    // neither should be mistaken for a chapter break once real markers exist.
    const para = (s) => s.repeat(4)
    const text = [
      '— CHAPTER ONE —', '', 'The Boy Who Lived', '', para('First chapter prose goes here. '),
      '', '— CHAPTER TWO —', '', 'The Vanishing Glass', '', para('Second chapter prose goes here. '),
      '', 'He read the letter:', '',
      'HOGWARTS SCHOOL OF WITCHCRAFT AND WIZARDRY', '',
      'Headmaster: Albus Dumbledore', '',
      '1. Three sets of plain work robes', '',
      para('The rest of the second chapter continues here after the letter. '),
      '', '— CHAPTER THREE —', '', 'The Letters from No One', '', para('Third chapter prose goes here. '),
    ].join('\n')
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual([
      'CHAPTER ONE The Boy Who Lived',
      'CHAPTER TWO The Vanishing Glass',
      'CHAPTER THREE The Letters from No One',
    ])
    // The letterhead and list item should still be present as ordinary body text
    expect(sections[1].content).toContain('HOGWARTS SCHOOL OF WITCHCRAFT AND WIZARDRY')
    expect(sections[1].content).toContain('Three sets of plain work robes')
  })

  it('still uses the ALL-CAPS fallback when a document has no explicit chapter markers at all', () => {
    const para = (s) => s.repeat(6)
    const text = [
      'THE FIRST BETRAYAL', '', para('Opening section prose goes here. '),
      '', 'THE LONG ROAD HOME', '', para('Second section prose goes here. '),
    ].join('\n')
    const sections = parseManuscriptSections(text)
    expect(sections.map(s => s.title)).toEqual(['THE FIRST BETRAYAL', 'THE LONG ROAD HOME'])
  })
})
