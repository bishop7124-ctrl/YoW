import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// Covers the deferred docs/ROADMAP.md 2026-08-05 row ("AI manuscript tools
// needed explicit context-limit choices", Status: "Fixed in code; needs
// browser QA"): the shared AiContextSelector used by Plot Hole Detector,
// Lore Conflict Checker, and Style Analysis. Exercises the UI wiring that
// doesn't require a live AI provider call — mode switching, target dropdown
// labels/options, and warning copy — using a fake saved API key so
// OFFLINE_MODE's canned response path (src/utils/offlineMock.js) actually
// runs instead of being blocked by the AI_CONFIG_REQUIRED_TEXT gate.

async function setFakeAiKey(page) {
  await page.locator('.user-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Account settings' }).click()
  await page.getByRole('tab', { name: 'AI' }).or(page.getByRole('button', { name: 'AI', exact: true })).first().click()
  await expect(page.getByRole('heading', { name: 'Model & API keys' })).toBeVisible()
  await page.locator('input[type="password"]').fill('fake-offline-test-key')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved')).toBeVisible()
  await page.getByRole('button', { name: 'Close account settings' }).click()
  await expect(page.getByRole('dialog', { name: /account settings/i })).toHaveCount(0)
}

async function openAiTool(page, toolLabel) {
  await page.getByRole('button', { name: 'AI Tools' }).click()
  await page.getByRole('button', { name: toolLabel, exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

for (const tool of [
  { tab: 'Plot Holes', heading: 'Plot Hole Detector' },
  { tab: 'Lore Conflicts', heading: 'Lore Conflict Checker' },
  { tab: 'Style Analysis', heading: 'Style Consistency' },
]) {
  test(`${tool.tab}: context mode switching shows the right target dropdown and warning copy`, async ({ page }) => {
    await createProject(page, { title: `AI Context ${tool.tab} Test` })
    await openAiTool(page, tool.tab)
    await expect(page.getByRole('heading', { name: tool.heading })).toBeVisible()

    // Note: scoping to `:visible` throughout — AITools.jsx keeps all 4 tool
    // panels mounted at once (just display:none when inactive), and Plot
    // Hole/Lore Conflict/Style Analysis each own an independent
    // AiContextSelector instance defaulting to the same Project-scan mode,
    // so an unscoped locator matches 2 extra hidden copies of the same
    // description text (strict-mode violation) and Character Interview's own
    // unrelated character-picker <select>.
    const visibleText = text => page.locator('p:visible').filter({ hasText: text })

    // Default mode is Project scan — no target dropdown, broad-scan copy.
    await expect(page.getByRole('button', { name: 'Project scan' })).toHaveCSS('color', /.*/) // sanity: rendered
    await expect(page.locator('select:visible')).toHaveCount(0)
    await expect(visibleText('Broad pass across the full structure')).toBeVisible()

    // Focused chapter — a Chapter-labelled dropdown with at least one option
    // (the default project's starter outline).
    await page.getByRole('button', { name: 'Focused chapter' }).click()
    await expect(visibleText('Close-read one chapter')).toBeVisible()
    const chapterSelect = page.locator('select:visible')
    await expect(chapterSelect).toBeVisible()
    // The target label ("Chapter"/"Act") is a text node sharing a <label>
    // with the <select> itself, so getByText(exact) never isolates it — the
    // <label>'s full text content includes the select's own option text too.
    await expect(page.locator('label:visible').filter({ hasText: 'Chapter' })).toBeVisible()
    expect(await chapterSelect.locator('option').count()).toBeGreaterThan(0)

    // Act review — an Act-labelled dropdown, still at least one option.
    await page.getByRole('button', { name: 'Act review' }).click()
    await expect(visibleText('Review one act at a middle level')).toBeVisible()
    await expect(page.locator('label:visible').filter({ hasText: 'Act' })).toBeVisible()
    expect(await page.locator('select:visible option').count()).toBeGreaterThan(0)

    // Back to Project scan — dropdown goes away again.
    await page.getByRole('button', { name: 'Project scan' }).click()
    await expect(page.locator('select:visible')).toHaveCount(0)
  })
}

test('Plot Holes: running an analysis in a non-default mode completes without error (offline canned response)', async ({ page }) => {
  await createProject(page, { title: 'AI Context Run Test' })
  await setFakeAiKey(page)
  await openAiTool(page, 'Plot Holes')

  await page.getByRole('button', { name: 'Act review' }).click()
  await page.getByRole('button', { name: 'Run Analysis' }).click()
  // OFFLINE_MODE's mockStreamMessage returns a canned, non-JSON sentence, so
  // PlotHoleDetector's parseFindings() can't find a findings object — this
  // exercises the real run path end-to-end (mode selection through to a
  // settled result) without asserting on AI content, and confirms the
  // failure mode is the graceful "couldn't parse" message, not a crash or a
  // silently-stuck spinner.
  await expect(page.getByText('Could not parse AI response. Try again.')).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: 'Analysing…' })).toHaveCount(0)
})
