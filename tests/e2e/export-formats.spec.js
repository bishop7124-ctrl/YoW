import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import {
  createProject, dismissLaunchPrompts, readScenesWithContent, seedCleanStorage,
  waitForStorage, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

test('project settings exports DOCX and visual PDF', async ({ page }) => {
  test.setTimeout(90_000)

  const projectTitle = `Export Smoke ${Date.now()}`
  const sentence = `Export smoke sentence ${Date.now()}`

  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(projectTitle)
  await page.getByRole('button', { name: 'Create' }).click()

  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  await page.getByPlaceholder('Begin writing here…').fill(sentence)
  await expect(page.getByPlaceholder('Begin writing here…')).toHaveValue(sentence)

  await page.getByRole('button', { name: 'Project settings' }).click()

  const docxDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Word docs ZIP/ }).click()
  const docxDownload = await docxDownloadPromise
  // "Word docs ZIP" bundles separate .docx files (story, characters, etc.) into one archive.
  expect(docxDownload.suggestedFilename()).toMatch(/\.zip$/)
  const docxPath = await docxDownload.path()
  expect(docxPath).toBeTruthy()
  expect(fs.statSync(docxPath).size).toBeGreaterThan(100)

  const pdfDownloadPromise = page.waitForEvent('download')
  await page.locator('.project-settings-theme-button').first().click()
  const pdfDownload = await pdfDownloadPromise
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/)
  const pdfPath = await pdfDownload.path()
  expect(pdfPath).toBeTruthy()
  expect(fs.statSync(pdfPath).size).toBeGreaterThan(100)
})

// Roadmap Bugs table: "2026-08-07 user report: Manuscript formatting (line
// breaks) did not survive .docx export/re-import". src/utils/docxImport.test.js
// already covers the export/import functions directly; this drives the real
// toolbar "Export"/"Import" buttons end to end so the fix is verified against
// the actual downloaded file the production UI produces, not just the
// underlying functions.
test('manuscript DOCX export preserves single line breaks and paragraph breaks through a real re-import round trip', async ({ page }) => {
  test.setTimeout(90_000)

  const sourceTitle = `Linebreak Export ${Date.now()}`
  const sceneText = [
    'First beat of dialogue.',
    'Second beat, same paragraph.',
    'Third beat, still connected.',
  ].join('\n') + '\n\n' + 'A separate paragraph after a real break.'

  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: sourceTitle })
  await writeInDefaultScene(page, sceneText)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /^Export/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
  const docxPath = await download.path()
  expect(docxPath).toBeTruthy()

  // Re-import that exact downloaded file into a fresh project via the real UI.
  await page.getByRole('button', { name: 'Back to projects' }).click()
  const destTitle = `Linebreak Import ${Date.now()}`
  await createProject(page, { title: destTitle })
  await page.getByRole('button', { name: 'Write' }).click()

  await page.getByRole('button', { name: 'Import' }).click()
  const fileInput = page.locator('input[type="file"]').first()
  await fileInput.setInputFiles({
    name: 'linebreak-export.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: fs.readFileSync(docxPath),
  })

  const importButton = page.getByRole('button', { name: /^Import \d/ })
  await importButton.waitFor({ timeout: 15_000 })
  await importButton.click()

  await waitForStorage(page, () => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]')
    return scenes.some(s => {
      const content = (typeof s.content === 'string' && s.content) || get(`nf_scene_content:${s.id}`) || ''
      return content.includes('separate paragraph after a real break')
    })
  }, undefined, 15_000)

  const scenes = await readScenesWithContent(page)
  const imported = scenes.find(s => s.content.includes('separate paragraph after a real break'))
  expect(imported).toBeTruthy()
  // Both the soft (single-\n) line breaks within the first paragraph and the
  // real (blank-line) paragraph break must survive the round trip exactly.
  expect(imported.content.trim()).toBe(sceneText)
})
