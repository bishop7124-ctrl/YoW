// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const local = { list: [] }
vi.mock('../../utils/sceneVersions', () => ({
  getSceneVersions: () => local.list,
  clearSceneVersions: vi.fn(),
  deleteSceneVersion: vi.fn(),
}))
const cloud = {
  active: true, paused: false, ok: true, pushed: [], push: vi.fn(async () => true), retry: vi.fn(), list: [], content: { c2: { content: 'cloud only text', title: 'Scene' } }, deleted: [],
  deleteOne: vi.fn(async () => true), clear: vi.fn(async () => true),
}
vi.mock('../../utils/cloudSceneVersions', () => ({
  useCloudSceneHistoryActive: () => cloud.active,
  useCloudSceneHistoryPaused: () => cloud.paused,
  retryCloudSceneHistoryNow: (...args) => cloud.retry(...args),
  lastCloudHistoryError: () => "",
  useCloudHistoryEpoch: () => 0,
  loadCloudSceneVersions: async () => ({ ok: cloud.ok, versions: cloud.ok ? cloud.list : [] }),
  pushCloudSceneVersion: (...args) => cloud.push(...args),
  fetchCloudVersionContent: async id => cloud.content[id] || null,
  deleteCloudSceneVersion: (...args) => cloud.deleteOne(...args),
  clearCloudSceneVersions: (...args) => cloud.clear(...args),
  listRecentlyDeletedScenes: async () => cloud.deleted,
  // Deterministic stand-in for the content hash: lets a test say which snapshots match.
  sceneVersionHash: async (_title, content) => `hash:${content}`,
}))

import SceneVersionHistory from './SceneVersionHistory'

const scene = { id: 's1', title: 'Opening' }
const localVersion = (id, content, ts) => ({ id, sceneId: 's1', title: 'Opening', content, wordCount: content.split(' ').length, timestamp: ts })

beforeEach(() => {
  cloud.active = true
  cloud.paused = false
  cloud.ok = true
  cloud.push.mockClear(); cloud.retry.mockClear()
  cloud.deleted = []
  cloud.deleteOne.mockClear(); cloud.clear.mockClear()
  local.list = [localVersion('l1', 'shared text', 3000), localVersion('l2', 'device only text', 2000)]
  cloud.list = [
    { id: 'cloud:c1', cloudId: 'c1', sceneId: 's1', title: 'Opening', wordCount: 2, timestamp: 3000, hash: 'hash:shared text', cloud: true },
    { id: 'cloud:c2', cloudId: 'c2', sceneId: 's1', title: 'Opening', wordCount: 3, timestamp: 1000, hash: 'hash:cloud only text', cloud: true },
  ]
})
afterEach(cleanup)

const open = (props = {}) => render(<SceneVersionHistory embedded scene={scene} onRestore={vi.fn()} onClose={vi.fn()} onToast={vi.fn()} {...props} />)

describe('SceneVersionHistory with cloud history', () => {
  it('with no scene selected it says so instead of loading forever', async () => {
    cloud.active = true
    open({ scene: null })
    expect(await screen.findByText('No scene selected.')).toBeTruthy()
    expect(screen.queryByText(/Account:/)).toBeNull()
  })

  it('says "device only" when cloud history is not active', async () => {
    cloud.active = false
    open()
    expect(screen.getByText(/Saved on this device only/)).toBeTruthy()
    expect(screen.queryByText('In your account')).toBeNull()
  })

  it('merges device and account versions and labels where each one lives', async () => {
    open()
    await waitFor(() => expect(screen.getAllByText('In your account')).toHaveLength(2))
    expect(screen.getAllByText('This device only')).toHaveLength(1)
    expect(screen.getByText(/latest 20, plus one a day for 30 days/)).toBeTruthy()
    expect(screen.queryByText(/backup/i)).toBeNull()
  })

  it('previews and restores an account-only version', async () => {
    const onRestore = vi.fn()
    open({ onRestore })
    await waitFor(() => expect(screen.getAllByText('In your account')).toHaveLength(2))
    // the account-only version is the oldest row
    const rows = screen.getAllByText(/words$/).map(el => el.closest('button'))
    fireEvent.click(rows[rows.length - 1])
    await waitFor(() => expect(screen.getByText('cloud only text')).toBeTruthy())
    fireEvent.click(screen.getByText('Restore this version'))
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ sceneId: 's1', content: 'cloud only text' }))
  })

  it('deleting a version also removes its account copy', async () => {
    open()
    await waitFor(() => expect(screen.getAllByText('In your account')).toHaveLength(2))
    fireEvent.click(screen.getAllByLabelText('Delete this version')[0])
    await waitFor(() => expect(cloud.deleteOne).toHaveBeenCalledWith('c1'))
  })

  it('clear all also clears the account copies and says so', async () => {
    open()
    await waitFor(() => expect(screen.getAllByText('In your account')).toHaveLength(2))
    fireEvent.click(screen.getByText('Clear all'))
    expect(screen.getByText(/permanently delete all 3 saved versions.*on this device and in your account/)).toBeTruthy()
    fireEvent.click(screen.getByText('Delete all versions'))
    await waitFor(() => expect(cloud.clear).toHaveBeenCalledWith('s1'))
  })

  it('lists recently deleted scenes and recovers one as a new scene', async () => {
    cloud.deleted = [{ id: 'cloud:c9', cloudId: 'c9', sceneId: 'gone', title: 'Lost chapter', wordCount: 40, deletedAt: Date.now() }]
    cloud.content.c9 = { content: 'lost words', title: 'Lost chapter' }
    const onRecoverScene = vi.fn(async () => true)
    open({ onRecoverScene, activeNovelId: 'n1' })
    fireEvent.click(screen.getByText('Recently deleted scenes'))
    await waitFor(() => expect(screen.getByText('Lost chapter')).toBeTruthy())
    fireEvent.click(screen.getByText('Recover as new scene'))
    await waitFor(() => expect(onRecoverScene).toHaveBeenCalledWith({ title: 'Lost chapter', content: 'lost words' }))
    await waitFor(() => expect(screen.queryByText('Lost chapter')).toBeNull())
    // the deleted scene's account copy is NOT erased by recovering it
    expect(cloud.clear).not.toHaveBeenCalled()
  })

  it('shows a message instead of loading forever when an account version cannot be fetched', async () => {
    cloud.content.c2 = null
    open()
    await waitFor(() => expect(screen.getAllByText('In your account')).toHaveLength(2))
    const rows = screen.getAllByText(/words$/).map(el => el.closest('button'))
    fireEvent.click(rows[rows.length - 1])
    await waitFor(() => expect(screen.getByText(/Could not load this version/)).toBeTruthy())
  })

  it('hides recently deleted scenes when cloud history is off', () => {
    cloud.active = false
    open({ onRecoverScene: vi.fn(), activeNovelId: 'n1' })
    expect(screen.queryByText('Recently deleted scenes')).toBeNull()
  })

  it('opening the history sends the account anything only this device has, plus the text as it is now', async () => {
    // l2 ("device only text") is not in the account; the scene's current text is also new.
    open({ scene: { ...scene, content: 'brand new current text', novelId: 'n1' } })
    await waitFor(() => expect(cloud.push).toHaveBeenCalled())
    const sent = cloud.push.mock.calls.map(([version]) => version.content)
    expect(sent).toContain('device only text')
    expect(sent).toContain('brand new current text')
    expect(sent).not.toContain('shared text') // already in the account
    expect(cloud.push.mock.calls.every(([, , options]) => options?.force === true)).toBe(true)
  })

  it('does not push anything when the account list could not be loaded', async () => {
    cloud.ok = false
    open()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(cloud.push).not.toHaveBeenCalled()
  })

  it('tells the writer when account history is paused and lets them retry', async () => {
    cloud.paused = true
    open()
    expect(screen.getByText(/Account history is paused after a connection problem/)).toBeTruthy()
    fireEvent.click(screen.getByText('Try again'))
    expect(cloud.retry).toHaveBeenCalled()
  })
})
