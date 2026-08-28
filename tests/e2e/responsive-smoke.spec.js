import { expect, test } from '@playwright/test'
import { dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

for (const viewport of viewports) {
  test(`core writing flow is reachable on ${viewport.name}`, async ({ page }) => {
    const projectTitle = `Responsive ${viewport.name} ${Date.now()}`
    const sentence = `Responsive ${viewport.name} sentence ${Date.now()}`

    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')
    await dismissLaunchPrompts(page)

    await page.getByRole('button', { name: 'New Project' }).first().click()
    await page.getByPlaceholder('Title *').fill(projectTitle)
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible()

    // At mobile/tablet widths the persistent top-nav "Write" tab collapses
    // into the hamburger menu, but the Overview page's own "Open manuscript"
    // hero CTA (ProjectDashboard.jsx) stays reachable and opens the same
    // editor — accept either, matching whichever this viewport shows.
    await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).click()
    const editor = page.locator('.ms-textarea').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await editor.fill(sentence)
    await expect(editor).toHaveValue(sentence)

    await page.reload()
    await expect(page).toHaveURL(/\/project\/.+\/writing/)
    await expect(page.locator('.ms-preview').filter({ hasText: sentence })).toBeVisible()
  })
}
