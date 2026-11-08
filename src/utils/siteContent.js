import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Editable public-site copy. Every page keeps its built-in copy as the default;
// the owner's published overrides (public.site_content_published) are merged on
// top. A failed or missing load always falls back to the defaults, so the
// marketing site can never render blank because of this layer.

export const SITE_PAGES = ['home', 'features', 'faq']
const MAX_STRING = 6000
const MAX_ARRAY = 200
const URL_KEYS = new Set(['src', 'href'])
const CACHE_PREFIX = 'yow_site_content_v1:'

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isScalar = (v) => ['string', 'number', 'boolean'].includes(typeof v)

// Relative paths, https and mailto only. Blocks javascript:, data:, protocol-
// relative URLs and anything else a mistaken paste could introduce.
export function isSafeUrl(value) {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v === '') return true
  if (v.startsWith('//')) return false
  if (v.startsWith('/') || v.startsWith('#')) return true
  return /^(https:\/\/|mailto:)/i.test(v)
}

function mergeScalar(def, over, key) {
  if (!isScalar(over)) return def
  if (typeof over === 'string') {
    if (over.length > MAX_STRING) return def
    if (URL_KEYS.has(key) && !isSafeUrl(over)) return def
  }
  if (typeof def === 'number' && typeof over !== 'number') return def
  return over
}

function mergeArray(def, over) {
  if (!Array.isArray(over)) return def
  const template = def[0]
  const items = over.slice(0, MAX_ARRAY).map((item, i) => {
    const base = i < def.length ? def[i] : template
    return mergeValue(base, item, null)
  })
  return items
}

// Merge `over` onto `def`, keeping the SHAPE of `def`: unknown keys are
// dropped, wrongly-typed values fall back to the default, URLs are validated.
// Arrays take the override's length/order so items can be added, removed and
// reordered; each item is merged against the matching default item (or the
// first default item as a template for newly added ones).
export function mergeValue(def, over, key = null) {
  if (over === undefined || over === null) return def
  // A null default (e.g. an optional note) can be filled in with text.
  if (def === null) return typeof over === 'string' && over.length <= MAX_STRING ? over : def
  if (Array.isArray(def)) return mergeArray(def, over)
  if (isPlainObject(def)) {
    if (!isPlainObject(over)) return def
    const out = {}
    for (const k of Object.keys(def)) out[k] = mergeValue(def[k], over[k], k)
    return out
  }
  if (isScalar(def)) return mergeScalar(def, over, key)
  return def
}

export const mergeContent = (defaults, override) => mergeValue(defaults, override, null)

// ── caching ────────────────────────────────────────────────────────────────
function readCache(page) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + page)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function writeCache(page, content) {
  try { localStorage.setItem(CACHE_PREFIX + page, JSON.stringify(content)) } catch { /* private mode */ }
}

const inflight = new Map()
export function fetchPublishedContent(page) {
  if (!SITE_PAGES.includes(page)) return Promise.resolve(null)
  if (inflight.has(page)) return inflight.get(page)
  const p = Promise.resolve(
    supabase
      .from('site_content_published')
      .select('content')
      .eq('page_key', page)
      .maybeSingle(),
  )
    .then(({ data, error }) => {
      if (error) return null
      return data?.content ?? null
    })
    .catch(() => null)
    .finally(() => { setTimeout(() => inflight.delete(page), 2000) })
  inflight.set(page, p)
  return p
}

// Preview channel: the editor (same origin only) pushes the unsaved draft to
// an open /site-preview/<page> tab. BroadcastChannel never crosses origins.
export const PREVIEW_CHANNEL = 'yow-site-preview'

function openChannel() {
  try { return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(PREVIEW_CHANNEL) } catch { return null }
}

/**
 * useSiteContent('home', DEFAULTS) -> merged content object.
 * In preview mode (the /site-preview/* route) it shows the editor's live draft
 * instead of the published copy.
 */
export function useSiteContent(page, defaults, { preview = false } = {}) {
  const [override, setOverride] = useState(() => (preview ? null : readCache(page)))

  useEffect(() => {
    if (preview) {
      const channel = openChannel()
      if (!channel) return undefined
      channel.onmessage = (e) => {
        if (e.data?.type === 'draft' && e.data.page === page) setOverride(e.data.content)
      }
      channel.postMessage({ type: 'ready', page })
      return () => channel.close()
    }
    let cancelled = false
    fetchPublishedContent(page).then((content) => {
      if (cancelled) return
      if (content) { setOverride(content); writeCache(page, content) }
      else if (content === null) { /* keep cache/defaults */ }
    })
    return () => { cancelled = true }
  }, [page, preview])

  return mergeContent(defaults, override)
}

// Words that would contradict the Marketing gate (docs/ROADMAP.md). The editor
// warns, never blocks: the owner decides.
export const EXCLUDED_CLAIMS = [
  'collaborat', 'real-time', 'realtime', 'co-author', 'shared project', 'share your project',
  'player view', 'player portal', 'virtual tabletop', 'vtt', 'mobile app', 'ios app', 'android app',
  'marketplace', 'community', 'publish to', 'kindle', 'amazon kdp', 'fantasy calendar',
]

export function findExcludedClaims(content) {
  const hits = new Set()
  const walk = (v) => {
    if (typeof v === 'string') {
      const lower = v.toLowerCase()
      for (const w of EXCLUDED_CLAIMS) if (lower.includes(w)) hits.add(w)
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (isPlainObject(v)) Object.values(v).forEach(walk)
  }
  walk(content)
  return [...hits]
}
