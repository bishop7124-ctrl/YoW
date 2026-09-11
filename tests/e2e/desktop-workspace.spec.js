import { expect, test } from '@playwright/test'
import { seedCleanStorage } from './helpers.js'

test('desktop runtime opens the project workspace instead of trapping users in settings', async ({ page }) => {
  await seedCleanStorage(page)
  await page.addInitScript(() => {
    window.__TAURI__ = {}
  })

  await page.goto('/')

  await expect(page.getByText('Library Snapshot')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Account Settings' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill('Desktop Workspace Check')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/project\//)
  await expect(page.getByText('Desktop Workspace Check').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to projects' })).toBeVisible()

  await page.getByRole('button', { name: /Dev User/ }).click()
  await page.getByRole('menuitem', { name: 'Account settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.getByRole('button', { name: 'Close account settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Back to projects' })).toBeVisible()
})
