import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  createProject, dismissLaunchPrompts, openImportZip, openProjectSettings,
  readStorage, seedCleanStorage,
} from './helpers.js'

// Covers docs/QA_PLAN.md Priority 9 ("Map Builder") "Required before launch
// acceptance" item 3: "Backup/export: export and restore a full project ZIP
// with both original and new maps; verify every drawing and Location link."
//
// tests/e2e/atlas-builder.spec.js already covers a single map's own
// "Editable map JSON" export/import round trip, but nothing previously
// exercised the whole-project backup ZIP (Project Settings -> Backup zip,
// the same one tests/e2e/import-into-existing-project.spec.js and
// tests/e2e/data-safety.spec.js use for other project data) with an Atlas
// map inside it. This confirms a map's drawn objects, geometry, and a
// linked Location record all survive a real export -> import round trip,
// not just the map's own standalone JSON export.
//
// Out of scope here (see docs/QA_PLAN.md Priority 9 for what's still
// deferred): live-cloud multi-device sync, the owner's subjective
// visual-direction review, and DOCX/PDF/world-bible map-plate visual
// fidelity beyond confirming a plate/placeholder is produced.
test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

test('project ZIP export/import round trip preserves Atlas map drawings and linked Location', async ({ page }) => {
  test.setTimeout(90_000)

  const sourceTitle = `Atlas ZIP Source ${Date.now()}`

  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: sourceTitle })

  // Build a World map with a drawn object and a Location-linked pin.
  await page.getByRole('button', { name: 'Open Atlas', exact: true }).first().click()
  await page.getByRole('button', { name: 'Map', exact: true }).first().click()
  await page.getByRole('button', { name: '+ New map', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Map name').fill('ZIP Restore World')
  await dialog.getByRole('button', { name: 'World', exact: true }).click()
  await dialog.getByRole('button', { name: 'Create map →' }).click()
  await expect(page.getByLabel('Map name', { exact: true })).toHaveValue('ZIP Restore World')

  const canvas = page.locator('.atlas-paper svg').first()
  const box = await canvas.boundingBox()

  // New World maps ship with pre-placed starter artwork, so track counts as
  // deltas from that baseline rather than assuming an empty canvas.
  const objectCount = () => page.locator('.atlas-paper [data-object-id]').count()
  const startingCount = await objectCount()

  // Draw one Land shape (a simple drag, same gesture atlas-builder.spec.js
  // uses for Room) so the exported map carries at least one additional
  // geometric object, not just a pin. Land's default drawing mode is now
  // point-by-point (click each coastline point, then Finish/double-click/
  // Enter) rather than a single drag — a plain drag under that default
  // only adds one point to an in-progress, uncommitted draft, which gets
  // silently discarded the moment the tool changes (see visibleObjects in
  // AtlasBuilder.jsx appending an uncommitted draft for display only).
  // Switch to Freehand mode first so this drag actually commits a real
  // object, matching the pattern atlas-builder.spec.js's own tests already
  // use for the same reason.
  await page.getByRole('button', { name: 'Land', exact: true }).click()
  await page.getByRole('group', { name: 'Land drawing mode' }).getByRole('button', { name: 'Freehand' }).click()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.atlas-paper [data-object-id]')).toHaveCount(startingCount + 1)

  // Place a Location pin and link it to a new Location record.
  await page.getByRole('button', { name: 'Place', exact: true }).click()
  await canvas.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } })
  await page.getByLabel('Element name').fill('Restored Capital')
  await page.getByRole('button', { name: 'Create Location from this' }).click()
  await expect(page.getByRole('button', { name: 'Open location ↗' })).toBeVisible()
  await expect(page.locator('.atlas-paper [data-object-id]')).toHaveCount(startingCount + 2)

  await page.evaluate(() => window.__yowStorageBridge?.flush())

  const originalMaps = await readStorage(page, 'nf_maps')
  const originalLocations = await readStorage(page, 'nf_locations')
  const originalMap = originalMaps.find(m => m.name === 'ZIP Restore World')
  expect(originalMap).toBeTruthy()
  expect(originalMap.mapObjects).toHaveLength(startingCount + 2)
  const originalPin = originalMap.mapObjects.find(o => o.properties?.name === 'Restored Capital')
  expect(originalPin).toBeTruthy()
  const originalLocation = originalLocations.find(l => l.name === 'Restored Capital')
  expect(originalLocation).toBeTruthy()
  expect(originalPin.linkedEntity.entityId).toBe(originalLocation.id)

  // Export the whole project as a backup ZIP.
  await page.getByRole('button', { name: '← Atlas', exact: true }).click()
  await openProjectSettings(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  expect(zipPath).toBeTruthy()
  await page.getByLabel('Project Settings', { exact: true }).getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()

  const novelCountBefore = (await readStorage(page, 'nf_novels')).length

  // Restore it as a brand-new project (a real "restore my backup" flow),
  // leaving the original project untouched so both can be compared.
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles({
    name: 'atlas-zip-restore.zip',
    mimeType: 'application/zip',
    buffer: readFileSync(zipPath),
  })
  await page.getByRole('button', { name: 'Create Project' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByText('Project created successfully!')).toBeVisible({ timeout: 15_000 })

  await expect.poll(async () => (await readStorage(page, 'nf_novels')).length, { timeout: 20_000 })
    .toBe(novelCountBefore + 1)

  // The original project's own map/location data is untouched...
  const mapsAfter = await readStorage(page, 'nf_maps')
  const originalMapAfter = mapsAfter.find(m => m.id === originalMap.id)
  expect(originalMapAfter).toEqual(originalMap)

  // ...and the restored copy carries the same drawing, geometry, and a
  // correctly-remapped Location link (a new record, not a shared id, since
  // import always creates fresh entities for a new project).
  const restoredNovels = await readStorage(page, 'nf_novels')
  const restoredNovel = restoredNovels.find(n => n.title === sourceTitle && n.id !== originalMap.novelId)
  expect(restoredNovel).toBeTruthy()
  const restoredMap = mapsAfter.find(m => m.novelId === restoredNovel.id && m.name === 'ZIP Restore World')
  expect(restoredMap).toBeTruthy()
  expect(restoredMap.mapType).toBe(originalMap.mapType)
  expect(restoredMap.mapObjects).toHaveLength(originalMap.mapObjects.length)
  // Geometry/type of every object survives, id remapping aside.
  const sortByType = objs => [...objs].sort((a, b) => a.type.localeCompare(b.type))
  expect(sortByType(restoredMap.mapObjects).map(o => ({ type: o.type, x: o.x, y: o.y, properties: o.properties })))
    .toEqual(sortByType(originalMap.mapObjects).map(o => ({ type: o.type, x: o.x, y: o.y, properties: o.properties })))

  const restoredLocations = await readStorage(page, 'nf_locations')
  const restoredLocation = restoredLocations.find(l => l.novelId === restoredNovel.id && l.name === 'Restored Capital')
  expect(restoredLocation).toBeTruthy()
  expect(restoredLocation.id).not.toBe(originalLocation.id)
  const restoredPin = restoredMap.mapObjects.find(o => o.properties?.name === 'Restored Capital')
  expect(restoredPin.linkedEntity.entityId).toBe(restoredLocation.id)
})
