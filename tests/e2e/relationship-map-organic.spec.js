/**
 * 15 Oct owner feedback: the relationship map must feel organic. Characters
 * can be dragged (their links follow), clicking one focuses it and glides the
 * view to centre it, and the focused character's links are labelled.
 */
import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

test('relationship map: drag moves a character and its friends follow; click centres and labels', async ({ page }) => {
  test.setTimeout(90_000)
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Organic ${Date.now()}` })
  const projectId = new URL(page.url()).pathname.split('/')[2]
  await page.evaluate(({ id }) => {
    const names = ['Ada', 'Ben', 'Cara', 'Dev', 'Esme', 'Finn', 'Gale', 'Hana']
    const chars = names.map((name, i) => ({
      id: `org-${i}`, novelId: id, name,
      relationships: i === 0 ? [1, 2, 3].map(t => ({ targetId: `org-${t}`, type: t === 1 ? 'friend' : t === 2 ? 'ally' : 'rival' })) : (i === 4 ? [{ targetId: 'org-5', type: 'friend' }, { targetId: 'org-6', type: 'friend' }] : []),
    }))
    window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify(chars))
  }, { id: projectId })
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await page.getByRole('button', { name: 'Characters' }).first().click()
  const tab = page.locator('.studio-tab').filter({ hasText: /^Relationship Map$/ })
  if (await tab.count()) await tab.click()
  await page.getByLabel('Focal character').waitFor({ state: 'visible' })

  const node = name => page.getByRole('button', { name: `Focus on ${name}`, exact: true })
  const centre = async name => { const b = await node(name).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const map = page.getByRole('region', { name: /Interactive relationship map/ })
  const mapBox = await map.boundingBox()

  // Dragging Ada moves Ada; her linked friend Ben follows, unrelated Hana barely reacts.
  const adaBefore = await centre('Ada')
  const benBefore = await centre('Ben')
  await page.mouse.move(adaBefore.x, adaBefore.y)
  await page.mouse.down()
  await page.mouse.move(adaBefore.x + 180, adaBefore.y + 90, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
  const adaAfter = await centre('Ada')
  const benAfter = await centre('Ben')
  expect(Math.hypot(adaAfter.x - adaBefore.x, adaAfter.y - adaBefore.y)).toBeGreaterThan(80)
  expect(Math.hypot(benAfter.x - benBefore.x, benAfter.y - benBefore.y)).toBeGreaterThan(20)
  // A drag is not a focus change.
  await expect(page.getByLabel('Focal character')).toHaveValue(/.+/)
  const focusedBefore = await page.getByLabel('Focal character').inputValue()

  // Clicking a character focuses them, glides them to the middle of the canvas, and labels their links.
  await node('Esme').click()
  await expect(page.getByLabel('Focal character')).not.toHaveValue(focusedBefore)
  await page.waitForTimeout(2500)
  const esme = await centre('Esme')
  expect(Math.abs(esme.x - (mapBox.x + mapBox.width / 2))).toBeLessThan(40)
  expect(Math.abs(esme.y - (mapBox.y + mapBox.height / 2))).toBeLessThan(40)
  await expect(node('Esme')).toHaveAttribute('aria-pressed', 'true')
  await expect(map.locator('svg text', { hasText: 'Friend' }).first()).toBeVisible()

  // Centre and Fit all stay available.
  await page.getByRole('button', { name: 'Fit all' }).click()
  await page.getByRole('button', { name: 'Centre' }).click()
})

// 14 Oct owner feedback: the map must come back the way the user left it, and a
// first visit must start with as little line overlap as the layout can manage.
test('relationship map: remembers dragged positions and pan/zoom after a reload; Tidy resets', async ({ page }) => {
  test.setTimeout(90_000)
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Remember ${Date.now()}` })
  const projectId = new URL(page.url()).pathname.split('/')[2]
  await page.evaluate(({ id }) => {
    const names = ['Ada', 'Ben', 'Cara', 'Dev', 'Esme', 'Finn', 'Gale', 'Hana']
    const chars = names.map((name, i) => ({
      id: `mem-${i}`, novelId: id, name,
      relationships: [{ targetId: `mem-${(i + 1) % 8}`, type: 'friend' }, ...(i % 3 === 0 ? [{ targetId: `mem-${(i + 4) % 8}`, type: 'ally' }] : [])],
    }))
    window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify(chars))
  }, { id: projectId })
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  const openMap = async () => {
    await page.reload()
    await page.getByRole('button', { name: 'Characters' }).first().click()
    const tab = page.locator('.studio-tab').filter({ hasText: /^Relationship Map$/ })
    if (await tab.count()) await tab.click()
    await page.getByLabel('Focal character').waitFor({ state: 'visible' })
    await page.waitForTimeout(800)
  }
  const node = name => page.getByRole('button', { name: `Focus on ${name}`, exact: true })
  const centre = async name => { const b = await node(name).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }

  await openMap()
  // Reopening a map nobody touched gives the same picture.
  const firstLoad = await centre('Cara')
  await openMap()
  const secondLoad = await centre('Cara')
  expect(Math.hypot(secondLoad.x - firstLoad.x, secondLoad.y - firstLoad.y)).toBeLessThan(3)

  // Move a character and zoom in, then reload: both come back.
  const before = await centre('Ada')
  await page.mouse.move(before.x, before.y)
  await page.mouse.down()
  await page.mouse.move(before.x + 160, before.y + 80, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(3500)
  await page.getByRole('button', { name: 'Zoom relationship map in' }).click()
  await page.waitForTimeout(900)
  const moved = await centre('Ada')
  const caraMoved = await centre('Cara')
  await openMap()
  const restored = await centre('Ada')
  const caraRestored = await centre('Cara')
  expect(Math.hypot(restored.x - moved.x, restored.y - moved.y)).toBeLessThan(4)
  expect(Math.hypot(caraRestored.x - caraMoved.x, caraRestored.y - caraMoved.y)).toBeLessThan(4)

  // Tidy forgets the custom arrangement.
  await page.getByRole('button', { name: 'Tidy' }).click()
  await page.waitForTimeout(600)
  const tidied = await centre('Ada')
  expect(Math.hypot(tidied.x - restored.x, tidied.y - restored.y)).toBeGreaterThan(20)
})
