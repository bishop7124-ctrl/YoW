import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('portable Launch School renders embedded progress and every roadmap task', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))

  const html = await readFile(resolve(process.cwd(), 'docs/launch-school.html'), 'utf8')
  await page.setContent(html, { waitUntil: 'domcontentloaded' })

  await page.locator('[data-view="all"]').click()
  await expect(page.locator('.task-card')).toHaveCount(39)
  await expect(page.locator('.tab')).toHaveCount(6)
  await expect(page.locator('#exportProgress')).toBeVisible()
  expect(errors).toEqual([])
})
