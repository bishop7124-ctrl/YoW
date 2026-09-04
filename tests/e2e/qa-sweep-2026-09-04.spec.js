// QA sweep 2026-09-04 (product-owner autonomous session): real-browser verification
// of "needs QA" / "needs visual QA" / "needs browser QA" Bugs-table rows and
// QA_PLAN.md items that are checkable in this environment's OFFLINE_MODE dev-server
// stub — no real Supabase account, Stripe checkout, AI provider key, or device
// required. See docs/ROADMAP.md's Bugs table and docs/QA_PLAN.md for the rows this
// verifies; each test below names the exact row it covers.
import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

async function openAccountSettings(page) {
  await page.locator('.user-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Account settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Account Settings' }).or(page.locator('.account-settings-page'))).toBeVisible()
}

async function goToAppearanceTab(page) {
  await page.getByRole('tab', { name: 'Appearance' }).or(page.getByText('Appearance', { exact: true })).first().click()
}

async function closeAccountSettings(page) {
  await page.getByLabel('Close account settings').click()
}

// Bugs row: "Theme corner roundness did not apply to many badge/button labels"
// (Fixed 2026-07-20, needs visual QA). --r-pill now derives from --radius-unit;
// verify a real pill/badge element (.project-settings-type-chip, which uses
// `border-radius: var(--r-pill)`) visibly changes shape when the Account
// Settings "Corner roundness" slider moves from sharp to rounded.
test('theme corner roundness applies to project type badge', async ({ page }) => {
  await createProject(page, { title: `Roundness ${Date.now()}` })

  const readChipRadius = async () => {
    await page.getByLabel('Project settings').first().click()
    await page.waitForSelector('[role="dialog"][aria-labelledby="project-settings-title"]')
    const radius = await page.locator('.project-settings-type-chip').first().evaluate(
      el => parseFloat(getComputedStyle(el).borderRadius),
    )
    await page.getByRole('button', { name: 'Done' }).first().click()
    return radius
  }

  const defaultRadius = await readChipRadius()
  expect(defaultRadius).toBeGreaterThan(0)

  await openAccountSettings(page)
  await goToAppearanceTab(page)
  const slider = page.locator('.account-range-field').first().locator('input[type="range"]')
  await expect(slider).toBeVisible()
  await slider.evaluate(el => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '2')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await closeAccountSettings(page)

  const sharpRadius = await readChipRadius()
  // radiusUnit=2 -> --r-pill = max(2px, 2*1.8) = 3.6px
  expect(sharpRadius).toBeLessThan(defaultRadius)
  expect(sharpRadius).toBeLessThanOrEqual(6)

  await openAccountSettings(page)
  await goToAppearanceTab(page)
  const slider2 = page.locator('.account-range-field').first().locator('input[type="range"]')
  await slider2.evaluate(el => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '16')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await closeAccountSettings(page)

  const roundedRadius = await readChipRadius()
  // radiusUnit=16 -> --r-pill = max(2px, 16*1.8) = 28.8px
  expect(roundedRadius).toBeGreaterThan(sharpRadius)
  expect(roundedRadius).toBeGreaterThan(20)
})

// Bugs row: "Character age-at-death calculation used current year as the age
// anchor" (Fixed, unit-tested, needs UI QA). Verify Age 1062 + Death Year 812
// shows "1062 at death", and the edit form reopens with Age 1062 (not a
// recalculated/garbage value).
test('character age-at-death uses death year as the anchor', async ({ page }) => {
  await createProject(page, { title: `AgeDeath ${Date.now()}` })
  await page.getByRole('button', { name: 'Open Characters' }).first().click()
  await page.getByRole('button', { name: /^(New|Add Character)$/ }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type="text"], input:not([type])').first().fill('Old One')
  const ageInput = dialog.locator('input[type="number"]').first()
  await ageInput.fill('1062')

  // Status is a custom ComboSelect <input> (not a native <select>), defaulting
  // to a displayed value of "Alive" — its dropdown list re-renders per
  // keystroke/highlight change, which made a plain click on the "Dead" <li>
  // flaky (actionability's stability check never settled). Typing to filter
  // then committing with Enter (the same interaction the component's own
  // handleKeyDown supports) is what a real keyboard user would do and avoids
  // depending on the dropdown's exact click geometry.
  // Locate the input by its position relative to the "Status" label rather
  // than its current displayed value ("Alive") — that value changes the
  // instant we fill it, so a value-based locator goes stale mid-interaction.
  const statusInput = dialog.getByText('Status', { exact: true }).locator('xpath=following-sibling::*[1]//input')
  await statusInput.click()
  await statusInput.fill('Dead')
  await statusInput.press('Enter')

  const deathYearInput = dialog.getByPlaceholder('Year 98')
  await expect(deathYearInput).toBeVisible()
  await deathYearInput.fill('Year 812')

  // Scope to the dialog — the detail pane behind it still shows its own
  // "Add Character" empty-state button, which an unscoped locator can match
  // first and click instead of the modal's real "Save Character" button.
  await dialog.getByRole('button', { name: /^Save/i }).first().click()

  // .first() — the text appears both in the header meta line ("Age 1062 at
  // death") and the Age detail row's own value ("1062 at death").
  await expect(page.getByText('1062 at death').first()).toBeVisible({ timeout: 8000 })

  // Reopen the edit form and confirm the Age field still reads 1062 (not a
  // recalculated value using current year as the anchor).
  await page.getByRole('button', { name: /Edit/i }).first().click()
  await expect(page.locator('input[type="number"]').first()).toHaveValue('1062')
})

// Bugs row: "Pricing page made Lifetime look permanently selected and called
// it Creator in comparison copy" (Fixed, needs QA). Verify no plan card looks
// selected, "Creator" never appears, and clicking card body content (not the
// CTA button) does nothing.
test('pricing page: no card looks pre-selected and Lifetime is never called Creator', async ({ page }) => {
  await page.goto('/pricing/')
  await dismissLaunchPrompts(page)

  await expect(page.getByText('Creator', { exact: false })).toHaveCount(0)

  const cards = page.locator('.pricing-card')
  await expect(cards.first()).toBeVisible()
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)

  // None of the cards should carry a "selected"/"active" state class.
  for (let i = 0; i < count; i++) {
    const cls = await cards.nth(i).getAttribute('class')
    expect(cls || '').not.toMatch(/is-selected|selected|is-active(?!\b.*highlight)/)
  }

  // Clicking the card body (its heading, not the CTA button) should not
  // trigger checkout/navigation.
  const urlBefore = page.url()
  await cards.first().locator('h3').first().click()
  await page.waitForTimeout(300)
  expect(page.url()).toBe(urlBefore)
})

// Bugs row: "AI context selector omitted History" (Fixed, needs QA). Verify
// World History entries are selectable as AI chat context and the selected
// count updates. Does not exercise an actual AI response (no provider key in
// this environment) — only the context-selection UI this row's fix touched.
test('AI chat context selector includes a History section with a live count', async ({ page }) => {
  await createProject(page, { title: `HistoryContext ${Date.now()}` })
  // World History lives inside the "Lore" studio room (STUDIO_ROOMS in
  // Layout.jsx groups sections ['lore', 'timeline', 'worldhistory']) — the
  // Dashboard overview's own "History" quick-link card is a different,
  // unrelated control that intentionally routes to Timeline instead
  // (`primarySection: 'timeline'` in ProjectDashboard.jsx), so open the room
  // and then pick the "History" sub-tab explicitly rather than any button
  // merely containing the word "History".
  await page.getByRole('button', { name: 'Open Lore' }).first().click()
  await page.getByRole('navigation', { name: 'Room sections' }).getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'New' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input').first().fill('The Sundering')
  await dialog.locator('input[type="number"]').first().fill('100') // Start year * is required
  await page.getByRole('button', { name: /^Save/i }).first().click()
  // .first() — saving auto-selects the new entry, so its title now appears
  // twice: once in the index list, once as the detail pane's <h1>.
  await expect(page.getByText('The Sundering').first()).toBeVisible({ timeout: 8000 })

  await page.getByTitle('Open AI chat').click()
  const newChatBtn = page.getByRole('button', { name: '+ New chat' })
  if (await newChatBtn.isVisible().catch(() => false)) await newChatBtn.click()

  // Scope to the AI panel throughout — the History workspace page's own
  // room-sections tab (also named "History") and record list stay mounted
  // behind the chat overlay and would otherwise collide with these locators.
  const aiPanel = page.getByRole('dialog', { name: 'AI chat' })
  const historySectionBtn = aiPanel.getByRole('button', { name: /^History/ })
  await expect(historySectionBtn).toBeVisible({ timeout: 8000 })
  await historySectionBtn.click() // expand the section if collapsed

  await aiPanel.getByText('The Sundering').first().click() // toggle the entry's checkbox row
  await expect(aiPanel.getByRole('button', { name: /^History \(1\)/ })).toBeVisible({ timeout: 5000 })
})

// Bugs row: "History era headers show text overlap while sticky" (Fixed,
// needs QA). Verify the sticky era header uses a fully opaque background
// (not translucent) so scrolled entries never show through it.
test('World History sticky era header is fully opaque', async ({ page }) => {
  await createProject(page, { title: `EraSticky ${Date.now()}` })
  // World History lives inside the "Lore" studio room (STUDIO_ROOMS in
  // Layout.jsx groups sections ['lore', 'timeline', 'worldhistory']) — the
  // Dashboard overview's own "History" quick-link card is a different,
  // unrelated control that intentionally routes to Timeline instead
  // (`primarySection: 'timeline'` in ProjectDashboard.jsx), so open the room
  // and then pick the "History" sub-tab explicitly rather than any button
  // merely containing the word "History".
  await page.getByRole('button', { name: 'Open Lore' }).first().click()
  await page.getByRole('navigation', { name: 'Room sections' }).getByRole('button', { name: 'History', exact: true }).click()

  // Add several entries so the index panel actually scrolls.
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: 'New' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input').first().fill(`Chronicle Entry ${i}`)
    await dialog.locator('input[type="number"]').first().fill(String(100 + i)) // Start year * is required
    await page.getByRole('button', { name: /^Save/i }).first().click()
    // .first() — saving auto-selects the new entry, so its title now appears
    // twice: once in the index list, once as the detail pane's <h1>.
    await expect(page.getByText(`Chronicle Entry ${i}`).first()).toBeVisible({ timeout: 8000 })
  }

  const stickyHeader = page.locator('.sticky.top-0').first()
  await expect(stickyHeader).toBeVisible()
  const alpha = await stickyHeader.evaluate(el => {
    const bg = getComputedStyle(el).backgroundColor
    const m = bg.match(/rgba?\(([^)]+)\)/)
    if (!m) return 1
    const parts = m[1].split(',').map(s => s.trim())
    return parts.length === 4 ? parseFloat(parts[3]) : 1
  })
  expect(alpha).toBe(1)
})

// Bugs rows: "Homepage/public pages inherit user's custom theme" and "Dashboard
// had no dedicated URL — shared `/` with the marketing homepage" (both Fixed,
// needs QA).
//
// Two OFFLINE_MODE-specific caveats this test works around rather than
// hides:
// 1. The logged-out marketing Home page can't be reached at all (the offline
//    dev-user is always "signed in") — this exercises the same isPublicPage
//    theme-reset code path via /pricing/ and /features/, which share it.
// 2. AppInner's "apply account-owned appearance on login" effect
//    (src/App.jsx, keyed on `user?.id`) resets the theme to DEFAULT_THEME on
//    every fresh mount whenever `user.user_metadata.theme` is empty — true
//    for a real brand-new account, but also true for OFFLINE_MODE's static
//    OFFLINE_USER fixture on *every* page load, since it never round-trips a
//    saved theme back into user_metadata the way a real Supabase profile
//    save does. A hard `page.goto()` between routes would spuriously wipe
//    the just-picked theme on every reload and falsely look like the
//    restore-on-return half of this fix is broken. Real navigation between
//    these marketing pages is itself a hard `<a href>` link (see
//    src/components/marketing/MarketingNav.jsx) — the app already supports
//    a client-side route change without a remount for exactly this
//    situation (see AccountSettings.jsx's own pushState+popstate upgrade
//    link) and that path is what a real signed-in user's session mostly
//    exercises when clicking any in-app link, so use the same mechanism
//    here to test the actual isPublicPage/restore logic without also
//    exercising OFFLINE_MODE's unrelated fixture limitation.
async function clientSideNavigate(page, path) {
  await page.evaluate((p) => {
    window.history.pushState(null, '', p)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test('public marketing routes force default theme; dashboard URL and theme restore on return', async ({ page }) => {
  // Confirm we land on /dashboard, not bare "/", once "logged in".
  await expect(page).toHaveURL(/\/dashboard$/)

  await openAccountSettings(page)
  await goToAppearanceTab(page)
  await page.getByRole('button', { name: /Ocean Depth/i }).click()
  await closeAccountSettings(page)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean-depth')

  await clientSideNavigate(page, '/pricing/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'tropical')

  await clientSideNavigate(page, '/features/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'tropical')

  await clientSideNavigate(page, '/dashboard')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean-depth')
})

// Bugs row (2026-08-08): "all public marketing pages unscrollable below ~860px
// width" (Fixed, needs QA — Pricing and FAQ were verified live at the time;
// Home, Features, Founders, Founder profile, and Download were still open).
// Home and the SPA's Founder-profile route aren't reachable in OFFLINE_MODE
// (Home needs a logged-out session; /founders/:slug/ is intercepted by its
// own static marketing HTML page before the SPA loads — see vite.config.mjs's
// staticHtmlMiddleware) — this covers the two SPA-rendered pages that are
// reachable and share the exact same `.yow-home` fix: Features and Founders
// (index), plus Download.
for (const path of ['/features/', '/founders/', '/download/']) {
  test(`${path} scrolls its full content below 860px width`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 })
    await page.goto(path)
    await dismissLaunchPrompts(page)

    const { scrollHeight, clientHeight, overflowY } = await page.evaluate(() => {
      const root = document.querySelector('.yow-home') || document.querySelector('.marketing-shell') || document.body
      const style = getComputedStyle(root)
      return { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight, overflowY: style.overflowY }
    })
    expect(scrollHeight).toBeGreaterThan(clientHeight)
    expect(overflowY).toBe('auto')

    const scrolledY = await page.evaluate(() => {
      const root = document.querySelector('.yow-home') || document.querySelector('.marketing-shell') || document.body
      root.scrollTo({ top: root.scrollHeight, behavior: 'instant' })
      return root.scrollTop
    })
    expect(scrolledY).toBeGreaterThan(0)
  })
}
