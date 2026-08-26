import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { dismissLaunchPrompts, openProjectSettings, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

test('project settings exports Word-docs ZIP and visual PDF', async ({ page }) => {
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

  await openProjectSettings(page)
  const settingsDialog = page.getByRole('dialog', { name: 'Project Settings' })

  const docxDownloadPromise = page.waitForEvent('download')
  await settingsDialog.getByRole('button', { name: /Word docs ZIP/ }).click()
  const docxDownload = await docxDownloadPromise
  expect(docxDownload.suggestedFilename()).toMatch(/\.zip$/)
  const docxPath = await docxDownload.path()
  expect(docxPath).toBeTruthy()
  expect(fs.statSync(docxPath).size).toBeGreaterThan(100)

  const pdfDownloadPromise = page.waitForEvent('download')
  await settingsDialog.getByRole('button', { name: 'Nocturne Grove' }).click()
  const pdfDownload = await pdfDownloadPromise
  expect(pdfDownload.suggestedFilename()).toMatch(/\.pdf$/)
  const pdfPath = await pdfDownload.path()
  expect(pdfPath).toBeTruthy()
  expect(fs.statSync(pdfPath).size).toBeGreaterThan(100)
})
