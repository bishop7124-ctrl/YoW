import { describe, expect, it } from 'vitest'
import { getMissingEnv, getSupabaseAdminConfig, validatePaidInterestBody } from '../../api/register-paid-interest.js'

describe('validatePaidInterestBody', () => {
  it('accepts a normal interest submission', () => {
    expect(validatePaidInterestBody({
      email: 'writer@example.com',
      name: 'Writer',
      projectType: 'Novel',
      message: 'Tell me when Lifetime is ready.',
      plan: 'premium_plus_lifetime',
      planLabel: 'Lifetime',
      page: '/pricing',
    })).toBeNull()
  })

  it('rejects missing or invalid email addresses', () => {
    expect(validatePaidInterestBody({})).toBe('Email is required.')
    expect(validatePaidInterestBody({ email: 'not-an-email' })).toBe('Enter a valid email address.')
  })
})

describe('getSupabaseAdminConfig', () => {
  it('falls back to VITE_SUPABASE_URL for Vercel projects that only expose the client URL name', () => {
    expect(getSupabaseAdminConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    })).toEqual({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'service-role',
    })
  })

  it('prefers SUPABASE_URL when both names are available', () => {
    expect(getSupabaseAdminConfig({
      SUPABASE_URL: 'https://server.supabase.co',
      VITE_SUPABASE_URL: 'https://client.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    }).url).toBe('https://server.supabase.co')
  })
})

describe('getMissingEnv', () => {
  it('reports only unset environment keys', () => {
    expect(getMissingEnv(['FEEDBACK_EMAIL', 'FEEDBACK_EMAIL_PASSWORD'], {
      FEEDBACK_EMAIL: 'owner@example.com',
    })).toEqual(['FEEDBACK_EMAIL_PASSWORD'])
  })
})
