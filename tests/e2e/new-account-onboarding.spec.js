import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage, seedCleanStorage,
} from './helpers.js'

// Covers the "New-account sample project and post-project AI setup" row in
// docs/ROADMAP.md's Bugs table (Status: "Implemented, needs real-signup QA")
// and docs/QA_PLAN.md Priority 1's matching deferred item. Never previously
// had real e2e coverage — every other spec explicitly suppresses this wizard
// (see seedCleanStorage's `suppressWizard` option) since it isn't what they're
// testing. These specs pass `suppressWizard: false` to exercise it directly.
//
// Acceptance criteria under test (from the roadmap row):
//   - A genuinely new account is offered "Tour with a sample" and
//     "Start my own project".
//   - Sample path: creates/opens one sample project, then shows the AI setup
//     prompt before any product tour.
//   - Own-project path: creates the project, then shows the AI setup prompt
//     before the first product tour.
//   - "Set up AI" opens Account Settings -> AI; "Maybe later" dismisses
//     without blocking app access.
//   - Deleting the sample project does not recreate it.

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page, { suppressWizard: false })
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('brand-new account is offered the sample-vs-own-project choice', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'How would you like to begin?' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Tour with a sample/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Start my own project/ })).toBeVisible()
})

test('sample path creates one sample project, then prompts AI setup before any tour; Maybe later does not block the app', async ({ page }) => {
  await page.getByRole('button', { name: /Tour with a sample/ }).click()
  await page.waitForURL(/\/project\//)

  // Exactly one project exists and it's the sample.
  const novels = await readStorage(page, 'nf_novels')
  expect(novels).toHaveLength(1)
  expect(novels[0].isSampleProject).toBe(true)

  // AI setup prompt shows next, not a product tour.
  const aiPrompt = page.getByRole('dialog', { name: 'Set up AI when you are ready' })
  await expect(aiPrompt).toBeVisible()
  await expect(page.getByRole('dialog', { name: /^Tour:/ })).toHaveCount(0)

  // Maybe later dismisses without blocking the app.
  await page.getByRole('button', { name: 'Maybe later' }).click()
  await expect(aiPrompt).toBeHidden()
  await expect(page.getByRole('button', { name: 'Write' })).toBeVisible()

  // Dismissal is remembered — reloading doesn't bring the prompt (or the
  // first-run choice wizard, since a project now exists) back.
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Set up AI when you are ready' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'How would you like to begin?' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('nf_aiSetupPrompt:offline-dev-user'))).toBe('done')
})

test('own-project path creates the project, then prompts AI setup; Set up AI opens Account Settings -> AI', async ({ page }) => {
  await page.getByRole('button', { name: /Start my own project/ }).click()

  // Step 0 — format (novel is preselected by default).
  await page.getByRole('button', { name: 'Continue →' }).click()

  // Step 1 — name it.
  await page.getByPlaceholder(/My Novel/).fill('My Own First Project')
  await page.getByRole('button', { name: 'Continue →' }).click()

  // Step 2 — ready.
  await page.getByRole('button', { name: 'Start writing →' }).click()
  await page.waitForURL(/\/project\//)

  const novels = await readStorage(page, 'nf_novels')
  expect(novels).toHaveLength(1)
  expect(novels[0].isSampleProject).toBeFalsy()
  expect(novels[0].title).toBe('My Own First Project')

  const aiPrompt = page.getByRole('dialog', { name: 'Set up AI when you are ready' })
  await expect(aiPrompt).toBeVisible()

  await page.getByRole('button', { name: 'Set up AI' }).click()
  await expect(aiPrompt).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Model & API keys' })).toBeVisible()
})

test('deleting the sample project does not recreate it', async ({ page }) => {
  await page.getByRole('button', { name: /Tour with a sample/ }).click()
  await page.waitForURL(/\/project\//)
  await page.getByRole('button', { name: 'Maybe later' }).click()

  await page.evaluate(() => { window.confirm = () => true })
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.locator('.dash-card-settings-button').first().click()
  await page.getByRole('button', { name: 'Delete project' }).click()

  await page.waitForFunction(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    return JSON.parse(raw || '[]').length === 0
  })

  await page.reload()
  // The wizard was already marked shown by the sample path, so deleting the
  // sample must not bring back the first-run choice screen or silently
  // recreate the sample — the account should just sit at an empty dashboard.
  await expect(page.getByRole('heading', { name: 'How would you like to begin?' })).toHaveCount(0)
  const novelsAfterReload = await readStorage(page, 'nf_novels')
  expect(novelsAfterReload).toHaveLength(0)
})

// Sanity check that createProject() (used throughout the rest of the suite)
// still works once the wizard is no longer suppressed by a prior project
// existing — i.e. the wizard only gates the *first* project, not every one.
test('creating a second project after the wizard does not re-show the first-run choice', async ({ page }) => {
  await page.getByRole('button', { name: /Start my own project/ }).click()
  await page.getByRole('button', { name: 'Continue →' }).click()
  await page.getByPlaceholder(/My Novel/).fill('First Project')
  await page.getByRole('button', { name: 'Continue →' }).click()
  await page.getByRole('button', { name: 'Start writing →' }).click()
  await page.waitForURL(/\/project\//)
  await page.getByRole('button', { name: 'Maybe later' }).click()

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: 'Second Project' })

  const novels = await readStorage(page, 'nf_novels')
  expect(novels.map(n => n.title).sort()).toEqual(['First Project', 'Second Project'])
})
