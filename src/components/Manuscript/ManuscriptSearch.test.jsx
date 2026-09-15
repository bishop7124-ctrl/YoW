// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import { readFileSync } from 'fs'
import ManuscriptSearch from './ManuscriptSearch.jsx'

afterEach(cleanup)

function makeScenes() {
  return [
    { id: 's1', chapterId: 'c1', novelId: 'n1', title: 'Opening Scene', content: 'The dragon flew over the mountain. Later, the dragon was seen again near the old ruins.' },
  ]
}

function renderSearch(overrides = {}) {
  const onOpenScene = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <ManuscriptSearch
      embedded
      scenes={makeScenes()}
      chapters={[{ id: 'c1', title: 'Chapter 1' }]}
      activeNovelId="n1"
      onOpenScene={onOpenScene}
      onReplaceInScene={vi.fn()}
      onClose={onClose}
      {...overrides}
    />
  )
  return { ...utils, onOpenScene, onClose }
}

describe('ManuscriptSearch "Go to scene" — highlight-on-open', () => {
  it('passes the raw {start, end} offset of the first match to onOpenScene', async () => {
    const { onOpenScene } = renderSearch()

    fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'ruins' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Go to scene' }))

    const content = makeScenes()[0].content
    const expectedStart = content.indexOf('ruins')
    expect(onOpenScene).toHaveBeenCalledWith('s1', { start: expectedStart, end: expectedStart + 'ruins'.length })
  })

  it('matches the first occurrence, not a later one, when the term repeats', async () => {
    const { onOpenScene } = renderSearch()

    fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'dragon' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Go to scene' }))

    const content = makeScenes()[0].content
    const firstOccurrence = content.indexOf('dragon')
    expect(onOpenScene).toHaveBeenCalledWith('s1', { start: firstOccurrence, end: firstOccurrence + 'dragon'.length })
  })

  it('accounts for an inline note marker before the match (regression: SceneEditor renders note-marker-stripped content, so a raw-content offset lands on the wrong text)', async () => {
    // scene.content can carry a `[[1]]` note marker that SceneEditor's own
    // textarea never shows (see stripNoteMarkers) — a match's raw offset has
    // to be computed against that same stripped text, or it's off by
    // however many marker characters preceded it.
    const content = 'Intro [[1]] text. The dragon flew over the mountain.'
    const scenes = [{ id: 's1', chapterId: 'c1', novelId: 'n1', title: 'Opening Scene', content }]
    const { onOpenScene } = renderSearch({ scenes })

    fireEvent.change(screen.getByLabelText('Search term'), { target: { value: 'dragon' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Go to scene' }))

    // Stripped content is 'Intro text. The dragon flew over the mountain.'
    // (the marker plus one of its flanking spaces collapses to a single
    // space) — "dragon" starts at a LOWER offset than it does in the raw
    // string, which still has the marker's characters in it.
    const rawOffset = content.indexOf('dragon')
    const call = onOpenScene.mock.calls.find(c => c[0] === 's1')
    expect(call[1]).toBeTruthy()
    expect(call[1].start).toBeLessThan(rawOffset)
    expect(content.slice(rawOffset, rawOffset + 'dragon'.length)).toBe('dragon')
  })
})

describe('ManuscriptSearch responsive CSS (regression: 2026-09-12 off-screen buttons)', () => {
  it('.ms-search-row wraps and .ms-search-input can shrink below its intrinsic width', () => {
    // jsdom doesn't run layout, so this can't assert real rendered geometry
    // (covered by live-browser QA instead) — it guards the two CSS
    // properties whose absence caused the original bug from silently
    // regressing: without flex-wrap, an overflowing row clips instead of
    // wrapping; without min-width: 0, a flex:1 text input refuses to shrink
    // past its default intrinsic content width, which is what forced the
    // overflow in the first place.
    const css = readFileSync('src/index.css', 'utf8')
    const rowRule = css.match(/\.ms-search-row\s*\{[^}]*\}/)?.[0]
    const inputRule = css.match(/\.ms-search-input\s*\{[^}]*\}/)?.[0]
    expect(rowRule).toMatch(/flex-wrap:\s*wrap/)
    expect(inputRule).toMatch(/min-width:\s*0/)
  })
})
