// Cross-tab "someone else is editing this right now" signal, built on the same
// BroadcastChannel approach as the storage-sync bridge (see
// src/storage/browserVaultAdapter.js) — but for *presence*, not data. Reconciling
// concurrent edits after the fact has repeatedly proven unreliable in practice
// (see the 2026-08-02/03 row in docs/ROADMAP.md's Bugs table, six root causes
// deep), so this warns the user up front instead of trying to silently merge.
import { useEffect, useState } from 'react'

const CHANNEL_NAME = 'yow-record-presence'
const STORAGE_PREFIX = 'yow-record-presence-v2:'
const HEARTBEAT_MS = 4000
const STALE_MS = 10000

function getTabId() {
  // This must identify the current *document*, not the browser session.
  // Safari's Duplicate Tab copies sessionStorage into the new tab, so a
  // sessionStorage-backed id makes both documents ignore each other's
  // presence messages as self-messages. A module-scoped random id is unique
  // to each loaded document, including duplicated tabs.
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
}

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

// key -> Map(otherTabId -> { lastSeenAt, startedAt })
const presenceByKey = new Map()
// key -> Set(listener callbacks)
const listeners = new Map()
// keys *this* document currently has open, so it can answer a fresh 'hello' from a
// tab that doesn't know about it yet (a plain heartbeat only reaches tabs that
// already know to listen for this key).
const openKeys = new Map()
const ownLeaseIds = new Set()

function presenceStoragePrefix(key) {
  return `${STORAGE_PREFIX}${encodeURIComponent(key)}:`
}

function presenceStorageKey(key, id) {
  return `${presenceStoragePrefix(key)}${id}`
}

function writeStoredPresence(key, id, startedAt) {
  try {
    localStorage.setItem(presenceStorageKey(key, id), JSON.stringify({ startedAt, lastSeenAt: Date.now() }))
  } catch { /* BroadcastChannel remains the fallback when storage is unavailable. */ }
}

function removeStoredPresence(key, id) {
  try { localStorage.removeItem(presenceStorageKey(key, id)) } catch { /* unavailable */ }
}

export function presenceHasPriority(ours, theirs) {
  if (!theirs) return false
  if (!ours) return true
  if (theirs.startedAt !== ours.startedAt) return theirs.startedAt < ours.startedAt
  return String(theirs.id) < String(ours.id)
}

function blockingEditorCount(key, ours) {
  const seen = new Map(presenceByKey.get(key) || [])
  const now = Date.now()
  const prefix = presenceStoragePrefix(key)
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(prefix)) continue
      const id = storageKey.slice(prefix.length)
      const entry = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (!entry || now - Number(entry.lastSeenAt) >= STALE_MS) {
        localStorage.removeItem(storageKey)
        continue
      }
      seen.set(id, { lastSeenAt: Number(entry.lastSeenAt), startedAt: Number(entry.startedAt) || 0 })
    }
  } catch { /* Ignore malformed/unavailable storage and use in-memory presence. */ }
  let n = 0
  seen.forEach((entry, id) => {
    if (now - entry.lastSeenAt < STALE_MS && presenceHasPriority(ours, { id, startedAt: entry.startedAt })) n++
  })
  return n
}

function notify(key) {
  listeners.get(key)?.forEach(cb => cb())
}

function markSeen(key, id, startedAt) {
  if (!presenceByKey.has(key)) presenceByKey.set(key, new Map())
  presenceByKey.get(key).set(id, { lastSeenAt: Date.now(), startedAt: Number(startedAt) || 0 })
  notify(key)
}

if (channel) {
  channel.onmessage = ({ data }) => {
    const { type, key, id, startedAt } = data || {}
    if (!type || !key || !id || ownLeaseIds.has(id)) return
    if (type === 'hello' || type === 'heartbeat') {
      markSeen(key, id, startedAt)
      if (type === 'hello' && openKeys.has(key)) {
        const ours = openKeys.get(key)
        channel.postMessage({ type: 'heartbeat', key, id: ours.id, startedAt: ours.startedAt })
      }
    } else if (type === 'bye') {
      presenceByKey.get(key)?.delete(id)
      notify(key)
    }
  }
}

/**
 * Reports how many *other* browser tabs currently have `key` open (per this
 * same signal — i.e. also called this hook with `active: true` for the same
 * key). Pass a stable, globally-unique key per record, e.g. `scene:${id}`.
 */
export function useTabPresence(key, active) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!active || !key) return undefined
    const leaseId = getTabId()
    const startedAt = Date.now()
    const ours = { id: leaseId, startedAt }
    const refresh = () => setCount(blockingEditorCount(key, ours))
    ownLeaseIds.add(leaseId)
    openKeys.set(key, ours)
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(refresh)
    writeStoredPresence(key, leaseId, startedAt)
    refresh()

    channel?.postMessage({ type: 'hello', key, id: leaseId, startedAt })
    const announcePresent = () => {
      writeStoredPresence(key, leaseId, startedAt)
      refresh()
      channel?.postMessage({ type: 'heartbeat', key, id: leaseId, startedAt })
    }
    const announceBye = () => {
      removeStoredPresence(key, leaseId)
      channel?.postMessage({ type: 'bye', key, id: leaseId })
    }
    const handleStorage = event => {
      const prefix = presenceStoragePrefix(key)
      if (!event.key?.startsWith(prefix)) return
      const changedId = event.key.slice(prefix.length)
      if (event.newValue == null) presenceByKey.get(key)?.delete(changedId)
      refresh()
    }
    window.addEventListener('pagehide', announceBye)
    window.addEventListener('pageshow', announcePresent)
    window.addEventListener('storage', handleStorage)
    const heartbeat = setInterval(() => {
      announcePresent()
    }, HEARTBEAT_MS)

    return () => {
      clearInterval(heartbeat)
      window.removeEventListener('pagehide', announceBye)
      window.removeEventListener('pageshow', announcePresent)
      window.removeEventListener('storage', handleStorage)
      if (openKeys.get(key)?.id === leaseId) openKeys.delete(key)
      ownLeaseIds.delete(leaseId)
      listeners.get(key)?.delete(refresh)
      announceBye()
      // A scene's SceneEditor stays mounted across separate focus/blur
      // "sittings" — only `active` (tied to `focused`) toggles, so `count`
      // is this SAME hook instance's state across every future sitting, not
      // freshly initialized per sitting. Without this reset, the *next*
      // focus attempt's very first render sees this sitting's last known
      // (possibly nonzero) `count` before its own fresh `refresh()` call
      // (which only runs inside the effect below, one render later) can
      // correct it — and SceneEditor's conflict-detection effect reads
      // `otherEditorsCount` synchronously on that same first render, so a
      // now-stale "someone else has this open" reading from a *previous*
      // sitting can immediately re-trigger the warning and re-block the
      // user even after the other tab has genuinely closed/blurred and no
      // one is editing any more. Found live 2026-09-17 re-verifying the
      // two-tab clobber Bugs-table row: focus, get warned, go back, wait
      // for the other tab to release, then focus again — the warning fired
      // again anyway, using leftover data from the *first* attempt.
      setCount(0)
    }
  }, [key, active])

  return active ? count : 0
}
