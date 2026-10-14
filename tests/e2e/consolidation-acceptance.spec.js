/**
 * Sprint 15 Oct consolidation: appearance (theme corner roundness, Save to
 * profile) survives a reload, and Focused writing (Writing mode) keeps the
 * editor free of side panels.
 */
import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, enterWritingMode, seedCleanStorage, writeInDefaultScene } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('corner roundness: set, Save to profile, value is kept when settings reopen', async ({ page }) => {
  await createProject(page, { title: `Look ${Date.now()}` })
  await page.locator('.user-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Account settings' }).click()
  await page.getByRole('tab', { name: 'Appearance' }).or(page.getByText('Appearance', { exact: true })).first().click()
  const slider = page.locator('.account-range-field').first().locator('input[type="range"]')
  await slider.evaluate(el => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, '14')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.getByRole('button', { name: 'Save to profile' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nf-radius-unit'))).toBe('14')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--radius-unit').trim())).toBe('14px')
  // Leave and return without a reload: the saved profile value is what loads back
  // (the offline test profile lives in memory, so a full reload is covered by the
  // cloud check in docs/QA_PLAN.md; production keys are pinned in profileMetadata.test.js).
  await page.getByLabel('Close account settings').click()
  await page.locator('.user-menu-trigger').click()
  await page.getByRole('menuitem', { name: 'Account settings' }).click()
  await page.getByRole('tab', { name: 'Appearance' }).or(page.getByText('Appearance', { exact: true })).first().click()
  await expect(page.locator('.account-range-field').first().locator('input[type="range"]')).toHaveValue('14')
})

test('focused writing: Writing mode shows no AI/Search panel and the Inspector can be closed to leave just the prose', async ({ page }) => {
  await createProject(page, { title: `Focus ${Date.now()}` })
  await writeInDefaultScene(page, 'Quiet words in focus.')
  await enterWritingMode(page)
  await page.getByRole('group', { name: 'Editor mode' }).getByRole('button', { name: 'Writing' }).click()
  await expect(page.locator('.ms-surface')).toHaveCount(0)
  // The Inspector is a user toggle; closing it leaves only the outline and the prose.
  await page.getByRole('button', { name: 'Close inspector' }).click()
  await expect(page.getByRole('button', { name: 'Notes', exact: true })).toHaveCount(0)
  await expect(page.getByText('Quiet words in focus.').first()).toBeVisible()
})
