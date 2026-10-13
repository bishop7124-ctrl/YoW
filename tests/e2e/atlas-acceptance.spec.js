/**
 * Sprint 14 Oct: Map Builder acceptance across all four map types.
 * For each of World / Region / Local / Interior: create, turn the grid on and
 * change it, draw an object, undo/redo the grid and the drawing, export a
 * 2x PNG (2400x1600) and an SVG that carries the grid but no editor UI,
 * export/import the editable JSON, and survive a reload + whole-project ZIP
 * restore with the grid settings and every object intact.
 */
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { normalizeGrid } from '../../src/components/Map/atlasModel.js'
import {
  createProject, dismissLaunchPrompts, downloadManualProjectBackup, openImportZip, openProjectSettings,
  readStorage, seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

const TYPES = ['World', 'Region', 'Local', 'Interior']

test('all four map types: grid, undo/redo, 2x PNG, SVG, JSON round trip, reload and ZIP restore', async ({ page }) => {
  test.setTimeout(240_000)
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  const title = `Atlas Acceptance ${Date.now()}`
  await createProject(page, { title })
  await page.getByRole('button', { name: 'Open Atlas', exact: true }).first().click()
  await page.getByRole('button', { name: 'Map', exact: true }).first().click()

  const objectCount = () => page.locator('.atlas-paper [data-object-id]').count()
  const maps = async () => readStorage(page, 'nf_maps')
  const byName = async (name) => (await maps()).find(m => m.name === name)

  for (const scale of TYPES) {
    const name = `${scale} Accept`
    await page.getByRole('button', { name: '+ New map', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Map name').fill(name)
    await dialog.getByRole('button', { name: scale, exact: true }).click()
    await dialog.getByRole('button', { name: 'Create map →' }).click()
    await expect(page.getByLabel('Map name', { exact: true })).toHaveValue(name)

    // Grid: interior starts with one on; others get the plain "Show a square grid" toggle.
    const label = `1 square = ${scale} test`
    if (scale !== 'Interior') await page.getByLabel('Show a square grid').check()
    await expect.poll(async () => (await byName(name)).metadata.gridSettings.enabled).toBe(true)
    const scaleInput = page.getByLabel('Grid scale label').or(page.getByLabel('Distance per square')).first()
    await scaleInput.fill(label)
    await expect.poll(async () => (await byName(name)).metadata.gridSettings.scale).toBe(label)

    // Place a symbol (available on every scale) and undo/redo it.
    const before = await objectCount()
    const canvas = page.locator('.atlas-paper svg').first()
    const box = await canvas.boundingBox()
    await page.getByRole('button', { name: 'Symbols', exact: true }).click()
    await canvas.click({ position: { x: box.width * 0.37, y: box.height * 0.71 } })
    await expect.poll(objectCount).toBeGreaterThan(before)
    const drawn = await objectCount()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(objectCount).toBe(drawn - 1)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect.poll(objectCount).toBe(drawn)

    // Undo walks back the grid settings too (the scale label edit is its own step).
    await page.getByRole('button', { name: 'Undo', exact: true }).click() // drawing
    await page.getByRole('button', { name: 'Undo', exact: true }).click() // scale label
    await expect.poll(async () => (await byName(name)).metadata.gridSettings.scale).not.toBe(label)
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect.poll(async () => (await byName(name)).metadata.gridSettings.scale).toBe(label)
    await expect.poll(objectCount).toBe(drawn)

    // Exports: 2x PNG, SVG with grid and no editor chrome.
    await page.locator('.atlas-export summary').click()
    let dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'PNG image', exact: true }).click()
    const png = await readFile(await (await dl).path())
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(2400)
    expect(png.readUInt32BE(20)).toBe(1600)
    dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'SVG image', exact: true }).click()
    const svg = await readFile(await (await dl).path(), 'utf8')
    expect(svg).toContain('data-object-id')
    expect(svg).not.toMatch(/data-selection|data-edit-handles|data-preview|data-draft/)
    expect(svg).toMatch(/grid/i)

    await page.getByRole('button', { name: '← Atlas', exact: true }).click()
  }

  // Reload: everything persisted.
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  const original = await maps()
  expect(original).toHaveLength(4)
  for (const scale of TYPES) {
    const m = original.find(x => x.name === `${scale} Accept`)
    expect(m.metadata.gridSettings.enabled).toBe(true)
    expect(m.metadata.gridSettings.scale).toBe(`1 square = ${scale} test`)
    expect(m.mapObjects.length).toBeGreaterThan(0)
  }

  // Editable JSON round trip keeps the grid for a non-default map.
  const worldCard = page.getByRole('button', { name: /World Accept/ })
  if (!(await worldCard.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.getByRole('button', { name: '← Atlas', exact: true }).click()
  }
  await worldCard.click()
  await page.locator('.atlas-export summary').click()
  const jsonDl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Editable map JSON' }).click()
  const json = await readFile(await (await jsonDl).path(), 'utf8')
  expect(JSON.parse(json).metadata.gridSettings.scale).toBe('1 square = World test')
  await page.getByRole('button', { name: '← Atlas', exact: true }).click()
  await page.locator('.atlas > input[type=file]').setInputFiles({ name: 'rt.json', mimeType: 'application/json', buffer: Buffer.from(json) })
  await expect.poll(async () => (await maps()).length).toBe(5)
  const imported = (await maps()).at(-1)
  expect(imported.metadata.gridSettings.enabled).toBe(true)
  expect(imported.metadata.gridSettings.scale).toBe('1 square = World test')
  expect(imported.mapObjects).toHaveLength(original.find(x => x.name === 'World Accept').mapObjects.length)
  await page.getByRole('button', { name: '← Atlas', exact: true }).click()

  // Whole-project ZIP restore: all maps (4 + the import) come back under a new project.
  const expectedMaps = await maps()
  await openProjectSettings(page)
  const zip = await downloadManualProjectBackup(page)
  const zipBuf = await readFile(await zip.path())
  await page.getByLabel('Project Settings', { exact: true }).getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()
  const novelsBefore = (await readStorage(page, 'nf_novels')).length
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles({ name: 'atlas-accept.zip', mimeType: 'application/zip', buffer: zipBuf })
  await page.getByRole('button', { name: 'Create Project' }).click({ timeout: 15_000 })
  await expect.poll(async () => (await readStorage(page, 'nf_novels')).length, { timeout: 20_000 }).toBe(novelsBefore + 1)
  const originalNovelId = expectedMaps[0].novelId
  const restoredNovel = (await readStorage(page, 'nf_novels')).find(n => n.title === title && n.id !== originalNovelId)
  expect(restoredNovel).toBeTruthy()
  const after = await maps()
  const restored = after.filter(m => m.novelId === restoredNovel.id)
  expect(restored).toHaveLength(expectedMaps.length)
  for (const src of expectedMaps) {
    const copy = restored.find(m => m.name === src.name && m.mapObjects.length === src.mapObjects.length)
    expect(copy, `restored copy of ${src.name}`).toBeTruthy()
    expect(copy.mapType).toBe(src.mapType)
    // JSON import fills defaults (type, line strength) that older raw maps leave implicit: compare as the app reads them.
    expect(normalizeGrid(copy.metadata.gridSettings)).toEqual(normalizeGrid(src.metadata.gridSettings))
  }
  // The originals are untouched by the restore.
  for (const src of expectedMaps) expect(after.find(m => m.id === src.id)).toEqual(src)
})
