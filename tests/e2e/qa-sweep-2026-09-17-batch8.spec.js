// 2026-09-17 batch browser-verify pass over 8 ROADMAP.md Bugs-table rows
// already marked fixed/QA-passed, re-checked live in a real browser per this
// session's mandate (some prior sign-offs pre-date the 2026-09-16 desktop
// density-scale zoom feature, a plausible new source of regressions at
// >860px).
//
// Only 2 of the 8 rows get new permanent coverage here — the other 6 turned
// out to already have dedicated, still-passing e2e coverage this session
// re-ran to confirm no regression, so duplicating them here would just add
// redundant CI time:
//   - marketing pages unscrollable below 860px -> tests/e2e/marketing-pages-responsive.spec.js
//     (375/768/860px, all pages including a real signed-out Home via sign-out flow)
//     + tests/e2e/qa-sweep-2026-09-04.spec.js (features/founders/download at 375px)
//   - corner roundness on badges/pills -> qa-sweep-2026-09-04.spec.js
//   - pricing page neutral presentation -> qa-sweep-2026-09-04.spec.js
//   - Map Builder opens on new + existing maps (the MAP_TYPE_OPTIONS crash site)
//     -> tests/e2e/atlas-builder.spec.js ("new atlas creates all scales..." and
//     "existing maps retain their original editor and data...")
//   - WorldHistory sticky era header opacity -> qa-sweep-2026-09-04.spec.js
//   - dashboard has its own /dashboard URL -> tests/e2e/url-persistence.spec.js
// All of the above were re-run live this session (see the dated ROADMAP.md
// note) and passed with no regression, including at the >860px widths that
// now go through the 2026-09-16 density-scale zoom.
//
// The 2 rows below had no permanent e2e coverage before this pass:
//   1. Project/dashboard word counts inflated by raw scene markup — only
//      unit-tested (src/utils/projectStats.test.js), never browser-verified.
//   2. Public pages inheriting a signed-in user's custom theme — the one
//      e2e case that existed for this (qa-sweep-2026-09-04.spec.js) was
//      explicitly dropped as stale (named a theme id that no longer exists)
//      and never replaced.
import { test, expect } from '@playwright/test'
import { createProject, seedCleanStorage, dismissLaunchPrompts, waitForStorageHydration, readStorage } from './helpers.js'

// The app's real storage backend is an IndexedDB-backed vault reached through
// window.__yowStorageBridge, not raw localStorage (see helpers.js readStorage's
// own comment) — writing/reading plain `localStorage` directly silently sees
// nothing once that backend is active. Mirrors readStorage() for writes.
async function writeStorage(page, key, value) {
  await page.evaluate(({ k, v }) => {
    const json = JSON.stringify(v)
    if (window.__yowStorageBridge?.setItem) window.__yowStorageBridge.setItem(k, json)
    else localStorage.setItem(k, json)
  }, { k: key, v: value })
}

// Bugs row: "Project picker/dashboard word counts could be inflated by raw
// markup" (Closed — QA-verified 2026-08-28, but that verification predates
// this repo's e2e suite gaining permanent coverage for it — only
// projectStats.test.js covers this at the unit level). Seed a scene whose
// content is 200 noisy markup/attribute-like tokens plus a single real word,
// and confirm the Project Overview's "Words written" stat shows 1, not an
// inflated count derived from raw token-splitting.
test('word count is not inflated by raw markup (Project Overview)', async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'WordCount QA' })
  await waitForStorageHydration(page)
  const novelId = await readStorage(page, 'nf_activeNovel')
  const noisy = Array.from({ length: 200 }, (_, i) => `data-storage-attr-${i}="value${i}"`).join(' ')
  const scene = {
    id: 'qa-scene-1', novelId, chapterId: 'qa-chapter-1', order: 0,
    title: 'QA Scene', content: `<div ${noisy}>Hello</div>`, status: 'draft',
  }
  const chapter = { id: 'qa-chapter-1', novelId, actId: 'qa-act-1', order: 0, title: 'QA Chapter' }
  const act = { id: 'qa-act-1', novelId, order: 0, title: 'QA Act' }
  await writeStorage(page, 'nf_scenes', [scene])
  await writeStorage(page, 'nf_chapters', [chapter])
  await writeStorage(page, 'nf_acts', [act])
  await page.reload()
  await waitForStorageHydration(page)
  await page.waitForTimeout(500)

  const wordsWritten = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.overview-stat-tile')]
    const tile = tiles.find(t => t.querySelector('.overview-stat-label')?.textContent.trim() === 'Words written')
    return tile ? tile.querySelector('.overview-stat-value')?.textContent.trim() : null
  })
  expect(wordsWritten).toBe('1')

  // Also confirm the library/project-picker card shows the same sane count,
  // not the raw-token-inflated one. (The card also legitimately shows the
  // project's fixed 80,000-word *target*, unrelated to actual content — this
  // checks the word-count stat specifically, not "no large number anywhere".)
  await page.getByRole('button', { name: 'Back to projects' }).first().click()
  await page.waitForTimeout(300)
  const libraryCardWords = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="library-card"], .library-card, .project-card')
    const text = (card || document.body).innerText
    const match = text.match(/(\d[\d,]*)\s*words?(?!\s*(?:to go|target))/i)
    return match ? match[1] : null
  })
  if (libraryCardWords) {
    expect(Number(libraryCardWords.replace(/,/g, ''))).toBeLessThan(250) // 200 noisy tokens + slack
  }
})

// Bugs row: "Homepage/public pages inherit user's custom theme" (QA passed
// 2026-09-05). Sets a distinctive non-default theme (Pearl Minimal) via the
// real Appearance UI, then confirms /pricing, /features, /faq and /founders
// all show the forced default theme instead, and the user's own theme is
// restored on navigating back into the app.
test('public marketing pages force the default theme, not the signed-in user\'s theme', async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await page.waitForTimeout(300)

  // Set the theme via the real Appearance UI + in-page event, without a full
  // reload: reloading re-triggers App.jsx's "apply account-owned appearance
  // on login" effect, which resets the offline-mode fixture user (who has no
  // user_metadata.theme) back to the default theme. Client-side SPA
  // navigation avoids that, matching how a real user's in-session theme
  // choice actually persists.
  await page.evaluate(() => window.dispatchEvent(new Event('open-account-settings')))
  await page.getByRole('tab', { name: 'Appearance' }).or(page.getByRole('button', { name: 'Appearance' })).first().click()
  await page.getByRole('button', { name: /Pearl Minimal/i }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  const dashboardBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim())
  expect(dashboardBg.toLowerCase()).toBe('#fafaf9')

  // Bare '/' is intentionally excluded: for an already-authenticated session
  // it isn't a distinct standalone public route (isStandalonePublicRoute only
  // recognizes /pricing, /features, /faq, /founders, /download, /login,
  // /signup — src/utils/appRoutes.js) — it's an alias redirected to
  // /dashboard once, on first mount, so a logged-in user never actually
  // lingers on '/' seeing marketing content. The signed-out '/' case is
  // covered by marketing-pages-responsive.spec.js's "Home" tests instead.
  const publicResults = {}
  for (const path of ['/pricing/', '/features/', '/faq/', '/founders/']) {
    await page.evaluate((p) => window.history.pushState({}, '', p), path)
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
    await page.waitForTimeout(300)
    publicResults[path] = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim())
  }
  for (const [path, bg] of Object.entries(publicResults)) {
    expect(bg.toLowerCase(), `${path} kept the user's Pearl Minimal theme instead of the default`).not.toBe('#fafaf9')
  }

  await page.evaluate(() => window.history.pushState({}, '', '/dashboard'))
  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
  await page.waitForTimeout(300)
  const restoredBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim())
  expect(restoredBg.toLowerCase()).toBe('#fafaf9')
})
