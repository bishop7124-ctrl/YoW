import { describe, expect, it } from 'vitest'
import { resolveHistorySceneId } from './historyScene'

const scenes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('resolveHistorySceneId', () => {
  it('shows the scene it was opened for while the active scene has not moved', () => {
    expect(resolveHistorySceneId('a', { sceneId: 'a', anchor: 'a' }, scenes)).toBe('a')
  })
  it('follows the writer into a different scene, and back again', () => {
    expect(resolveHistorySceneId('b', { sceneId: 'a', anchor: 'a' }, scenes)).toBe('b')
    expect(resolveHistorySceneId('a', { sceneId: 'a', anchor: 'a' }, scenes)).toBe('a')
  })
  it('ignores an active scene that no longer exists, or none at all', () => {
    expect(resolveHistorySceneId('gone', { sceneId: 'a', anchor: 'a' }, scenes)).toBe('a')
    expect(resolveHistorySceneId(null, { sceneId: 'a', anchor: 'a' }, scenes)).toBe('a')
    expect(resolveHistorySceneId('b', { sceneId: null, anchor: null }, [])).toBeNull()
  })
})
