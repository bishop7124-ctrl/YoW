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
})
