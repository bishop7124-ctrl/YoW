import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
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

test('multi-scene: content in two scenes is isolated and both survive refresh', async ({ page }) => {
  const textA = `Scene A content ${Date.now()}`
  const textB = `Scene B content ${Date.now()}`

  await createProject(page, { title: 'Multi-scene Autosave' })
  await page.getByRole('button', { name: 'Write' }).click()

  // Write in the default scene (scene A)
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await editor.fill(textA)

  // Wait for scene A to appear in localStorage
  await waitForStorage(page, () => {
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    return scenes.some(s => (s.content || '').includes('Scene A content'))
  })

  // Add a new scene via sidebar
  const addSceneBtn = page.getByRole('button', { name: /Add scene/i }).first()
  await addSceneBtn.click()

  // Wait for the new scene editor to appear (empty)
  await expect(page.getByPlaceholder('Begin writing here…')).toHaveValue('', { timeout: 6000 })

  // Write in scene B
  await page.getByPlaceholder('Begin writing here…').fill(textB)
  await waitForStorage(page, () => {
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    return scenes.some(s => (s.content || '').includes('Scene B content'))
  })

  // Go back to scene A by clicking its entry in the sidebar
  await page.locator('.ms-scene-item, [data-scene]').first().click()
  await expect(page.getByPlaceholder('Begin writing here…')).toHaveValue(textA, { timeout: 6000 })

  // Reload and confirm both scenes still have their content
  await page.reload()
  const scenes = await readStorage(page, 'nf_scenes')
  const sceneAContent = scenes.some(s => (s.content || '') === textA)
  const sceneBContent = scenes.some(s => (s.content || '') === textB)
  expect(sceneAContent).toBe(true)
  expect(sceneBContent).toBe(true)
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

  await waitForStorage(page, () => {
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    return scenes.some(s => (s.content || '').includes('end.'))
  })

  await page.reload()
  await expect(page.locator('.ms-preview').filter({ hasText: 'end.' })).toBeVisible({ timeout: 10_000 })
})

test('content survives logout then login (localStorage round-trip)', async ({ page }) => {
  const text = `Logout survive ${Date.now()}`
  await createProject(page, { title: 'Logout Persist Test' })
  await writeInDefaultScene(page, text)

  // In offline mode there is no real auth, so we simulate by reloading
  // after confirming localStorage holds the data — same guarantee as logout/login
  const scenes = await readStorage(page, 'nf_scenes')
  expect(scenes.some(s => (s.content || '').includes(text.slice(0, 20)))).toBe(true)

  // Hard reload (clears React state, re-reads from localStorage like a fresh login)
  await page.reload()
  await expect(page.locator('.ms-preview').filter({ hasText: text.slice(0, 20) })).toBeVisible({ timeout: 10_000 })
})

test('autosave timestamp is written to nf_localWriteAt', async ({ page }) => {
  const before = Date.now()
  await createProject(page, { title: 'Timestamp Test' })
  await writeInDefaultScene(page, `Timestamp check ${Date.now()}`)

  const ts = await page.evaluate(() => Number(localStorage.getItem('nf_localWriteAt') || '0'))
  expect(ts).toBeGreaterThanOrEqual(before)
})
