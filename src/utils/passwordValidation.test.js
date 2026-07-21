import { describe, expect, it } from 'vitest'
import { validatePassword } from './passwordValidation.js'

describe('password validation', () => {
  it('accepts a password that meets the signup requirements', () => {
    expect(validatePassword('Worlds2026!').valid).toBe(true)
  })

  it('returns clear missing requirements for weak passwords', () => {
    const result = validatePassword('short')

    expect(result.valid).toBe(false)
    expect(result.missing).toEqual(['uppercase letter', 'number', 'symbol', 'minimum length 8 characters'])
    expect(result.message).toBe('Password requires uppercase letter, lowercase letter, number, symbol, minimum length 8 characters.')
  })
})
