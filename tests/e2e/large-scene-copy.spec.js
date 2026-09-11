import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, seedCleanStorage, writeInDefaultScene,
} from './helpers.js'

// Covers the deferred QA_PLAN.md Priority 2 item for the "Copy whole scene"
// action added alongside LARGE_SCENE_CHAR_THRESHOLD (see docs/ROADMAP.md's
// 2026-08-08 Bugs row, Phase 4(a)): a scene over that threshold gets a
// one-click way to copy its full text, since selecting all text by hand in
// a very large native <textarea> is itself slow/unreliable.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Copy Scene Test Project' })
})

test('copy whole scene appears for very large scenes and copies the exact full content', async ({ page }) => {
  // LARGE_SCENE_CHAR_THRESHOLD (manuscriptUtils.js) is 120,000 chars.
  const bigText = 'A'.repeat(130000)
  await writeInDefaultScene(page, bigText)

  const copyBtn = page.getByRole('button', { name: /Copy whole scene/i })
  await expect(copyBtn).toBeVisible({ timeout: 5000 })
  await copyBtn.click()
  await expect(page.getByRole('button', { name: /Copied!/i })).toBeVisible({ timeout: 3000 })

  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toBe(bigText)
})

test('copy whole scene does not appear for ordinary-sized scenes', async ({ page }) => {
  await writeInDefaultScene(page, 'A short scene.')
  await expect(page.getByRole('button', { name: /Copy whole scene/i })).toHaveCount(0)
})
