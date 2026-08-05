// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ManuscriptCoverageNotice } from './ManuscriptCoverageNotice.jsx'

afterEach(cleanup)

describe('ManuscriptCoverageNotice', () => {
  it('does not call a short all-scenes excerpt limit a large manuscript', () => {
    render(
      <ManuscriptCoverageNotice
        coverage={{
          totalScenes: 2,
          includedScenes: 2,
          omittedScenes: 0,
          contentTruncated: true,
        }}
      />
    )

    expect(screen.getByText(/AI context is limited/i)).toBeTruthy()
    expect(screen.queryByText(/Manuscript is large/i)).toBeNull()
    expect(screen.getByText(/analysing all 2 scenes/i)).toBeTruthy()
  })

  it('still labels omitted scenes as a large-manuscript warning', () => {
    render(
      <ManuscriptCoverageNotice
        coverage={{
          totalScenes: 32,
          includedScenes: 20,
          omittedScenes: 12,
          contentTruncated: false,
        }}
      />
    )

    expect(screen.getByText(/Manuscript is large/i)).toBeTruthy()
    expect(screen.getByText(/first 20 of 32 scenes/i)).toBeTruthy()
  })
})
