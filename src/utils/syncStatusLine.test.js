import { describe, it, expect } from 'vitest'
import { deriveSyncStatusLine } from './syncStatusLine.js'

const now = 1_700_000_000_000
const idle = { state: 'idle', lastSyncedAt: null, lastError: null }

describe('deriveSyncStatusLine', () => {
  it('shows hosting-inactive when lapsed, regardless of local-first or live state', () => {
    const result = deriveSyncStatusLine({ syncStatus: idle, localFirstSelected: false, canSyncCloud: false, isLocalMode: true, now })
    expect(result).toEqual({ tone: 'paused', text: 'Cloud sync unavailable — hosting inactive' })
  })

  it('lapsed hosting takes priority over local-first state', () => {
    const result = deriveSyncStatusLine({ syncStatus: idle, localFirstSelected: true, canSyncCloud: false, isLocalMode: true, now })
    expect(result.text).toBe('Cloud sync unavailable — hosting inactive')
  })

  it('shows paused with no last-synced time when local-first and never synced', () => {
    const result = deriveSyncStatusLine({ syncStatus: idle, localFirstSelected: true, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'paused', text: 'Automatic sync paused — Local-first mode' })
  })

  it('shows paused with a last-synced time when local-first after a previous sync', () => {
    const syncStatus = { state: 'synced', lastSyncedAt: now - 5 * 60_000, lastError: null }
    const result = deriveSyncStatusLine({ syncStatus, localFirstSelected: true, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'paused', text: 'Automatic sync paused — last synced 5 minutes ago' })
  })

  it('shows unavailable when the account cannot sync cloud at all', () => {
    const result = deriveSyncStatusLine({ syncStatus: idle, localFirstSelected: false, canSyncCloud: false, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'paused', text: 'Cloud sync unavailable for this account' })
  })

  it('shows syncing while a push is in flight', () => {
    const syncStatus = { state: 'syncing', lastSyncedAt: null, lastError: null }
    const result = deriveSyncStatusLine({ syncStatus, localFirstSelected: false, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'active', text: 'Syncing…' })
  })

  it('shows the error message and retry note on failure', () => {
    const syncStatus = { state: 'error', lastSyncedAt: null, lastError: 'network unreachable' }
    const result = deriveSyncStatusLine({ syncStatus, localFirstSelected: false, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'error', text: 'Sync error — network unreachable — will retry automatically' })
  })

  it('falls back to a generic retry note when the error has no message', () => {
    const syncStatus = { state: 'error', lastSyncedAt: null, lastError: null }
    const result = deriveSyncStatusLine({ syncStatus, localFirstSelected: false, canSyncCloud: true, isLocalMode: false, now })
    expect(result.text).toBe('Sync error — will retry automatically')
  })

  it('shows synced with the last-update time after a successful push', () => {
    const syncStatus = { state: 'synced', lastSyncedAt: now - 90_000, lastError: null }
    const result = deriveSyncStatusLine({ syncStatus, localFirstSelected: false, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'synced', text: 'Synced — last update 1 minute ago' })
  })

  it('shows generic active state before any sync has happened yet', () => {
    const result = deriveSyncStatusLine({ syncStatus: idle, localFirstSelected: false, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'active', text: 'Cloud sync active' })
  })

  it('handles a missing syncStatus object gracefully', () => {
    const result = deriveSyncStatusLine({ localFirstSelected: false, canSyncCloud: true, isLocalMode: false, now })
    expect(result).toEqual({ tone: 'active', text: 'Cloud sync active' })
  })
})
