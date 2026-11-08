import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import {
  PREVIEW_CHANNEL, SITE_PAGES, findExcludedClaims, mergeContent,
} from '../../utils/siteContent'
import { HOME_DEFAULTS, HOME_SECTION_LABELS } from '../../content/home'
import { FEATURES_DEFAULTS } from '../../content/features'
import { FAQ_DEFAULTS } from '../../content/faq'
import FieldTree from './FieldTree'

// Private page editor for the public marketing pages. Only accounts listed in
// public.site_editors can load or save anything here; every other visitor
// (signed out or signed in) sees an ordinary "not found" page. The database
// enforces this with RLS, so hiding the UI is a courtesy, not the security.

const PAGES = {
  home: { label: 'Homepage', path: '/', defaults: HOME_DEFAULTS },
  features: { label: 'Features page', path: '/features/', defaults: FEATURES_DEFAULTS },
  faq: { label: 'FAQ page', path: '/faq/', defaults: FAQ_DEFAULTS },
}

const SAVE_DELAY_MS = 1200

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-main)', color: 'var(--text-main)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Page not found</h1>
        <a href="/" style={{ color: 'var(--accent)' }}>Go to the homepage</a>
      </div>
    </div>
  )
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '—')

export default function SiteEditor({ user, authLoading }) {
  const [allowed, setAllowed] = useState(null)
  const [page, setPage] = useState('home')
  const [working, setWorking] = useState(null)
  const [live, setLive] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [uploads, setUploads] = useState([])
  const [uploadTick, setUploadTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const channelRef = useRef(null)
  const saveTimer = useRef(null)
  const workingRef = useRef(null)
  const pageRef = useRef(page)
  const dirtyRef = useRef(false)
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { workingRef.current = working }, [working])
  useEffect(() => { dirtyRef.current = dirty }, [dirty])

  const defaults = PAGES[page].defaults

  // Who is this? Ask the database, never trust the client.
  useEffect(() => {
    if (authLoading) return
    if (!user) { setAllowed(false); return }
    let cancelled = false
    Promise.resolve(supabase.rpc('is_site_editor')).then(({ data, error: rpcError }) => {
      if (!cancelled) setAllowed(!rpcError && data === true)
    }).catch(() => { if (!cancelled) setAllowed(false) })
    return () => { cancelled = true }
  }, [user, authLoading])

  useEffect(() => {
    document.title = allowed ? 'Site editor' : 'Page not found'
    let meta = document.querySelector('meta[name="robots"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta) }
    const previous = meta.content
    meta.content = 'noindex, nofollow'
    return () => { meta.content = previous || 'index, follow' }
  }, [allowed])

  // Preview tabs ask for the current draft when they open.
  useEffect(() => {
    if (!allowed || typeof BroadcastChannel === 'undefined') return undefined
    const channel = new BroadcastChannel(PREVIEW_CHANNEL)
    channelRef.current = channel
    channel.onmessage = (e) => {
      if (e.data?.type === 'ready' && e.data.page === pageRef.current && workingRef.current) {
        channel.postMessage({ type: 'draft', page: pageRef.current, content: workingRef.current })
      }
    }
    return () => { channel.close(); channelRef.current = null }
  }, [allowed])

  const pushPreview = useCallback((content) => {
    channelRef.current?.postMessage({ type: 'draft', page: pageRef.current, content })
  }, [])

  const saveDraftNow = useCallback(async () => {
    clearTimeout(saveTimer.current)
    if (!dirtyRef.current || !workingRef.current) return true
    setSaving(true)
    const { error: saveError } = await supabase.from('site_content_draft').upsert({
      page_key: pageRef.current,
      content: workingRef.current,
      updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (saveError) { setError(`Could not save the draft: ${saveError.message}`); return false }
    setError('')
    setDirty(false)
    dirtyRef.current = false
    setStatus(`Draft saved ${new Date().toLocaleTimeString()}`)
    return true
  }, [])

  // Load the draft if there is one, otherwise what is live, otherwise defaults.
  const loadPage = useCallback(async (key) => {
    setWorking(null)
    setError('')
    const [draftRes, liveRes] = await Promise.all([
      supabase.from('site_content_draft').select('content, updated_at').eq('page_key', key).maybeSingle(),
      supabase.from('site_content_published').select('content, published_at').eq('page_key', key).maybeSingle(),
    ])
    if (draftRes.error || liveRes.error) {
      setError(`Could not load this page: ${(draftRes.error || liveRes.error).message}. Nothing has been changed.`)
      return
    }
    const base = PAGES[key].defaults
    const liveMerged = mergeContent(base, liveRes.data?.content)
    const start = draftRes.data ? mergeContent(base, draftRes.data.content) : liveMerged
    setLive({ content: liveMerged, publishedAt: liveRes.data?.published_at || null })
    setWorking(start)
    setDirty(false)
    setStatus(draftRes.data ? `Draft from ${fmt(draftRes.data.updated_at)}` : liveRes.data ? 'Showing the live version' : 'Showing the built-in version')
  }, [])

  useEffect(() => { if (allowed) loadPage(page) }, [allowed, page, loadPage])

  const refreshHistory = useCallback(async () => {
    const { data } = await supabase.from('site_content_history')
      .select('id, content, published_at, archived_at').eq('page_key', pageRef.current)
      .order('id', { ascending: false }).limit(30)
    setHistory(data || [])
  }, [])

  // Image library for the picker
  const refreshUploads = useCallback(() => setUploadTick(t => t + 1), [])
  useEffect(() => {
    if (!allowed) return
    supabase.storage.from('site-media').list('uploads', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
      .then(({ data }) => {
        setUploads((data || []).filter(f => f.name && !f.name.startsWith('.')).map(f => ({
          name: f.name,
          url: supabase.storage.from('site-media').getPublicUrl(`uploads/${f.name}`).data.publicUrl,
        })))
      })
  }, [allowed, uploadTick])

  const ctx = useMemo(() => ({
    sectionLabels: HOME_SECTION_LABELS,
    listUploads: () => Promise.resolve(uploads),
    refreshUploads,
  }), [uploads, refreshUploads])

  const onChange = (next) => {
    setWorking(next)
    setDirty(true)
    dirtyRef.current = true
    pushPreview(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { saveDraftNow() }, SAVE_DELAY_MS)
  }

  useEffect(() => {
    const warn = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); clearTimeout(saveTimer.current) }
  }, [])

  const switchPage = async (key) => {
    if (key === page) return
    if (!(await saveDraftNow())) return
    setShowHistory(false)
    setPage(key)
  }

  const publish = async () => {
    if (!working) return
    const flags = findExcludedClaims(working)
    const warning = flags.length
      ? `\n\nHeads up: this copy mentions things YOW does not offer at launch (${flags.join(', ')}). Publish anyway?`
      : ''
    if (!window.confirm(`Publish the ${PAGES[page].label} to the live site now?${warning}`)) return
    if (!(await saveDraftNow())) return
    const { error: pubError } = await supabase.rpc('publish_site_content', { p_page: page })
    if (pubError) { setError(`Publish failed: ${pubError.message}`); return }
    // Make this browser's cached copy match, so you see it immediately.
    try { localStorage.setItem(`yow_site_content_v1:${page}`, JSON.stringify(working)) } catch { /* ignore */ }
    setLive({ content: working, publishedAt: new Date().toISOString() })
    setStatus(`Published ${new Date().toLocaleTimeString()}`)
    setError('')
  }

  const restore = (entry) => {
    if (!window.confirm(`Load the version that was live until ${fmt(entry.archived_at)} into the editor? It stays a draft until you publish.`)) return
    onChange(mergeContent(defaults, entry.content))
    setShowHistory(false)
  }

  const resetToBuiltIn = () => {
    if (!window.confirm('Replace this draft with the original built-in text and images? It stays a draft until you publish.')) return
    onChange(mergeContent(defaults, null))
  }

  const revertToLive = () => {
    if (!live || !window.confirm('Discard your draft and go back to what is live?')) return
    onChange(live.content)
  }

  if (authLoading || allowed === null) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-main)', color: 'var(--text-muted)' }}>Loading…</div>
  }
  if (!allowed) return <NotFound />

  const unpublished = working && live && JSON.stringify(working) !== JSON.stringify(live.content)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>Site editor</strong>
        <nav aria-label="Pages" style={{ display: 'flex', gap: 6 }}>
          {SITE_PAGES.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => switchPage(key)}
              className={`btn btn-sm ${key === page ? 'btn-primary' : 'btn-secondary'}`}
              aria-current={key === page ? 'page' : undefined}
            >
              {PAGES[key].label}
            </button>
          ))}
        </nav>
        <span style={{ flex: 1 }} />
        <span role="status" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {saving ? 'Saving…' : dirty ? 'Unsaved changes…' : status}{unpublished ? ' · Unpublished changes' : ''}
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.open(`/site-preview/${page}`, 'yow-site-preview')}>
          Open live preview
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowHistory(s => !s); refreshHistory() }}>History</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={publish} disabled={!working || saving}>Publish</button>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 96px' }}>
        {error && <p role="alert" style={{ border: '1px solid #c0564f', color: '#c0564f', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{error}</p>}

        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 0 }}>
          Edit anything below. Changes save automatically as a <strong>draft</strong> and only reach the live site when you press <strong>Publish</strong>.
          Use “Open live preview” to see your draft in the real page while you work. Live now: {fmt(live?.publishedAt) === '—' ? 'built-in version' : fmt(live.publishedAt)}.
        </p>
        <div style={{ display: 'flex', gap: 8, margin: '0 0 20px', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={revertToLive}>Discard draft (back to live)</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={resetToBuiltIn}>Reset to original text</button>
        </div>

        {showHistory && (
          <section aria-label="Version history" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13 }}>Previously published versions</p>
            {history.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Nothing yet. A version is kept each time you publish over an older one.</p>}
            {history.map(entry => (
              <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                <span>Live until {fmt(entry.archived_at)}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => restore(entry)}>Load into editor</button>
              </div>
            ))}
          </section>
        )}

        {working
          ? <FieldTree value={working} template={defaults} ctx={ctx} onChange={onChange} />
          : !error && <p style={{ color: 'var(--text-muted)' }}>Loading page…</p>}
      </main>
    </div>
  )
}
