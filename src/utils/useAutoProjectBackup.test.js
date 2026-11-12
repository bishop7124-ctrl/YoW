// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { resetBackupFailuresForTests } from './projectBackups'

const storage = vi.hoisted(() => ({ items: new Map() }))
vi.mock('../storage/projectStorage', () => ({
  readItem: key => storage.items.get(key) ?? null,
  writeItem: (key, value) => { storage.items.set(key, value) },
}))
import { useAutoProjectBackup } from './useAutoProjectBackup'

const DAY = 24 * 60 * 60 * 1000
const makeStore = (over = {}) => ({
  activeNovelId: 'p1',
  activeNovel: { id: 'p1', backupConfig: { frequency: 'daily', retention: 5, lastBackupAt: new Date(Date.now() - 3 * DAY).toISOString() } },
  getProjectExportData: vi.fn(() => ({ project: { title: 'World' } })),
  updateNovel: vi.fn(),
  ...over,
})

beforeEach(() => { vi.useFakeTimers(); storage.items.clear(); resetBackupFailuresForTests() })
afterEach(() => { vi.useRealTimers() })

describe('useAutoProjectBackup', () => {
  it('makes an overdue snapshot shortly after a project opens, without any settings dialog', () => {
    const store = makeStore()
    renderHook(() => useAutoProjectBackup(store))
    expect(store.updateNovel).not.toHaveBeenCalled() // the project gets a moment to finish loading
    vi.advanceTimersByTime(5100)
    expect(store.updateNovel).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.items.get('nf_project_backups_p1'))[0]).toMatchObject({ kind: 'auto' })
  })

  it('notices a day boundary while the app stays open, and on regaining focus', () => {
    const store = makeStore()
    store.activeNovel.backupConfig.lastBackupAt = new Date().toISOString() // just backed up
    renderHook(() => useAutoProjectBackup(store))
    vi.advanceTimersByTime(5100)
    expect(store.updateNovel).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + DAY + 60000)
    window.dispatchEvent(new Event('focus'))
    expect(store.updateNovel).toHaveBeenCalledTimes(1)
  })

  it('does nothing for manual projects, with no project open, or while the tab is hidden', () => {
    const manual = makeStore({ activeNovel: { id: 'p1', backupConfig: { frequency: 'manual' } } })
    renderHook(() => useAutoProjectBackup(manual))
    const none = makeStore({ activeNovelId: null })
    renderHook(() => useAutoProjectBackup(none))
    const hiddenStore = makeStore()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    renderHook(() => useAutoProjectBackup(hiddenStore))
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(manual.updateNovel).not.toHaveBeenCalled()
    expect(none.updateNovel).not.toHaveBeenCalled()
    expect(hiddenStore.updateNovel).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('stops checking when the project closes', () => {
    const store = makeStore()
    const { unmount } = renderHook(() => useAutoProjectBackup(store))
    unmount()
    vi.advanceTimersByTime(60 * 60 * 1000)
    window.dispatchEvent(new Event('focus'))
    expect(store.updateNovel).not.toHaveBeenCalled()
  })
})
