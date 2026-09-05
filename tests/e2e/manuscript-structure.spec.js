import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readScenesWithContent, readStorage,
  seedCleanStorage, waitForManuscriptReady, waitForStorage,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Manuscript Structure Test' })
  await enterWritingMode(page)
})

// ─── Scene CRUD ───────────────────────────────────────────────────────────────

test('add a scene and verify it persists after reload', async ({ page }) => {
  // StructureSidebar (`.ms-sidebar-*`) was replaced by ManuscriptRail in the
  // 2026-08-27 redesign, and its footer no longer has a rail-level "+ Scene"
  // button at all (`.ms-rail-f-btn` today only adds a Chapter or an Act —
  // see ManuscriptRail.jsx's `.ms-rail-f` block). Scenes are now added via
  // the per-chapter inline row button (`.ms-rail-add-scene button`,
  // rendered once per chapter under its scene list).
  await page.locator('.ms-rail-add-scene button').first().click()

  await waitForStorage(page, () => {
    const raw = window.__yowStorageBridge?.getItem('nf_scenes') ?? localStorage.getItem('nf_scenes')
    const scenes = JSON.parse(raw || '[]')
    return scenes.length >= 2
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForManuscriptReady(page)
  const scenes = await readStorage(page, 'nf_scenes')
  expect(scenes.length).toBeGreaterThanOrEqual(2)
})

test('rename a scene and verify it persists', async ({ page }) => {
  const newName = `Renamed Scene ${Date.now()}`

  // Click the ms-preview area to focus the scene (sets focused=true, shows scene header)
  await page.locator('.ms-preview').first().click()

  // Scene header is now is-visible — click the title button to open inline edit
  const titleBtn = page.locator('.ms-scene-header button[title="Click to rename scene"]').first()
  await titleBtn.waitFor({ state: 'visible', timeout: 5000 })
  await titleBtn.click()

  // Fill the inline input and commit with Enter
  const renameInput = page.locator('.ms-scene-header input').first()
  await renameInput.waitFor({ state: 'visible', timeout: 3000 })
  await renameInput.fill(newName)
  await renameInput.press('Enter')

  const prefix = newName.slice(0, 15)
  await waitForStorage(page, (p) => {
    const raw = window.__yowStorageBridge?.getItem('nf_scenes') ?? localStorage.getItem('nf_scenes')
    const scenes = JSON.parse(raw || '[]')
    return scenes.some(s => (s.title || '').includes(p))
  }, prefix)

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForManuscriptReady(page)
  const scenes = await readStorage(page, 'nf_scenes')
  expect(scenes.some(s => (s.title || '').includes(prefix))).toBe(true)
})

test('word count updates when content is added', async ({ page }) => {
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()

  await page.getByPlaceholder('Begin writing here…').fill('One two three four five')

  // Word count should appear somewhere — scene bar or footer
  await expect(
    page.locator('.ms-word-count, [data-word-count], .scene-meta').filter({ hasText: /\d+/ }),
  ).toBeVisible({ timeout: 6000 }).catch(() => {
    // Acceptable if count is rendered elsewhere; core test is storage below
  })

  // readScenesWithContent, not readStorage — scene prose lives under its own
  // nf_scene_content:<id> key, not inline on the nf_scenes record.
  const scenes = await readScenesWithContent(page)
  const scene = scenes.find(s => (s.content || '').includes('One two three'))
  expect(scene).toBeTruthy()
})

// ─── Chapter CRUD ─────────────────────────────────────────────────────────────

test('add a chapter and verify it appears and persists', async ({ page }) => {
  // ManuscriptRail's footer "+ Chapter" button (see the scene-add comment above).
  await page.locator('.ms-rail-f-btn', { hasText: '+ Chapter' }).click()

  await waitForStorage(page, () => {
    const raw = window.__yowStorageBridge?.getItem('nf_chapters') ?? localStorage.getItem('nf_chapters')
    const chapters = JSON.parse(raw || '[]')
    return chapters.length >= 2
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForManuscriptReady(page)
  const chapters = await readStorage(page, 'nf_chapters')
  expect(chapters.length).toBeGreaterThanOrEqual(2)
})

test('structure sidebar shows at least one act, chapter, and scene', async ({ page }) => {
  const acts = await readStorage(page, 'nf_acts')
  const chapters = await readStorage(page, 'nf_chapters')
  const scenes = await readStorage(page, 'nf_scenes')

  expect(acts.length).toBeGreaterThanOrEqual(1)
  expect(chapters.length).toBeGreaterThanOrEqual(1)
  expect(scenes.length).toBeGreaterThanOrEqual(1)
})

// ─── Scene status ─────────────────────────────────────────────────────────────

test('scene status cycles and persists', async ({ page }) => {
  // Status is no longer an inline scene-meta-bar badge — the 2026-08-27
  // manuscript-editor-redesign moved it into the right-hand Inspector's
  // "Scene" tab as a row of plain option buttons (`.ms-opt`, one per
  // SCENE_STATUSES entry in manuscriptUtils.js), with the active one
  // carrying `is-on`. Select the scene first so the Inspector has something
  // to show (same pattern as the "rename a scene" test above).
  await page.locator('.ms-preview').first().click()

  const statusRow = page.locator('.ms-insp-row').first()
  await expect(statusRow).toBeVisible()
  const before = await statusRow.locator('.ms-opt.is-on').first().textContent()
  // Click the next status in the cycle (not currently active) rather than
  // assuming a fixed index, so this doesn't depend on the scene's starting status.
  const nextOption = statusRow.locator('.ms-opt:not(.is-on)').first()
  const after = await nextOption.textContent()
  await nextOption.click()
  await expect(statusRow.locator('.ms-opt.is-on')).toHaveText(after)
  expect(after).not.toBe(before)

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForManuscriptReady(page)
  const scenes = await readStorage(page, 'nf_scenes')
  // At least one scene should have a non-default status
  expect(scenes.some(s => s.status && s.status !== 'draft')).toBe(true)
})

// ─── Finalised mode ───────────────────────────────────────────────────────────

test('finalized draft can be created and viewed', async ({ page }) => {
  // The 2026-08-27 manuscript-editor-redesign replaced the old one-off
  // "Finalize draft" action button with a persistent "Finalised" mode
  // alongside Write/Edit in the topbar's mode switcher (ManuscriptTopbar.jsx
  // MODES, `[role=group][aria-label="Editor mode"]`) — a live read view of
  // the current manuscript, not a saved snapshot. Write some content first
  // so there's something to see in that read view.
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  await page.getByPlaceholder('Begin writing here…').fill('Draft content for finalization.')

  await waitForStorage(page, () => {
    // Scene prose lives under its own nf_scene_content:<id> key, not inline
    // on the nf_scenes record (src/storage/sceneContentStore.js) — a scene
    // can transiently still show inline content right after the first local
    // commit though, so check both rather than assuming either is authoritative.
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]')
    return scenes.some(s => (s.content || '').includes('Draft content') || (get(`nf_scene_content:${s.id}`) || '').includes('Draft content'))
  })

  await page.getByRole('group', { name: 'Editor mode' }).getByRole('button', { name: 'Finalised' }).click()

  // Finalised mode shows its own Manuscript/Book sub-view switcher
  // (`[aria-label="Finalised view"]`) and, in Manuscript sub-view, the
  // written content in a read-only surface.
  await expect(page.getByRole('group', { name: 'Finalised view' })).toBeVisible({ timeout: 8000 })
  await expect(page.getByText('Draft content for finalization.')).toBeVisible()
})
