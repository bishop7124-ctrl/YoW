import { describe, expect, it } from 'vitest'
import { MANUSCRIPT_TEMPLATES, getTemplatesForProjectType } from './manuscriptTemplates.js'

const idsFor = (projectType) => getTemplatesForProjectType(projectType).map(template => template.id)
const targetsFor = (projectType) => getTemplatesForProjectType(projectType).map(template => template.targetWords)

describe('manuscript project-type templates', () => {
  it('shows novel-specific templates', () => {
    expect(idsFor('novel')).toEqual([
      'three-act',
      'heros-journey',
      'save-the-cat',
      'romantasy',
      'mystery-thriller',
      'novel-blank',
    ])
  })

  it('shows campaign-specific templates without retired or prose-only templates', () => {
    expect(idsFor('dnd_campaign')).toEqual(['dnd-blank', 'dnd-three-arc', 'dnd-oneshot'])
    expect(idsFor('tabletop_rpg')).toEqual(['ttrpg-blank', 'ttrpg-three-act', 'ttrpg-oneshot', 'ttrpg-horror'])
  })

  it('shows compact prose templates for short stories', () => {
    expect(idsFor('short_story')).toEqual([
      'short-story-blank',
      'freytags-pyramid',
      'flash-fiction',
      'in-medias-res',
    ])
  })

  it('shows novella-specific templates without novel-scale or TV options', () => {
    expect(idsFor('novella')).toEqual([
      'novella-blank',
      'compressed-three-act',
      'novella-mystery',
      'novella-romance',
    ])
    expect(Math.max(...targetsFor('novella'))).toBeLessThanOrEqual(40000)
  })

  it('keeps comic templates comic-specific', () => {
    expect(idsFor('comic')).toEqual(['comic-blank', 'comic-arc', 'graphic-novel'])
  })

  it('does not expose TV show templates', () => {
    expect(MANUSCRIPT_TEMPLATES.some(template => template.projectTypes?.includes('tv_show'))).toBe(false)
    expect(MANUSCRIPT_TEMPLATES.some(template => /tv|television|season/i.test(`${template.id} ${template.name}`))).toBe(false)
  })

  it('does not use universal templates across project types', () => {
    expect(MANUSCRIPT_TEMPLATES.some(template => template.projectTypes?.includes('all'))).toBe(false)
  })
})
