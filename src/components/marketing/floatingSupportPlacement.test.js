import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

// The fixed support pill has no safe corner inside a project workspace: on desktop it covered the
// inspector's Edit/Delete buttons and on phones the manuscript tab bar, which turned five browser
// specs red on 2-3 Oct 2026 (and blocked real taps). It must stay off the workspace.
describe('floating support pill placement', () => {
  it('is hidden whenever the project workspace footer is present', () => {
    expect(css).toMatch(/body:has\(\.studio-workspace-footer\)\s+\.floating-support-link\s*\{\s*display:\s*none;/)
  })

  it('is still hidden behind any open dialog', () => {
    expect(css).toMatch(/body:has\(\[role="dialog"\]\)\s+\.floating-support-link\s*\{\s*display:\s*none;/)
  })

  it('is not lifted by a bottom offset that could land it on a workspace control', () => {
    expect(css).not.toMatch(/body:has\(\.ms-tabbar\)[^{]*\.floating-support-link/)
  })
})
