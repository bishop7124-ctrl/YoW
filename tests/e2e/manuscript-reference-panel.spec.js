import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// Covers the "Writing reference panel" row in docs/ROADMAP.md's Active
// section (Status: "Implemented, needs browser QA") — search/filter, the
// floating reference window's tabs, empty state, and "Open full entry"
// jumping into the native section, at desktop and at the two responsive
// smoke widths already established in tests/e2e/responsive-smoke.spec.js.
//
// Also covers the follow-up test gaps logged in docs/ROADMAP.md (2026-09-11
// pricing-page QA session note): the Details/Links tabs, drag-to-reposition,
// and Copy-name clipboard content weren't yet exercised here.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

async function addCharacter(page, name) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save Character' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

// A keyword/alias lands in ManuscriptReferencePanel.jsx's `entry.tags`, which
// is what makes buildEntries()/ReferenceModal render both the Details tab
// (any non-skipped raw field, including `keywords`, makes `fields.length` >
// 0) and the Links tab (`entry.tags?.length` > 0) — the base addCharacter()
// helper above only fills the required Name field, so neither tab appears.
async function addCharacterWithKeyword(page, name, keyword) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByPlaceholder('e.g. The Raven, Lord Blackwood...').fill(keyword)
  await page.getByPlaceholder('e.g. The Raven, Lord Blackwood...').press('Enter')
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

// At compact widths the direct top-nav "Write"/"Open manuscript" button is
// only reachable from the project overview page — from inside a room (e.g.
// after addCharacter() navigates into Characters), it's collapsed behind the
// "Open section menu" hamburger instead (see Studio.jsx's roomMenuOpen
// portal, which renders its own "Write" item). Try the direct button first
// (desktop, or already on the overview) and fall back to the hamburger.
async function openReferencePanel(page) {
  const directWrite = page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first()
  const hamburger = page.getByRole('button', { name: 'Open section menu' })
  if (await directWrite.isVisible().catch(() => false)) {
    await directWrite.click()
  } else {
    await hamburger.click()
    // The menu item's button groups "Write" and "Open the manuscript" text
    // together, so its accessible name isn't exactly "Write" — match the
    // leading word instead.
    await page.getByRole('button', { name: /^Write\b/ }).click()
  }
  await page.getByRole('button', { name: 'Reference', exact: true }).click()
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

test('Details and Links tabs render entry fields and tags, and Copy name puts the exact title on the clipboard', async ({ page }) => {
  await createProject(page, { title: 'Reference Panel Details Links Test' })
  const charName = `Kestrel Vane ${Date.now()}`
  const keyword = 'The Raven'
  await addCharacterWithKeyword(page, charName, keyword)

  await openReferencePanel(page)
  const charCard = page.locator('.ms-reference-card', { hasText: charName })
  await charCard.click()
  const referenceWindow = page.getByRole('dialog', { name: `${charName} reference` })
  await expect(referenceWindow).toBeVisible()

  // Details tab: the keyword field is rendered as a raw field (not filtered
  // by DETAIL_SKIP_KEYS), so it must show up as a row under Details.
  await referenceWindow.getByRole('button', { name: 'Details' }).click()
  await expect(referenceWindow.getByText('Keywords')).toBeVisible()
  await expect(referenceWindow.getByText(keyword)).toBeVisible()

  // Links tab: the same keyword also lands in entry.tags, rendered as a
  // "#tag" chip under a Tags section.
  await referenceWindow.getByRole('button', { name: 'Links' }).click()
  await expect(referenceWindow.getByText('Tags', { exact: true })).toBeVisible()
  await expect(referenceWindow.getByText(`#${keyword}`)).toBeVisible()

  // Copy name: assert the actual clipboard content, not just that the click
  // doesn't throw (the existing test above deliberately stops short of this).
  await referenceWindow.getByRole('button', { name: 'Copy name' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(charName)
})

test('reference window can be dragged by its header to a new position', async ({ page }) => {
  await createProject(page, { title: 'Reference Panel Drag Test' })
  const charName = `Drag Target ${Date.now()}`
  await addCharacter(page, charName)

  await openReferencePanel(page)
  await page.locator('.ms-reference-card', { hasText: charName }).click()
  const referenceWindow = page.getByRole('dialog', { name: `${charName} reference` })
  await expect(referenceWindow).toBeVisible()

  const header = referenceWindow.locator('.ms-reference-modal-header')
  const before = await referenceWindow.boundingBox()

  // Drag from the header (not a button, so startDrag's `event.target.closest
  // ('button')` bail-out doesn't fire) by a distance well past Playwright's
  // hover-detection jitter, then release.
  await header.hover()
  await page.mouse.down()
  await page.mouse.move(before.x + 160, before.y + 120, { steps: 10 })
  await page.mouse.up()

  const after = await referenceWindow.boundingBox()
  expect(after.x).not.toBeCloseTo(before.x, 0)
  expect(after.y).not.toBeCloseTo(before.y, 0)
  // The window should still be showing the same entry, just moved — dragging
  // must not close it or swap its content.
  await expect(referenceWindow).toBeVisible()
  await expect(referenceWindow.getByRole('heading', { name: charName })).toBeVisible()
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
