import { describe, expect, it } from 'vitest'
import { captureSource, checkApply } from './aiSuggestionSource'

const sceneA = { id: 'a', title: 'The gate', content: '<p>Mira arrived.</p>' }
const sceneB = { id: 'b', title: 'The cellar', content: '<p>Tomas waited.</p>' }

describe('captureSource', () => {
  it('records the scene, its title, the trimmed highlight and the text at that moment', () => {
    expect(captureSource(sceneA, '  Mira  ')).toEqual({ sceneId: 'a', sceneTitle: 'The gate', selection: 'Mira', content: '<p>Mira arrived.</p>' })
    expect(captureSource(null)).toEqual({ sceneId: '', sceneTitle: '', selection: '', content: '' })
  })
})

describe('checkApply', () => {
  it('allows everything when nothing was recorded', () => {
    expect(checkApply(null, sceneB, '', 'replace')).toEqual({ ok: true })
  })

  it('refuses to apply a suggestion written for one scene to another, and names the source scene', () => {
    const source = captureSource(sceneA)
    for (const mode of ['append', 'replace']) {
      const result = checkApply(source, sceneB, '', mode)
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/"The gate"/)
    }
    expect(checkApply(source, null, '', 'append').ok).toBe(false)
  })

  it('lets an insert through while the same scene is open, even after the scene was edited', () => {
    const source = captureSource(sceneA)
    expect(checkApply(source, { ...sceneA, content: '<p>Mira arrived. Then more.</p>' }, '', 'append')).toEqual({ ok: true })
  })

  it('refuses to replace the whole scene once it has been edited, and allows it when unchanged', () => {
    const source = captureSource(sceneA)
    expect(checkApply(source, sceneA, '', 'replace')).toEqual({ ok: true })
    const edited = checkApply(source, { ...sceneA, content: '<p>Mira arrived late.</p>' }, '', 'replace')
    expect(edited.ok).toBe(false)
    expect(edited.reason).toMatch(/edited since/)
  })

  it('replaces a highlighted passage only while the same passage is still highlighted', () => {
    const source = captureSource(sceneA, 'Mira arrived.')
    expect(checkApply(source, sceneA, ' Mira arrived. ', 'replace')).toEqual({ ok: true })
    expect(checkApply(source, sceneA, 'Something else', 'replace').ok).toBe(false)
    expect(checkApply(source, sceneA, '', 'replace').ok).toBe(false)
    // an edit elsewhere in the scene does not matter for a passage replace
    expect(checkApply(source, { ...sceneA, content: '<p>Mira arrived.</p><p>New.</p>' }, 'Mira arrived.', 'replace')).toEqual({ ok: true })
  })
})
