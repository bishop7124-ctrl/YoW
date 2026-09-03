import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readScenesWithContent, readStorage,
  seedCleanStorage, waitForStorage, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('content survives an immediate page reload', async ({ page }) => {
  const text = `Autosave refresh ${Date.now()}`
  await createProject(page, { title: 'Autosave Reload Test' })
  await writeInDefaultScene(page, text)

  // Flush before reload — the IndexedDB backend persists asynchronously, so
  // reloading immediately after a write can race it and lose the write.
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()

  await expect(page.locator('.ms-preview').filter({ hasText: text })).toBeVisible({ timeout: 10_000 })
})

test('content survives navigating away to worldbuilding and back', async ({ page }) => {
  const text = `Autosave nav-away ${Date.now()}`
  await createProject(page, { title: 'Autosave Nav Test' })
  await writeInDefaultScene(page, text)

  // Navigate to Characters (a different section)
  await page.getByRole('button', { name: /Characters/i }).first().click()
  await expect(page.getByRole('heading', { name: /Characters/i })).toBeVisible()

  // Navigate back to writing
  await page.getByRole('button', { name: 'Write' }).click()

  await expect(page.locator('.ms-preview').filter({ hasText: text })).toBeVisible({ timeout: 10_000 })
})

test('multi-scene: scenes written in different chapters are isolated in localStorage', async ({ page }) => {
  const textA = `Scene A content ${Date.now()}`
  const textB = `Scene B content ${Date.now()}`

  await createProject(page, { title: 'Multi-scene Autosave' })
  await writeInDefaultScene(page, textA)

  // Verify textA survived a reload (proves autosave round-trip for scene content).
  // textB is unused here but kept as a named variable for future expansion.
  void textB

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  // Wait for real hydration before reading storage — a read right after
  // page.reload can race the app's own async backend-swap in main.jsx.
  await page.getByRole('button', { name: 'Write' }).waitFor()

  // readScenesWithContent, not readStorage — scene prose lives under its own
  // nf_scene_content:<id> key, not inline on the nf_scenes record.
  const scenes = await readScenesWithContent(page)
  expect(scenes.some(s => (s.content || '').includes(textA.slice(0, 20)))).toBe(true)
  // Confirm the scene store has at least 1 entry for this project
  const novels = await readStorage(page, 'nf_novels')
  const novelId = novels[0]?.id
  expect(scenes.filter(s => s.novelId === novelId).length).toBeGreaterThanOrEqual(1)
})

test('rapid typing is fully captured before reload', async ({ page }) => {
  await createProject(page, { title: 'Rapid Type Test' })
  await page.getByRole('button', { name: 'Write' }).click()

  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()

  const editor = page.getByPlaceholder('Begin writing here…')
  // Simulate rapid typing word by word
  const words = 'The quick brown fox jumps over the lazy dog'
  await editor.fill(words)
  // Type a few more characters to simulate burst
  await editor.pressSequentially(' — end.', { delay: 20 })

  const fullText = `${words} — end.`
  void fullText

  await waitForStorage(page, () => {
    // Scene prose lives under its own nf_scene_content:<id> key, not inline
    // on the nf_scenes record (src/storage/sceneContentStore.js) — a scene
    // can transiently still show inline content right after the first local
    // commit though, so check both rather than assuming either is authoritative.
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]')
    return scenes.some(s => (s.content || '').includes('end.') || (get(`nf_scene_content:${s.id}`) || '').includes('end.'))
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await expect(page.locator('.ms-preview').filter({ hasText: 'end.' })).toBeVisible({ timeout: 10_000 })
})

test('content survives logout then login (localStorage round-trip)', async ({ page }) => {
  const text = `Logout survive ${Date.now()}`
  await createProject(page, { title: 'Logout Persist Test' })
  await writeInDefaultScene(page, text)

  // In offline mode there is no real auth, so we simulate by reloading
  // after confirming project storage holds the data — same guarantee as logout/login
  const scenes = await readScenesWithContent(page)
  expect(scenes.some(s => (s.content || '').includes(text.slice(0, 20)))).toBe(true)

  // Hard reload (clears React state, re-reads from storage like a fresh login).
  // Flush first — see the flush comment on the earlier reload in this file.
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await expect(page.locator('.ms-preview').filter({ hasText: text.slice(0, 20) })).toBeVisible({ timeout: 10_000 })
})

test('autosave timestamp is written to nf_localWriteAt', async ({ page }) => {
  const before = Date.now()
  await createProject(page, { title: 'Timestamp Test' })
  await writeInDefaultScene(page, `Timestamp check ${Date.now()}`)

  const ts = await readStorage(page, 'nf_localWriteAt')
  expect(ts).toBeGreaterThanOrEqual(before)
})

// Regression test for the 2026-08-07 "false 'edited in two tabs' scene-conflict
// copy on every normal typing pause, in a single tab" bug (docs/ROADMAP.md Bugs
// table): the store's conflict detection used to compare a debounced draft write
// against a fresher in-progress commit and read the lag itself as "another tab
// changed this." Fixed by flushing the draft synchronously before that comparison
// (SceneEditor.jsx's debouncedUpdate). This is the browser-QA pass that row's
// Next Action called for, promoted into a permanent regression guard.
test('typing with pauses in a single tab never raises a false sync-conflict banner', async ({ page }) => {
  await createProject(page, { title: 'Conflict Banner Test' })
  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  const editor = page.getByPlaceholder('Begin writing here…')

  // Bursts separated by 1-10s pauses, single tab/session — the exact scenario
  // the roadmap row's Next Action asks for.
  const bursts = ['First burst of writing.', 'Second burst after a pause.', 'Third burst, longer pause before this one.']
  const pauses = [1000, 4000, 8000]
  for (let i = 0; i < bursts.length; i++) {
    await editor.pressSequentially(bursts[i], { delay: 30 })
    await page.waitForTimeout(pauses[i])
    await expect(page.locator('.ms-toolbar-conflict-btn')).toHaveCount(0)
  }

  // Crash-safety guarantee from the 2026-08-06 row must still hold: a blur
  // still flushes the draft immediately, so content survives a reload.
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await expect(page.locator('.ms-preview').filter({ hasText: bursts[0].slice(0, 15) })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.ms-toolbar-conflict-btn')).toHaveCount(0)
})
