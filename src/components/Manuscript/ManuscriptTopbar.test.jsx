// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ManuscriptTopbar from './ManuscriptTopbar.jsx'

afterEach(cleanup)

const openMenu = (props) => {
  render(<ManuscriptTopbar projectTitle="Test" acts={[]} chapters={[]} scenes={[]} labels={{}} {...props} />)
  fireEvent.click(screen.getByTitle('More'))
}

// Finalise draft only works for novel-type projects (Manuscript.jsx's
// handleFinaliseDraft returns early otherwise), so the action must not be
// offered for Novella, Short Story or campaign projects.
describe('ManuscriptTopbar overflow menu: Finalise draft', () => {
  it('offers Finalise draft for novel projects', () => {
    openMenu({ isNovelProject: true })
    expect(screen.getByRole('button', { name: /Finalise draft/ })).toBeTruthy()
  })

  it('hides Finalise draft for non-novel projects but keeps Export', () => {
    openMenu({ isNovelProject: false })
    expect(screen.queryByRole('button', { name: /Finalise draft/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Export/ })).toBeTruthy()
  })
})
