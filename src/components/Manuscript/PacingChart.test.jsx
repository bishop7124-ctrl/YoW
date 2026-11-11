// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const flag = { on: false }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import PacingChart from './PacingChart.jsx'

afterEach(() => { cleanup(); flag.on = false })

const acts = [{ id: 'a1', novelId: 'n1', order: 0 }]
const chapters = [{ id: 'c1', actId: 'a1', order: 0, title: 'One' }, { id: 'c2', actId: 'a1', order: 1, title: 'Two' }]
const scenesWith = (tensions) => tensions.map((tension, i) => ({
  id: `s${i}`, novelId: 'n1', chapterId: i < 2 ? 'c1' : 'c2', order: i % 2, title: `Scene ${i}`, content: 'word '.repeat(10 * (i + 1)),
  ...(tension === undefined ? {} : { tension }),
}))
const open = scenes => render(<PacingChart scenes={scenes} chapters={chapters} acts={acts} activeNovelId="n1" onOpenScene={vi.fn()} onClose={vi.fn()} />)

describe('PacingChart tension', () => {
  it('shows no tension controls or note while the flag is off', () => {
    open(scenesWith([2, 4, undefined]))
    expect(screen.queryByLabelText('Tension')).toBeNull()
    expect(screen.queryByTestId('tension-note')).toBeNull()
  })
  it('says how many scenes are rated, and never treats unrated scenes as an error', () => {
    flag.on = true
    open(scenesWith([2, 4, undefined]))
    expect(screen.getByTestId('tension-note').textContent).toBe('2 of 3 scenes have a tension rating. Scenes without one are left out of the line.')
  })
  it('explains how to start when nothing is rated', () => {
    flag.on = true
    open(scenesWith([undefined, undefined]))
    expect(screen.getByTestId('tension-note').textContent).toMatch(/No scenes have a tension rating yet/)
  })
  it('hides the note with the Tension toggle', () => {
    flag.on = true
    open(scenesWith([3]))
    fireEvent.click(screen.getByLabelText('Tension'))
    expect(screen.queryByTestId('tension-note')).toBeNull()
  })
})
