import { describe, expect, it } from 'vitest'
import { formatVersionLabel, getAppVersionLabel } from './appVersion'

describe('app version label', () => {
  it('shows version, platform and build', () => {
    expect(formatVersionLabel({ version: '0.2.0-beta.1', build: 'c177156', desktop: true }))
      .toBe('Version 0.2.0-beta.1 \u00b7 desktop app \u00b7 build c177156')
  })
  it('omits the build when none is known and falls back to dev', () => {
    expect(formatVersionLabel({ version: '0.2.0-beta.1' })).toBe('Version 0.2.0-beta.1')
    expect(formatVersionLabel({})).toBe('Version dev')
  })
  it('reads the injected build values', () => {
    expect(getAppVersionLabel(false)).toMatch(/^Version \S+/)
  })
})
