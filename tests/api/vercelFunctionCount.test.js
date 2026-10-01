import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function vercelFunctionFiles(directoryUrl = new URL('../../api/', import.meta.url), prefix = '') {
  return readdirSync(directoryUrl, { withFileTypes: true }).flatMap(entry => {
    const relativePath = `${prefix}${entry.name}`
    if (entry.isDirectory()) {
      return vercelFunctionFiles(new URL(`${entry.name}/`, directoryUrl), `${relativePath}/`)
    }
    // Vercel ignores utility files only when the filename itself starts with
    // `_` or `.`, not merely because one of their parent directories does.
    return entry.name.endsWith('.js') && !entry.name.startsWith('_') && !entry.name.startsWith('.')
      ? [relativePath]
      : []
  })
}

describe('Vercel Function count', () => {
  it('keeps the Hobby deployment at no more than 12 Vercel Functions', () => {
    expect(vercelFunctionFiles().sort()).toEqual([
      'ai-proxy.js',
      'ai-settings.js',
      'create-checkout-session.js',
      'create-customer-portal.js',
      'desktop-devices.js',
      'get-download-links.js',
      'get-founder-slots.js',
      'reengagement-unsubscribe.js',
      'register-paid-interest.js',
      'send-reengagement-emails.js',
      'stripe-webhook.js',
      'submit-feedback.js',
    ])
  })
})
