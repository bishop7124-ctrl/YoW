import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, enterWritingMode,
  seedCleanStorage, waitForManuscriptReady,
} from './helpers.js'

// Automated coverage for the QA_PLAN "Add automated accessibility checks"
// item: WCAG 2.0/2.1 A/AA rule violations via axe-core across the core
// screens a writer actually lives in. This is not a substitute for the
// manual keyboard-only/screen-reader pass QA_PLAN also calls for — axe
// catches missing labels/roles/contrast/focus-trap-shaped issues, not
// "does this actually make sense read aloud." It also can't reach the real
// logged-out marketing pages: this suite runs against VITE_OFFLINE_MODE,
// which boots straight into the fixed offline user's app (see
// waitForStorageHydration's comment in helpers.js and QA_PLAN.md's note on
// the offline-mode/story-atlas dev-server gap) — there is no logged-out
// state to reach from here.
//
// Scoped to 'critical'/'serious' impact only. 'moderate'/'minor' findings
// are real but numerous enough across a themed, six-project-type app that
// gating CI on all of them on day one would make this check something
// people route around rather than fix; critical/serious is the launch-
// blocker-shaped subset (missing accessible names, keyboard traps, broken
// landmark structure, insufficient contrast) worth failing a run over.
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

// Owner decision 2026-09-25: WCAG AA contrast is only a requirement for the
// dedicated "Accessible (High Contrast)" theme — the app's other themes
// (including whichever one this test suite's default/system theme resolves
// to) are brand/identity choices, not accessibility promises. The tests
// below this point run against that default theme, so they check every
// other critical/serious axe rule (labels, landmarks, keyboard traps, etc.)
// but not `color-contrast`. The dedicated Accessible-theme test further
// down uses the strict `checkNoSeriousViolations` above instead.
async function checkNoSeriousViolationsIgnoringContrast(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze()
  const violations = seriousOrWorse(results)
  expect(violations, describeViolations(violations)).toEqual([])
}

test.describe('Accessibility (axe-core, critical/serious only)', () => {
  test('pre-project dashboard state has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await checkNoSeriousViolationsIgnoringContrast(page)
  })

  test('dashboard with a project has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Dashboard Test' })
    await checkNoSeriousViolationsIgnoringContrast(page)
  })

  test('manuscript editor (write mode) has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Editor Test' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await checkNoSeriousViolationsIgnoringContrast(page)
  })

  test('Characters worldbuilding screen has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Characters Test' })
    await page.getByRole('button', { name: /Characters/i }).first().click()
    await checkNoSeriousViolationsIgnoringContrast(page)
  })

  test('New Project modal (dialog focus/labeling) has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await page.getByRole('button', { name: 'New Project' }).first().click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await checkNoSeriousViolationsIgnoringContrast(page)
  })
})

// Switches to a built-in theme via the real Account Settings -> Appearance UI
// (the same path a user takes) rather than poking localStorage directly:
// App.jsx resets a brand-new account's theme to the default on mount (the
// "new accounts don't inherit a previous browser-local theme" isolation
// fix), and AppearancePanel's own theme-tuning effect recomputes
// --accent-contrast/--accent-fade as *inline* style overrides from the
// active theme's real accent color — both would leave a directly-poked
// data-theme attribute out of sync with what a real theme switch produces,
// which is exactly the mismatch this block exists to measure honestly.
// `open-account-settings` is the same window event Layout.jsx's own upgrade
// CTA dispatches, so this isn't a test-only backdoor.
async function switchToTheme(page, themeLabel) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'appearance' } }))
  })
  // themeLabel is matched as a literal string, not a regex fragment — labels
  // like "Accessible (High Contrast)" contain regex metacharacters that would
  // otherwise silently change what this matches (parens become a capture
  // group, so the anchored pattern never matches the real literal text).
  const escapedLabel = themeLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.locator('.theme-choice-copy > span')
    .filter({ hasText: new RegExp(`^${escapedLabel}$`) })
    .locator('xpath=ancestor::button[1]')
    .click()
  await page.getByRole('button', { name: 'Close account settings' }).click()
}

// Owner decision 2026-09-25: the built-in stylistic themes (Nocturne Grove/
// dark-refined, Tropical, Pearl Minimal, Sage Grove/light-refined) are brand/
// identity choices, not accessibility promises — WCAG AA contrast is only a
// requirement for the dedicated "Accessible (High Contrast)" theme, which
// exists specifically so a user who needs it has one. This replaces the
// prior per-theme contrast-debt sweep (which asserted the same strict
// standard against every stylistic theme and consequently had a permanent
// list of known, accepted failures) with a single strict check against the
// one theme this promise actually applies to.
test.describe('Accessibility contrast requirement — Accessible (High Contrast) theme', () => {
  test('manuscript editor in the Accessible theme has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Accessible Theme Test' })
    await switchToTheme(page, 'Accessible (High Contrast)')
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    const activeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(activeTheme, 'theme switch did not apply before running axe').toBe('accessible')
    await checkNoSeriousViolations(page)
  })
})
