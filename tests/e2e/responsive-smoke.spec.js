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
    await page.getByText('Begin writing here…').click()
    const editor = page.getByPlaceholder('Begin writing here…')
    await expect(editor).toBeVisible()
    await editor.fill(sentence)
    await expect(editor).toHaveValue(sentence)

    await page.reload()
    await expect(page).toHaveURL(/\/project\/.+\/writing/)
    await expect(page.locator('.ms-preview').filter({ hasText: sentence })).toBeVisible()
  })
}

// Regression guard for the 2026-08-28 tablet-inspector bug (ROADMAP Bugs table).
// The two cases above only ever open the editor at a fixed viewport, so they'd
// miss the panel arriving over the prose as a result of a *later* resize. A real
// tablet does exactly that when rotated: at 1024px landscape the Scene Inspector
// is a harmless side column, but at 768px portrait the same panel is a 62vh
// sheet layered over the writing surface — so an inspector left open across that
// transition lands on top of the editor.
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

  // Rotate to portrait, crossing into the width band where the inspector and
  // the AI surface render as overlay sheets rather than side columns.
  await page.setViewportSize({ width: 768, height: 1024 })

  // The real assertion: the editor must still be directly clickable. Playwright
  // fails a click with a pointer-interception error if any panel covers it, so
  // this catches the obstruction without asserting on inspector internals.
  await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  const sentence = `Rotated and still writable ${Date.now()}`
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)
})
