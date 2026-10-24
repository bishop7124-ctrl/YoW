import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryBackend, resetStorageBackend, setStorageBackend } from '../storage/projectStorage.js'
import { clearDeletedAccountMarkers } from './accountLocalCleanup.js'

describe('clearDeletedAccountMarkers', () => {
  afterEach(() => resetStorageBackend())

  it('clears only the deleted account markers through the active storage backend', () => {
    const backend = createMemoryBackend({
      'nf_unsyncedRecovery:user-delete': 'private prose',
      'nf_localFirstSnapshot:user-delete': 'private prose',
      'nf_unsyncedRecovery:other-user': 'keep prose',
      'nf_lastActiveProject:user-delete': '{"projectId":"deleted-project"}',
      'nf_sampleProjectSeeded:the-last-ember-v3:user-delete': '1',
      'nf_sampleProjectMapSeeded:atlas-layout-v4:user-delete': '1',
      'nf_lastActiveProject:other-user': '{"projectId":"keep-project"}',
    })
    setStorageBackend(backend)

    clearDeletedAccountMarkers('user-delete')

    expect(backend.getItem('nf_unsyncedRecovery:user-delete')).toBeNull()
    expect(backend.getItem('nf_localFirstSnapshot:user-delete')).toBeNull()
    expect(backend.getItem('nf_unsyncedRecovery:other-user')).toBe('keep prose')
    expect(backend.getItem('nf_lastActiveProject:user-delete')).toBeNull()
    expect(backend.getItem('nf_sampleProjectSeeded:the-last-ember-v3:user-delete')).toBeNull()
    expect(backend.getItem('nf_sampleProjectMapSeeded:atlas-layout-v4:user-delete')).toBeNull()
    expect(backend.getItem('nf_lastActiveProject:other-user')).not.toBeNull()
  })
})
