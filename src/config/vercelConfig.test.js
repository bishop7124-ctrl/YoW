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
})
