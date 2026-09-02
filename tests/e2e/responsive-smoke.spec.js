import { expect, test } from '@playwright/test'
import { dismissLaunchPrompts, readScenesWithContent, seedCleanStorage } from './helpers.js'

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
    await page.getByText('Begin writing here…').click()
    const editor = page.locator('main textarea').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await editor.fill(sentence)
    await expect(editor).toHaveValue(sentence)
    await page.waitForFunction(
      (expected) => {
        const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
        const scenes = JSON.parse(get('nf_scenes') || '[]')
        return scenes.some(s => s.content === expected || get(`nf_scene_content:${s.id}`) === expected)
      },
      sentence,
      { timeout: 8000 },
    )

    await page.reload()
    await expect(page).toHaveURL(/\/project\/.+\/writing/)
    await expect.poll(async () => {
      const scenes = await readScenesWithContent(page)
      return scenes.some(scene => scene.content === sentence)
    }).toBe(true)
  })
}

test('rotating a tablet into portrait does not leave a panel covering the editor', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(`Rotate ${Date.now()}`)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()

  const placeholder = page.getByText('Begin writing here…')
  await expect(placeholder).toBeVisible()

  await page.setViewportSize({ width: 768, height: 1024 })
  await placeholder.click()

  const editor = page.getByPlaceholder('Begin writing here…')
  const sentence = `Rotated and still writable ${Date.now()}`
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)
})
