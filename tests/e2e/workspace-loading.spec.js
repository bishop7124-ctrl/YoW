import { test, expect } from '@playwright/test'
import { seedCleanStorage, dismissLaunchPrompts, createProject } from './helpers.js'

test('deferred workspace tools load when opened and preserve navigation', async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Deferred tools', type: 'dnd_campaign' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const [room, tab, module] of [
    ['Characters', 'Family Tree', 'familytree/FamilyTree.jsx'],
    ['Characters', 'Relationship Map', 'relationships/RelationshipMap.jsx'],
    ['Planning', 'Schedule', 'schedule/ScheduleCalendar.jsx'],
    ['Lore', 'History', 'worldhistory/WorldHistory.jsx'],
    ['Atlas', 'Map', 'Map/MapBuilder.jsx'],
    ['Party', null, 'characterbuilder/CharacterBuilder.jsx'],
  ]) {
    const loaded = page.waitForResponse(response => response.url().includes(module) && response.ok())
    await page.getByLabel('Studio navigation').getByRole('button', { name: `Open ${room}`, exact: true }).click()
    if (tab) await page.locator('.studio-tab').filter({ hasText: new RegExp(`^${tab}$`) }).click()
    await loaded
    await expect(page.getByText('Loading workspace…', { exact: true })).toHaveCount(0)
    await expect(page.getByText('This section ran into an error.', { exact: true })).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
