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

// Regression guard for the tablet-inspector rotation gap (ROADMAP Bugs table).
// The two cases above only ever open the editor at a fixed viewport, so they'd
// miss the panel arriving over the prose as a result of a *later* resize. A real
// tablet does exactly that when rotated: at 1024px landscape the Scene Inspector
// is a harmless side column, but at 768px portrait the same panel is a 62vh
// sheet layered over the writing surface — so an inspector left open across that
// transition lands on top of the editor.
async function openManuscriptInLandscape(page, title) {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(title)
  await page.getByRole('button', { name: 'Create' }).click()

  // Sync on the project-creation navigation before hunting for the Write
  // control, so the locator below can't race the route change.
  await expect(page).toHaveURL(/\/project\//)
  // .first(): at 1024px the title appears as a heading in more than one place
  // (unlike the 390/768px cases above), which would otherwise trip strict mode.
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible()

  // .first(): at 1024px the top-nav "Write" tab and the Overview hero
  // "Open manuscript" CTA can both be present, which would trip strict mode.
  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()

  const placeholder = page.getByText('Begin writing here…')
  await expect(placeholder).toBeVisible()
  return placeholder
}

// Asserts the editor is genuinely reachable: Playwright fails a click with a
// pointer-interception error if any panel covers it, so this catches the
// obstruction directly rather than by proxy.
async function expectEditorStillWritable(page, placeholder) {
  await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  const sentence = `Rotated and still writable ${Date.now()}`
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)
}

test('rotating a tablet into portrait does not leave the inspector covering the editor', async ({ page }) => {
  const placeholder = await openManuscriptInLandscape(page, `Rotate insp ${Date.now()}`)

  // Precondition, so this test can't silently decay into a vacuous pass if the
  // inspector's mount-time default or render condition ever changes: at 1024px
  // the inspector really is open (as a harmless in-flow side column).
  const inspector = page.locator('aside[aria-label="Scene inspector"]')
  await expect(inspector).toBeVisible()

  // Rotate to portrait, crossing into the band where it becomes a 62vh sheet.
  await page.setViewportSize({ width: 768, height: 1024 })

  await expect(inspector).toBeHidden()
  await expectEditorStillWritable(page, placeholder)
})
