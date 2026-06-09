import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

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
  await page.getByRole('button', { name: /Word document/ }).click()
  const docxDownload = await docxDownloadPromise
  expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/)
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
