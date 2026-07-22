import { describe, expect, it } from 'vitest'
import {
  buildProjectTypePromptContext,
  getManuscriptCoverage,
  getManuscriptCoverageForNovel,
  buildPlotHoleUserPrompt,
  buildStyleUserPrompt,
} from './aiToolPrompts'
import { buildSystemPrompt } from './aiApi'

describe('buildProjectTypePromptContext', () => {
  it('builds type-specific context for every active project type', () => {
    const cases = [
      ['novel', ['Project type: Novel', 'Act > Chapter > Scene', 'long-form prose fiction', 'novel-scale arcs']],
      ['novella', ['Project type: Novella', 'Part > Chapter > Scene', 'tighter scope than a full novel', 'smaller promise than a novel-scale']],
      ['short_story', ['Project type: Short Story', 'Part > Section > Scene', 'short story with a compact cast', 'one dominant dramatic movement']],
      ['dnd_campaign', ['Project type: D&D Campaign', 'Story Arc > Session > Encounter', 'DM-side D&D campaign planning', 'Do not imply live play']],
      ['tabletop_rpg', ['Project type: Tabletop Campaign', 'Campaign Arc > Session > Encounter', 'system-neutral tabletop campaign planning', 'Stay system-neutral']],
      ['comic', ['Project type: Comic / Graphic Novel', 'Volume > Issue > Page', 'page/panel beats', 'SFX']],
    ]

    cases.forEach(([type, expectedParts]) => {
      const context = buildProjectTypePromptContext({ title: 'Test Project', type })
      expectedParts.forEach(part => expect(context).toContain(part))
    })
  })

  it('does not describe comic projects as lacking panel tooling', () => {
    const context = buildProjectTypePromptContext({ title: 'Panels', type: 'comic' })

    expect(context).not.toContain('Do not assume panel tooling is available yet')
  })

  it('feeds project-type context into the full AI chat system prompt', () => {
    const prompt = buildSystemPrompt(
      { title: 'Friday Table', type: 'tabletop_rpg' },
      {},
      {}
    )

    expect(prompt).toContain('Project type: Tabletop Campaign')
    expect(prompt).toContain('GM-side system-neutral tabletop campaign planning')
    expect(prompt).toContain('Campaign Arc > Session > Encounter')
  })
})

describe('getManuscriptCoverage', () => {
  it('reports full coverage for a small manuscript with short scenes', () => {
    const scenes = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, content: 'short content' }))
    const coverage = getManuscriptCoverage(scenes)

    expect(coverage).toEqual({ totalScenes: 5, includedScenes: 5, omittedScenes: 0, contentTruncated: false })
  })

  it('reports omitted scenes once a manuscript exceeds the inline scene cap', () => {
    const scenes = Array.from({ length: 45 }, (_, i) => ({ id: `s${i}`, content: 'short content' }))
    const coverage = getManuscriptCoverage(scenes)

    expect(coverage.totalScenes).toBe(45)
    expect(coverage.includedScenes).toBe(20)
    expect(coverage.omittedScenes).toBe(25)
  })

  it('flags content truncation when an included scene exceeds the per-scene character cap', () => {
    const scenes = [{ id: 's0', content: 'x'.repeat(700) }]
    const coverage = getManuscriptCoverage(scenes)

    expect(coverage.contentTruncated).toBe(true)
  })

  it('handles an empty or missing scene list without throwing', () => {
    expect(getManuscriptCoverage([])).toEqual({ totalScenes: 0, includedScenes: 0, omittedScenes: 0, contentTruncated: false })
    expect(getManuscriptCoverage(undefined)).toEqual({ totalScenes: 0, includedScenes: 0, omittedScenes: 0, contentTruncated: false })
  })
})

describe('Comic project AI tool content', () => {
  const novel = { id: 'novel-1', type: 'comic', title: 'Comic Test' }
  const comicPage = {
    id: 'page-1', novelId: 'novel-1', issueId: 'issue-1', title: 'The Reveal',
    pageType: 'splash', pageTurn: 'reveal', summary: 'The hero unmasks.',
  }
  const comicPanel = {
    id: 'panel-1', pageId: 'page-1', order: 0,
    description: 'Close-up on the mask coming off.',
    dialogue: [{ speaker: 'Hero', text: 'It was me all along.' }],
    captions: [{ type: 'narration', text: 'Nobody expected this.' }],
    sfx: [{ text: 'RIIIP' }],
  }
  const store = {
    novels: [novel],
    comicPages: [comicPage],
    comicPanels: [comicPanel],
    scenes: [], chapters: [], acts: [],
  }

  it('buildPlotHoleUserPrompt reads comic pages/panels instead of an empty scenes section', () => {
    const prompt = buildPlotHoleUserPrompt(store, 'novel-1')

    expect(prompt).toContain('## COMIC PAGES')
    expect(prompt).toContain('The Reveal')
    expect(prompt).toContain('Hero: "It was me all along."')
    expect(prompt).toContain('RIIIP')
    expect(prompt).not.toContain('MANUSCRIPT SCENES')
  })

  it('buildStyleUserPrompt reads comic pages for style analysis', () => {
    const prompt = buildStyleUserPrompt(store, 'novel-1')

    expect(prompt).toContain('## COMIC PAGES TO ANALYSE')
    expect(prompt).toContain('Nobody expected this.')
  })

  it('getManuscriptCoverageForNovel counts comic pages, not the (empty) scenes array', () => {
    const coverage = getManuscriptCoverageForNovel(store, 'novel-1', novel)

    expect(coverage.totalScenes).toBe(1)
    expect(coverage.omittedScenes).toBe(0)
  })

  it('getManuscriptCoverageForNovel falls back to scenes for non-comic projects', () => {
    const proseNovel = { id: 'novel-2', type: 'novel' }
    const proseStore = { scenes: [{ id: 's1', novelId: 'novel-2', content: 'hi' }], comicPages: [], comicPanels: [] }

    const coverage = getManuscriptCoverageForNovel(proseStore, 'novel-2', proseNovel)

    expect(coverage.totalScenes).toBe(1)
  })
})
