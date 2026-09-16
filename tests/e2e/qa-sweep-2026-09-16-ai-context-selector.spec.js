// QA sweep 2026-09-16 (qa-engineer session): real-browser verification of the
// Bugs table row "2026-08-05: AI manuscript tools needed explicit context-limit
// choices" — status "Fixed in code; needs browser QA". No prior e2e coverage
// existed for this feature at all (grep for AiContextSelector/project_scan/
// focused_chapter/act_review across tests/e2e/ before this file returned
// nothing); only unit tests for the underlying aiToolPrompts.js helpers
// existed (src/utils/aiToolPrompts.test.js).
//
// This drives the actual AiContextSelector control (shared by Plot Hole
// Detector, Lore Conflict Checker, and Style Analysis) against a real
// Chromium session: mode switching (Project scan / Focused chapter / Act
// review), target dropdown correctness on both a single-act/chapter project
// and a multi-act/multi-chapter one, the ManuscriptCoverageNotice warning
// copy actually changing with mode/content, and one real "Run Analysis"
// click per tool to confirm the full pipeline (context selection -> prompt
// build -> streamMessage -> UI) doesn't crash.
//
// AITools.jsx keeps all 4 tool sub-panels mounted at all times, each with its
// own independent AiContextSelector instance, and only toggles which one is
// visible via `display:none` on the inactive ones (same fact
// unconfigured-ai-account.spec.js's own `configNotice()` helper documents and
// works around) — so every locator below is scoped with `.filter({ visible:
// true })` rather than assuming only one tool's controls exist in the DOM.
//
// VITE_OFFLINE_MODE's mockStreamMessage() (src/utils/offlineMock.js) answers
// every AI call with a canned plain-text response, never a real request —
// see unconfigured-ai-account.spec.js's identical reasoning. That canned
// response has no JSON braces, so PlotHoleDetector/LoreConflictChecker/
// StyleConsistency's parseFindings()/parseResult() cannot parse it into
// findings; that is an existing, pre-existing offline-mode limitation
// unrelated to this row's fix, not something this spec is trying to hide —
// asserted on explicitly below rather than assumed.
import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, OFFLINE_USER_ID, seedCleanStorage } from './helpers.js'

async function seedFakeAiConfig(page) {
  await page.addInitScript((userId) => {
    localStorage.setItem('nf_aiSettings', JSON.stringify({
      activeProvider: 'openrouter',
      openrouter: { apiKey: 'sk-or-fake-test-key-not-real', model: 'google/gemma-3-27b-it' },
    }))
    localStorage.setItem('nf_aiSettingsOwner', userId)
  }, OFFLINE_USER_ID)
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await seedFakeAiConfig(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

function visibleModeButton(page, label) {
  return page.getByRole('button', { name: label }).filter({ visible: true })
}

function visibleSelects(page) {
  return page.locator('select').filter({ visible: true })
}

function visibleTargetLabel(page, text) {
  return page.locator('label', { hasText: text }).filter({ visible: true }).filter({ has: page.locator('select') })
}

test('small single-act/chapter project: mode switching, target dropdown, and a real run — Plot Hole Detector', async ({ page }) => {
  test.setTimeout(60_000)
  await createProject(page, { title: `AI Context Small ${Date.now()}` })

  await page.getByRole('button', { name: 'AI Tools' }).click()
  await expect(page.getByRole('heading', { name: 'Plot Hole Detector' })).toBeVisible()

  // Default mode is Project scan; no target dropdown while it's active.
  await expect(visibleModeButton(page, 'Project scan')).toHaveAttribute('style', /accent/)
  await expect(visibleSelects(page)).toHaveCount(0)

  // Switch to Focused chapter: a target dropdown appears labelled "Chapter"
  // (not "Act"/"Issue"/"Volume" — this is a Novel-type project) and its only
  // option is the project's real default chapter title.
  await visibleModeButton(page, 'Focused chapter').click()
  const chapterSelect = visibleTargetLabel(page, 'Chapter').locator('select')
  await expect(chapterSelect).toBeVisible()
  await expect(chapterSelect.locator('option')).toHaveCount(1)
  await expect(chapterSelect.locator('option').first()).toHaveText(/Chapter 1/)

  // Switch to Act review: dropdown label becomes "Act", one option, matching
  // the project's real default act title.
  await visibleModeButton(page, 'Act review').click()
  const actSelect = visibleTargetLabel(page, 'Act').locator('select')
  await expect(actSelect).toBeVisible()
  await expect(actSelect.locator('option')).toHaveCount(1)
  await expect(actSelect.locator('option').first()).toHaveText(/Act 1/)

  // Back to Project scan: dropdown disappears again.
  await visibleModeButton(page, 'Project scan').click()
  await expect(visibleSelects(page)).toHaveCount(0)

  // A small, freshly-created project (one short placeholder-free scene) is
  // well under every mode's limits (project_scan: 80 units/320 chars) — no
  // coverage warning should render at all.
  await expect(page.getByText(/Manuscript is large|AI context is limited/).filter({ visible: true })).toHaveCount(0)

  // Run Analysis: confirm the full pipeline runs without crashing. Offline
  // mode's canned response isn't JSON, so this is expected to end in the
  // app's own graceful parse-error branch, not a findings list — assert
  // that explicitly rather than a generic "didn't throw."
  await page.getByRole('button', { name: 'Run Analysis' }).click()
  await expect(page.getByText('Analysing your manuscript')).toBeVisible()
  await expect(page.getByText('Could not parse AI response. Try again.')).toBeVisible({ timeout: 15_000 })
})

test('multi-act/multi-chapter project: target dropdowns list every real act/chapter in order — Lore Conflict Checker and Style Analysis', async ({ page }) => {
  test.setTimeout(60_000)
  await createProject(page, { title: `AI Context Multi ${Date.now()}` })

  // Build a real 3-act, 2-chapters-per-act structure via the manuscript
  // rail's own "+ Act"/"+ Chapter" controls (not seeded storage), so the
  // dropdown is verified against genuinely-created, genuinely-titled
  // records exactly as a user would create them.
  await page.getByRole('button', { name: /^(Write|Sessions|Pages)$/ }).click()
  await page.locator('.manuscript-processor').waitFor({ state: 'visible', timeout: 10_000 })

  // Project starts with Act 1 / Chapter 1 already created. Add Chapter 2 to
  // Act 1, then Act 2 (+ its Chapter 1/2), then Act 3 (+ its Chapter 1/2).
  const addChapter = () => page.locator('.ms-rail-f-btn', { hasText: '+ Chapter' }).click()
  const addAct = () => page.locator('.ms-rail-f-btn', { hasText: '+ Act' }).click()

  await addChapter() // Act 1 / Chapter 2
  await addAct()     // Act 2 (becomes current act)
  await addChapter() // Act 2 / Chapter 1
  await addChapter() // Act 2 / Chapter 2
  await addAct()     // Act 3
  await addChapter() // Act 3 / Chapter 1
  await addChapter() // Act 3 / Chapter 2

  await page.getByRole('button', { name: 'AI Tools' }).click()
  await page.getByRole('button', { name: 'Lore Conflicts' }).click()
  await expect(page.getByRole('heading', { name: 'Lore Conflict Checker' })).toBeVisible()

  await visibleModeButton(page, 'Focused chapter').click()
  const chapterSelect = visibleTargetLabel(page, 'Chapter').locator('select')
  const chapterLabels = await chapterSelect.locator('option').allTextContents()
  expect(chapterLabels).toHaveLength(6)
  // Ordered act-then-chapter, matching getAiContextTargets' own act-major
  // flatMap — and numbered continuously across the whole manuscript (1-6),
  // matching the Outline panel's own chapterNumbers convention
  // (StoryOutline.jsx), not restarting at 1 within each act.
  expect(chapterLabels).toEqual([
    'Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5', 'Chapter 6',
  ])

  await visibleModeButton(page, 'Act review').click()
  const actSelect = visibleTargetLabel(page, 'Act').locator('select')
  const actLabels = await actSelect.locator('option').allTextContents()
  expect(actLabels).toEqual(['Act 1', 'Act 2', 'Act 3'])

  // Switch tool to Style Analysis: it owns an independent contextSelection
  // (each tool keeps its own useState), so it must default back to Project
  // scan rather than leaking Lore Conflict's Act review choice. Lore
  // Conflict's own select stays mounted (just hidden), so this confirms no
  // *visible* select — not that none exists anywhere in the DOM.
  await page.getByRole('button', { name: 'Style Analysis' }).click()
  // The nav button is labelled "Style Analysis"; the panel's own heading is
  // "Style Consistency" (StyleConsistency.jsx) — different text, same tool.
  await expect(page.getByRole('heading', { name: 'Style Consistency' })).toBeVisible()
  await expect(visibleModeButton(page, 'Project scan')).toHaveAttribute('style', /accent/)
  await expect(visibleSelects(page)).toHaveCount(0)

  // A real run on this tool too, in Act review mode, targeting Act 2.
  await visibleModeButton(page, 'Act review').click()
  await visibleTargetLabel(page, 'Act').locator('select').selectOption({ label: 'Act 2' })
  await page.getByRole('button', { name: 'Analyse Style' }).click()
  await expect(page.getByText('Could not parse AI response. Try again.')).toBeVisible({ timeout: 15_000 })
})

test('coverage warning copy tracks the active mode\'s content limit', async ({ page }) => {
  test.setTimeout(60_000)
  await createProject(page, { title: `AI Context Coverage ${Date.now()}` })

  // Write a scene body longer than Project scan's 320-char excerpt cap but
  // shorter than Focused chapter's 4000-char cap, so switching modes should
  // make the "AI context is limited" content-truncation warning appear and
  // then disappear — a direct, real-browser check of "warning copy matches
  // included/skipped text" tracking the selected mode, not just existing.
  const longText = 'The lantern flickered. '.repeat(20) // ~460 characters, > 320, < 4000
  expect(longText.length).toBeGreaterThan(320)
  expect(longText.length).toBeLessThan(4000)

  await page.getByRole('button', { name: /^(Write|Sessions|Pages)$/ }).click()
  await page.locator('.manuscript-processor').waitFor({ state: 'visible', timeout: 10_000 })
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await editor.fill(longText)
  await editor.press('End')

  await page.getByRole('button', { name: 'AI Tools' }).click()
  await expect(page.getByRole('heading', { name: 'Plot Hole Detector' })).toBeVisible()

  // Project scan (320-char cap): one scene, none omitted, but content is
  // truncated -> "AI context is limited" lead text, not "Manuscript is large".
  await expect(page.getByText(/^AI context is limited:/).filter({ visible: true })).toBeVisible()
  await expect(page.getByText(/^Manuscript is large:/).filter({ visible: true })).toHaveCount(0)
  await expect(page.getByText(/some scene text has been shortened to about 320 characters each/).filter({ visible: true })).toBeVisible()

  // Focused chapter (4000-char cap): the same scene now fits uncut -> no
  // coverage warning at all.
  await visibleModeButton(page, 'Focused chapter').click()
  await expect(page.getByText(/AI context is limited|Manuscript is large/).filter({ visible: true })).toHaveCount(0)
})
