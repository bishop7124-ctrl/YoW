/**
 * URL persistence tests — verify that project sections survive a hard refresh.
 *
 * Roadmap bug: "Refresh can lose the current app page or settings panel."
 * Fixed via history.pushState; this spec provides the required QA coverage.
 */
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, seedCleanStorage,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('writing mode URL persists after reload', async ({ page }) => {
  await createProject(page, { title: 'URL Write Test' })
  await page.getByRole('button', { name: 'Write' }).click()

  await expect(page).toHaveURL(/\/project\/.+\/writing/)
  const url = page.url()

  await page.reload()

  // Same URL and the writing view is still shown
  expect(page.url()).toBe(url)
  await expect(page.getByRole('button', { name: 'Write' }).first()).toBeVisible()
})

test('project overview URL persists after reload', async ({ page }) => {
  await createProject(page, { title: 'URL Overview Test' })

  await expect(page).toHaveURL(/\/project\//)
  const url = page.url()

  await page.reload()

  expect(page.url()).toBe(url)
  await expect(page.getByRole('heading', { name: 'URL Overview Test' }).first()).toBeVisible()
})

test('worldbuilding section URL persists after reload', async ({ page }) => {
  await createProject(page, { title: 'URL Section Test' })
  // Two "Open Characters" buttons exist (studio nav + overview card) — use studio nav button
  await page.getByRole('button', { name: 'Open Characters' }).first().click()

  await expect(page).toHaveURL(/\/project\/.+\/characters/)
  const url = page.url()

  await page.reload()

  expect(page.url()).toBe(url)
  // Characters section should be open after reload
  await expect(page.getByRole('heading', { name: /Characters/i }).first()).toBeVisible()
})

test('direct navigation to a project URL loads the correct project', async ({ page }) => {
  const title = `Direct Nav ${Date.now()}`
  await createProject(page, { title })

  const url = page.url() // e.g. /project/abc123

  // Navigate away then come back via direct URL
  await page.goto('/')
  await page.goto(url)

  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 8000 })
})

test('writing view can be reached via direct URL without losing content', async ({ page }) => {
  await createProject(page, { title: 'Direct Write Nav' })
  await page.getByRole('button', { name: 'Write' }).click()
  await expect(page).toHaveURL(/\/project\/.+\/writing/)

  const text = `Direct nav write ${Date.now()}`
  await page.getByText('Begin writing here…').click()
  await page.getByPlaceholder('Begin writing here…').fill(text)

  // Wait for the debounced save to actually land in storage before
  // navigating away — mirrors writeInDefaultScene's own wait. Without this,
  // page.goto('/') below can fire before the write reaches storage, which
  // isn't what this test means to verify (see the 2026-08-25 ROADMAP note on
  // whether beforeunload/pagehide flushing alone is fast enough for a real
  // user who navigates within the debounce window — a separate, still-open
  // question this test intentionally isn't exercising).
  await page.waitForFunction((expected) => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]')
    const matches = (content) => content === expected || (content || '').includes(expected.slice(0, 40))
    return scenes.some(s => matches(s.content) || matches(get(`nf_scene_content:${s.id}`)))
  }, text, { timeout: 8000 })

  const writingUrl = page.url()
  await page.goto('/')
  await page.goto(writingUrl)

  // Should be in writing view, content should have been saved
  await expect(page).toHaveURL(/\/project\/.+\/writing/)
  await expect(page.locator('.ms-preview').filter({ hasText: text.slice(0, 15) })).toBeVisible({ timeout: 10_000 })
})
