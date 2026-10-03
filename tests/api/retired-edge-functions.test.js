import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const functionsDir = new URL('../../supabase/functions/', import.meta.url)
const RETIRED = ['stripe-webhook', 'create-checkout-session', 'create-customer-portal', 'downgrade-to-free']

describe('billing stack has a single implementation', () => {
  it('keeps the legacy Stripe Edge Function copies out of the deployable set', () => {
    const deployable = readdirSync(functionsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(entry => entry.name)
      .sort()
    expect(deployable).toEqual(['send-reengagement-email', 'send-reset-email', 'send-welcome-email'])
    for (const name of RETIRED) {
      expect(existsSync(new URL(`_retired/${name}/index.ts`, functionsDir))).toBe(true)
      expect(existsSync(new URL(`${name}/index.ts`, functionsDir))).toBe(false)
    }
  })

  it('has the active Vercel routes the retired copies were replaced by', () => {
    for (const route of ['stripe-webhook', 'create-checkout-session', 'create-customer-portal']) {
      expect(existsSync(new URL(`../../api/${route}.js`, import.meta.url))).toBe(true)
    }
  })

  it('does not configure or call a retired function', () => {
    const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
    for (const name of RETIRED) expect(config).not.toContain(`[functions.${name}]`)
  })
})
