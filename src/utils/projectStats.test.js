import { describe, expect, it } from 'vitest'
import { buildProjectStats } from './projectStats.js'

describe('project stats', () => {
  it('counts visible manuscript words instead of HTML/storage markup', () => {
    const project = { id: 'project-1', title: 'Tiny Draft', type: 'novel' }
    const noisyAttribute = Array.from({ length: 200 }, (_, index) => `token-${index}`).join(' ')
    const stats = buildProjectStats(project, {
      scenes: [
        {
          id: 'scene-1',
          novelId: project.id,
          content: `<p data-storage="${noisyAttribute}">Hello</p>`,
        },
      ],
    })

    expect(stats.manuscriptWords).toBe(1)
  })

  it('excludes scene conflict copies from the manuscript word count', () => {
    const project = { id: 'project-1', title: 'Tiny Draft', type: 'novel' }
    const stats = buildProjectStats(project, {
      scenes: [
        { id: 'scene-1', novelId: project.id, content: 'one two three' },
        { id: 'scene-1-copy', novelId: project.id, conflictOf: 'scene-1', content: 'four five six seven' },
      ],
    })

    expect(stats.manuscriptWords).toBe(3)
  })

  it('builds campaign progress from sessions and prep fields without capping over target', () => {
    const project = {
      id: 'campaign-1',
      title: 'Friday Table',
      type: 'dnd_campaign',
      targetSessions: 2,
    }
    const stats = buildProjectStats(project, {
      chapters: [
        {
          id: 'session-1',
          novelId: project.id,
          sessionPlan: { hooks: 'Missing caravan', npcs: 'Innkeeper Mira' },
          sessionRecap: { summary: 'The party found the tracks.' },
        },
        {
          id: 'session-2',
          novelId: project.id,
          sessionPlan: { encounters: 'Road ambush' },
        },
        {
          id: 'session-3',
          novelId: project.id,
          sessionRecap: { fallout: 'Bandits flee north' },
        },
      ],
      scenes: [
        { id: 'encounter-1', novelId: project.id },
        { id: 'encounter-2', novelId: project.id },
      ],
    })

    expect(stats.campaignStats).toMatchObject({
      plannedSessions: 3,
      encounterCount: 2,
      planFieldsFilled: 3,
      recapFieldsFilled: 2,
      sessionProgress: 150,
      sessionsWithPrep: 2,
      sessionsWithRecap: 2,
    })
  })
})
