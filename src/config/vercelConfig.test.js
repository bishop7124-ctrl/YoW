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

  it('serves route-specific SEO HTML before the SPA catch-all', () => {
    const routeSpecificPages = config.rewrites.filter(rewrite =>
      rewrite.destination.endsWith('/index.html') && rewrite.destination !== '/index.html'
    )

    expect(routeSpecificPages).toEqual(expect.arrayContaining([
      { source: '/features/', destination: '/features/index.html' },
      { source: '/pricing/', destination: '/pricing/index.html' },
      { source: '/faq/', destination: '/faq/index.html' },
      { source: '/founders/', destination: '/founders/index.html' },
      { source: '/founders/morgan-bishop/', destination: '/founders/morgan-bishop/index.html' },
    ]))

    expect(config.rewrites.at(-1)).toEqual({
      source: '/((?!assets/).*)',
      destination: '/index.html',
    })
  })
})
