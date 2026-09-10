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

// --text-faint is a deliberate low-emphasis text tier used for editor-chrome
// micro-labels (rail section headers, scene numbers, the inspector empty
// state, etc), defined per theme in src/index.css. This suite's default
// (light-refined, rendered as this offline-mode suite's fixed theme) measures
// 2.7-4.1:1 against the panel backgrounds it's used on in the manuscript
// editor — below the 4.5:1 AA floor for normal text. 2026-09-10: the other
// three built-in themes were measured too (see the "contrast debt across
// built-in themes" describe block below) and share the same shortfall, plus
// two further debts specific to individual themes (see KNOWN_CONTRAST_DEBT
// below for the full, per-theme list). Recoloring --text-faint (or the
// --accent-derived text colors also implicated) is a cross-cutting design
// change — it's used well beyond the nodes this suite happens to touch — not
// a bug fixable in an e2e test pass. Tracked in docs/ROADMAP.md's Bugs table
// and Needs Product Decision table pending a design decision.
// Filtered here (per theme, by exact fgColor) so this check still fails on
// any *other* contrast regression, including a change that makes a
// *different*, not-yet-known color newly fail somewhere this suite checks.
const KNOWN_CONTRAST_DEBT_FG_COLOR = '#7d9086'

// Full per-theme known-debt map backing the "contrast debt across built-in
// themes" describe block below. Each entry is the exact axe-reported
// fgColor(s) already confirmed failing AA on the manuscript editor screen for
// that theme, live via real UI theme switching (Account Settings ->
// Appearance), not just CSS inspection. `--text-faint` fails identically in
// all four; dark-refined and pearl-minimal also use their theme's `--accent`
// color as small text (`.text-xs`) at 2.79:1 / 3.26:1; tropical's active-mode
// pill (`.ms-modes .is-on`, `--accent-text` on `--accent-fade`) measures
// 4.01:1, just under the 4.5:1 floor. See the Bugs table row this data feeds.
const KNOWN_CONTRAST_DEBT = {
  'light-refined': ['#7d9086'],
  'dark-refined': ['#5c706b', '#9c4935'],
  tropical: ['#4d8480', '#f39a7c'],
  'pearl-minimal': ['#8b939b', '#7a8a9c'],
}

function isKnownDebt(node, knownColors) {
  return (node.any || []).some(check => check.id === 'color-contrast' && knownColors.includes(check.data?.fgColor))
}

function withoutKnownDebt(violations, knownColors = [KNOWN_CONTRAST_DEBT_FG_COLOR]) {
  return violations
    .map(v => v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter(n => !isKnownDebt(n, knownColors)) } : v)
    .filter(v => v.nodes.length > 0)
}

function describeViolations(violations) {
  return violations
    .map(v => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}`)
    .join('\n')
}

async function checkNoSeriousViolations(page, knownDebtColors) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const violations = withoutKnownDebt(seriousOrWorse(results), knownDebtColors)
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

// Confirms docs/ROADMAP.md's open --text-faint Bugs-table row and its
// "the other three themes... were not measured" Next Action: this exercises
// the exact same manuscript-editor screen the default-theme test above
// covers, once per remaining built-in theme (labels/ids from
// src/utils/theme.js's BUILT_IN_THEMES), switched live through the real UI.
// KNOWN_CONTRAST_DEBT above documents what each theme was found to share
// (--text-faint) or add on top of that (an --accent-derived small-text/pill
// color) — this suite still fails on anything not in that list, so a new
// regression in any of these themes is still caught, not silently absorbed.
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
      await checkNoSeriousViolations(page, KNOWN_CONTRAST_DEBT[id])
    })
  }
})
