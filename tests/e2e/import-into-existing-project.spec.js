import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { dismissLaunchPrompts, openImportZip, openProjectSettings, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

// Covers the "Import into an existing project" destination option added to
// AIImportModal — see the "Import into an existing project and project
// merging" row in docs/ROADMAP.md's Bugs table. Real-account/live-provider
// AI import isn't reachable in this offline harness, so this exercises the
// native-YOW-export path (no AI needed), which shares the same destination
// picker and populate/rollback code as AI/archive imports.
test('Import ZIP can import into an existing project without creating a new one or losing the destination\'s own content', async ({ page }) => {
  const sourceTitle = `Import Source ${Date.now()}`
  const sourceSentence = `Source project sentence ${Date.now()}.`
  const destTitle = `Import Destination ${Date.now()}`
  const destSentence = `Destination project's own sentence ${Date.now()}.`

  await page.goto('/')
  await dismissLaunchPrompts(page)

  // Build and export the source project.
  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(sourceTitle)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/project\//)

  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  const sourceEditor = page.getByPlaceholder('Begin writing here…')
  await sourceEditor.fill(sourceSentence)
  await expect(sourceEditor).toHaveValue(sourceSentence)

  await openProjectSettings(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/ }).click()
  const download = await downloadPromise
  const tmpZipPath = `/tmp/yow-import-existing-${Date.now()}.zip`
  await download.saveAs(tmpZipPath)
  expect(fs.statSync(tmpZipPath).size).toBeGreaterThan(100)
  await page.getByLabel('Project Settings', { exact: true }).getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()

  // Build the destination project with its own distinct content.
  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(destTitle)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/project\//)
  const destProjectId = page.url().match(/\/project\/([^/]+)/)[1]

  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  const destEditor = page.getByPlaceholder('Begin writing here…')
  await destEditor.fill(destSentence)
  await expect(destEditor).toHaveValue(destSentence)
  await page.waitForFunction(
    (expected) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scenes = JSON.parse(get('nf_scenes') || '[]')
      return scenes.some(s => (s.content || get(`nf_scene_content:${s.id}`) || '').includes(expected.slice(0, 40)))
    },
    destSentence,
    { timeout: 8000 },
  )

  await openProjectSettings(page)
  await page.getByLabel('Project Settings', { exact: true }).getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible()

  const novelCountBefore = await page.evaluate(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    return JSON.parse(raw || '[]').length
  })
  expect(novelCountBefore).toBe(2)

  // Import the source's export into the existing destination project.
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles(tmpZipPath)

  await expect(page.getByLabel('Import into')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Import into').selectOption({ label: destTitle })
  await expect(page.getByRole('button', { name: 'Import Into Project' })).toBeVisible()
  await page.getByRole('button', { name: 'Import Into Project' }).click()
  await expect(page.getByText('Import complete!').first()).toBeVisible({ timeout: 15_000 })

  // No third project was created.
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    return JSON.parse(raw || '[]').length
  }), { timeout: 20_000 }).toBe(2)

  // The destination project gained the source's scene content, and its own
  // pre-existing scene content is untouched — a real merge, not a replace.
  await expect.poll(async () => page.evaluate((nid) => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]').filter(s => s.novelId === nid)
    return scenes.map(s => s.content || get(`nf_scene_content:${s.id}`) || '')
  }, destProjectId), { timeout: 15_000 }).toEqual(
    expect.arrayContaining([
      expect.stringContaining(destSentence.slice(0, 40)),
      expect.stringContaining(sourceSentence.slice(0, 40)),
    ]),
  )
})
