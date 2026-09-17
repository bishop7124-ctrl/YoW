import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, enterWritingMode,
  seedCleanStorage, waitForManuscriptReady, writeInDefaultScene,
} from './helpers.js'

// QA follow-up to the ROADMAP.md "Site-wide Quiet Slate default theme
// (2026-08-19)" Active-table row, run 2026-09-16.
//
// Finding before any browser was opened: the row's Next Action asked for a
// whole-site visual pass on the "Quiet Slate" theme plus a check that its
// gold tag color (#b8902a) is only ever a badge fill, never plain text. But
// `src/utils/theme.js`'s `BUILT_IN_THEMES` has no `quiet-slate` entry (the
// 2026-08-26 "Refine theme presets and system default" commit replaced it
// with the current dark-refined/light-refined/tropical/pearl-minimal set,
// and ROADMAP.md's own 2026-09-07 "Whole-site corrective sweep" entry
// already calls the Quiet Slate note "superseded"), and `#b8902a` does not
// appear anywhere in `src/`, `index.html` or `public/` — confirmed by
// `git grep` and, live, by opening Account Settings -> Appearance and
// reading the theme list off the actual rendered page (screenshot taken
// 2026-09-16: options are exactly "Match system", "Sage Grove",
// "Nocturne Grove", "Tropical", "Pearl Minimal"). So there is no Quiet
// Slate implementation left to visually QA or to carry a gold-badge risk.
//
// The theme-registry test below is a regression guard for that finding.
// The rest of this file does the *substantive* part of the requested pass
// — the whole-site visual/contrast sweep — against the theme system that
// actually ships today, since that need (worldbuilding screens, Account
// Settings tabs beyond Appearance, modals/toasts, and all 4 built-in
// themes at 375/768/1280px) is real regardless of the stale Quiet Slate
// framing. See ROADMAP.md's "Site-wide Quiet Slate default theme" row for
// the full corrected write-up.

const BUILT_IN_THEMES = [
  { id: 'dark-refined', label: 'Nocturne Grove' },
  { id: 'light-refined', label: 'Sage Grove' },
  { id: 'tropical', label: 'Tropical' },
  { id: 'pearl-minimal', label: 'Pearl Minimal' },
]

// Switches to a built-in theme via the real Account Settings -> Appearance
// UI (not localStorage) — same helper shape as accessibility.spec.js's
// `switchToTheme`, which this file follows rather than re-deriving its own
// pattern (per the repo's existing 2026-09-16 theme-contrast QA convention).
async function switchToTheme(page, themeLabel) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'appearance' } }))
  })
  await page.locator('.theme-choice-copy > span')
    .filter({ hasText: new RegExp(`^${themeLabel}$`) })
    .locator('xpath=ancestor::button[1]')
    .click()
  await page.getByRole('button', { name: 'Close account settings' }).click()
}

function seriousOrWorse(results) {
  return results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
}

function describeViolations(violations) {
  return violations
    .map(v => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}`)
    .join('\n')
}

async function checkNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const violations = seriousOrWorse(results)
  expect(violations, describeViolations(violations)).toEqual([])
}

// Same check, but ignoring `color-contrast` — for screens with the
// pre-existing, already-documented `--accent`-as-plain-text-color debt
// (QA_PLAN.md's "Theme contrast audit" note: "`--accent` used as small
// link/label text ... measures below the 4.5:1 AA text threshold ...
// needs a product/design decision, not a pure code fix"). This 2026-09-16
// pass found that debt is broader than previously catalogued — 20+ inline
// `color: 'var(--accent)'` call sites in `AccountSettings.jsx` alone,
// confirmed failing on dark-refined too (2.89:1), not just "some light
// themes" as originally written up — but bulk-recoloring ~20 call sites
// each against their own background is exactly the kind of broad,
// design-affecting change this repo's QA convention defers to a product
// decision rather than a QA session silently absorbing. See ROADMAP.md's
// Bugs table for the full finding. Still asserts every *other*
// critical/serious axe rule (labels, landmarks, keyboard traps, etc.).
async function checkNoSeriousViolationsExceptKnownAccentTextDebt(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  const violations = seriousOrWorse(results)
  expect(violations, describeViolations(violations)).toEqual([])
}

// Opens a top-level room (e.g. "Atlas", "Lore") through whichever nav surface
// is actually visible at the current viewport. `.studio-room-list` is
// `display: none` at/below the ~860px breakpoint (src/index.css), replaced
// by a hamburger that opens a portaled `#studio-room-menu` with the same
// room buttons — so a plain `getByRole('button', { name: label })` click
// works at desktop widths but times out at 375/768px. This mirrors what a
// real user does at each width rather than reaching into the DOM directly.
async function openRoom(page, label) {
  const directButton = page.getByRole('button', { name: label }).first()
  if (await directButton.isVisible().catch(() => false)) {
    await directButton.click()
    return
  }
  await page.getByRole('button', { name: /Open section menu/i }).click()
  await page.getByRole('button', { name: label }).first().click()
}

test.describe('Theme registry sanity (regression guard for the Quiet Slate finding above)', () => {
  test('Appearance panel exposes exactly the 4 current built-in themes, no Quiet Slate', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'Theme Registry Sanity' })

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'appearance' } }))
    })
    const labels = await page.locator('.theme-choice-copy > span').allTextContents()
    expect(labels).toEqual(['Match system', 'Sage Grove', 'Nocturne Grove', 'Tropical', 'Pearl Minimal'])
    await expect(page.getByText(/quiet slate/i)).toHaveCount(0)
  })
})

// Worldbuilding screens not already covered by accessibility.spec.js's
// default-theme block (Characters is covered there; Locations/Lore/Timeline
// are not), exercised across all 4 built-in themes via the real theme
// switcher.
test.describe('Worldbuilding screens across built-in themes (axe-core)', () => {
  for (const { id, label } of BUILT_IN_THEMES) {
    test(`Locations/Lore/Timeline in ${id} theme have no unknown critical/serious violations`, async ({ page }) => {
      await seedCleanStorage(page)
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `Theme Worldbuilding ${id}` })
      await switchToTheme(page, label)

      const activeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      expect(activeTheme, 'theme switch did not apply before running axe').toBe(id)

      // "Locations" is inside the "Atlas" room (same nav path worldbuilding.spec.js uses)
      await page.getByRole('button', { name: 'Atlas' }).first().click()
      await page.getByRole('button', { name: 'New' }).first().waitFor({ state: 'visible' })
      await checkNoSeriousViolations(page)

      await page.getByRole('button', { name: 'Lore' }).first().click()
      await page.getByRole('button', { name: 'New' }).first().waitFor({ state: 'visible' })
      await checkNoSeriousViolations(page)

      await page.getByRole('button', { name: 'Timeline' }).first().click()
      await expect(page.getByRole('heading', { name: /Timeline/i })).toBeVisible()
      await checkNoSeriousViolations(page)
    })
  }
})

// Account Settings tabs beyond Appearance (which accessibility.spec.js's
// theme loop already exercises indirectly via the theme switch itself).
test.describe('Account Settings tabs across built-in themes (axe-core)', () => {
  for (const { id, label } of BUILT_IN_THEMES) {
    test(`Profile/Preferences/Storage/AI/Membership tabs in ${id} theme have no unknown critical/serious violations`, async ({ page }) => {
      await seedCleanStorage(page)
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `Theme Settings ${id}` })
      await switchToTheme(page, label)

      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'profile' } }))
      })
      for (const tab of ['Profile', 'Preferences', 'Storage', 'AI', 'Membership']) {
        await page.getByRole('button', { name: tab, exact: true }).click()
        await checkNoSeriousViolationsExceptKnownAccentTextDebt(page)
      }
    })
  }
})

// Modal + toast check on a non-default theme, since the 2026-08-19 Quiet
// Slate pass's own bugs (unreadable dark-on-dark button text, a muddy
// gradient card) were both surfaced by live-testing a theme other than
// whatever was previously default — the same risk applies to any future
// default change, so this is deliberately run on Nocturne Grove (dark)
// rather than the light default.
test.describe('Modals and toasts on a non-default theme (axe-core)', () => {
  test('New Character modal and manuscript search/replace toast in Nocturne Grove have no unknown critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'Theme Modal Toast Test' })
    await switchToTheme(page, 'Nocturne Grove')

    // Modal: New Character
    await page.getByRole('button', { name: 'Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).first().click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await checkNoSeriousViolations(page)
    await page.keyboard.press('Escape')

    // Toast: manuscript search & replace ("Replace all" shows an undo toast)
    const sentence = `Toast QA sentence ${Date.now()}`
    await writeInDefaultScene(page, sentence)
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await page.keyboard.press('Control+f')
    await page.getByPlaceholder('Search…').fill('Toast QA sentence')
    // The replacement field only mounts once "Replace" is toggled open
    // (the toggle button's own accessible name — "Replace all" doesn't
    // exist in the DOM yet at this point, so the substring match is safe).
    await page.getByRole('button', { name: 'Replace', exact: true }).click()
    await page.getByPlaceholder('Replace with…').fill('Replaced QA sentence')
    await page.getByRole('button', { name: 'Replace all' }).click()

    const toast = page.locator('.ms-toast.is-on')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveAttribute('role', 'status')
    await checkNoSeriousViolations(page)
  })
})

// Responsive pass (this repo's usual widths) across a worldbuilding screen
// and Account Settings, on the light default and one dark alternative, to
// catch theme-token layout regressions rather than only color/contrast ones.
const RESPONSIVE_WIDTHS = [
  { name: '375px', width: 375, height: 812 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1280px', width: 1280, height: 900 },
]

test.describe('Responsive widths across themes', () => {
  for (const themeLabel of ['Sage Grove', 'Nocturne Grove']) {
    for (const viewport of RESPONSIVE_WIDTHS) {
      test(`Locations and Account Settings render at ${viewport.name} in ${themeLabel}`, async ({ page }) => {
        await seedCleanStorage(page)
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto('/')
        await dismissLaunchPrompts(page)
        await createProject(page, { title: `Responsive ${themeLabel} ${viewport.name}` })
        await switchToTheme(page, themeLabel)

        // "Locations" is inside the "Atlas" room (same nav path worldbuilding.spec.js uses)
        await openRoom(page, 'Atlas')
        await expect(page.getByRole('button', { name: 'New' }).first()).toBeVisible()
        // No horizontal page overflow at any of the standard widths.
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1)

        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'appearance' } }))
        })
        await expect(page.getByText('Themes & display')).toBeVisible()
        const settingsScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(settingsScrollWidth).toBeLessThanOrEqual(viewport.width + 1)
      })
    }
  }
})
