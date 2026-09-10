// QA sweep 2026-09-10 (product-owner autonomous session): real-browser
// verification of two Bugs-table / QA_PLAN.md rows that were fixed and
// unit-tested in code but still explicitly marked as needing a live browser
// pass — checkable in this environment's OFFLINE_MODE dev-server stub, no
// real Supabase account, Stripe checkout, AI provider key, or device
// required. See docs/ROADMAP.md's Bugs table and docs/QA_PLAN.md for the
// rows each test below covers.
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, openImportZip, readStorage,
  seedCleanStorage, seedIndexedDbEntries, waitForStorage, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

// Bugs row "2026-09-03 (backend-engineer, whole-codebase-audit finding #19):
// archive/document imports had no decompression limits" (fixed in code,
// unit-tested at the function level in archiveImportLimits.test.js /
// AIImportModal.archiveLimits.test.js — this is the still-open browser-level
// check). Craft a real ZIP with one more entry than MAX_ARCHIVE_FILE_COUNT
// (all empty, so the archive itself stays tiny — the point is the *entry
// count*, not needing a genuinely huge file) and upload it through the real
// "Import ZIP" UI. tryReadYowZip (the first reader handleFiles tries for a
// single .zip) calls assertUnzippedResultOk() right after unzipping, before
// it ever looks for a manifest — so this trips the same guard a real hostile
// or corrupt archive would, and proves the resulting error actually reaches
// the user-visible fileError text instead of hanging the tab or failing
// silently.
test('importing a ZIP with too many entries shows a clear error instead of hanging or crashing', async ({ page }) => {
  const { zipSync } = await import('fflate')
  const MAX_ARCHIVE_FILE_COUNT = 5000
  const files = {}
  for (let i = 0; i <= MAX_ARCHIVE_FILE_COUNT; i++) files[`f${i}.txt`] = new Uint8Array(0)
  const buffer = zipSync(files)

  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles({
    name: 'too-many-entries.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(buffer),
  })

  await expect(page.getByText(/too many files to import safely/i)).toBeVisible({ timeout: 15_000 })
  // The app must not have silently created a project from the rejected archive.
  const novels = await readStorage(page, 'nf_novels')
  expect(novels || []).toEqual([])
})

// Bugs row "2026-09-04 (audit finding #16 ...): Project deletion can leave
// per-scene keys" (fixed in code and unit-tested against jsdom/localStorage
// — QA_PLAN.md Priority -1 explicitly calls out that a real IndexedDB vault
// still needed checking). Confirms both passes deleteAllSceneContentForNovel
// documents: (1) the deleted project's own nf_scene_content:<id> key is
// actually gone from the real IndexedDB-backed vault, not just absent from
// the nf_scenes metadata array, and (2) its orphan sweep also removes an
// unrelated, already-orphaned nf_scene_content:* key with no owning scene
// anywhere — the exact "orphan left by an earlier gap" case the fix targets.
// Does not cover the desktop Tauri/SQLite vault or the second-tab-never-
// opened-it race also named in that QA_PLAN row — both still need a
// separate live pass.
test('deleting a project purges its IndexedDB scene-content keys, including a pre-existing orphan', async ({ page }) => {
  const orphanKey = 'nf_scene_content:pre-existing-orphan-id'

  // Seed an unrelated orphan key into the real IndexedDB vault — simulating a
  // leftover from before this fix shipped, with no nf_scenes entry anywhere
  // referencing it. deleteAllSceneContentForNovel's orphan sweep uses
  // projectStorage.js's listKeys(), which reads the backend's in-memory
  // mirror hydrated at boot — a key written directly to IndexedDB *after*
  // the app has already booted (e.g. via a bare page.evaluate) never enters
  // that mirror and would make this test pass for the wrong reason (looking
  // orphan-swept when it was actually just never visible to the app at all).
  // seedIndexedDbEntries + reload writes it before the next boot's hydration
  // instead, so it's genuinely visible the same way a real pre-existing
  // orphan would be.
  await seedIndexedDbEntries(page, { [orphanKey]: '"orphan prose that should be swept"' })
  await page.reload()
  await dismissLaunchPrompts(page)

  const projectTitle = `Orphan Key Test ${Date.now()}`
  await createProject(page, { title: projectTitle })
  await writeInDefaultScene(page, 'Content whose IndexedDB key should be purged on delete.')

  const novels = await readStorage(page, 'nf_novels')
  const projectId = novels[0].id
  const scenes = await readStorage(page, 'nf_scenes')
  const sceneId = scenes[0].id
  const contentKey = `nf_scene_content:${sceneId}`

  const readKv = async (key) => page.evaluate((k) => new Promise((resolve, reject) => {
    const req = indexedDB.open('yow-storage', 1)
    req.onsuccess = () => {
      const tx = req.result.transaction('kv', 'readonly')
      const getReq = tx.objectStore('kv').get(k)
      getReq.onsuccess = () => resolve(getReq.result ?? null)
      getReq.onerror = () => reject(getReq.error)
    }
    req.onerror = () => reject(req.error)
  }), key)

  // Sanity-check both keys are actually present before delete.
  expect(await readKv(contentKey)).not.toBeNull()
  expect(await readKv(orphanKey)).not.toBeNull()

  await page.evaluate(() => { window.confirm = () => true })
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.locator('.dash-card-settings-button').first().click()
  await page.getByRole('button', { name: 'Delete project' }).click()

  await waitForStorage(page, (id) => {
    const storedNovels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    return !storedNovels.some(n => n.id === id)
  }, projectId)

  await expect.poll(() => readKv(contentKey), { timeout: 8000 }).toBeNull()
  await expect.poll(() => readKv(orphanKey), { timeout: 8000 }).toBeNull()

  const versions = await readStorage(page, 'nf_scene_versions')
  const versionSceneIds = Array.isArray(versions) ? versions.map(v => v.sceneId) : Object.keys(versions || {})
  expect(versionSceneIds).not.toContain(sceneId)
})
