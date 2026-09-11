import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// Covers docs/QA_PLAN.md Priority 1's "Brand-new unconfigured AI account" deferred
// item: "on a fresh account with no saved provider key, verify Account Settings,
// bottom AI Assistant, AI Chat, AI Import, manuscript suggestions, Ideas AI
// expand, AI Tools, and Character Chat all show clean setup/upgrade guidance
// rather than attempting a request, leaking a previous key, or crashing."
//
// The offline-mode dev-user fixture (src/utils/offlineMock.js) is a founder-tier
// (paid) account, so every surface below is expected to show the *config-required*
// guidance (AiConfigRequiredNotice / AI_CONFIG_REQUIRED_TEXT, "Open AI settings")
// rather than the *upgrade-wall* guidance (AiUpgradeRequiredNotice) a genuinely
// free account would see on the AI-locked surfaces (AI Import, Ideas AI expand,
// the bottom AI bar, manuscript suggestions, AI Tools) — this spec is about the
// no-key case, not the free-plan case, which already has its own gating logic
// unit-tested (e.g. AIToolsUpgradeWall, AiUpgradeRequiredNotice usages).
//
// seedCleanStorage never seeds `nf_aiSettings`/`nf-ai-settings`, so every test
// starts from a genuinely key-less account. A page.route() guard on every real
// AI provider host (see src/utils/aiApi.js) fails the test if any surface ever
// attempts a live request instead of showing guidance — belt-and-suspenders,
// since OFFLINE_MODE already stubs streamMessage() with a canned response and
// every guarded component checks for a key *before* ever calling streamMessage.

// Only the actual completion/chat endpoints — not OpenRouter's public,
// keyless GET /models listing, which Account Settings' AI tab prefetches
// for its model dropdown regardless of whether a key is saved and carries
// no credentials, so it isn't the "attempted a request" this spec guards
// against.
const AI_PROVIDER_HOSTS = [
  'https://api.openai.com/**',
  'https://api.anthropic.com/**',
  'https://generativelanguage.googleapis.com/**',
  'https://openrouter.ai/api/v1/chat/**',
]

async function guardAgainstRealAiRequests(page) {
  const calls = []
  for (const pattern of AI_PROVIDER_HOSTS) {
    await page.route(pattern, (route) => {
      calls.push(route.request().url())
      return route.abort()
    })
  }
  return calls
}

async function assertNoLeakedKey(page) {
  const raw = await page.evaluate(() => ({
    settings: window.__yowStorageBridge?.getItem('nf_aiSettings') ?? localStorage.getItem('nf_aiSettings'),
    legacy: localStorage.getItem('nf-ai-settings'),
  }))
  expect(raw.settings).toBeFalsy()
  expect(raw.legacy).toBeFalsy()
}

// AITools.jsx keeps all 4 AI Tools sub-panels mounted at all times (even
// off-screen) once a project is open, each independently rendering its own
// copy of this same guidance text hidden via `display:none` — so a plain
// getByText() page-wide hits a strict-mode violation on every test run
// inside a project, not just the AI Tools test itself. filter({visible:true})
// narrows to whichever copy is actually on-screen for the surface under test.
function configNotice(page) {
  return page.getByText('An API key or AI configuration is required to use this AI feature.').filter({ visible: true })
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('Account Settings -> AI shows an empty, unsaved key field', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  await page.locator('.user-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Account settings' }).click()
  await page.getByRole('tab', { name: 'AI' }).or(page.getByRole('button', { name: 'AI', exact: true })).first().click()
  await expect(page.getByRole('heading', { name: 'Model & API keys' })).toBeVisible()

  const keyInput = page.locator('input[type="password"]')
  await expect(keyInput).toHaveValue('')
  await expect(page.getByText('· saved')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove key' })).toHaveCount(0)

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('bottom AI Assistant bar shows setup guidance instead of attempting a request', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  // Project overview's section id isn't one of AIAssistant's SECTION_CONFIG
  // keys, so it falls back to the 'dashboard' entry's placeholder.
  const barInput = page.getByPlaceholder('Ask about your project…')
  await barInput.fill('Tell me about my project')
  await barInput.press('Enter')

  await expect(configNotice(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open AI settings' })).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('full AI Chat panel shows setup guidance immediately, no crash', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  // The toggle button's accessible name is its visible "Chat" text; "Open AI
  // chat"/"Close AI chat" is exposed as its title (a description, not the
  // name) — getByTitle sidesteps that and is unambiguous.
  await page.getByTitle('Open AI chat').click()
  await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible()
  await expect(configNotice(page)).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('AI Import shows setup guidance without attempting analysis', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('button', { name: 'AI Import' }).click()

  await expect(configNotice(page)).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('manuscript AI suggestions tab shows setup guidance', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()
  // Both the manuscript toolbar's "AI writing assistant" button and the
  // sidebar's own tab strip button share the accessible name "AI" — target
  // the sidebar tab specifically (WritingSidebar.jsx TABS).
  await page.locator('.ms-writing-tab-btn[aria-label="AI"]').click()

  await expect(configNotice(page)).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('Ideas AI expand shows setup guidance instead of attempting a request', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  // Idea Board lives under the Planning room (STUDIO_ROOMS in Layout.jsx),
  // reached by its sub-tab, not a top-level nav button.
  await page.getByRole('button', { name: 'Planning' }).click()
  await page.getByRole('button', { name: 'Idea Board' }).click()
  await page.getByPlaceholder('Capture an idea… (Enter to add)').fill('A dragon who collects umbrellas')
  await page.getByPlaceholder('Capture an idea… (Enter to add)').press('Enter')

  await page.getByText('A dragon who collects umbrellas').click()
  // exact:true avoids matching the board's "AI expanded" filter-toggle button.
  await page.getByRole('button', { name: 'AI expand', exact: true }).click()

  await expect(configNotice(page)).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('AI Tools shows setup guidance on its default tab', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  await page.getByRole('button', { name: 'AI Tools' }).click()
  // All 4 tools (Plot Holes, Lore Conflicts, Character Interview, Style
  // Analysis) stay mounted simultaneously so analyses survive tab switches
  // (AITools.jsx), each independently rendering its own guidance notice —
  // .first() targets the default-active Plot Holes tab's.
  await expect(configNotice(page).first()).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})

test('Character Chat shows setup guidance instead of attempting a request', async ({ page }) => {
  const calls = await guardAgainstRealAiRequests(page)
  await createProject(page, { title: 'AI No-Key Test' })

  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill('Test Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // CHARACTER_TABS' tab strip is a role="group"; disambiguates from the
  // bottom bar's own "Chat" toggle button (title "Open AI chat").
  await page.getByRole('group').getByRole('button', { name: 'Chat' }).click()
  await expect(page.getByRole('heading', { name: 'Character Interview' })).toBeVisible()
  await expect(configNotice(page)).toBeVisible()

  await assertNoLeakedKey(page)
  expect(calls).toEqual([])
})
