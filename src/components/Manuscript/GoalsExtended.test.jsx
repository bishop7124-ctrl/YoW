// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const flag = { on: true }
vi.mock('../../utils/useFeatureFlag', () => ({ useFeatureFlag: () => flag.on }))
import GoalsExtended, { resetSprintForTests } from './GoalsExtended'

beforeEach(() => { flag.on = true; resetSprintForTests() })
afterEach(() => { cleanup(); vi.useRealTimers() })

const open = (props = {}) => {
  const update = props.onUpdateGoals || vi.fn()
  const view = render(<GoalsExtended goals={{}} dailyWords={{}} totalWords={0} {...props} onUpdateGoals={update} />)
  return { update, ...view }
}

describe('GoalsExtended', () => {
  it('renders nothing when the goals_extended flag is off', () => {
    flag.on = false
    const { container } = open()
    expect(container.innerHTML).toBe('')
  })

  it('shows "set goal" prompts when nothing is set, and saves a weekly goal', () => {
    const { update } = open({ goals: { daily: 500 } })
    expect(screen.getByText('No goal set for this week.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Set this week goal'))
    const input = screen.getByLabelText('This week goal in words')
    fireEvent.change(input, { target: { value: '3500' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({ daily: 500, weekly: 3500 })
  })

  it('clearing a goal with an empty or zero value turns it off', () => {
    const { update } = open({ goals: { monthly: 8000 } })
    fireEvent.click(screen.getByLabelText('Edit this month goal'))
    const input = screen.getByLabelText('This month goal in words')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(update).toHaveBeenCalledWith({ monthly: 0 })
  })

  it('shows progress for the week using this week\'s net words', () => {
    const today = new Date()
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    open({ goals: { weekly: 1000 }, dailyWords: { [key]: 250 } })
    expect(screen.getByText(/250 of 1,000 words/)).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'This week progress' }).getAttribute('aria-valuenow')).toBe('25')
  })

  it('saves and clears a deadline, and explains what is needed to see a projection', () => {
    const { update } = open({ goals: {} })
    expect(screen.getByText(/Pick a date to see how your pace/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Finish by'), { target: { value: '2027-03-01' } })
    expect(update).toHaveBeenCalledWith({ deadline: '2027-03-01' })
  })

  it('with a deadline but no word target it asks for a target instead of guessing', () => {
    open({ goals: { deadline: '2099-01-01' } })
    expect(screen.getByText(/Set a manuscript word target/)).toBeTruthy()
    fireEvent.click(screen.getByText('Clear'))
  })

  it('runs a sprint, counts only the words added during it, and reports the result', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T10:00:00'))
    const { rerender, update } = open({ totalWords: 1000 })
    fireEvent.click(screen.getByText('10 min'))
    expect(screen.getByText('10:00')).toBeTruthy()
    rerender(<GoalsExtended goals={{}} dailyWords={{}} totalWords={1180} onUpdateGoals={update} />)
    expect(screen.getByText('180 words this sprint')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(10 * 60_000 + 1500) })
    expect(screen.getByText(/Last sprint:/).textContent).toContain('180 words')
    expect(screen.getByText(/Sprint finished: 180 words in 10 minutes/)).toBeTruthy()
    expect(screen.queryByText('Stop sprint')).toBeNull()
  })

  it('stopping early records the time actually spent and never shows negative words', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T10:00:00'))
    const { rerender, update } = open({ totalWords: 500 })
    fireEvent.click(screen.getByText('25 min'))
    rerender(<GoalsExtended goals={{}} dailyWords={{}} totalWords={400} onUpdateGoals={update} />) // deleted text
    act(() => { vi.advanceTimersByTime(3 * 60_000) })
    fireEvent.click(screen.getByText('Stop sprint'))
    expect(screen.getByText(/Last sprint:/).textContent).toMatch(/0 words.*3 minutes.*stopped early/)
  })

  it('rejects a custom sprint length outside 1 to 240 minutes', () => {
    open()
    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '999' } })
    fireEvent.click(screen.getByText('Start'))
    expect(screen.queryByText('Stop sprint')).toBeNull()
    fireEvent.change(screen.getByLabelText('Custom minutes'), { target: { value: '12' } })
    fireEvent.click(screen.getByText('Start'))
    expect(screen.getByText('Stop sprint')).toBeTruthy()
  })

  it('keeps a running sprint when the panel is closed and reopened, and settles one that ended meanwhile', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T10:00:00'))
    const first = render(<GoalsExtended goals={{}} dailyWords={{}} totalWords={100} projectId="p1" onUpdateGoals={vi.fn()} />)
    fireEvent.click(screen.getByText('10 min'))
    first.unmount() // e.g. the writer switches Inspector tab
    vi.setSystemTime(new Date('2026-11-11T10:03:00'))
    const second = render(<GoalsExtended goals={{}} dailyWords={{}} totalWords={160} projectId="p1" onUpdateGoals={vi.fn()} />)
    expect(screen.getByText('7:00')).toBeTruthy()
    expect(screen.getByText('60 words this sprint')).toBeTruthy()
    second.unmount()
    vi.setSystemTime(new Date('2026-11-11T10:20:00'))
    render(<GoalsExtended goals={{}} dailyWords={{}} totalWords={300} projectId="p1" onUpdateGoals={vi.fn()} />)
    expect(screen.getByText(/Last sprint:/).textContent).toContain('200 words')
  })

  it('does not show or count a sprint from another project', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T10:00:00'))
    const a = render(<GoalsExtended goals={{}} dailyWords={{}} totalWords={100} projectId="p1" onUpdateGoals={vi.fn()} />)
    fireEvent.click(screen.getByText('10 min'))
    a.unmount()
    render(<GoalsExtended goals={{}} dailyWords={{}} totalWords={5000} projectId="p2" onUpdateGoals={vi.fn()} />)
    expect(screen.queryByText('Stop sprint')).toBeNull()
    expect(screen.getByText('10 min')).toBeTruthy()
  })
})
