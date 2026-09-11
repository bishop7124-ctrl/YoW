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

test.describe('Accessibility (axe-core, critical/serious only)', () => {
  test('pre-project dashboard state has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await checkNoSeriousViolations(page)
  })

  test('dashboard with a project has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Dashboard Test' })
    await checkNoSeriousViolations(page)
  })

  test('manuscript editor (write mode) has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Editor Test' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await checkNoSeriousViolations(page)
  })

  test('Characters worldbuilding screen has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'A11y Characters Test' })
    await page.getByRole('button', { name: /Characters/i }).first().click()
    await checkNoSeriousViolations(page)
  })

  test('New Project modal (dialog focus/labeling) has no critical/serious violations', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await page.getByRole('button', { name: 'New Project' }).first().click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await checkNoSeriousViolations(page)
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
  await page.locator('.theme-choice-copy > span')
    .filter({ hasText: new RegExp(`^${themeLabel}$`) })
    .locator('xpath=ancestor::button[1]')
    .click()
  await page.getByRole('button', { name: 'Close account settings' }).click()
}

// Exercise the manuscript editor in every non-default built-in theme through
// the real Appearance UI. No known contrast violations are filtered here.
test.describe('Accessibility contrast debt across built-in themes (axe-core)', () => {
  for (const { id, label } of [
    { id: 'dark-refined', label: 'Nocturne Grove' },
    { id: 'tropical', label: 'Tropical' },
    { id: 'pearl-minimal', label: 'Pearl Minimal' },
  ]) {
    test(`manuscript editor in ${id} theme has no unknown critical/serious violations`, async ({ page }) => {
      await seedCleanStorage(page)
      await page.goto('/')
      await dismissLaunchPrompts(page)
      await createProject(page, { title: `A11y Theme Test ${id}` })
      await switchToTheme(page, label)
      await enterWritingMode(page)
      await waitForManuscriptReady(page)
      const activeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      expect(activeTheme, 'theme switch did not apply before running axe').toBe(id)
      await checkNoSeriousViolations(page)
    })
  }
})
