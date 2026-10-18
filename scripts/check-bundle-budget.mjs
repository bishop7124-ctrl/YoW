#!/usr/bin/env node
// Route/bundle budget gate (launch sprint 17 Oct, Performance gate). Run after
// `npm run build`. Sizes are gzip bytes, which is what a visitor downloads.
// Budgets sit about 10% above the 17 Oct 2026 measurement, so a real regression
// fails the gate while normal feature work does not. Raise a budget only with a
// recorded reason in docs/QA_PLAN.md.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const KB = 1024
export const BUDGETS = {
  entryJs: 620 * KB, // the first script every route loads (measured 564 KB)
  anyOtherChunk: 150 * KB, // every lazily loaded chunk (largest measured 114 KB)
  totalJs: 1020 * KB, // all JS in dist/assets (measured 910 KB)
  totalCss: 95 * KB, // all CSS in dist/assets (measured 82 KB)
}

const gzipSize = (file) => gzipSync(readFileSync(file)).length
const format = (bytes) => `${(bytes / KB).toFixed(1)} KB`

export const measureBuild = (distDir) => {
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) throw new Error(`No build found at ${assetsDir}. Run "npm run build" first.`)
  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const entryMatch = html.match(/<script[^>]+type="module"[^>]+src="\/assets\/([^"]+\.js)"/)
  if (!entryMatch) throw new Error('Could not find the entry script in dist/index.html.')
  const entry = entryMatch[1]
  const files = readdirSync(assetsDir)
  const sized = (ext) => files.filter(name => name.endsWith(ext)).map(name => ({ name, gzip: gzipSize(join(assetsDir, name)) }))
  return { entry, js: sized('.js'), css: sized('.css') }
}

export const evaluate = ({ entry, js, css }) => {
  const failures = []
  const sum = (items) => items.reduce((total, item) => total + item.gzip, 0)
  const entrySize = js.find(item => item.name === entry)?.gzip ?? 0
  if (entrySize > BUDGETS.entryJs) failures.push(`entry ${entry} is ${format(entrySize)} (budget ${format(BUDGETS.entryJs)})`)
  for (const item of js) {
    if (item.name !== entry && item.gzip > BUDGETS.anyOtherChunk) {
      failures.push(`chunk ${item.name} is ${format(item.gzip)} (budget ${format(BUDGETS.anyOtherChunk)})`)
    }
  }
  if (sum(js) > BUDGETS.totalJs) failures.push(`total JS is ${format(sum(js))} (budget ${format(BUDGETS.totalJs)})`)
  if (sum(css) > BUDGETS.totalCss) failures.push(`total CSS is ${format(sum(css))} (budget ${format(BUDGETS.totalCss)})`)
  return { failures, entrySize, totalJs: sum(js), totalCss: sum(css) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  const result = evaluate(measureBuild(distDir))
  console.log(`Bundle budget: entry ${format(result.entrySize)}, total JS ${format(result.totalJs)}, total CSS ${format(result.totalCss)} (gzip).`)
  if (result.failures.length) {
    console.error(`Bundle budget exceeded:\n- ${result.failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('Bundle budget passed.')
}
