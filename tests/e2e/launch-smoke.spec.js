import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

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

  await page.reload()
  await expect(page).toHaveURL(/\/project\/.+\/writing/)
  await expect(page.locator('.ms-preview').filter({ hasText: sentence })).toBeVisible()

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.zip$/)

  const path = await download.path()
  expect(path).toBeTruthy()
  expect(fs.statSync(path).size).toBeGreaterThan(100)

  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()

  await page.locator('input[type="file"][accept=".zip"]').setInputFiles(path)

  await expect.poll(async () => page.evaluate((expectedSentence) => {
    const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    return {
      projectCount: novels.length,
      restoredSceneCount: scenes.filter(scene => scene.content === expectedSentence).length,
    }
  }, sentence)).toEqual({ projectCount: 2, restoredSceneCount: 2 })
})
