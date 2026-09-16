import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// Covers the "Writing reference panel" row in docs/ROADMAP.md's Active
// section — a 2026-09-16 rebuild of the old (deleted 2026-08-17)
// ManuscriptReferencePanel as its own ManuscriptSurface panel, reachable from
// the manuscript topbar's overflow ("More") menu rather than the old
// WritingSidebar tab strip. Covers search/filter, the floating reference
// window's tabs, empty state, and "Open full entry" jumping into the native
// section, at desktop and at the two responsive smoke widths already
// established in tests/e2e/responsive-smoke.spec.js.

async function addCharacter(page, name) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save Character' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function addLocation(page, name) {
  await page.getByRole('button', { name: 'Atlas' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

// At mobile/tablet widths the persistent top-nav "Write" tab collapses into
// a hamburger menu once away from the project overview page (e.g. after
// addCharacter/addLocation navigate into a room) — the overview's own direct
// "Write"/"Open manuscript" CTA is only reachable from the overview itself.
// Try the direct button first (desktop, or already back on the overview) and
// fall back to the hamburger, matching the same handling other specs use.
async function openReferencePanel(page) {
  const directWrite = page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first()
  const hamburger = page.getByRole('button', { name: 'Open section menu' })
  if (await directWrite.isVisible().catch(() => false)) {
    await directWrite.click()
  } else {
    await hamburger.click()
    await page.getByRole('button', { name: /^Write\b/ }).click()
  }
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menu').getByRole('button', { name: 'Reference' }).click()
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('empty state shows guidance when the project has no worldbuilding content yet', async ({ page }) => {
  await createProject(page, { title: 'Reference Panel Empty Test' })
  await openReferencePanel(page)
  await expect(page.getByText('Add characters, locations, lore, ideas, or schedule entries elsewhere in the project and they will appear here.')).toBeVisible()
})

test('search, type filter, floating window tabs, and Open full entry jump into the native section', async ({ page }) => {
  await createProject(page, { title: 'Reference Panel Test' })
  const charName = `Aria Nightshade ${Date.now()}`
  const locName = `Silver Bay ${Date.now()}`
  await addCharacter(page, charName)
  await addLocation(page, locName)

  await openReferencePanel(page)

  // Both entries listed with the right type badges.
  const charCard = page.locator('.ms-reference-card', { hasText: charName })
  const locCard = page.locator('.ms-reference-card', { hasText: locName })
  await expect(charCard).toBeVisible()
  await expect(locCard).toBeVisible()
  await expect(charCard.locator('.type-character')).toBeVisible()
  await expect(locCard.locator('.type-location')).toBeVisible()

  // Search narrows to the matching entry only.
  await page.getByLabel('Search project references').fill(locName)
  await expect(locCard).toBeVisible()
  await expect(charCard).toHaveCount(0)
  await page.getByLabel('Search project references').fill('')

  // Type filter narrows to just Characters.
  await page.getByRole('button', { name: /^Characters\s/ }).click()
  await expect(charCard).toBeVisible()
  await expect(locCard).toHaveCount(0)
  await page.getByRole('button', { name: /^All\s/ }).click()
  await expect(locCard).toBeVisible()

  // Opening a card shows the floating reference window on the Overview tab.
  await charCard.click()
  const referenceWindow = page.getByRole('dialog', { name: `${charName} reference` })
  await expect(referenceWindow).toBeVisible()
  await expect(referenceWindow.getByText('No overview has been added yet.')).toBeVisible()

  // Copy name doesn't close the window (unlike Open full entry) — a smoke
  // check that the click doesn't throw. Clipboard *content* isn't asserted:
  // headless Chromium's Clipboard API needs an explicit permission grant
  // this suite doesn't currently request.
  await referenceWindow.getByRole('button', { name: 'Copy name' }).click()
  await expect(referenceWindow).toBeVisible()

  // Open full entry closes the window and jumps into the native Characters
  // section — out of the writing view entirely, per handleOpenReferenceEntry
  // in Manuscript.jsx (dispatches `switch-section`, switching viewMode away
  // from 'writing').
  await referenceWindow.getByRole('button', { name: 'Open full entry' }).click()
  await expect(referenceWindow).toHaveCount(0)
  await expect(page.getByPlaceholder('Begin writing here…')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: charName })).toBeVisible()
})

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test(`reference panel is reachable and usable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await createProject(page, { title: `Reference Panel ${viewport.name}` })
    const charName = `Responsive Character ${viewport.name} ${Date.now()}`
    await addCharacter(page, charName)

    await openReferencePanel(page)
    const charCard = page.locator('.ms-reference-card', { hasText: charName })
    await expect(charCard).toBeVisible()

    await charCard.click()
    const referenceWindow = page.getByRole('dialog', { name: `${charName} reference` })
    await expect(referenceWindow).toBeVisible()
    await referenceWindow.getByRole('button', { name: 'Open full entry' }).click()
    await expect(referenceWindow).toHaveCount(0)
    await expect(page.getByRole('heading', { name: charName })).toBeVisible()
  })
}
