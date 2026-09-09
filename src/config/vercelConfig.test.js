import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))

describe('Vercel production routing', () => {
  it('redirects the bare domain to the canonical www origin', () => {
    expect(config.redirects).toContainEqual({
      source: '/(.*)',
      has: [{ type: 'host', value: 'yourownworld.co.uk' }],
      destination: 'https://www.yourownworld.co.uk/$1',
      permanent: true,
    })
  })

  it('leaves React-owned public routes to the SPA catch-all', () => {
    const explicitlyStatic = config.rewrites
      .filter(rewrite => rewrite.destination !== '/index.html')
      .map(rewrite => rewrite.source)

    expect(explicitlyStatic).not.toContain('/founders/')
    expect(explicitlyStatic).not.toContain('/founders/:slug/')
    expect(explicitlyStatic).not.toContain('/features/')
    expect(explicitlyStatic).not.toContain('/faq/')
    expect(config.rewrites).toContainEqual({
      source: '/((?!assets/).*)',
      destination: '/index.html',
    })
  })
})
