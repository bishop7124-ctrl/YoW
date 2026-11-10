import { describe, expect, it, vi } from 'vitest'
import { fetchRemoteBuild, isNewBuild } from './versionCheck'

const reply = (body, { ok = true, type = 'application/json' } = {}) =>
  vi.fn(async () => ({ ok, headers: { get: () => type }, json: async () => body }))

describe('isNewBuild', () => {
  it('is true only when both ids exist and differ', () => {
    expect(isNewBuild('abc1234', 'def5678')).toBe(true)
    expect(isNewBuild('abc1234', 'abc1234')).toBe(false)
    expect(isNewBuild('', 'def5678')).toBe(false)
    expect(isNewBuild('abc1234', null)).toBe(false)
  })
})

describe('fetchRemoteBuild', () => {
  it('returns the build id from a valid response', async () => {
    expect(await fetchRemoteBuild(reply({ build: 'def5678' }))).toBe('def5678')
  })
  it('ignores HTML (the SPA fallback), errors, junk and failures', async () => {
    expect(await fetchRemoteBuild(reply({ build: 'def5678' }, { type: 'text/html' }))).toBeNull()
    expect(await fetchRemoteBuild(reply({ build: 'def5678' }, { ok: false }))).toBeNull()
    expect(await fetchRemoteBuild(reply({ build: '<script>' }))).toBeNull()
    expect(await fetchRemoteBuild(reply({}))).toBeNull()
    expect(await fetchRemoteBuild(vi.fn(async () => { throw new Error('offline') }))).toBeNull()
  })
})
