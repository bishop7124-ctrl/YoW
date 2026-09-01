import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { dismissLaunchPrompts, openImportZip, openProjectSettings, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

test('create, write, refresh, export, and restore a project', async ({ page }) => {
  const projectTitle = `Smoke Project ${Date.now()}`
  const sentence = `Smoke test sentence ${Date.now()} survives refresh.`

  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(projectTitle)
  await page.getByPlaceholder('Description (optional)').fill('Automated launch smoke project.')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/project\//)
  await expect(page.getByText(projectTitle).first()).toBeVisible()

  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await expect(editor).toBeVisible()
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)

  // Flush before reload — the IndexedDB backend persists asynchronously, so
  // reloading immediately after typing can race it and lose the write (see
  // autosave.spec.js's identical pattern for this same scenario).
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await expect(page).toHaveURL(/\/project\/.+\/writing/)
  await expect(page.locator('.ms-preview').filter({ hasText: sentence })).toBeVisible()

  await openProjectSettings(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.zip$/)

  // Playwright temp downloads have no extension; save with .zip so the import modal accepts it
  const tmpZipPath = `/tmp/yow-smoke-${Date.now()}.zip`
  await download.saveAs(tmpZipPath)
  expect(fs.statSync(tmpZipPath).size).toBeGreaterThan(100)

  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()

  // 'Import ▾' dropdown replaced the old bare 'Restore' button
  await expect(page.getByRole('button', { name: /Import/i }).first()).toBeVisible()

  // Open Import > Import ZIP, upload the backup, then confirm on the preview screen
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles(tmpZipPath)

  // The modal moves to a preview phase showing the YOW export; click "Create Project" to confirm
  await page.getByRole('button', { name: 'Create Project' }).click({ timeout: 15_000 })

  // After import, storage should have 2 projects (original + restored copy).
  // Read through window.__yowStorageBridge — the app's real storage backend
  // is an IndexedDB-backed vault, not raw localStorage (see docs/ROADMAP.md's
  // 2026-08-24 part 2 / 2026-08-25 Bugs row).
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    const novels = JSON.parse(raw || '[]')
    return novels.length
  }), { timeout: 20_000 }).toBe(2)
})
