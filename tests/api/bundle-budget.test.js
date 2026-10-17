import { describe, expect, it } from 'vitest'
import { BUDGETS, evaluate } from '../../scripts/check-bundle-budget.mjs'

const KB = 1024
const build = (overrides = {}) => ({
  entry: 'index-a.js',
  js: [{ name: 'index-a.js', gzip: 500 * KB }, { name: 'map-b.js', gzip: 40 * KB }],
  css: [{ name: 'index-c.css', gzip: 60 * KB }],
  ...overrides,
})

describe('bundle budget gate', () => {
  it('passes a build inside every budget', () => {
    expect(evaluate(build()).failures).toEqual([])
  })

  it('fails when the entry script grows past its budget', () => {
    const result = evaluate(build({ js: [{ name: 'index-a.js', gzip: BUDGETS.entryJs + 1 }] }))
    expect(result.failures.join()).toMatch(/entry index-a\.js/)
  })

  it('fails when a lazy chunk or the CSS total is too large', () => {
    const result = evaluate(build({
      js: [{ name: 'index-a.js', gzip: 100 * KB }, { name: 'big.js', gzip: BUDGETS.anyOtherChunk + 1 }],
      css: [{ name: 'a.css', gzip: BUDGETS.totalCss + 1 }],
    }))
    expect(result.failures.join()).toMatch(/chunk big\.js/)
    expect(result.failures.join()).toMatch(/total CSS/)
  })

  it('fails when total JS passes its budget', () => {
    const result = evaluate(build({ js: [{ name: 'index-a.js', gzip: 610 * KB }, { name: 'a.js', gzip: 140 * KB }, { name: 'b.js', gzip: 140 * KB }, { name: 'c.js', gzip: 140 * KB }] }))
    expect(result.failures.join()).toMatch(/total JS/)
  })
})
