/**
 * Extends the "Import into an existing project" coverage in
 * `import-into-existing-project.spec.js` (which only exercises Characters)
 * to the other collections `populateYowProjectIntoExisting` (AIImportModal.jsx)
 * dedupes — see the docs/QA_PLAN.md Priority 3 "Import destination — native
 * YOW export only" row. That function uses the same generic
 * `existingByName(...).get(norm(...))` pattern for every collection, but two
 * genuinely different branches exist:
 *   - id-remap collections (eras, factions, characters, locations, world
 *     history, RPG characters): a same-name match is *linked to* — no new
 *     record is created, but the existing record's id is reused for any
 *     relationship remap.
 *   - skip-only collections (lore, timeline, ideas): a same-name/title match
 *     is simply skipped — no new record, and no remap since nothing else
 *     references these by id today.
 * This file covers one of each: Locations (remap) and Lore (skip-only), plus
 * confirming unchecking "skip duplicates" creates a real second copy for a
 * non-character type.
 */
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, openImportZip, readStorage,
  seedCleanStorage, waitForStorage,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

async function addLocation(page, name) {
  await page.getByRole('button', { name: 'Atlas' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await waitForStorage(page, (n) => {
    const locs = JSON.parse((window.__yowStorageBridge?.getItem('nf_locations') ?? localStorage.getItem('nf_locations')) || '[]')
    return locs.some(l => l.name === n)
  }, name)
}

async function addLore(page, title) {
  await page.getByRole('button', { name: 'Lore' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.getByPlaceholder(/binding laws/i).first().fill(title)
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await waitForStorage(page, (t) => {
    const lore = JSON.parse((window.__yowStorageBridge?.getItem('nf_loreEntries') ?? localStorage.getItem('nf_loreEntries')) || '[]')
    return lore.some(e => e.title === t || e.name === t)
  }, title)
}

async function exportBackupZip(page) {
  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  await page.getByRole('button', { name: 'Done' }).click()
  return zipPath
}

async function importZipIntoExisting(page, zipPath, destTitle, { dedupe = true } = {}) {
  const fileInput = await openImportZip(page)
  const { readFileSync } = await import('node:fs')
  await fileInput.setInputFiles({
    name: 'merge-source.zip',
    mimeType: 'application/zip',
    buffer: readFileSync(zipPath),
  })
  await page.getByRole('radio', { name: 'Import into an existing project' }).waitFor({ timeout: 15_000 })
  await page.getByRole('radio', { name: 'Import into an existing project' }).click()
  await page.getByLabel('Destination project').selectOption({ label: destTitle })
  if (!dedupe) {
    await page.getByLabel(/skip items that already exist/i).uncheck()
  }
  await page.getByRole('button', { name: 'Import Into Project' }).click()
}

test('a same-named Location is linked to the existing record, not duplicated', async ({ page }) => {
  const sourceTitle = `Merge Source Loc ${Date.now()}`
  await createProject(page, { title: sourceTitle })
  await addLocation(page, 'Shared Location')
  await addLocation(page, 'Unique Source Location')
  const zipPath = await exportBackupZip(page)

  await page.getByRole('button', { name: 'Back to projects' }).click()
  const destTitle = `Merge Dest Loc ${Date.now()}`
  await createProject(page, { title: destTitle })
  await addLocation(page, 'Shared Location')

  const destLocsBefore = await readStorage(page, 'nf_locations')
  const destNovelId = (await readStorage(page, 'nf_novels')).find(n => n.title === destTitle).id
  const destSharedId = destLocsBefore.find(l => l.novelId === destNovelId && l.name === 'Shared Location').id

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await importZipIntoExisting(page, zipPath, destTitle)

  await waitForStorage(page, (novelId) => {
    const locs = JSON.parse((window.__yowStorageBridge?.getItem('nf_locations') ?? localStorage.getItem('nf_locations')) || '[]')
    return locs.some(l => l.novelId === novelId && l.name === 'Unique Source Location')
  }, destNovelId, 20_000)

  const destLocs = (await readStorage(page, 'nf_locations')).filter(l => l.novelId === destNovelId)
  expect(destLocs.filter(l => l.name === 'Shared Location')).toHaveLength(1)
  expect(destLocs.find(l => l.name === 'Shared Location').id).toBe(destSharedId)
  expect(destLocs.some(l => l.name === 'Unique Source Location')).toBe(true)
})

test('a same-titled Lore entry is skipped (not duplicated) when deduping is on, but duplicated when off', async ({ page }) => {
  const sourceTitle = `Merge Source Lore ${Date.now()}`
  await createProject(page, { title: sourceTitle })
  await addLore(page, 'Shared Lore')
  const zipPath = await exportBackupZip(page)

  await page.getByRole('button', { name: 'Back to projects' }).click()
  const destTitle = `Merge Dest Lore ${Date.now()}`
  await createProject(page, { title: destTitle })
  await addLore(page, 'Shared Lore')
  const destNovelId = (await readStorage(page, 'nf_novels')).find(n => n.title === destTitle).id

  // Dedupe on (default): stays at exactly one copy.
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await importZipIntoExisting(page, zipPath, destTitle)
  await page.waitForTimeout(1500)
  let destLore = (await readStorage(page, 'nf_loreEntries')).filter(e => e.novelId === destNovelId)
  expect(destLore.filter(e => e.title === 'Shared Lore')).toHaveLength(1)

  // Dedupe off: a real second copy is created.
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await importZipIntoExisting(page, zipPath, destTitle, { dedupe: false })
  await waitForStorage(page, (novelId) => {
    const lore = JSON.parse((window.__yowStorageBridge?.getItem('nf_loreEntries') ?? localStorage.getItem('nf_loreEntries')) || '[]')
    return lore.filter(e => e.novelId === novelId && e.title === 'Shared Lore').length >= 2
  }, destNovelId, 20_000)
  destLore = (await readStorage(page, 'nf_loreEntries')).filter(e => e.novelId === destNovelId)
  expect(destLore.filter(e => e.title === 'Shared Lore')).toHaveLength(2)
})
