import { describe, expect, it } from 'vitest'
import { sanitizeEditableProfileMetadata } from './profileMetadata'

describe('sanitizeEditableProfileMetadata', () => {
  it('keeps supported profile, appearance, tour, and free-project fields', () => {
    const profile = {
      full_name: 'Writer',
      theme: 'quiet-slate',
      tour_progress: { tour_library: true },
      free_project_id: 'project-1',
    }

    expect(sanitizeEditableProfileMetadata(profile)).toEqual(profile)
  })

  it('strips entitlement and administrative metadata from client profile updates', () => {
    expect(sanitizeEditableProfileMetadata({
      full_name: 'Writer',
      subscription_status: 'active',
      subscription_plan: 'founder',
      beta_tester: true,
      trial_started_at: '2099-01-01T00:00:00.000Z',
      was_monthly: true,
      is_admin: true,
    })).toEqual({ full_name: 'Writer' })
  })

  it('rejects non-object profile updates', () => {
    expect(() => sanitizeEditableProfileMetadata(null)).toThrow(TypeError)
    expect(() => sanitizeEditableProfileMetadata([])).toThrow(TypeError)
  })
})
