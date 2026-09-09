// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { getProjectType } from '../../constants/projectTypes.js'
import { localDateKey, shiftDateKey } from '../../utils/writingStreak.js'
import ProjectDashboard from './ProjectDashboard.jsx'

const words = count => Array.from({ length: count }, (_, index) => `word${index}`).join(' ')
const timestampFor = date => new Date(`${date}T12:00:00`).getTime()

function makeStore({ daily = 500 } = {}) {
  const today = localDateKey()
  const dates = [shiftDateKey(today, -2), shiftDateKey(today, -1), today]
  const scene = {
    id: 'scene-1',
    chapterId: 'chapter-1',
    title: 'Opening',
    content: words(1500),
    lastModified: timestampFor(today),
    wordHistory: dates.map((date, index) => ({
      date,
      words: (index + 1) * 500,
      timestamp: timestampFor(date),
    })),
  }
  const project = { id: 'project-1', title: 'Streak Test', type: 'novel', writingGoals: { daily } }
  return {
    updateNovel: vi.fn(),
    activeProjectStats: {
      project,
      projectType: getProjectType('novel'),
      manuscriptWords: 1500,
      scenes: [scene],
      acts: [{ id: 'act-1', title: 'Act One', order: 0 }],
      chapters: [{ id: 'chapter-1', actId: 'act-1', title: 'Chapter One', order: 0 }],
      characters: [],
      factions: [],
      locations: [],
      maps: [],
      timeline: [],
      loreEntries: [],
      worldHistory: [],
      ideaEntries: [],
      planningItems: 0,
      createdLabel: 'Today',
      campaignStats: null,
    },
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('ProjectDashboard writing goal streak', () => {
  it('renders project-area tiles above the dashboard stats', () => {
    const { container } = render(<ProjectDashboard store={makeStore()} />)
    const projectAreas = container.querySelector('[aria-label="Project areas"]')
    const statRow = container.querySelector('[data-tour="dashboard-stat-row"]')

    expect(projectAreas).not.toBeNull()
    expect(statRow).not.toBeNull()
    expect(projectAreas.compareDocumentPosition(statRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the current and best consecutive goal streak on Overview', () => {
    const store = makeStore()
    const { container } = render(<ProjectDashboard store={store} />)
    const card = container.querySelector('[aria-label="Writing goal streak"]')
    const stats = [...card.querySelectorAll('.overview-streak-summary strong')].map(node => node.textContent)

    expect(stats).toEqual(['3', '3', '3'])
    expect(card.textContent).toContain("Today's 500-word goal is complete.")
    expect(card.querySelectorAll('.overview-streak-days .is-met')).toHaveLength(3)
  })

  it('records the previous goal when the daily target changes', () => {
    const store = makeStore()
    const { getByRole } = render(<ProjectDashboard store={store} />)
    fireEvent.click(getByRole('button', { name: 'Insights' }))
    fireEvent.change(getByRole('textbox', { name: 'Daily writing goal' }), { target: { value: '750' } })

    expect(store.updateNovel).toHaveBeenCalledWith('project-1', {
      writingGoals: expect.objectContaining({
        daily: 750,
        dailyHistory: [
          { date: '1970-01-01', goal: 500 },
          { date: localDateKey(), goal: 750 },
        ],
      }),
    })
  })
})
