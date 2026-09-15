/**
 * Extends "Import into an existing project" (import-into-existing-project.spec.js,
 * import-into-existing-project-other-types.spec.js) to the compatible
 * structured ZIP (non-YOW) import path — docs/QA_PLAN.md Priority 3's
 * "Import destination and project merge — remaining/deferred scope" row.
 *
 * The structured-ZIP and AI-parsed import paths both go through the same
 * populateProject/populateProjectIntoExisting functions in AIImportModal.jsx
 * (unit-tested directly in AIImportModal.test.js for dedupe-by-name,
 * create-separate-when-off, rollback-on-failure, and comic-page routing).
 * This file drives that same logic through a real browser import of a
 * structured ZIP, exactly as the native-YOW-export specs do for
 * populateYowProjectIntoExisting.
 *
 * The AI-parsed import path shares this same underlying logic but cannot be
 * driven to its preview screen in this e2e harness: Playwright always runs
 * against VITE_OFFLINE_MODE=true (playwright.config.mjs), which stubs every
 * AI provider call with a fixed, non-JSON canned response
 * (src/utils/offlineMock.js) — so a real "Analyze with AI" pass can never
 * produce parseable structured data to reach the preview/destination-picker
 * screen here. See the docs/QA_PLAN.md row for this deferral.
 */
import { expect, test } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import {
  createProject, dismissLaunchPrompts, openImportZip, readStorage,
  seedCleanStorage, waitForStorage,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

// Builds a minimal "compatible structured ZIP" (non-YOW) archive matching the
// folder shape tryReadStructuredZip (AIImportModal.jsx) recognizes:
// <type>/<folder>/metadata.json (+ optional entry.md), for type in
// characters/locations/lore/items/other/snippets/notes.
function buildStructuredZip({ characters = [], locations = [] } = {}) {
  const files = {}
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const addEntry = (type, name, body) => {
    files[`${type}/${slug(name)}/metadata.json`] = strToU8(JSON.stringify({ attributes: { name } }))
    files[`${type}/${slug(name)}/entry.md`] = strToU8(body)
  }
  characters.forEach(c => addEntry('characters', c, `${c}'s biography goes here.`))
  locations.forEach(l => addEntry('locations', l, `${l} is a notable place.`))
  return Buffer.from(zipSync(files))
}

async function addCharacter(page, name) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, (n) => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.name === n)
  }, name)
}

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

async function importStructuredZipIntoExisting(page, buffer, destTitle, { dedupe = true } = {}) {
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles({ name: 'structured-source.zip', mimeType: 'application/zip', buffer })
  await page.getByRole('radio', { name: 'Import into an existing project' }).waitFor({ timeout: 15_000 })
  await page.getByRole('radio', { name: 'Import into an existing project' }).click()
  await page.getByLabel('Destination project').selectOption({ label: destTitle })
  if (!dedupe) await page.getByLabel(/skip items that already exist/i).uncheck()
  await page.getByRole('button', { name: 'Import Into Project' }).click()
}

test('importing a compatible structured ZIP into an existing project links a same-name character/location instead of duplicating', async ({ page }) => {
  const destTitle = `Structured Merge Dest ${Date.now()}`
  await createProject(page, { title: destTitle })
  await addCharacter(page, 'Shared Character')
  await addLocation(page, 'Shared Location')

  const destNovelId = (await readStorage(page, 'nf_novels')).find(n => n.title === destTitle).id
  const destCharsBefore = await readStorage(page, 'nf_characters')
  const destLocsBefore = await readStorage(page, 'nf_locations')
  const destSharedCharId = destCharsBefore.find(c => c.novelId === destNovelId && c.name === 'Shared Character').id
  const destSharedLocId = destLocsBefore.find(l => l.novelId === destNovelId && l.name === 'Shared Location').id

  const zipBuffer = buildStructuredZip({
    characters: ['Shared Character', 'Unique Source Character'],
    locations: ['Shared Location', 'Unique Source Location'],
  })

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await importStructuredZipIntoExisting(page, zipBuffer, destTitle)

  await waitForStorage(page, (novelId) => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.novelId === novelId && c.name === 'Unique Source Character')
  }, destNovelId, 20_000)

  const destChars = (await readStorage(page, 'nf_characters')).filter(c => c.novelId === destNovelId)
  const destLocs = (await readStorage(page, 'nf_locations')).filter(l => l.novelId === destNovelId)

  // Shared items were linked to (not duplicated from) the pre-existing records.
  expect(destChars.filter(c => c.name === 'Shared Character')).toHaveLength(1)
  expect(destChars.find(c => c.name === 'Shared Character').id).toBe(destSharedCharId)
  expect(destLocs.filter(l => l.name === 'Shared Location')).toHaveLength(1)
  expect(destLocs.find(l => l.name === 'Shared Location').id).toBe(destSharedLocId)
  // Unique items from the archive were added.
  expect(destChars.some(c => c.name === 'Unique Source Character')).toBe(true)
  expect(destLocs.some(l => l.name === 'Unique Source Location')).toBe(true)
  expect(destChars).toHaveLength(2)
  expect(destLocs).toHaveLength(2)
})

test('unchecking "skip duplicates" creates a real second copy from a structured ZIP import', async ({ page }) => {
  const destTitle = `Structured Merge Dupes ${Date.now()}`
  await createProject(page, { title: destTitle })
  await addCharacter(page, 'Shared Character')
  const destNovelId = (await readStorage(page, 'nf_novels')).find(n => n.title === destTitle).id

  const zipBuffer = buildStructuredZip({ characters: ['Shared Character'] })

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await importStructuredZipIntoExisting(page, zipBuffer, destTitle, { dedupe: false })

  await waitForStorage(page, (novelId) => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.filter(c => c.novelId === novelId && c.name === 'Shared Character').length >= 2
  }, destNovelId, 20_000)

  const destChars = (await readStorage(page, 'nf_characters')).filter(c => c.novelId === destNovelId)
  expect(destChars.filter(c => c.name === 'Shared Character')).toHaveLength(2)
})
