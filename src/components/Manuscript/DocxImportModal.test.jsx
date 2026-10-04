// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DocxImportModal from './DocxImportModal.jsx'

const parsedActs = [{ title: 'Act 1', chapters: [{ title: 'Chapter 1', scenes: [{ title: 'Scene', content: 'Imported words' }] }] }]

vi.mock('../../utils/docxImport', () => ({
  parseDocxToStructure: vi.fn(async () => parsedActs),
  countImportStats: () => ({ totalActs: 1, totalChapters: 1, totalScenes: 1, totalWords: 2 }),
}))

afterEach(() => cleanup())

describe('DocxImportModal import strategy', () => {
  it('defaults existing manuscripts to safe chapter merging', async () => {
    const onImport = vi.fn(async () => {})
    render(<DocxImportModal hasExistingContent onImport={onImport} onClose={vi.fn()} />)

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(['docx'], 'draft.docx')] },
    })
    await screen.findByText('Where should the imported text go?')

    expect(screen.getByRole('radio', { name: /Merge into matching chapters/i }).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 words' }))
    await waitFor(() => expect(onImport).toHaveBeenCalledWith(parsedActs, { mode: 'merge' }))
  })

  it('allows an explicit separate append', async () => {
    const onImport = vi.fn(async () => {})
    render(<DocxImportModal hasExistingContent onImport={onImport} onClose={vi.fn()} />)

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(['docx'], 'draft.docx')] },
    })
    await screen.findByText('Where should the imported text go?')
    fireEvent.click(screen.getByRole('radio', { name: /Add as a separate structure/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 words' }))

    await waitFor(() => expect(onImport).toHaveBeenCalledWith(parsedActs, { mode: 'append' }))
  })
})

