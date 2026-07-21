import { describe, expect, it } from 'vitest'
import { PROJECT_TYPES } from './projectTypes'

describe('project type defaults', () => {
  it('enables Map Builder and AI Tools for every active project type', () => {
    for (const [typeId, config] of Object.entries(PROJECT_TYPES)) {
      expect(config.defaultSections, `${typeId} defaults`).toEqual(
        expect.arrayContaining(['map', 'aitools']),
      )
    }
  })
})
