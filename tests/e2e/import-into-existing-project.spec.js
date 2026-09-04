/**
 * "Import into an existing project" — roadmap Bugs table item "Import into
 * an existing project and project merging" (docs/ROADMAP.md).
 *
 * Covers the native-YOW-export path only (populateYowProjectIntoExisting in
 * src/components/AIImportModal.jsx) — see that row for what's deliberately
 * still out of scope (AI-parsed/DOCX imports, and structure-level merge).
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

test('importing a ZIP into an existing project adds content additively, skipping a same-name duplicate', async ({ page }) => {
  // ── Build a source project with two characters, export it ──────────────
  const sourceTitle = `Merge Source ${Date.now()}`
  await createProject(page, { title: sourceTitle })
  await addCharacter(page, 'Shared Character')
  await addCharacter(page, 'Unique To Source')

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  await page.getByRole('button', { name: 'Done' }).click()

  // ── Build a destination project with its own pre-existing character,
  //    sharing a name with one from the source ──────────────────────────
  await page.getByRole('button', { name: 'Back to projects' }).click()
  const destTitle = `Merge Destination ${Date.now()}`
  await createProject(page, { title: destTitle })
  await addCharacter(page, 'Shared Character')
  await addCharacter(page, 'Already In Destination')

  const destCharsBefore = await readStorage(page, 'nf_characters')
  const destNovelsBefore = await readStorage(page, 'nf_novels')
  const destNovelId = destNovelsBefore.find(n => n.title === destTitle).id
  const destSharedCharacterId = destCharsBefore.find(c => c.novelId === destNovelId && c.name === 'Shared Character').id

  // ── Import the source ZIP, targeting the destination project ───────────
  await page.getByRole('button', { name: 'Back to projects' }).click()
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
  // Leave "Skip items that already exist" checked (default) — this is the
  // dedup path being tested.
  await page.getByRole('button', { name: 'Import Into Project' }).click()

  await waitForStorage(page, (novelId) => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.novelId === novelId && c.name === 'Unique To Source')
  }, destNovelId, 20_000)

  const allChars = await readStorage(page, 'nf_characters')
  const destChars = allChars.filter(c => c.novelId === destNovelId)
  // The source project was exported, but never deleted — still present.
  const sourceNovelId = (await readStorage(page, 'nf_novels')).find(n => n.title === sourceTitle)?.id

  // Destination gained the source's unique character...
  expect(destChars.some(c => c.name === 'Unique To Source')).toBe(true)
  // ...kept its own pre-existing character, still just once (not duplicated)...
  expect(destChars.filter(c => c.name === 'Shared Character')).toHaveLength(1)
  expect(destChars.find(c => c.name === 'Shared Character').id).toBe(destSharedCharacterId)
  // ...and its own other pre-existing character is untouched.
  expect(destChars.some(c => c.name === 'Already In Destination')).toBe(true)
  expect(destChars).toHaveLength(3) // Shared Character, Already In Destination, Unique To Source

  // The source project itself was never touched by the import.
  if (sourceNovelId) {
    const sourceChars = allChars.filter(c => c.novelId === sourceNovelId)
    expect(sourceChars).toHaveLength(2)
  }
})
