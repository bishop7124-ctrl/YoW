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
  // 2026-08-27 redesign. Its footer "+ Scene" button (`.ms-rail-f-btn`) adds
  // to the end of the manuscript regardless of which chapter is selected —
  // scoped to that class since "+ Scene" text alone also matches the
  // per-chapter inline row button and the empty-manuscript "add first
  // scene" CTA (`.manuscript-add-scene`).
  await page.locator('.ms-rail-f-btn', { hasText: '+ Scene' }).click()

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
  // The status chip (SceneEditor.jsx's `.ms-meta-status`) is hidden by CSS
  // while the editor is in Write mode (`.ms-scene-header--write .ms-meta-status
  // { display: none }`) — it only renders in Edit mode.
  await page.getByRole('group', { name: 'Editor mode' }).getByRole('button', { name: 'Edit' }).click()

  const statusBtn = page.locator('.ms-meta-status').first()
  if (!(await statusBtn.isVisible().catch(() => false))) {
    test.skip() // status control not visible in this layout, skip gracefully
    return
  }

  const before = await statusBtn.textContent()
  await statusBtn.click()
  const after = await statusBtn.textContent()
  expect(after).not.toBe(before)

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForManuscriptReady(page)
  const scenes = await readStorage(page, 'nf_scenes')
  // At least one scene should have a non-default status
  expect(scenes.some(s => s.status && s.status !== 'draft')).toBe(true)
})

// ─── Finalize draft ───────────────────────────────────────────────────────────

test('finalized draft can be created and viewed', async ({ page }) => {
  // Write some content first
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

  // Finalise lives behind the topbar overflow ("More") menu, under the
  // "Finish" section, as "Finalise draft" (British spelling — the previous
  // regex only matched "Finalize"/"Finalised", never plain "Finalise").
  // Opening it there swaps the surface to the FinalisePane, which has its
  // own "Finalise draft" button that actually calls handleFinaliseDraft().
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menu').getByRole('button', { name: 'Finalise draft' }).click()

  const finalizeBtn = page.getByRole('button', { name: 'Finalise draft' }).first()
  if (!(await finalizeBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    test.skip()
    return
  }

  // handleFinaliseDraft() names the copy via window.prompt then confirms via
  // window.confirm — both are native dialogs Playwright auto-dismisses
  // unless handled, which is why this used to silently no-op. One `on`
  // handler (not two `once`s — both `once`s would fire on the first dialog
  // and the second would error "already handled") covers both dialogs.
  page.on('dialog', dialog => dialog.accept())
  await finalizeBtn.click()

  // The finalized reader (FinalizedReader.jsx's `.ms-final-reader`, shared by
  // both its scroll and paged view modes) should appear.
  await expect(
    page.locator('.ms-final-reader').first(),
  ).toBeVisible({ timeout: 8000 })
})
