/**
 * QA recheck for the 2026-09-13 roadmap bug: "writing-progress footer badge
 * overflowed its card on mobile" — the "Target reached. Beautiful work."
 * pill (and its siblings) kept a max-content flex width and pushed through
 * the Overview card's right border on phone widths.
 *
 * Fixed in `src/index.css` (`.writing-progress-footer` switches to a
 * one-column grid at `max-width: 760px`, and its `small`/`span` pills get
 * `width: fit-content; max-width: 100%; white-space: normal;
 * overflow-wrap: anywhere` so they stay content-sized when short and wrap
 * instead of overflowing when long) and
 * `src/components/dashboard/ProjectDashboard.jsx` (`WritingProgressCard`,
 * `CampaignProgressCard`).
 *
 * This spec is the deferred recheck named in `docs/ROADMAP.md`'s Bugs table
 * and `docs/QA_PLAN.md` Priority 4: reached-target, remaining-words,
 * no-target, and campaign variants, at both 375px and 430px.
 */
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, seedCleanStorage, writeInDefaultScene,
} from './helpers.js'

const widths = [375, 430]

// Confirms every pill in the progress footer (a) never extends past the
// card's own right edge and (b) never clips its text internally — the two
// ways the original bug manifested (`flex: 0 0 auto` pushing the badge
// through the card border, `white-space: nowrap` refusing to wrap it).
async function assertFooterBadgesContained(page, cardSelector) {
  const card = page.locator(cardSelector)
  await expect(card).toBeVisible()
  const cardBox = await card.boundingBox()
  expect(cardBox, 'card should have a bounding box').toBeTruthy()

  const badges = card.locator('.writing-progress-footer small, .writing-progress-footer span')
  const count = await badges.count()
  expect(count).toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    const badge = badges.nth(i)
    const box = await badge.boundingBox()
    expect(box, `badge ${i} should have a bounding box`).toBeTruthy()
    // The badge's right edge must not extend past the card's right edge.
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1)
    // Text must wrap inside the pill rather than being clipped: no internal
    // horizontal overflow (scrollWidth should not exceed clientWidth).
    const internalOverflow = await badge.evaluate(el => el.scrollWidth - el.clientWidth)
    expect(internalOverflow).toBeLessThanOrEqual(1)
  }

  // No page-level horizontal scroll introduced by the footer.
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(pageOverflow).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

for (const width of widths) {
  test.describe(`writing-progress footer badges at ${width}px`, () => {
    // Default state for a freshly created Novel project: no words written
    // yet against the type's default word target, so the footer shows the
    // "N words to go." pill (not the target-reached / green treatment).
    test(`remaining-words variant is contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `Remaining Words ${width} ${Date.now()}`, type: 'novel' })

      const cardSelector = '.writing-progress-card:not(.writing-progress-card-campaign)'
      const badge = page.locator(cardSelector).locator('.writing-progress-footer small')
      await expect(badge).toHaveText(/words to go\.$/)
      await expect(badge).not.toHaveClass(/is-target-reached/)

      await assertFooterBadgesContained(page, cardSelector)
    })

    // Set a tiny word target and write past it so the footer flips to the
    // "Target reached. Beautiful work." pill (the exact text from the bug
    // report) with its green `is-target-reached` treatment. The setup
    // (typing in Insights, entering the editor, navigating back) is driven
    // at a desktop viewport where the persistent Studio nav is available —
    // at this spec's own 375/430px widths that nav collapses into a
    // hamburger menu (see responsive-smoke.spec.js) — and only *then*
    // resized down to the width under test, which exercises the same CSS
    // media queries as loading the page fresh at that width.
    test(`reached-target variant is contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `Reached Target ${width} ${Date.now()}`, type: 'novel' })

      await page.getByRole('button', { name: 'Insights', exact: true }).click()
      const goalInput = page.getByLabel('Manuscript word goal')
      await goalInput.fill('5')
      await expect(goalInput).toHaveValue('5')

      await writeInDefaultScene(page, 'The quick brown fox jumps over the lazy dog today')

      await page.getByLabel('Studio navigation').getByRole('button', { name: 'Open Overview', exact: true }).click()
      await expect(page).toHaveURL(/\/project\//)

      const cardSelector = '.writing-progress-card:not(.writing-progress-card-campaign)'
      const badge = page.locator(cardSelector).locator('.writing-progress-footer small')
      await expect(badge).toHaveText('Target reached. Beautiful work.')
      await expect(badge).toHaveClass(/is-target-reached/)

      await page.setViewportSize({ width, height: 844 })
      await assertFooterBadgesContained(page, cardSelector)
    })

    // A project type with no default word target (Comic / Graphic Novel,
    // unlike Novel/Novella/Short Story) starts with no target configured at
    // all, so the footer shows the "No word target set yet." pill (the
    // third badge shape the footer can render) without any extra setup.
    test(`no-target variant is contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `No Target ${width} ${Date.now()}`, type: 'comic' })

      const cardSelector = '.writing-progress-card:not(.writing-progress-card-campaign)'
      const badge = page.locator(cardSelector).locator('.writing-progress-footer small')
      await expect(badge).toHaveText('No word target set yet.')
      await expect(badge).not.toHaveClass(/is-target-reached/)

      await assertFooterBadgesContained(page, cardSelector)
    })

    // Campaign project types (D&D Campaign / Tabletop Campaign) render a
    // parallel CampaignProgressCard with the same `.writing-progress-footer`
    // markup/CSS but session/prep-recap framing instead of word counts —
    // and its status pill ("<noun> · Arc -> Session -> Encounter") is
    // considerably longer text than the manuscript variants, so this also
    // exercises real multi-word wrapping inside the pill.
    test(`campaign variant is contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `Campaign Badge ${width} ${Date.now()}`, type: 'dnd_campaign' })

      const cardSelector = '.writing-progress-card-campaign'
      const badge = page.locator(cardSelector).locator('.writing-progress-footer small')
      await expect(badge).toHaveText(/with prep/)

      await assertFooterBadgesContained(page, cardSelector)
    })
  })
}
