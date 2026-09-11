import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

async function openRoom(page, room) {
  const persistent = page.getByLabel('Studio navigation').getByRole('button', { name: `Open ${room}`, exact: true })
  if (await persistent.isVisible().catch(() => false)) {
    await persistent.click()
    return
  }
  await page.getByRole('button', { name: 'Open section menu' }).click()
  await page.locator('#studio-room-menu').getByRole('button', { name: new RegExp(`^${room}`) }).click()
}

test('tablet map editing becomes phone map viewing', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await createProject(page, { title: `Responsive atlas ${Date.now()}` })
  await openRoom(page, 'Atlas')
  await page.getByRole('navigation', { name: 'Room sections' }).getByRole('button', { name: 'Map' }).click()

  await expect(page.getByText('Map Builder is desktop-only')).toHaveCount(0)
  await page.getByRole('button', { name: '+ New map' }).click()
  await page.getByLabel('Map name').fill('The Northern Marches')
  await page.getByRole('button', { name: 'Create map →' }).click()
  await expect(page.getByLabel('Map name', { exact: true })).toHaveValue('The Northern Marches')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('region', { name: 'Map canvas; scroll to pan' })).toBeVisible()
  await expect(page.getByText('Viewing mode · Edit on a tablet or desktop.')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ New map' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.getByRole('region', { name: 'Map canvas; scroll to pan' }).locator('> div')).toHaveAttribute('style', /150%/)
})

test('long titles preserve readable desktop navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await createProject(page, { title: 'The Northern Marches: A Chronicle of the Winter Sea and Its Forgotten Kingdoms' })

  const roomWidths = await page.getByLabel('Studio navigation').locator('.studio-room').evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().width),
  )
  expect(roomWidths.length).toBeGreaterThan(4)
  expect(Math.min(...roomWidths)).toBeGreaterThan(40)
})

test('character editor contains focus and returns it after close', async ({ page }) => {
  await createProject(page, { title: `Dialog focus ${Date.now()}` })
  await openRoom(page, 'Characters')
  const trigger = page.getByRole('button', { name: 'New', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Create Character' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).focus()
  await page.keyboard.press('Tab')
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
