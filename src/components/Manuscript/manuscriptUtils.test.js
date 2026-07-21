// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities, buildFinalizedDraft } from './manuscriptUtils.js'

describe('decodeHtmlEntities', () => {
  it('decodes named entities like apostrophes and ampersands', () => {
    expect(decodeHtmlEntities("don&apos;t")).toBe("don't")
    expect(decodeHtmlEntities('salt &amp; pepper')).toBe('salt & pepper')
    expect(decodeHtmlEntities('&#39;quoted&#39;')).toBe("'quoted'")
  })

  it('leaves plain text unchanged', () => {
    expect(decodeHtmlEntities("don't touch this")).toBe("don't touch this")
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('passes through non-string input unchanged', () => {
    expect(decodeHtmlEntities(null)).toBe(null)
    expect(decodeHtmlEntities(undefined)).toBe(undefined)
  })
})

describe('buildFinalizedDraft', () => {
  const labels = { level1: 'Act', level2: 'Chapter', level3: 'Scene' }

  it('decodes HTML entities baked into scene content and titles', () => {
    const acts = [{ id: 'a1', title: 'Act &amp; One', order: 0 }]
    const chapters = [{ id: 'c1', actId: 'a1', title: 'Chapter &apos;1&apos;', order: 0 }]
    const scenes = [{ id: 's1', chapterId: 'c1', title: 'The Beginning', content: "She said, &quot;I won&apos;t.&quot;", order: 0 }]

    const draft = buildFinalizedDraft({ novel: { title: 'My Novel &amp; Friends' }, acts, chapters, scenes, labels, title: 'Draft 1' })

    expect(draft.projectTitle).toBe('My Novel & Friends')
    expect(draft.acts[0].title).toBe('Act & One')
    expect(draft.acts[0].chapters[0].title).toBe("Chapter '1'")
    expect(draft.acts[0].chapters[0].scenes[0].content).toBe('She said, "I won\'t."')
  })
})
