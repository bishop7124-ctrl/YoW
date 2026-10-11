// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import ManuscriptTopbar from './ManuscriptTopbar.jsx'

const noop = vi.fn()

const renderTopbar = (overrides = {}) => render(
  <ManuscriptTopbar
    projectTitle="Test"
    breadcrumbPath=""
    acts={[]}
    chapters={[]}
    scenes={[]}
    labels={{ level1: 'Part', level2: 'Chapter', level3: 'Scene' }}
    onSelectScene={noop}
    railCollapsed={false}
    onToggleRail={noop}
    mode="write"
    onSetMode={noop}
    saveState="saved"
    wordCount={0}
    wordsToday={0}
    onToggleAI={noop}
    onToggleInspector={noop}
    onOpenProject={noop}
    onOverflowAction={noop}
    onToggleFullscreen={noop}
    {...overrides}
  />,
)

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  return within(screen.getByRole('menu'))
}

describe('ManuscriptTopbar Finish menu', () => {
  afterEach(cleanup)

  it('offers Finalise draft for novel-type projects', () => {
    renderTopbar({ isNovelProject: true })
    expect(openMenu().getByRole('button', { name: 'Finalise draft' })).toBeTruthy()
  })

  // Novella and Short Story: handleFinaliseDraft only supports novel-type
  // projects, so the action must not appear (it used to no-op silently).
  it('hides Finalise draft for Novella, Short Story and other non-novel types, but keeps Export', () => {
    renderTopbar({ isNovelProject: false })
    const menu = openMenu()
    expect(menu.queryByRole('button', { name: 'Finalise draft' })).toBeNull()
    expect(menu.getByRole('button', { name: /^Export/ })).toBeTruthy()
  })
})
