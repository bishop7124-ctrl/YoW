import { describe, expect, it } from 'vitest'
import { buildProjectTypePromptContext } from './aiToolPrompts'
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
