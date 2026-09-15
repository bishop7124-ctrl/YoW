// Cross-tab "someone else is editing this right now" signal, built on the same
// BroadcastChannel approach as the storage-sync bridge (see
// src/storage/browserVaultAdapter.js) — but for *presence*, not data. Reconciling
// concurrent edits after the fact has repeatedly proven unreliable in practice
// (see the 2026-08-02/03 row in docs/ROADMAP.md's Bugs table, six root causes
// deep), so this warns the user up front instead of trying to silently merge.
import { useEffect, useState } from 'react'

const CHANNEL_NAME = 'yow-record-presence'
const HEARTBEAT_MS = 4000
const STALE_MS = 10000

function getTabId() {
  try {
    const key = 'yow-tab-presence-id'
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const next = Math.random().toString(36).slice(2)
    sessionStorage.setItem(key, next)
    return next
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

const tabId = getTabId()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null

// key -> Map(otherTabId -> { lastSeenAt, startedAt })
const presenceByKey = new Map()
// key -> Set(listener callbacks)
const listeners = new Map()
// keys *this* tab currently has open, so it can answer a fresh 'hello' from a
// tab that doesn't know about it yet (a plain heartbeat only reaches tabs that
// already know to listen for this key).
const openKeys = new Map()

export function presenceHasPriority(ours, theirs) {
  if (!theirs) return false
  if (!ours) return true
  if (theirs.startedAt !== ours.startedAt) return theirs.startedAt < ours.startedAt
  return String(theirs.id) < String(ours.id)
}

function blockingEditorCount(key, ours) {
  const seen = presenceByKey.get(key)
  if (!seen) return 0
  const now = Date.now()
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
    if (!type || !key || !id || id === tabId) return
    if (type === 'hello' || type === 'heartbeat') {
      markSeen(key, id, startedAt)
      if (type === 'hello' && openKeys.has(key)) {
        channel.postMessage({ type: 'heartbeat', key, id: tabId, startedAt: openKeys.get(key) })
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
    if (!active || !key || !channel) return undefined
    const startedAt = Date.now()
    const ours = { id: tabId, startedAt }
    const refresh = () => setCount(blockingEditorCount(key, ours))
    openKeys.set(key, startedAt)
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key).add(refresh)
    refresh()

    channel.postMessage({ type: 'hello', key, id: tabId, startedAt })
    const heartbeat = setInterval(() => {
      refresh()
      channel.postMessage({ type: 'heartbeat', key, id: tabId, startedAt })
    }, HEARTBEAT_MS)

    return () => {
      clearInterval(heartbeat)
      openKeys.delete(key)
      listeners.get(key)?.delete(refresh)
      channel.postMessage({ type: 'bye', key, id: tabId })
    }
  }, [key, active])

  return active ? count : 0
}
