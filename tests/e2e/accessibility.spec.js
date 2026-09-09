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
// state, etc). It's defined per theme in src/index.css (dark-refined
// #5c706b, this suite's default #7d9086, tropical #4d8480, pearl-minimal
// #8b939b — four *different* values, not one shared constant) and, at
// least for the #7d9086 default this offline-mode suite actually renders,
// measures 2.7-4.1:1 against the panel backgrounds it's used on in the
// manuscript editor — below the 4.5:1 AA floor for normal text. The other
// three themes were not checked here and may or may not have the same
// shortfall on their own equivalent panels. Recoloring --text-faint is a
// cross-cutting design change (it's used well beyond the nodes this suite
// happens to touch), not a bug fixable in an e2e test pass — tracked in
// QA_PLAN.md's "contrast per theme" item pending a design decision.
// Filtered here (for this theme's value only) so this check still fails on
// any *other* contrast regression, including a --text-faint change that
// makes a *different* theme's value newly fail somewhere this suite checks.
const KNOWN_CONTRAST_DEBT_FG_COLOR = '#7d9086'

function isKnownTextFaintDebt(node) {
  return (node.any || []).some(check => check.id === 'color-contrast' && check.data?.fgColor === KNOWN_CONTRAST_DEBT_FG_COLOR)
}

function withoutKnownDebt(violations) {
  return violations
    .map(v => v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter(n => !isKnownTextFaintDebt(n)) } : v)
    .filter(v => v.nodes.length > 0)
}

function describeViolations(violations) {
  return violations
    .map(v => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}`)
    .join('\n')
}

async function checkNoSeriousViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const violations = withoutKnownDebt(seriousOrWorse(results))
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
