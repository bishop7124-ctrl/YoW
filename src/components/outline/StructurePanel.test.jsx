// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import StructurePanel from './StructurePanel.jsx'
import StoryOutline from './StoryOutline.jsx'

afterEach(() => { cleanup(); flag.on = true })

const makeStore = (novel = {}, extra = {}) => ({
  activeNovel: { id: 'n1', type: 'novel', ...novel },
  acts: [{ id: 'a1', title: 'Act 1', order: 0 }],
  chapters: [
    { id: 'c1', actId: 'a1', title: 'Opening', order: 0 },
    { id: 'c2', actId: 'a1', title: 'Chase', order: 1 },
    { id: 'c3', actId: 'a1', title: 'Fall', order: 2 },
  ],
  scenes: [],
  updateNovel: vi.fn(),
  readOnly: false,
  ...extra,
})

describe('StructurePanel', () => {
  it('asks you to choose a structure, offering the real ones and not the blank scaffold', () => {
    const store = makeStore()
    render(<StructurePanel store={store} />)
    expect(screen.getByText(/Pick a structure above/)).toBeTruthy()
    const options = [...screen.getByLabelText('Story structure').options].map(o => o.textContent)
    expect(options).toEqual(expect.arrayContaining(['Choose a structure…', 'Three Act Structure', "Hero's Journey", 'Save the Cat', 'Seven-Point Structure', 'Story Circle', 'Five-Act Structure']))
    expect(options).not.toContain('Blank Novel')
    fireEvent.change(screen.getByLabelText('Story structure'), { target: { value: 'seven-point' } })
    expect(store.updateNovel).toHaveBeenCalledWith('n1', { structureMap: { templateId: 'seven-point', byTemplate: {} } })
  })

  it('shows empty beats and the placed count for the chosen structure', () => {
    const store = makeStore({ structureMap: { templateId: 'seven-point', byTemplate: { 'seven-point': { hook: ['c1'], midpoint: ['c2'] } } } })
    render(<StructurePanel store={store} />)
    expect(screen.getByRole('status').textContent).toMatch(/2 of 7 beats have a chapter/)
    expect(screen.getAllByText('Placed')).toHaveLength(2)
    expect(screen.getAllByText('Empty')).toHaveLength(5)
    const hook = screen.getByRole('list', { name: 'Chapters on Hook' })
    expect(within(hook).getByText(/Opening/)).toBeTruthy()
  })

  it('places a chapter on a beat and removes it again', () => {
    const store = makeStore({ structureMap: { templateId: 'seven-point', byTemplate: { 'seven-point': { hook: ['c1'] } } } })
    render(<StructurePanel store={store} />)
    fireEvent.change(screen.getByLabelText('Add a chapter to Plot Turn 1'), { target: { value: 'c2' } })
    expect(store.updateNovel).toHaveBeenLastCalledWith('n1', { structureMap: { templateId: 'seven-point', byTemplate: { 'seven-point': { hook: ['c1'], 'plot-turn-1': ['c2'] } } } })
    fireEvent.click(screen.getByLabelText(/Remove .*Opening.* from Hook/))
    expect(store.updateNovel).toHaveBeenLastCalledWith('n1', { structureMap: { templateId: 'seven-point', byTemplate: { 'seven-point': {} } } })
  })

  it('notes a beat that starts before an earlier one, without treating it as an error', () => {
    const store = makeStore({ structureMap: { templateId: 'seven-point', byTemplate: { 'seven-point': { hook: ['c3'], 'plot-turn-1': ['c1'] } } } })
    render(<StructurePanel store={store} />)
    expect(screen.getByText(/starts before an earlier beat does/)).toBeTruthy()
  })

  it('ignores chapters that were deleted and keeps other structures\' maps untouched', () => {
    const store = makeStore({ structureMap: { templateId: 'seven-point', byTemplate: { 'seven-point': { hook: ['deleted'] }, 'three-act': { 'inciting-incident': ['c1'] } } } })
    render(<StructurePanel store={store} />)
    expect(screen.getByRole('status').textContent).toMatch(/0 of 7 beats/)
    fireEvent.change(screen.getByLabelText('Story structure'), { target: { value: 'three-act' } })
    expect(store.updateNovel.mock.calls[0][1].structureMap.byTemplate['three-act']).toEqual({ 'inciting-incident': ['c1'] })
  })

  it('is read-only when the project is read-only', () => {
    render(<StructurePanel store={makeStore({ structureMap: { templateId: 'seven-point' } }, { readOnly: true })} />)
    expect(screen.getByLabelText('Story structure').disabled).toBe(true)
    expect(screen.queryByLabelText('Add a chapter to Hook')).toBeNull()
  })

  it('says so for a project type with no structures', () => {
    render(<StructurePanel store={makeStore({ type: 'no-such-type' })} />)
    expect(screen.getByText(/no story structures to check against/)).toBeTruthy()
  })
})

describe('StoryOutline Structure tab', () => {
  it('appears only while the flag is on', () => {
    const store = { ...makeStore(), moveAct: vi.fn(), addAct: vi.fn() }
    flag.on = false
    const { unmount } = render(<StoryOutline store={store} />)
    expect(screen.queryByRole('tab', { name: 'Structure' })).toBeNull()
    unmount()
    flag.on = true
    render(<StoryOutline store={store} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Structure' }))
    expect(screen.getByTestId('structure-panel')).toBeTruthy()
  })
})
