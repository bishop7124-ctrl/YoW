/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ManuscriptDiscoveryModal from './ManuscriptDiscoveryModal.jsx'

const store = {
  characters: [], locations: [], factions: [], loreEntries: [], timeline: [], acts: [], chapters: [],
}

describe('ManuscriptDiscoveryModal', () => {
  it('states the local non-AI privacy boundary before upload and closes accessibly', () => {
    const onClose = vi.fn()
    render(<ManuscriptDiscoveryModal store={store} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Import & Discover Project' })).toBeTruthy()
    expect(screen.getByText(/Create a complete YOW project with local \/ non-AI manuscript analysis/)).toBeTruthy()
    expect(screen.getByText(/does not call an AI provider or external NLP service/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /choose a manuscript/i })).toBeTruthy()
    expect(screen.getByText(/DOCX, TXT, or Markdown/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
