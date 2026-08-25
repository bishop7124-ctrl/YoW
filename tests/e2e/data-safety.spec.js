import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, openImportZip, readStorage,
  seedCleanStorage, seedIndexedDbEntries, waitForStorage, writeInDefaultScene,
} from './helpers.js'

// Every browser-context callback below (page.evaluate/waitForFunction) reads
// project storage via `window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)`
// rather than raw localStorage — the app's active backend can be an
// IndexedDB-backed vault (src/storage/browserVaultAdapter.js) that raw
// localStorage reads can't see. Inlined at each call site rather than a
// shared helper since these callbacks are serialized into the browser and
// can't close over a Node-side function.

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

// ─── Delete cascades ──────────────────────────────────────────────────────────

test('deleting a project removes its acts, chapters, and scenes', async ({ page }) => {
  await createProject(page, { title: 'Cascade Delete Test' })
  await writeInDefaultScene(page, 'Content that should be deleted.')

  const novels = await readStorage(page, 'nf_novels')
  const projectId = novels[0].id

  // Accept the native confirm() dialog that fires on delete
  await page.evaluate(() => { window.confirm = () => true })

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.locator('.dash-card-settings-button').first().click()
  await page.getByRole('button', { name: 'Delete project' }).click()

  await waitForStorage(page, (id) => {
    const storedNovels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    return !storedNovels.some(n => n.id === id)
  }, projectId)

  const acts = await readStorage(page, 'nf_acts')
  const chapters = await readStorage(page, 'nf_chapters')
  const scenes = await readStorage(page, 'nf_scenes')

  expect((acts || []).some(a => a.novelId === projectId)).toBe(false)
  expect((chapters || []).some(c => c.novelId === projectId)).toBe(false)
  expect((scenes || []).some(s => s.novelId === projectId)).toBe(false)
})

test('deleting a character removes it from relationship lists', async ({ page }) => {
  await createProject(page, { title: 'Character Cascade Test' })

  await page.getByRole('button', { name: 'Characters' }).first().click()
  await expect(page.getByRole('heading', { name: /Characters/i })).toBeVisible()

  for (const charName of ['Alice', 'Bob']) {
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(charName)
    await page.getByRole('button', { name: 'Save Character' }).click()
    await waitForStorage(page, (n) => {
      const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
      return chars.some(c => c.name === n)
    }, charName)
  }

  // Character cards are .studio-record buttons — getByText finds hidden <option> first
  await page.locator('.studio-record', { hasText: 'Alice' }).first().click()

  // Character delete fires two confirm() dialogs — accept both
  await page.evaluate(() => { window.confirm = () => true })
  await page.getByRole('button', { name: /Delete/i }).first().click()

  await waitForStorage(page, () => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return !chars.some(c => c.name === 'Alice')
  })

  const chars = await readStorage(page, 'nf_characters')
  expect(chars.some(c => c.name === 'Bob')).toBe(true)
  expect(chars.some(c => c.name === 'Alice')).toBe(false)
})

// ─── Project isolation ────────────────────────────────────────────────────────

test('worldbuilding data is isolated between projects', async ({ page }) => {
  const titleA = `Isolation A ${Date.now()}`
  const titleB = `Isolation B ${Date.now()}`

  await createProject(page, { title: titleA })
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill('Project A Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, () => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.name === 'Project A Character')
  })
  const novelsAfterA = await readStorage(page, 'nf_novels')
  const projectAId = novelsAfterA.find(n => n.title === titleA)?.id

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: titleB })
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill('Project B Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, () => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.name === 'Project B Character')
  })

  const allChars = await readStorage(page, 'nf_characters')
  const projectAChars = allChars.filter(c => c.novelId === projectAId)
  expect(projectAChars.some(c => c.name === 'Project A Character')).toBe(true)
  expect(projectAChars.some(c => c.name === 'Project B Character')).toBe(false)
})

// ─── Large project stress ─────────────────────────────────────────────────────

test('dashboard and writing remain usable with 10 projects in storage', async ({ page }) => {
  test.setTimeout(120_000)

  // Seed directly into the app's storage backend (see seedIndexedDbEntries —
  // raw localStorage seeding here would be invisible to the app once the
  // IndexedDB-backed vault is active) so it's present before the app boots
  // on the next navigation.
  const novels = []
  const acts = []
  const chapters = []
  const scenes = []
  for (let i = 0; i < 10; i++) {
    const novelId = `stress-novel-${i}`
    const actId = `stress-act-${i}`
    const chapterId = `stress-chapter-${i}`
    const sceneId = `stress-scene-${i}`
    novels.push({ id: novelId, title: `Stress Project ${i}`, type: 'novel', createdAt: Date.now() - i * 1000 })
    acts.push({ id: actId, novelId, title: `Act ${i}`, order: 0 })
    chapters.push({ id: chapterId, novelId, actId, title: `Chapter ${i}`, order: 0 })
    scenes.push({ id: sceneId, novelId, chapterId, actId, title: `Scene ${i}`, content: `Content for stress project ${i}. `.repeat(50), order: 0 })
  }
  await seedIndexedDbEntries(page, {
    nf_novels: JSON.stringify(novels),
    nf_acts: JSON.stringify(acts),
    nf_chapters: JSON.stringify(chapters),
    nf_scenes: JSON.stringify(scenes),
  })

  // Use goto instead of reload to reliably trigger addInitScript
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible({ timeout: 10_000 })

  // Open a project by creating one (stress data is in background storage)
  await createProject(page, { title: 'Stress Write Test' })
  await page.getByRole('button', { name: 'Write' }).click()
  await expect(page.locator('[data-tour="manuscript-editor"]').first()).toBeVisible({ timeout: 10_000 })
})

test('large scene content (>10k words) loads without crash', async ({ page }) => {
  await createProject(page, { title: 'Large Scene Test' })

  await page.evaluate(() => {
    const novels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    const novel = novels[0]
    if (!novel) return
    const scenes = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes') ?? localStorage.getItem('nf_scenes')) || '[]')
    const scene = scenes.find(s => s.novelId === novel.id)
    if (scene) {
      scene.content = 'The quick brown fox jumps over the lazy dog. '.repeat(500)
      // hydrateScenesFromStorage (src/storage/sceneContentStore.js) uses a
      // scene's own inline .content when present rather than requiring the
      // separate nf_scene_content:<id> key, so writing it inline here (as
      // this test already did) is fine — just needs to go through the
      // bridge like every other write.
      const write = (k, v) => { if (window.__yowStorageBridge) window.__yowStorageBridge.setItem(k, v); else localStorage.setItem(k, v) }
      write('nf_scenes', JSON.stringify(scenes))
    }
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await page.getByRole('button', { name: 'Write' }).click()
  await expect(page.locator('[data-tour="manuscript-editor"]').first()).toBeVisible({ timeout: 10_000 })
})

// ─── Import / restore round-trip ──────────────────────────────────────────────

test('exported ZIP restores all worldbuilding data', async ({ page }) => {
  const projectTitle = `Export Restore ${Date.now()}`
  await createProject(page, { title: projectTitle })

  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill('Restore Test Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, () => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.name === 'Restore Test Character')
  })

  // Export via the studio project settings panel
  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  await page.getByRole('button', { name: 'Done' }).click()

  // Delete via project manager — accept the confirm() dialog
  await page.evaluate(() => { window.confirm = () => true })
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.locator('.dash-card-settings-button').first().click()
  await page.getByRole('button', { name: 'Delete project' }).click()
  await waitForStorage(page, (t) => {
    const novels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    return !novels.some(n => n.title === t)
  }, projectTitle)

  // Restore from ZIP — pass buffer with .zip extension so filename filter passes
  await page.goto('/')
  await dismissLaunchPrompts(page)
  const fileInput = await openImportZip(page)
  const { readFileSync } = await import('node:fs')
  await fileInput.setInputFiles({
    name: 'project-backup.zip',
    mimeType: 'application/zip',
    buffer: readFileSync(zipPath),
  })

  // Wait for the native YOW export preview phase, then confirm
  await page.getByRole('button', { name: 'Create Project' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Create Project' }).click()

  await waitForStorage(page, (t) => {
    const novels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return novels.some(n => n.title === t)
      && chars.some(c => c.name === 'Restore Test Character')
  }, projectTitle, 20_000)

  const chars = await readStorage(page, 'nf_characters')
  expect(chars.some(c => c.name === 'Restore Test Character')).toBe(true)
})
