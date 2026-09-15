import { expect, test } from '@playwright/test'
import { dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// QA_PLAN.md Priority 4 "Responsive And Visual Safety" — the 2026-08-08 entry
// fixed a page-breaking bug where `@media (max-width: 860px) { html, body,
// #root { overflow: hidden/clip } }` (src/index.css) trapped every public
// marketing page to one viewport height below ~860px, with everything past
// the fold unreachable. That session only verified Pricing and FAQ directly;
// this spec verifies the fix holds for the remaining pages sharing the same
// `.yow-home` root class (Features, Founders index, Founder profile, Download,
// and Home) at the three required widths (375px, 768px, 860px).
//
// The check mirrors the exact failure mode: if a page's content is taller
// than one viewport, its `.yow-home` scroll container must report
// `overflow-y: auto` and actually move when scrolled to the bottom — not
// just "look right" at the top of the page. It also asserts no page-level
// horizontal overflow and that the footer (present on every one of these
// pages) is reachable, since a regression here would most likely either trap
// scroll again or make the footer/final CTA unreachable.

const WIDTHS = [375, 768, 860]

async function assertPageScrollsAndHasNoHorizontalOverflow(page) {
  const before = await page.evaluate(() => {
    const root = document.querySelector('.yow-home') || document.querySelector('.marketing-shell')
    const style = root && getComputedStyle(root)
    return {
      hasRoot: !!root,
      scrollHeight: root?.scrollHeight ?? 0,
      clientHeight: root?.clientHeight ?? 0,
      overflowY: style?.overflowY,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })
  expect(before.hasRoot, 'expected a .yow-home or .marketing-shell root element').toBe(true)
  // No page ever overflows horizontally, regardless of content height.
  expect(before.docScrollWidth).toBeLessThanOrEqual(before.viewportWidth + 2)

  const needsScroll = before.scrollHeight > before.clientHeight + 2
  if (needsScroll) {
    expect(before.overflowY).toBe('auto')
    const scrolledTop = await page.evaluate(() => {
      const root = document.querySelector('.yow-home') || document.querySelector('.marketing-shell')
      root.scrollTo({ top: root.scrollHeight, behavior: 'instant' })
      return root.scrollTop
    })
    expect(scrolledTop, 'scrolling the marketing page root should move it — content must not be trapped').toBeGreaterThan(0)
  }

  // The footer is reachable and visible once scrolled to (every one of these
  // pages renders a real <footer>), confirming the trapped-content failure
  // mode specifically (not just that *some* scrollTop value changed).
  const footer = page.locator('footer').first()
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeVisible()

  // Reset scroll for whatever runs next in the same test.
  await page.evaluate(() => {
    const root = document.querySelector('.yow-home') || document.querySelector('.marketing-shell')
    root?.scrollTo({ top: 0, behavior: 'instant' })
  })
}

test.describe('Marketing pages stay scrollable and reachable below 860px', () => {
  test.beforeEach(async ({ page }) => {
    await seedCleanStorage(page)
  })

  // Reachable directly by URL under the OFFLINE_MODE dev-user fixture — these
  // don't depend on signed-out/signed-in state (see App.jsx: showFeatures /
  // showFounders / founderProfileSlug are derived purely from the URL path).
  for (const [label, path] of [
    ['Features', '/features/'],
    ['Founders (index)', '/founders/'],
    ['Founder profile', '/founders/morgan-bishop/'],
    ['Download', '/download/'],
  ]) {
    for (const width of WIDTHS) {
      test(`${label} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 700 })
        await page.goto(path)
        await dismissLaunchPrompts(page)
        await assertPageScrollsAndHasNoHorizontalOverflow(page)
      })
    }
  }

  // Home (the marketing splash rendered by LoginPage's `initialScreen="home"`,
  // via HomePage.jsx) only renders when there is no signed-in user. The
  // VITE_OFFLINE_MODE dev-user fixture used by this whole e2e suite starts
  // every test already signed in, so reach it the same way a real visitor
  // who was just signed out would: sign out via the user menu (OFFLINE_MODE's
  // signOut() really does clear `user`), then continue past the transient
  // "You've been signed out" screen to the homepage.
  for (const width of WIDTHS) {
    test(`Home at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 })
      await page.goto('/')
      await dismissLaunchPrompts(page)

      await page.locator('.user-menu-trigger').click()
      await page.getByRole('menuitem', { name: 'Sign out' }).click()
      await page.getByRole('button', { name: 'Go to homepage' }).click()
      await expect(page.locator('.yow-home')).toBeVisible()

      await assertPageScrollsAndHasNoHorizontalOverflow(page)
    })
  }
})
