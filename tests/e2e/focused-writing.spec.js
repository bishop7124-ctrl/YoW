import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Focused Writing Test' })
  await page.getByRole('button', { name: 'Write' }).click()
})

test('focused mode is independent, keeps tools available, and Escape closes in layers', async ({ page }) => {
  await expect(page.getByRole('group', { name: 'Manuscript page zoom' })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom manuscript page in' }).click()
  await expect(page.locator('.manuscript-document')).toHaveCSS('zoom', '1.1')

  await page.getByRole('button', { name: 'Enter focused writing mode' }).click()

  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)
  // The studio nav banner's <h1> also shows the project title and stays
  // visible in focused mode (by design — "keeps tools available"), so this
  // must target the focused-mode topbar's own title specifically.
  await expect(page.locator('.ms-focus-project-title')).toHaveText('Focused Writing Test')
  await expect(page.getByRole('button', { name: 'Exit focused writing mode' })).toBeVisible()

  await expect(page.getByText('110%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom manuscript page in' }).click()
  await expect(page.locator('.manuscript-document')).toHaveCSS('zoom', '1.2')

  await page.getByRole('button', { name: 'Structure', exact: true }).click()
  await expect(page.locator('.ms-writing-sidebar.is-focused-mode.is-open')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.ms-writing-sidebar.is-focused-mode.is-open')).toHaveCount(0)
  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)

  await page.keyboard.press('Escape')
  await expect(page.locator('.manuscript-processor')).not.toHaveClass(/is-focused-writing/)
})

test('focused preference survives reload only while explicitly left enabled', async ({ page }) => {
  await page.getByRole('button', { name: 'Enter focused writing mode' }).click()
  await page.reload()
  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)

  await page.getByRole('button', { name: 'Exit focused writing mode' }).click()
  await page.reload()
  await expect(page.locator('.manuscript-processor')).not.toHaveClass(/is-focused-writing/)
})

test('long wrapped prose keeps the caret inside the calm comfort zone', async ({ page }) => {
  await page.getByRole('button', { name: 'Enter focused writing mode' }).click()
  await page.getByText('Begin writing here…').click()
  const editor = page.getByPlaceholder('Begin writing here…')
  const longParagraph = Array.from({ length: 260 }, (_, index) => `wrapped${index}`).join(' ')
  await editor.fill(longParagraph)
  await editor.press('End')

  await expect.poll(async () => page.evaluate(() => {
    const textarea = document.querySelector('.ms-textarea')
    const container = document.querySelector('.ms-scroll-container')
    if (!textarea || !container) return false
    const textareaRect = textarea.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    // `.ms-textarea` carries a decorative 36px bottom padding (the blank
    // "paper" margin below the last line) that's part of the raw box's
    // bottom edge but has nothing to do with where the caret actually
    // sits — with 260 wrapped words filling it, the caret is right at the
    // end of the content, so subtracting that padding turns this into an
    // accurate proxy for the caret's own line instead of overshooting by
    // a fixed ~9% of the container's height. Confirmed against the real
    // mirror-based caret measurement (useTextareaCaretRect.js) landing at
    // frac ≈0.65 — exactly the hook's own comfort-zone target — while the
    // unadjusted box bottom read frac ≈0.74, just outside this band.
    const paddingBottom = Number.parseFloat(getComputedStyle(textarea).paddingBottom) || 0
    const textBottom = textareaRect.bottom - paddingBottom
    return textBottom >= containerRect.top + container.clientHeight * .35
      && textBottom <= containerRect.top + container.clientHeight * .72
  })).toBe(true)
})

test('mobile focused tools open as a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 })
  await page.getByRole('button', { name: 'Enter focused writing mode' }).click()
  await page.getByRole('button', { name: 'Notes', exact: true }).click()

  const sheet = page.locator('.ms-writing-sidebar.is-focused-mode.is-open')
  await expect(sheet).toBeVisible()
  const box = await sheet.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(370)
  expect(box?.y).toBeGreaterThan(150)
})
