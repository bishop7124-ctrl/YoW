// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  isEditor: true,
  draft: null,
  published: null,
  upserts: [],
  rpcCalls: [],
}))

vi.mock('../../supabase', () => {
  const table = (name) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: name === 'site_content_draft' ? db.draft : name === 'site_content_published' ? db.published : null,
          error: null,
        }),
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
    upsert: (row) => { db.upserts.push({ name, row }); return Promise.resolve({ error: null }) },
  })
  return {
    supabase: {
      rpc: (fn, args) => {
        db.rpcCalls.push({ fn, args })
        if (fn === 'is_site_editor') return Promise.resolve({ data: db.isEditor, error: null })
        return Promise.resolve({ data: null, error: null })
      },
      from: table,
      storage: {
        from: () => ({
          list: () => Promise.resolve({ data: [], error: null }),
          getPublicUrl: (p) => ({ data: { publicUrl: `https://x.supabase.co/${p}` } }),
        }),
      },
    },
  }
})

import SiteEditor from './SiteEditor'

beforeEach(() => {
  db.isEditor = true; db.draft = null; db.published = null; db.upserts = []; db.rpcCalls = []
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('SiteEditor access', () => {
  it('shows a plain not-found page to a signed-out visitor and never asks the database', () => {
    render(<SiteEditor user={null} authLoading={false} />)
    expect(screen.getByText('Page not found')).toBeTruthy()
    expect(db.rpcCalls).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
  })

  it('shows not-found to a signed-in user who is not an editor', async () => {
    db.isEditor = false
    render(<SiteEditor user={{ id: 'u1' }} authLoading={false} />)
    await waitFor(() => expect(screen.getByText('Page not found')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
  })
})

describe('SiteEditor for an editor', () => {
  it('loads the built-in homepage copy, saves edits as a draft, and publishes through the RPC', async () => {
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    const eyebrow = await screen.findByDisplayValue('Your Own World')
    fireEvent.change(eyebrow, { target: { value: 'Edited eyebrow' } })

    await waitFor(() => expect(db.upserts.length).toBeGreaterThan(0), { timeout: 4000 })
    const saved = db.upserts.at(-1)
    expect(saved.name).toBe('site_content_draft')
    expect(saved.row.page_key).toBe('home')
    expect(saved.row.content.hero.eyebrow).toBe('Edited eyebrow')

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(db.rpcCalls.some(c => c.fn === 'publish_site_content' && c.args.p_page === 'home')).toBe(true))
  })

  it('reorders homepage sections', async () => {
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    await screen.findByDisplayValue('Your Own World')
    fireEvent.click(screen.getByLabelText('Move AI features down'))
    await waitFor(() => expect(db.upserts.length).toBeGreaterThan(0), { timeout: 4000 })
    expect(db.upserts.at(-1).row.content.sectionOrder).toEqual(['projectTypes', 'features', 'comparison', 'problems', 'cta', 'ai'])
  })

  it('warns before publishing copy that contradicts the launch scope', async () => {
    db.draft = { content: { hero: { intro: 'Real-time collaboration for every writer.' } } }
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    await screen.findByDisplayValue('Real-time collaboration for every writer.')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(window.confirm).toHaveBeenCalled())
    expect(window.confirm.mock.calls[0][0]).toMatch(/collaborat/)
  })
})
