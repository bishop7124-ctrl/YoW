import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildActs, parseManuscriptSections, populateProject } from '../components/AIImportModal'
import { dropHistoryDuplicatesOfTimeline, isPartTitle, isReferenceTitle, notesToIdeas, parseComicPanels, prepareImportSections, sessionPartOf } from './importStructure'

const fixture = (name) => readFileSync(new URL(`../../tests/fixtures/ai-import/${name}`, import.meta.url), 'utf8')
const prepare = (text) => prepareImportSections(text, parseManuscriptSections(text))

describe('prepareImportSections', () => {
  it('keeps only the five novel chapters, groups them into the three Parts, and saves reference sections as notes', () => {
    const { sections, notes } = prepare(fixture('1-novel-The-Salt-Lantern.md'))
    expect(sections.map(s => s.title)).toEqual([
      'Chapter 1: Low Tide', 'Chapter 2: The Archivist', "Chapter 3: Brandt's Offer", 'Chapter 4: Into the Fog', 'Chapter 5: Greywatch',
    ])
    expect(notes.map(n => n.title)).toEqual(['The Salt Lantern', 'Characters', 'Locations', 'Lore', 'Timeline'])

    const acts = buildActs(sections, {}, {})
    expect(acts.map(a => a.title)).toEqual([
      'Part One: The Light That Should Not Burn', 'Part Two: The Names of the Drowned', 'Part Three: What the Lamp Keeps',
    ])
    expect(acts.map(a => a.chapters.length)).toEqual([2, 2, 1])
    // prose is untouched
    expect(acts[0].chapters[0].scenes[0].content).toContain('Mara Venn waded across the tidal flats')
  })

  it('turns notes into ideas without losing their text', () => {
    const { notes } = prepare(fixture('1-novel-The-Salt-Lantern.md'))
    const ideas = notesToIdeas(notes)
    expect(ideas).toHaveLength(5)
    expect(ideas.find(i => i.title === 'Imported notes: Characters').body).toContain('Tobias Quill')
  })

  it('leaves a document with no markdown headings alone', () => {
    const text = 'CHAPTER I.\n\n' + 'word '.repeat(60) + '\n\nCHAPTER II.\n\n' + 'word '.repeat(60)
    const sections = parseManuscriptSections(text)
    const { sections: kept, notes } = prepareImportSections(text, sections)
    expect(kept).toHaveLength(sections.length)
    expect(notes).toHaveLength(0)
    expect(buildActs(kept, {}, {}).map(a => a.title)).toEqual(['Act 1'])
  })

  it('keeps long prose under a top-level title as a chapter rather than demoting it to notes', () => {
    const text = `# My Book\n\n${'It was a quiet night in the old town. '.repeat(40)}\n\n## Chapter 1\n\n${'More story follows here. '.repeat(30)}`
    const { sections, notes } = prepare(text)
    expect(notes).toHaveLength(0)
    expect(sections.length).toBeGreaterThanOrEqual(2)
  })

  it('does not treat a chapter that merely mentions a reference word as a note', () => {
    expect(isReferenceTitle('Locations')).toBe(true)
    expect(isReferenceTitle('Non-Player Characters')).toBe(true)
    expect(isReferenceTitle('Chapter 3: History')).toBe(false)
    expect(isReferenceTitle('The Locations Dispute')).toBe(false)
    expect(isPartTitle('Part Two: The Names of the Drowned')).toBe(true)
    expect(isPartTitle('Partial Recall')).toBe(false)
  })
})

describe('campaign sessions', () => {
  it('merges Session Prep and Session Recap into one session with two scenes, and drops the reference sections', () => {
    const { sections, notes } = prepare(fixture('4-dnd-campaign-The-Hollow-Crown.md'))
    expect(sections.map(s => s.title)).toEqual(['Session Prep: Session 1 - The Empty Tomb', 'Session Recap: Session 1'])
    expect(notes.map(n => n.title)).toEqual(expect.arrayContaining(['Premise', 'Factions', 'Non-Player Characters', 'Locations']))

    const acts = buildActs(sections, {}, {})
    expect(acts).toHaveLength(1)
    expect(acts[0].chapters).toHaveLength(1)
    const [session] = acts[0].chapters
    expect(session.title).toBe('Session 1 - The Empty Tomb')
    expect(session.scenes.map(s => s.title)).toEqual(['Session Prep', 'Session Recap'])
    expect(session.scenes[0].content).toContain('Crypt of the Wight')
    expect(session.scenes[1].content).toContain('shadow Kessa Redhand')
  })

  it('parses prep/recap titles', () => {
    expect(sessionPartOf('Session Prep: Session 3 - The Marsh')).toMatchObject({ kind: 'Prep', key: '3', rest: 'Session 3 - The Marsh' })
    expect(sessionPartOf('Session Recap: Session 3')).toMatchObject({ kind: 'Recap', key: '3' })
    expect(sessionPartOf('Session 3')).toBeNull()
  })

  it('does the same for the tabletop file', () => {
    const { sections } = prepare(fixture('5-ttrpg-campaign-Ashfall-Station.md'))
    const acts = buildActs(sections, {}, {})
    expect(acts[0].chapters).toHaveLength(1)
    expect(acts[0].chapters[0].scenes).toHaveLength(2)
  })
})

describe('comic pages and panels', () => {
  it('keeps only Page sections as pages', () => {
    const { sections, notes } = prepare(fixture('6-comic-Neon-Saints.md'))
    expect(sections.map(s => s.title)).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4'])
    expect(notes.map(n => n.title)).toEqual(expect.arrayContaining(['Characters', 'Locations']))
  })

  it('splits a page into panels with dialogue, captions and sound effects', () => {
    const { sections } = prepare(fixture('6-comic-Neon-Saints.md'))
    const page1 = parseComicPanels(sections[0].content)
    expect(page1.panels).toHaveLength(3)
    expect(page1.panels[0].captions[0].text).toBe('Every city has its saints. Ours just happen to be late.')
    expect(page1.panels[0].description).toContain('Wide establishing shot of Neon Row')
    expect(page1.panels[1].dialogue).toEqual([expect.objectContaining({ speaker: 'Juno', text: 'Three minutes. I can do three minutes.' })])
    const page2 = parseComicPanels(sections[1].content)
    expect(page2.panels[1].sfx[0].text).toBe('FWOOOM')
    expect(page2.panels[2].dialogue[0]).toMatchObject({ speaker: 'Drone', text: 'Unauthorised entry.' })
  })

  it('returns no panels for prose so the page keeps its text', () => {
    expect(parseComicPanels('Once upon a time.').panels).toEqual([])
  })

  it('creates panel records through populateProject for comics', () => {
    const calls = { pages: [], panels: [] }
    const store = {
      addAct: (title) => ({ id: 'a1', title }),
      updateAct: () => {},
      addChapter: (actId, title) => ({ id: 'c1', title }),
      updateChapter: () => {},
      addComicPage: (issueId, data) => { const p = { id: `p${calls.pages.length}`, ...data }; calls.pages.push(p); return p },
      addComicPanel: (pageId, data) => { calls.panels.push({ pageId, ...data }); return data },
    }
    const { sections } = prepare(fixture('6-comic-Neon-Saints.md'))
    populateProject(store, { acts: buildActs(sections, {}, {}) }, { acts: true }, 'comic')
    expect(calls.pages.map(p => p.title)).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4'])
    expect(calls.panels).toHaveLength(3 + 3 + 1 + 2)
    expect(calls.panels[0].pageId).toBe('p0')
  })
})

describe('dropHistoryDuplicatesOfTimeline', () => {
  const timeline = [
    { title: 'Greywatch Lighthouse is built', description: 'The lighthouse is constructed after the Great Wreck.' },
    { title: 'Edrin Venn disappears', description: "Mara's father vanishes on a foggy night." },
  ]
  it('drops history entries that restate timeline events and keeps genuinely new background', () => {
    const history = [
      { title: 'The Great Wreck and Greywatch’s Construction', content: 'After the Great Wreck, Greywatch Lighthouse is built.' },
      { title: 'Edrin Venn Disappears', content: "Mara's father, Edrin Venn, disappears on a foggy night." },
      { title: 'The Tidal Guilds', content: 'Salvage guilds formed along the coast and divided the wrecks between them.' },
    ]
    expect(dropHistoryDuplicatesOfTimeline(history, timeline).map(h => h.title)).toEqual(['The Tidal Guilds'])
  })
  it('keeps everything when there is no timeline', () => {
    const history = [{ title: 'A', content: 'b' }]
    expect(dropHistoryDuplicatesOfTimeline(history, [])).toEqual(history)
  })
})
