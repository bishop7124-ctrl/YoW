// QA_PLAN.md Priority 11 "Marketing/SEO static pages" item: confirm each
// listed route serves its dedicated static HTML page (from public/) rather
// than falling through to the SPA shell. In dev, vite.config.mjs's
// `staticHtmlMiddleware` mirrors vercel.json's per-route rewrites (see the
// SPA_ROUTES exclusion set there for /features, /pricing, /faq, /founders,
// which are intentionally SPA-rendered instead) — this test does not talk to
// Vercel directly, but exercises the same routing table both configs share
// and would catch a route present in one but not the other.
import { expect, test } from '@playwright/test'

// The SPA shell is the only one of the two that mounts React into #root —
// static files under public/ have no such element at all. This is a more
// reliable discriminator than checking document.title: several SPA-routed
// pages (Founders, FAQ) set their own per-page SEO title via
// src/utils/usePageMeta.js once mounted, so a single expected title doesn't
// hold across all of them.
async function expectSpaShellRendered(page) {
  await expect(page.locator('#root')).not.toBeEmpty()
}

const staticRoutes = [
  ['/about/', 'About Your Own World'],
  ['/ai-overview/', 'AI Writing Assistant for Worldbuilders'],
  ['/worldbuilding-software/', 'Worldbuilding Software for Fantasy Writers'],
  ['/novel-writing-software/', 'Novel Writing Software for Authors'],
  ['/dnd-campaign-manager/', 'D&D Campaign Manager for Dungeon Masters'],
  ['/story-planning-software/', 'Story Planning Software for Writers'],
  ['/timeline-tool-for-writers/', 'Timeline Tool for Writers'],
  ['/family-tree-builder/', 'Family Tree Builder for Writers'],
  ['/map-builder-for-writers/', 'Map Builder for Writers'],
  ['/lore-management/', 'Lore Management Software'],
  ['/founders/example-founder/', 'A. N. Writer — YOW Founder'],
  ['/beta-disclaimer/', 'Beta Disclaimer'],
]

for (const [path, expectedTitleFragment] of staticRoutes) {
  test(`${path} serves its static marketing page, not the SPA shell`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveTitle(new RegExp(expectedTitleFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await expect(page.locator('#root')).toHaveCount(0)
  })
}

// /founders/ (no slug) and /features/, /pricing/, /faq/ are intentionally
// SPA-routed (see SPA_ROUTES in vite.config.mjs), not served from public/ —
// confirm they render the app shell rather than a stray static file.
for (const path of ['/founders/', '/features/', '/pricing/', '/faq/']) {
  test(`${path} renders the SPA shell, not a static file`, async ({ page }) => {
    await page.goto(path)
    await expectSpaShellRendered(page)
  })
}

test('an unknown marketing-shaped route falls through to the SPA shell', async ({ page }) => {
  await page.goto('/this-route-does-not-exist/')
  await expectSpaShellRendered(page)
})
