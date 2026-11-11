// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  isEditor: true,
  draft: null,
  published: null,
  upserts: [],
  rpcCalls: [],
  save: null,
  load: null,
  publish: null,
}))

vi.mock('../../supabase', () => {
  const table = (name) => ({
    select: () => ({
      eq: (_field, page) => ({
        maybeSingle: () => db.load ? db.load(name, page) : Promise.resolve({
          data: name === 'site_content_draft' ? db.draft : name === 'site_content_published' ? db.published : null,
          error: null,
        }),
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
      }),
    }),
    upsert: (row) => { db.upserts.push({ name, row }); return db.save ? db.save(row) : Promise.resolve({ error: null }) },
  })
  return {
    supabase: {
      rpc: (fn, args) => {
        db.rpcCalls.push({ fn, args })
        if (fn === 'is_site_editor') return Promise.resolve({ data: db.isEditor, error: null })
        return db.publish ? db.publish(args) : Promise.resolve({ data: null, error: null })
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
  db.isEditor = true; db.draft = null; db.published = null; db.upserts = []; db.rpcCalls = []; db.save = null; db.load = null; db.publish = null
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

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


const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

describe('site editor asynchronous preservation (AUD-30)', () => {
  const pendingImages = () => {
    const images = []
    vi.stubGlobal('Image', class {
      naturalWidth = 800
      naturalHeight = 600
      constructor() { images.push(this) }
    })
    return images
  }

  it('ignores an old page image result after loading another page', async () => {
    const images = pendingImages()
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    await screen.findByDisplayValue('Your Own World')
    fireEvent.change(screen.getAllByLabelText('Choose an existing image')[0], { target: { value: '/screenshots/character-dossier.jpg' } })
    expect(images).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'FAQ page' }))
    await screen.findByDisplayValue('Frequently asked questions')
    await act(async () => images[0].onload())
    const faq = screen.queryByDisplayValue('Frequently asked questions')
    expect(faq).not.toBeNull()
    expect(db.upserts).toHaveLength(0)
    fireEvent.change(faq, { target: { value: 'New FAQ heading' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(db.upserts[0].row.page_key).toBe('faq')
    expect(db.upserts[0].row.content.hero).toMatchObject({ eyebrow: 'FAQ', title: 'New FAQ heading' })
  })

  it('retains sibling text edits when an image measurement finishes', async () => {
    const images = pendingImages()
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    const eyebrow = await screen.findByDisplayValue('Your Own World')
    fireEvent.change(screen.getAllByLabelText('Choose an existing image')[0], { target: { value: '/screenshots/character-dossier.jpg' } })
    fireEvent.change(eyebrow, { target: { value: 'Keep later text edit' } })
    await act(async () => images[0].onload())
    expect(screen.queryByDisplayValue('Keep later text edit')).not.toBeNull()
    expect(screen.getAllByLabelText('Choose an existing image')[0].value).toBe('/screenshots/character-dossier.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(db.upserts[0].row.content.hero.eyebrow).toBe('Keep later text edit')
  })

  it('saves edits made during an older save instead of falsely acknowledging them', async () => {
    const first = deferred()
    const second = deferred()
    db.save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    const input = await screen.findByDisplayValue('Your Own World')
    fireEvent.change(input, { target: { value: 'Revision A' } })
    await waitFor(() => expect(db.upserts).toHaveLength(1), { timeout: 4000 })
    fireEvent.change(input, { target: { value: 'Revision B' } })
    await act(async () => first.resolve({ error: null }))
    await waitFor(() => expect(db.upserts).toHaveLength(2), { timeout: 4000 })
    expect(db.upserts[1].row.content.hero.eyebrow).toBe('Revision B')
    await act(async () => second.resolve({ error: null }))
    expect(screen.getByRole('status').textContent).toMatch(/Draft saved/)
    expect(input.value).toBe('Revision B')
  })

  it('ignores an older page load that resolves after a later navigation', async () => {
    const features = deferred()
    db.load = (table, page) => page === 'features' ? features.promise : Promise.resolve({ data: null, error: null })
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    await screen.findByDisplayValue('Your Own World')
    fireEvent.click(screen.getByRole('button', { name: 'Features page' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Features page' }).getAttribute('aria-current')).toBe('page'))
    fireEvent.click(screen.getByRole('button', { name: 'FAQ page' }))
    const faq = await screen.findByDisplayValue('Frequently asked questions')
    await act(async () => features.resolve({ data: null, error: null }))
    expect(screen.queryByDisplayValue('Frequently asked questions')).not.toBeNull()
    fireEvent.change(faq, { target: { value: 'Latest FAQ heading' } })
    await waitFor(() => expect(db.upserts).toHaveLength(1), { timeout: 4000 })
    expect(db.upserts[0].row.page_key).toBe('faq')
    expect(JSON.stringify(db.upserts[0].row.content)).toContain('Latest FAQ heading')
  })

  it('publishes the confirmed saved copy while temporarily locking edits and page switching', async () => {
    const save = deferred()
    const publish = deferred()
    db.save = () => save.promise
    db.publish = () => publish.promise
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    const input = await screen.findByDisplayValue('Your Own World')
    fireEvent.change(input, { target: { value: 'Confirmed copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(db.upserts).toHaveLength(1))
    expect(input.closest('fieldset')?.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Features page' }).disabled).toBe(true)
    await act(async () => save.resolve({ error: null }))
    await waitFor(() => expect(db.rpcCalls.some(c => c.fn === 'publish_site_content')).toBe(true))
    await act(async () => publish.resolve({ data: '2026-11-09T12:00:00Z', error: null }))
    expect(JSON.parse(localStorage.getItem('yow_site_content_v1:home')).hero.eyebrow).toBe('Confirmed copy')
    expect(input.closest('fieldset')?.disabled).toBe(false)
  })

  it('keeps a failed save dirty and refuses publication when the request rejects', async () => {
    db.save = () => Promise.reject(new Error('temporary connection failure'))
    render(<SiteEditor user={{ id: 'owner' }} authLoading={false} />)
    const input = await screen.findByDisplayValue('Your Own World')
    fireEvent.change(input, { target: { value: 'Keep this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('temporary connection failure'))
    expect(screen.getByRole('status').textContent).toContain('Unsaved')
    expect(db.rpcCalls.filter(c => c.fn === 'publish_site_content')).toHaveLength(0)
    expect(input.value).toBe('Keep this draft')
  })
})
