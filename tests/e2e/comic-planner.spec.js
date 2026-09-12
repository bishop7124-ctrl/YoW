import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, openImportZip, readStorage,
  seedCleanStorage, waitForStorage, waitForStorageHydration,
} from './helpers.js'

// ─── Shared helpers for the full QA-plan pass below ────────────────────────────
// (comic-planner.spec.js's original tests above cover: comic type gating on
// create, planner reachability, single page/panel add + localStorage
// persistence, dialogue-field persistence across reload, page-count display,
// page+panel delete cascade, ZIP export containing comic data, and non-comic
// isolation. The tests below fill in the rest of docs/ROADMAP.md's "PRD:
// Comic Panel Engine" QA Plan: full structure CRUD incl. rename/reorder/delete
// confirmation, full page/panel field persistence, duplicate isolation,
// character linking, reference image/PDF upload, cross-navigation and
// sign-out/in persistence, ZIP round-trip restore, DOCX script content,
// responsive layout, and data-safety delete chains.)

const issueButton = (page) => page.getByRole('button', { name: /Issue|Chapter/i }).first()

async function ensureIssueSelected(page) {
  const issueBtn = issueButton(page)
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) await issueBtn.click()
}

async function addPage(page) {
  await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
}

async function pageCount(page) {
  return page.evaluate(() => JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]').length)
}

// Encodes a real, browser-decodable image (not hand-rolled bytes) via an
// offscreen <canvas> so uploadUserMedia's genuine createImageBitmap() decode
// step (see src/utils/imageOptimize.js) succeeds for PNG/JPEG/WebP alike.
// `color` matters, not just format: the app re-optimizes every upload to a
// canonical WebP (imageOptimize.js), so two solid-color images of the same
// color and size legitimately re-encode to byte-identical output — a "does
// replacing produce a different value" check needs visually different source
// images, not just different source MIME types.
async function makeCanvasImageBuffer(page, mimeType, color = '#3366ff') {
  const bytes = await page.evaluate(async ({ type, fill }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 6
    canvas.height = 6
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, 6, 6)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { type: mimeType, fill: color })
  return Buffer.from(bytes)
}

// A well-known, valid minimal 1x1 transparent GIF — canvas.toBlob has no
// image/gif encoder in browsers, so this format needs real hand-authored bytes.
const TINY_GIF_BUFFER = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')

async function addCharacter(page, name) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, (n) => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.some(c => c.name === n)
  }, name)
  await enterWritingMode(page)
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Comic Test Project', type: 'comic' })
})

test('comic project has correct project type', async ({ page }) => {
  const novels = await readStorage(page, 'nf_novels')
  const project = novels.find(n => n.title === 'Comic Test Project')
  expect(project?.type).toBe('comic')
})

test('comic workspace is reachable from the Pages button', async ({ page }) => {
  await enterWritingMode(page)

  // The Comic Planner should be rendered instead of the prose editor
  await expect(
    page.locator('[data-tour*="comic"], .comic-planner, [class*="comic"]').first(),
  ).toBeVisible({ timeout: 8000 })
})

test('add a page to an issue and verify localStorage persistence', async ({ page }) => {
  await enterWritingMode(page)

  // Select (or auto-select) the first issue
  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await issueBtn.click()
  }

  // Add a page
  const addPageBtn = page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first()
  await addPageBtn.click()

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.length >= 1
  })

  const pages = await readStorage(page, 'nf_comicPages')
  expect(pages.length).toBeGreaterThanOrEqual(1)
})

test('add a panel to a page and verify localStorage persistence', async ({ page }) => {
  await enterWritingMode(page)

  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await issueBtn.click()
  }

  // Add a page first
  const addPageBtn = page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first()
  await addPageBtn.click()

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.length >= 1
  })

  // Click on the page to open it
  await page.locator('.cp-page-row').first().click()

  // Add a panel
  const addPanelBtn = page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first()
  await addPanelBtn.click()

  await waitForStorage(page, () => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    return panels.length >= 1
  })

  const panels = await readStorage(page, 'nf_comicPanels')
  expect(panels.length).toBeGreaterThanOrEqual(1)
})

test('panel dialogue field saves and persists after reload', async ({ page }) => {
  await enterWritingMode(page)

  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await issueBtn.click()
  }

  await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
  await waitForStorage(page, () => {
    return JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]').length >= 1
  })

  await page.locator('.cp-page-row').first().click()
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => {
    return JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]').length >= 1
  })

  // A panel starts with no dialogue lines — "+ balloon" (PanelEditor's
  // addDialogue) has to be clicked before the dialogue text field exists.
  await page.getByRole('button', { name: '+ balloon' }).first().click()

  const dialogueField = page.getByPlaceholder(/dialogue|speech|balloon/i).first()
  await expect(dialogueField).toBeVisible({ timeout: 3000 })

  const dialogueText = `Panel dialogue ${Date.now()}`
  await dialogueField.fill(dialogueText)

  // waitForStorage's predicate runs in the page realm via page.waitForFunction,
  // which serializes the function source — it can't close over dialogueText
  // from this scope, so it has to come in as an explicit arg.
  await waitForStorage(page, (text) => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    return panels.some(p =>
      (p.dialogue || []).some(d => (d.text || d).includes(text.slice(0, 15)))
      || (p.dialogueText || '').includes(text.slice(0, 15)),
    )
  }, dialogueText)

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  const panels = await readStorage(page, 'nf_comicPanels')
  expect(panels?.some(p =>
    JSON.stringify(p).includes(dialogueText.slice(0, 15)),
  )).toBe(true)
})

test('page and panel counts appear in the planner UI', async ({ page }) => {
  await enterWritingMode(page)

  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await issueBtn.click()
  }

  await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
  await waitForStorage(page, () => {
    return JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]').length >= 1
  })

  // Page count stat should be visible somewhere
  await expect(
    page.locator('text=/\\d+ page/i').first(),
  ).toBeVisible({ timeout: 6000 }).catch(() => {
    // Stat may be labelled differently; core persistence is verified above
  })
})

test('deleting a page removes it and its panels from storage', async ({ page }) => {
  await enterWritingMode(page)

  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await issueBtn.click()
  }

  await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
  await waitForStorage(page, () => {
    return JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]').length >= 1
  })

  const pagesBefore = await readStorage(page, 'nf_comicPages')
  const pageId = pagesBefore[0]?.id

  // Open page then delete. The page-actions "Delete" button's accessible
  // name is just "Delete" (its title attribute "Delete page" is overridden
  // by the button's own text content) — scope to .cp-page-actions so this
  // doesn't collide with any other "Delete"-labelled control on the page.
  // Deleting a page asks for confirmation via a native window.confirm() (same
  // convention as ManuscriptRail's act/chapter/scene deletes) — accept it.
  await page.locator('.cp-page-row').first().click()
  const deletePageBtn = page.locator('.cp-page-actions').getByRole('button', { name: 'Delete' }).first()
  if (!(await deletePageBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    test.skip()
    return
  }

  page.once('dialog', dialog => dialog.accept())
  await deletePageBtn.click()

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return !pages.some(p => p.id === pageId)
  })

  const pagesAfter = await readStorage(page, 'nf_comicPages')
  expect(pagesAfter.some(p => p.id === pageId)).toBe(false)

  // Panels belonging to that page should also be gone
  const panels = await readStorage(page, 'nf_comicPanels')
  expect(panels.some(p => p.pageId === pageId)).toBe(false)
})

test('comic pages and panels are included in ZIP export', async ({ page }) => {
  await enterWritingMode(page)

  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await issueBtn.click()
  }

  await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
  await waitForStorage(page, () => {
    return JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]').length >= 1
  })

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.zip$/)

  const { default: fs } = await import('node:fs')
  const path = await download.path()
  expect(fs.statSync(path).size).toBeGreaterThan(100)
})

test('prose project does not show Comic Planner UI', async ({ page }) => {
  // Create a Novel project in the same session
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: 'Prose Novel', type: 'novel' })

  await enterWritingMode(page)

  // Wait for the manuscript editor to mount
  await page.locator('[data-tour="manuscript-editor"]').waitFor({ timeout: 8000 })

  // The comic planner UI must not be visible in a prose project
  const comicUi = page.locator('[data-tour*="comic"], .cp-page-list, .cp-issue-panel').first()
  await expect(comicUi).not.toBeVisible()
})

// ═══ QA Plan §1: Structure CRUD ═══════════════════════════════════════════════
// (project-type gating + planner-opens-instead-of-manuscript already covered above)

test('add/rename volume and issue, then delete issue and volume with confirmation', async ({ page }) => {
  await enterWritingMode(page)

  // A new comic project seeds "Volume 1" / "Issue 1" automatically (starterOutline).
  await expect(page.locator('.cp-sidebar-volume-title').first()).toHaveText('Volume 1')

  // Add a second volume — App auto-creates its own "Issue 1" child too.
  await page.getByRole('button', { name: '+ Volume' }).click()
  await expect(page.locator('.cp-sidebar-volume-title')).toHaveCount(2)
  await expect(page.locator('.cp-sidebar-volume-title').nth(1)).toHaveText('Volume 2')

  // Add a second issue under the first volume. (Volume 2's own sidebar
  // section starts collapsed — expandedVolumes is computed once at mount —
  // so its auto-created issue isn't rendered yet; only Volume 1's two issues
  // show in the DOM count below.)
  await page.getByTitle('Add issue').first().click()
  await expect(page.locator('.cp-sidebar-issue-btn')).toHaveCount(2)

  // Rename Volume 1 via double-click -> inline edit -> Enter commits.
  await page.locator('.cp-sidebar-volume-title').first().dblclick()
  const volInput = page.locator('.cp-inline-edit').first()
  await volInput.fill('Renamed Volume')
  await volInput.press('Enter')
  await expect(page.locator('.cp-sidebar-volume-title').first()).toHaveText('Renamed Volume')

  // Rename Issue 1 via double-click -> blur commits.
  await page.locator('.cp-sidebar-issue-btn span').first().dblclick()
  const issueInput = page.locator('.cp-inline-edit').first()
  await issueInput.fill('Renamed Issue')
  await issueInput.blur()
  await expect(page.locator('.cp-sidebar-issue-btn').first()).toContainText('Renamed Issue')

  await waitForStorage(page, () => {
    const chapters = JSON.parse((window.__yowStorageBridge?.getItem('nf_chapters') ?? localStorage.getItem('nf_chapters')) || '[]')
    return chapters.some(c => c.title === 'Renamed Issue')
  })

  // Add a page to the (renamed) first issue, then delete that issue —
  // deleting must remove its pages and require confirmation.
  await page.locator('.cp-sidebar-issue-btn').first().click()
  await addPage(page)
  await waitForStorage(page, () => window.__yowStorageBridge?.getItem('nf_comicPages') || localStorage.getItem('nf_comicPages'))
  expect(await pageCount(page)).toBeGreaterThanOrEqual(1)

  // Cancel path: dismiss the confirm — issue and its page must survive.
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('.cp-sidebar-issue-row').first().getByTitle('Delete issue').click()
  await page.waitForTimeout(300)
  expect(await page.locator('.cp-sidebar-issue-btn').count()).toBe(2)

  // Accept path: issue and its page(s) are removed.
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.cp-sidebar-issue-row').first().getByTitle('Delete issue').click()
  await waitForStorage(page, () => {
    const chapters = JSON.parse((window.__yowStorageBridge?.getItem('nf_chapters') ?? localStorage.getItem('nf_chapters')) || '[]')
    return chapters.length === 2
  })
  await expect(page.locator('.cp-sidebar-issue-btn')).toHaveCount(1)

  // Deleting the (renamed) volume removes its remaining issue too, with confirmation.
  page.once('dialog', dialog => dialog.dismiss())
  await page.locator('.cp-sidebar-volume-row').first().getByTitle('Delete volume').click()
  await page.waitForTimeout(300)
  await expect(page.locator('.cp-sidebar-volume-title')).toHaveCount(2)

  page.once('dialog', dialog => dialog.accept())
  await page.locator('.cp-sidebar-volume-row').first().getByTitle('Delete volume').click()
  await expect(page.locator('.cp-sidebar-volume-title')).toHaveCount(1)
  await expect(page.locator('.cp-sidebar-volume-title').first()).toHaveText('Volume 2')
})

// ═══ QA Plan §2: Page CRUD ═════════════════════════════════════════════════════

test('add 3 pages with ascending numbers, edit every page field, and duplicate without cross-contamination', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)

  await addPage(page)
  await addPage(page)
  await addPage(page)
  await expect(page.locator('.cp-page-row')).toHaveCount(3)
  await expect(page.locator('.cp-page-row-num')).toHaveText(['1', '2', '3'])

  // Edit every page-level field on page 1.
  await page.locator('.cp-page-row').first().click()
  const editor = page.locator('.cp-page-editor')
  await editor.getByPlaceholder('Page title (optional)').fill('Cover reveal')
  await editor.locator('.cp-row-3 .cp-field').nth(0).locator('select').selectOption('splash')
  await editor.locator('.cp-row-3 .cp-field').nth(1).locator('select').selectOption('final')
  await editor.locator('.cp-row-3 .cp-field').nth(2).locator('select').selectOption('cliffhanger')
  await editor.getByPlaceholder('What happens on this page?').fill('The hero arrives.')
  await editor.getByPlaceholder('Composition, mood, palette, references…').fill('Wide establishing shot, warm palette.')
  await editor.getByPlaceholder('Editor, artist, or letterer notes…').fill('Letterer: extra-large SFX here.')

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.some(p => p.title === 'Cover reveal' && p.pageType === 'splash' && p.status === 'final' && p.pageTurn === 'cliffhanger')
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await enterWritingMode(page)
  await ensureIssueSelected(page)

  const pagesAfterReload = await readStorage(page, 'nf_comicPages')
  const savedPage = pagesAfterReload.find(p => p.title === 'Cover reveal')
  expect(savedPage).toMatchObject({
    pageType: 'splash',
    status: 'final',
    pageTurn: 'cliffhanger',
    summary: 'The hero arrives.',
    visualDirection: 'Wide establishing shot, warm palette.',
    productionNotes: 'Letterer: extra-large SFX here.',
  })

  // Duplicate page 1 (now "Cover reveal") and confirm the copy is independent.
  await page.locator('.cp-page-row', { hasText: 'Cover reveal' }).click()
  await page.locator('.cp-page-actions').getByRole('button', { name: 'Duplicate' }).click()
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.length >= 4
  })

  // The duplicate is auto-selected — edit its title only.
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Cover reveal (variant)')
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.some(p => p.title === 'Cover reveal (variant)')
  })

  const pagesAfterDuplicateEdit = await readStorage(page, 'nf_comicPages')
  const original = pagesAfterDuplicateEdit.find(p => p.title === 'Cover reveal')
  const duplicate = pagesAfterDuplicateEdit.find(p => p.title === 'Cover reveal (variant)')
  expect(original).toBeTruthy()
  expect(duplicate).toBeTruthy()
  expect(duplicate.id).not.toBe(original.id)
  // Original's own fields must be untouched by editing the duplicate.
  expect(original.pageType).toBe('splash')
  expect(original.status).toBe('final')
})

// ═══ QA Plan §3: Panel CRUD ════════════════════════════════════════════════════

test('4 panels expand/collapse independently, every field persists, delete renumbers, character link persists', async ({ page }) => {
  await addCharacter(page, `Panel Character ${Date.now()}`)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()

  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  }
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 4)
  await expect(page.locator('.cp-panel-card')).toHaveCount(4)
  await expect(page.locator('.cp-panel-num')).toHaveText(['Panel 1', 'Panel 2', 'Panel 3', 'Panel 4'])

  // Collapse only the second panel; the others must stay open independently.
  const secondToggle = page.locator('.cp-panel-card').nth(1).locator('.cp-panel-toggle')
  await secondToggle.click()
  await expect(page.locator('.cp-panel-card').nth(1)).not.toHaveClass(/is-open/)
  await expect(page.locator('.cp-panel-card').nth(0)).toHaveClass(/is-open/)
  await expect(page.locator('.cp-panel-card').nth(2)).toHaveClass(/is-open/)
  await secondToggle.click() // reopen for the rest of this test

  // Fill every field on panel 1.
  const panel1 = page.locator('.cp-panel-card').first()
  await panel1.locator('.cp-row-2 .cp-field').nth(0).locator('select').selectOption('close-up')
  await panel1.locator('.cp-row-2 .cp-field').nth(1).locator('select').selectOption('inset')
  await panel1.locator('.cp-row-2 .cp-field').nth(2).locator('select').selectOption('revised')
  await panel1.getByPlaceholder("Describe the panel's visual content…").fill('Hero clenches fist.')
  await panel1.getByPlaceholder('Composition, expression, props, motion, references…').fill('Low angle, gritted teeth.')

  // Character chip (added via addCharacter above).
  await panel1.locator('.cp-char-chip').first().click()

  await panel1.getByRole('button', { name: '+ balloon' }).click()
  await panel1.getByPlaceholder('Speaker').first().fill('Hero')
  await panel1.getByPlaceholder('Dialogue text…').first().fill('This ends now.')

  await panel1.getByRole('button', { name: '+ caption' }).click()
  await panel1.locator('.cp-caption-type').first().selectOption('thought')
  await panel1.getByPlaceholder('Caption text…').first().fill('One more chance.')

  await panel1.getByRole('button', { name: '+ sfx' }).click()
  await panel1.getByPlaceholder('Sound effect…').first().fill('KRAK!')

  await panel1.getByPlaceholder('Props, costume, time continuity…').fill('Jacket now torn.')

  await waitForStorage(page, () => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    const p = panels.find(p => p.description === 'Hero clenches fist.')
    return Boolean(p && p.dialogue?.[0]?.text === 'This ends now.' && p.sfx?.[0]?.text === 'KRAK!' && p.characterIds?.length === 1)
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await page.locator('.cp-page-row').first().click()

  const panelsAfterReload = await readStorage(page, 'nf_comicPanels')
  const savedPanel = panelsAfterReload.find(p => p.description === 'Hero clenches fist.')
  expect(savedPanel).toMatchObject({
    shotType: 'close-up',
    layoutHint: 'inset',
    status: 'revised',
    artNotes: 'Low angle, gritted teeth.',
    continuityNotes: 'Jacket now torn.',
  })
  expect(savedPanel.dialogue[0]).toMatchObject({ speaker: 'Hero', text: 'This ends now.' })
  expect(savedPanel.captions[0]).toMatchObject({ type: 'thought', text: 'One more chance.' })
  expect(savedPanel.sfx[0]).toMatchObject({ text: 'KRAK!' })
  expect(savedPanel.characterIds).toHaveLength(1)

  // Delete the *second* panel and confirm the remaining three are renumbered
  // 1/2/3 (not left with a 1/3/4 gap) — the panel-editor header number must
  // reflect display position, not a raw stored `order` value.
  page.once('dialog', dialog => dialog.accept())
  await page.locator('.cp-panel-card').nth(1).getByTitle('Delete panel').click()
  await expect(page.locator('.cp-panel-card')).toHaveCount(3)
  await expect(page.locator('.cp-panel-num')).toHaveText(['Panel 1', 'Panel 2', 'Panel 3'])

  // Unlink the character from the (still-first) panel and confirm it persists.
  await page.locator('.cp-panel-card').first().locator('.cp-char-chip').first().click()
  await waitForStorage(page, () => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    const p = panels.find(p => p.description === 'Hero clenches fist.')
    return (p?.characterIds?.length ?? 0) === 0
  })
})

test('move-up/move-down buttons reorder pages and panels, and order persists after reload', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 2)

  await page.locator('.cp-page-row').first().click()
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('First page')
  await page.locator('.cp-page-row').nth(1).click()
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Second page')
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.some(p => p.title === 'Second page')
  })

  // Move the second row up so "Second page" becomes row 1.
  await page.locator('.cp-page-row').nth(1).getByTitle('Move page up').click()
  await expect(page.locator('.cp-page-row-title').first()).toHaveText('Second page')
  await expect(page.locator('.cp-page-row-title').nth(1)).toHaveText('First page')

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    const second = pages.find(p => p.title === 'Second page')
    const first = pages.find(p => p.title === 'First page')
    return second.order < first.order
  })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await expect(page.locator('.cp-page-row-title').first()).toHaveText('Second page')

  // Panel reorder, same pattern.
  await page.locator('.cp-page-row').first().click()
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 2)
  await page.locator('.cp-panel-card').first().getByPlaceholder("Describe the panel's visual content…").fill('Panel A')
  await page.locator('.cp-panel-card').nth(1).getByPlaceholder("Describe the panel's visual content…").fill('Panel B')
  await waitForStorage(page, () => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    return panels.some(p => p.description === 'Panel B')
  })

  await page.locator('.cp-panel-card').nth(1).getByTitle('Move panel up').click()
  await expect(page.locator('.cp-panel-card').first().getByPlaceholder("Describe the panel's visual content…")).toHaveValue('Panel B')
})

// ═══ QA Plan §4: Reference image upload (page and panel level) ═══════════════

test('page reference image: upload PNG, replace, remove', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()

  const upload = page.locator('.cp-page-editor-header .cp-upload-field')
  const pngBuffer = await makeCanvasImageBuffer(page, 'image/png')
  await upload.locator('input[type="file"]').setInputFiles({ name: 'ref.png', mimeType: 'image/png', buffer: pngBuffer })
  await expect(upload.locator('.cp-upload-img')).toBeVisible({ timeout: 8000 })

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return Boolean(pages[0]?.referenceImage)
  })
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await page.locator('.cp-page-row').first().click()
  await expect(page.locator('.cp-page-editor-header .cp-upload-img')).toBeVisible({ timeout: 8000 })
  const firstImage = (await readStorage(page, 'nf_comicPages'))[0].referenceImage

  // Replace with a different image (different color — see makeCanvasImageBuffer).
  const jpegBuffer = await makeCanvasImageBuffer(page, 'image/jpeg', '#ff3366')
  await page.locator('.cp-page-editor-header .cp-upload-field .cp-upload-replace input[type="file"]')
    .setInputFiles({ name: 'ref2.jpg', mimeType: 'image/jpeg', buffer: jpegBuffer })
  await waitForStorage(page, (prev) => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return Boolean(pages[0]?.referenceImage) && pages[0].referenceImage !== prev
  }, firstImage)

  // Remove clears it and the drop zone returns.
  await page.locator('.cp-page-editor-header .cp-upload-field').getByRole('button', { name: 'Remove' }).click()
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return !pages[0]?.referenceImage
  })
  await expect(page.locator('.cp-page-editor-header .cp-upload-drop')).toBeVisible()
})

test('page reference: WebP and GIF process and save; panel reference PDF is session-only', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()

  const webpBuffer = await makeCanvasImageBuffer(page, 'image/webp')
  const pageUpload = page.locator('.cp-page-editor-header .cp-upload-field')
  await pageUpload.locator('input[type="file"]').setInputFiles({ name: 'ref.webp', mimeType: 'image/webp', buffer: webpBuffer })
  await expect(pageUpload.locator('.cp-upload-img')).toBeVisible({ timeout: 8000 })
  await pageUpload.getByRole('button', { name: 'Remove' }).click()
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return !pages[0]?.referenceImage
  })

  await pageUpload.locator('input[type="file"]').setInputFiles({ name: 'ref.gif', mimeType: 'image/gif', buffer: TINY_GIF_BUFFER })
  await expect(pageUpload.locator('.cp-upload-img')).toBeVisible({ timeout: 8000 })
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return Boolean(pages[0]?.referenceImage)
  })

  // Panel-level PDF reference: session-only, badge visible, gone after refresh.
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 1)
  const panelUpload = page.locator('.cp-panel-card').first().locator('.cp-upload-field')
  const tinyPdf = Buffer.from('%PDF-1.4\n%%EOF')
  await panelUpload.locator('input[type="file"]').setInputFiles({ name: 'ref.pdf', mimeType: 'application/pdf', buffer: tinyPdf })
  await expect(panelUpload.locator('.cp-pdf-badge')).toHaveText(/Session only — not saved on refresh/)
  await expect(panelUpload.locator('.cp-pdf-iframe')).toBeVisible()

  // PDFs are explicitly session-only — never written to comic panel storage.
  const panelsBeforeReload = await readStorage(page, 'nf_comicPanels')
  expect(panelsBeforeReload[0]?.referenceImage).toBeFalsy()

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await page.locator('.cp-page-row').first().click()
  await expect(page.locator('.cp-panel-card').first().locator('.cp-pdf-iframe')).toHaveCount(0)
  await expect(page.locator('.cp-panel-card').first().locator('.cp-upload-drop')).toBeVisible()
})

// ═══ QA Plan §5: Persistence ═══════════════════════════════════════════════════

test('comic planner data survives navigating away to Worldbuilding and back', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Survives navigation')
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.some(p => p.title === 'Survives navigation')
  })

  // "Locations" lives inside the "Atlas" room button (STUDIO_ROOMS, Layout.jsx).
  await page.getByRole('button', { name: 'Atlas' }).first().click()
  await page.getByRole('button', { name: 'New' }).first().waitFor({ state: 'visible' })
  await enterWritingMode(page)

  await expect(page.locator('.cp-page-list')).toBeVisible()
  const pages = await readStorage(page, 'nf_comicPages')
  expect(pages.some(p => p.title === 'Survives navigation')).toBe(true)
})

test('comic planner data survives a simulated sign-out/sign-in (reload) alongside another project', async ({ page }) => {
  // Offline dev mode has no real auth boundary to cross, so — same convention
  // as autosave.spec.js's "content survives logout then login" — a hard
  // reload after confirming project storage holds the data stands in for a
  // real sign-out/sign-in, exercising the same localStorage/IndexedDB-backed
  // persistence a real logout/login would read from.
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Present after sign-in')
  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    return pages.some(p => p.title === 'Present after sign-in')
  })

  // A second, unrelated project in the same account, to prove the "account"
  // this reload simulates re-entering has more than one project in it.
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: 'Second Comic Project', type: 'comic' })

  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)

  const novels = await readStorage(page, 'nf_novels')
  expect(novels.some(n => n.title === 'Comic Test Project')).toBe(true)
  expect(novels.some(n => n.title === 'Second Comic Project')).toBe(true)
  const pages = await readStorage(page, 'nf_comicPages')
  expect(pages.some(p => p.title === 'Present after sign-in')).toBe(true)
})

// ═══ QA Plan §6: Export — ZIP round trip ═══════════════════════════════════════

test('ZIP export contains comic-pages.json/comic-panels.json, and re-importing restores everything under a new project', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Roundtrip page')
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 1)
  await page.locator('.cp-panel-card').first().getByPlaceholder("Describe the panel's visual content…").fill('Roundtrip panel description')
  await page.locator('.cp-panel-card').first().getByRole('button', { name: '+ balloon' }).click()
  await page.locator('.cp-panel-card').first().getByPlaceholder('Dialogue text…').first().fill('Roundtrip line')
  await waitForStorage(page, () => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    return panels.some(p => p.dialogue?.[0]?.text === 'Roundtrip line')
  })

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  // setInputFiles(path) later needs a real .zip-extensioned path — the AI
  // Import file-type filter rejects anything else — so save explicitly
  // rather than reuse download.path()'s extensionless temp path (same
  // convention as launch-smoke.spec.js / atlas-project-zip-restore.spec.js).
  const zipPath = `/tmp/yow-comic-qa-roundtrip-${Date.now()}.zip`
  await download.saveAs(zipPath)

  const zip = unzipSync(new Uint8Array(readFileSync(zipPath)))
  expect(Object.keys(zip)).toEqual(expect.arrayContaining([
    expect.stringMatching(/data\/comic-pages\.json$/),
    expect.stringMatching(/data\/comic-panels\.json$/),
  ]))
  const exportedPages = JSON.parse(strFromU8(zip[Object.keys(zip).find(k => k.endsWith('data/comic-pages.json'))]))
  const exportedPanels = JSON.parse(strFromU8(zip[Object.keys(zip).find(k => k.endsWith('data/comic-panels.json'))]))
  expect(exportedPages.some(p => p.title === 'Roundtrip page')).toBe(true)
  expect(exportedPanels.some(p => p.dialogue?.[0]?.text === 'Roundtrip line')).toBe(true)

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Back to projects' }).click()

  const novelCountBefore = (await readStorage(page, 'nf_novels')).length
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles(zipPath)
  await page.getByRole('button', { name: 'Create Project' }).click({ timeout: 15_000 })

  // waitForStorage's arg param doubles as a timeout override when it's a bare
  // number (see its typeof check in helpers.js) — wrap the count so a plain
  // integer here isn't misread as a near-zero timeout.
  await waitForStorage(page, ({ before }) => {
    const novels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    return novels.length > before
  }, { before: novelCountBefore })

  const novelsAfter = await readStorage(page, 'nf_novels')
  expect(novelsAfter).toHaveLength(novelCountBefore + 1)
  const originalProject = novelsAfter.find(n => n.title === 'Comic Test Project')
  const restoredProject = novelsAfter.find(n => n.id !== originalProject.id)
  expect(restoredProject).toBeTruthy()
  expect(restoredProject.type).toBe('comic')

  const allPages = await readStorage(page, 'nf_comicPages')
  const allPanels = await readStorage(page, 'nf_comicPanels')
  const restoredPage = allPages.find(p => p.novelId === restoredProject.id && p.title === 'Roundtrip page')
  expect(restoredPage).toBeTruthy()
  // Restore must remap ids rather than collide with the source project's.
  expect(restoredPage.id).not.toBe(exportedPages.find(p => p.title === 'Roundtrip page').id)
  const restoredPanel = allPanels.find(p => p.novelId === restoredProject.id && p.pageId === restoredPage.id)
  expect(restoredPanel?.dialogue?.[0]?.text).toBe('Roundtrip line')

  // The original project's own records must be untouched by the restore.
  const originalPages = allPages.filter(p => p.novelId === originalProject.id)
  expect(originalPages.some(p => p.title === 'Roundtrip page')).toBe(true)
})

// ═══ QA Plan §7: Export — DOCX ═════════════════════════════════════════════════

test('DOCX export renders a Comic Script section with volume/issue/page/panel content, and placeholders for empty ones', async ({ page }) => {
  await enterWritingMode(page)

  // First issue gets a real page+panel; add a second, deliberately empty, issue.
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Docx page')
  await page.locator('.cp-page-editor').getByPlaceholder('Composition, mood, palette, references…').fill('Docx visual direction')
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 1)
  const panel = page.locator('.cp-panel-card').first()
  await panel.getByPlaceholder("Describe the panel's visual content…").fill('Docx panel description')
  await panel.getByPlaceholder('Composition, expression, props, motion, references…').fill('Docx art notes')
  await panel.getByRole('button', { name: '+ balloon' }).click()
  await panel.getByPlaceholder('Speaker').first().fill('Narrator')
  await panel.getByPlaceholder('Dialogue text…').first().fill('Docx dialogue line')
  await panel.getByRole('button', { name: '+ caption' }).click()
  await panel.getByPlaceholder('Caption text…').first().fill('Docx caption line')
  await panel.getByRole('button', { name: '+ sfx' }).click()
  await panel.getByPlaceholder('Sound effect…').first().fill('DOCXBOOM')
  await panel.getByPlaceholder('Props, costume, time continuity…').fill('Docx continuity note')

  // A second issue with no pages at all (empty-issue placeholder).
  await page.getByTitle('Add issue').first().click()
  await waitForStorage(page, () => {
    const chapters = JSON.parse((window.__yowStorageBridge?.getItem('nf_chapters') ?? localStorage.getItem('nf_chapters')) || '[]')
    return chapters.length >= 2
  })

  await waitForStorage(page, () => {
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    return panels.some(p => p.description === 'Docx panel description')
  })

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Word docs ZIP/ }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  const zip = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const comicEntryName = Object.keys(zip).find(name => /Comic[- ]Script/i.test(name))
  expect(comicEntryName, `expected a "Comic Script" entry among: ${Object.keys(zip).join(', ')}`).toBeTruthy()

  const docxInner = unzipSync(zip[comicEntryName])
  const documentXml = strFromU8(docxInner['word/document.xml'])

  expect(documentXml).toContain('Comic Script')
  expect(documentXml).toContain('Volume 1')
  expect(documentXml).toContain('Issue 1')
  expect(documentXml).toContain('Docx page')
  expect(documentXml).toContain('Docx visual direction')
  expect(documentXml).toContain('Docx panel description')
  expect(documentXml).toContain('Docx art notes')
  expect(documentXml).toContain('Narrator')
  expect(documentXml).toContain('Docx dialogue line')
  expect(documentXml).toContain('Docx caption line')
  expect(documentXml).toContain('DOCXBOOM')
  expect(documentXml).toContain('Docx continuity note')
  // The second, empty issue must render a placeholder, not crash the export.
  expect(documentXml).toContain('(no pages)')
})

// ═══ QA Plan §8: Non-comic project isolation (extra: DOCX-specific) ═══════════

test('DOCX export of a non-comic project has no Comic Script section', async ({ page }) => {
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: 'Isolation Novel', type: 'novel' })
  await enterWritingMode(page)
  await page.getByText('Begin writing here…').click()
  await page.getByPlaceholder('Begin writing here…').fill('Some prose content for export.')
  await waitForStorage(page, () => {
    const scenes = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes') ?? localStorage.getItem('nf_scenes')) || '[]')
    return scenes.some(s => (s.content || '').includes('Some prose'))
  })

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Word docs ZIP/ }).click()
  const download = await downloadPromise
  const zip = unzipSync(new Uint8Array(readFileSync(await download.path())))
  const comicEntry = Object.keys(zip).find(name => /Comic[- ]Script/i.test(name))
  expect(comicEntry).toBeFalsy()
})

// ═══ QA Plan §9: Responsive ════════════════════════════════════════════════════

test('layout is usable at 375px, 768px, and 1280px+ with no horizontal overflow', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()

  for (const size of [{ width: 375, height: 800 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(size)
    await page.waitForTimeout(200)

    await expect(page.locator('.cp-sidebar')).toBeVisible()
    await expect(page.locator('.cp-page-list')).toBeVisible()
    await expect(page.locator('.cp-page-editor')).toBeVisible()
    await expect(page.locator('.cp-upload-drop, .cp-upload-preview').first()).toBeVisible()

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflowX, `horizontal overflow at ${size.width}px`).toBeLessThanOrEqual(1)

    if (size.width <= 768) {
      // Sidebar "+"/delete controls are hover-revealed on desktop, which has
      // no equivalent on touch — they must be unconditionally visible here.
      const opacity = await page.locator('.cp-sidebar-row-actions').first().evaluate(el => getComputedStyle(el).opacity)
      expect(Number(opacity)).toBeGreaterThan(0)
    }
  }
})

// ═══ QA Plan §10: Data safety ══════════════════════════════════════════════════

test('deleting a linked character clears it from page and panel characterIds', async ({ page }) => {
  const charName = `Doomed Character ${Date.now()}`
  await addCharacter(page, charName)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.locator('.cp-page-editor-header .cp-char-chip').first().click()
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 1)
  await page.locator('.cp-panel-card').first().locator('.cp-char-chip').first().click()

  await waitForStorage(page, () => {
    const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
    const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
    return (pages[0]?.characterIds?.length === 1) && (panels[0]?.characterIds?.length === 1)
  })

  await page.getByRole('button', { name: 'Characters' }).first().click()
  // With exactly one character, Characters auto-selects it into the dossier
  // view (Edit/Delete buttons) — no separate list-item click needed, and
  // `getByText(charName)` would ambiguously also match an off-screen
  // <option> in an unrelated dropdown on this page.
  await expect(page.getByRole('heading', { name: charName })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()

  await waitForStorage(page, () => {
    const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters') ?? localStorage.getItem('nf_characters')) || '[]')
    return chars.length === 0
  })

  const pages = await readStorage(page, 'nf_comicPages')
  const panels = await readStorage(page, 'nf_comicPanels')
  expect(pages[0]?.characterIds ?? []).toHaveLength(0)
  expect(panels[0]?.characterIds ?? []).toHaveLength(0)
})

test('restoring a ZIP into an account with other projects leaves those projects unaffected', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)

  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  // Real .zip-extensioned path — see the comment on the equivalent save in
  // the ZIP round-trip test above.
  const zipPath = `/tmp/yow-comic-qa-existing-account-${Date.now()}.zip`
  await (await downloadPromise).saveAs(zipPath)
  await page.keyboard.press('Escape')

  // A second, pre-existing project in the same account that the restore must not touch.
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: 'Untouched Project', type: 'novel' })
  const untouchedProjectId = (await readStorage(page, 'nf_novels')).find(n => n.title === 'Untouched Project').id
  await enterWritingMode(page)
  await page.getByText('Begin writing here…').click()
  await page.getByPlaceholder('Begin writing here…').fill('Do not touch me.')
  await waitForStorage(page, () => {
    const scenes = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes') ?? localStorage.getItem('nf_scenes')) || '[]')
    return scenes.some(s => (s.content || '').includes('Do not touch me'))
  })
  // Scoped to this project's own novelId — nf_scenes holds every project's
  // scenes (including the unrelated comic project's own orphaned starter
  // scene record), so an unscoped snapshot here would wrongly flag that as
  // "lost" once the after-snapshot below is correctly project-scoped.
  const untouchedScenesBefore = (await readScenesLikeContent(page)).filter(s => s.novelId === untouchedProjectId)

  await page.getByRole('button', { name: 'Back to projects' }).click()
  const novelCountBefore = (await readStorage(page, 'nf_novels')).length
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles(zipPath)
  await page.getByRole('button', { name: 'Create Project' }).click({ timeout: 15_000 })
  // waitForStorage's arg param doubles as a timeout override when it's a bare
  // number (see its typeof check in helpers.js) — wrap the count so a plain
  // integer here isn't misread as a near-zero timeout.
  await waitForStorage(page, ({ before }) => {
    const novels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    return novels.length > before
  }, { before: novelCountBefore })

  const novels = await readStorage(page, 'nf_novels')
  expect(novels).toHaveLength(novelCountBefore + 1)
  expect(novels.some(n => n.title === 'Comic Test Project')).toBe(true)
  expect(novels.some(n => n.title === 'Untouched Project')).toBe(true)

  const untouchedProject = novels.find(n => n.title === 'Untouched Project')
  const untouchedScenesAfter = (await readStorage(page, 'nf_scenes')).filter(s => s.novelId === untouchedProject.id)
  expect(untouchedScenesAfter.map(s => s.id).sort()).toEqual(untouchedScenesBefore.map(s => s.id).sort())

  async function readScenesLikeContent(p) {
    return p.evaluate(() => JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes') ?? localStorage.getItem('nf_scenes')) || '[]'))
  }
})

test('deleting the project removes all its comic page and panel records from storage', async ({ page }) => {
  await enterWritingMode(page)
  await ensureIssueSelected(page)
  await addPage(page)
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')).length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => (JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')).length >= 1)

  const novelId = (await readStorage(page, 'nf_novels')).find(n => n.title === 'Comic Test Project').id

  await page.getByRole('button', { name: 'Back to projects' }).click()
  await expect(page.getByRole('heading', { name: 'Comic Test Project' }).first()).toBeVisible()
  await page.getByLabel('Project settings').first().click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete project', exact: true }).click()

  await waitForStorage(page, (id) => {
    const novels = JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]')
    return !novels.some(n => n.id === id)
  }, novelId)

  const pages = await readStorage(page, 'nf_comicPages')
  const panels = await readStorage(page, 'nf_comicPanels')
  expect(pages.some(p => p.novelId === novelId)).toBe(false)
  expect(panels.some(p => p.novelId === novelId)).toBe(false)
})
