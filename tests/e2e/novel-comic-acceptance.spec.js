/**
 * Sprint 13 Oct: Novel and Comic customer-journey acceptance.
 * Novel: several finalised-draft snapshots -> reader opens each, previous/next
 * pages work, working draft untouched -> persistence across reload -> ZIP.
 * Comic: a large project (120 pages / 480 panels) survives reload, is fully
 * present in the ZIP export, and re-imports with nothing dropped.
 */
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import {
  createProject, dismissLaunchPrompts, downloadManualProjectBackup, enterWritingMode, openImportZip,
  readStorage, seedIndexedDbEntries, seedCleanStorage, waitForStorage, waitForStorageHydration, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

const readKey = (page, key) => page.evaluate(
  (k) => JSON.parse((window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)) || '[]'), key,
)

test('Novel: multiple finalised snapshots, reader switching, previous/next, reload, non-novel hiding', async ({ page }) => {
  test.setTimeout(180_000)
  const title = `Acceptance Novel ${Date.now()}`
  await createProject(page, { title, type: 'novel' })
  await writeInDefaultScene(page, 'Snapshot one prose about the harbour.')

  const backToWorking = async (currentText) => {
    await page.getByRole('button', { name: '← Working draft' }).click()
    await page.getByText(currentText).first().click()
    await expect(page.locator('textarea.ms-textarea').first()).toBeVisible({ timeout: 10_000 })
  }
  // handle both dialogs (prompt then confirm) reliably
  page.on('dialog', d => (d.type() === 'prompt' ? d.accept(d.defaultValue()) : d.accept()))
  const doFinalise = async () => {
    // The menu item toggles the Finalise pane, so a second press may close it.
    const paneButton = page.getByRole('button', { name: 'Finalise draft' })
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole('button', { name: 'More' }).click()
      await page.getByRole('menu').getByRole('button', { name: 'Finalise draft' }).click()
      if (await paneButton.first().isVisible({ timeout: 2000 }).catch(() => false)) break
    }
    await page.getByRole('button', { name: 'Finalise draft' }).first().click()
    await expect(page.locator('.ms-final-reader').first()).toBeVisible({ timeout: 10_000 })
  }

  await doFinalise()
  await backToWorking('Snapshot one prose about the harbour.')
  const editor = page.locator('textarea.ms-textarea').first()
  await editor.fill('Snapshot two prose about the lighthouse.')
  await editor.press('End')
  await waitForStorage(page, () => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    return JSON.parse(get('nf_scenes') || '[]').some(s => (get(`nf_scene_content:${s.id}`) || s.content || '').includes('lighthouse'))
  })
  await doFinalise()
  await backToWorking('Snapshot two prose about the lighthouse.')
  await editor.fill('Snapshot three prose about the storm.')
  await editor.press('End')
  await waitForStorage(page, () => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    return JSON.parse(get('nf_scenes') || '[]').some(s => (get(`nf_scene_content:${s.id}`) || s.content || '').includes('storm'))
  })
  await doFinalise()

  // Three distinct snapshots stored, newest first, each frozen at its own prose.
  let novels = await readStorage(page, 'nf_novels')
  let drafts = novels.find(n => n.title === title).finalizedDrafts
  expect(drafts).toHaveLength(3)
  const frozenText = (d) => JSON.stringify(d.scenes || d)
  expect(frozenText(drafts[0])).toContain('storm')
  expect(frozenText(drafts[1])).toContain('lighthouse')
  expect(frozenText(drafts[2])).toContain('harbour')
  expect(frozenText(drafts[2])).not.toContain('storm')

  // Reader: the selector lists all three, switching shows that snapshot's prose.
  const picker = page.getByLabel('View a different finalized draft')
  await expect(picker.locator('option')).toHaveCount(3)
  await picker.selectOption(drafts[2].id)
  await page.getByRole('button', { name: 'Scroll' }).click()
  await expect(page.locator('.ms-final-reader').getByText('harbour').first()).toBeVisible()
  await expect(page.locator('.ms-final-reader').getByText('storm')).toHaveCount(0)
  await picker.selectOption(drafts[0].id)
  await expect(page.locator('.ms-final-reader').getByText('storm').first()).toBeVisible()

  // Pages view: Previous is disabled on the first spread; Next is enabled only when more pages exist.
  await page.getByRole('button', { name: 'Pages' }).click()
  await expect(page.getByRole('button', { name: 'Previous pages' })).toBeDisabled()
  const next = page.getByRole('button', { name: 'Next pages' })
  if (await next.isEnabled()) {
    await next.click()
    await expect(page.getByRole('button', { name: 'Previous pages' })).toBeEnabled()
    await page.getByRole('button', { name: 'Previous pages' }).click()
  }

  // Snapshots persist across reload and the working draft was not locked.
  await page.getByRole('button', { name: '← Working draft' }).click()
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  novels = await readStorage(page, 'nf_novels')
  drafts = novels.find(n => n.title === title).finalizedDrafts
  expect(drafts).toHaveLength(3)
  await dismissLaunchPrompts(page)
  await page.getByText(title).first().click().catch(() => {})
  await enterWritingMode(page)
  await page.getByText('Snapshot three prose about the storm.').first().click()
  await expect(page.locator('textarea.ms-textarea').first()).toHaveValue('Snapshot three prose about the storm.')

  // Non-novel types never offer Finalise draft (Comic uses its own planner).
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: `Acceptance Comic ${Date.now()}`, type: 'comic' })
  await enterWritingMode(page)
  await expect(page.getByRole('button', { name: 'Finalise draft' })).toHaveCount(0)
})

test('Comic: large project (120 pages / 480 panels) survives reload, ZIP export and re-import', async ({ page }) => {
  test.setTimeout(240_000)
  const title = `Acceptance Large Comic ${Date.now()}`
  await createProject(page, { title, type: 'comic' })
  await enterWritingMode(page)
  const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
  if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) await issueBtn.click()
  await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
  await waitForStorage(page, () => JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]').length >= 1)
  await page.locator('.cp-page-row').first().click()
  await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
  await waitForStorage(page, () => JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]').length >= 1)

  const originalId = (await readStorage(page, 'nf_novels')).find(n => n.title === title).id
  const PAGES = 120
  const PER_PAGE = 4
  const seed = await page.evaluate(({ pages, per }) => {
    const get = (k) => JSON.parse((window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)) || '[]')
    const [tplPage] = get('nf_comicPages')
    const [tplPanel] = get('nf_comicPanels')
    const outPages = []
    const outPanels = []
    for (let i = 0; i < pages; i++) {
      const pid = `acc-page-${i}`
      outPages.push({ ...tplPage, id: pid, title: `Large page ${i + 1}`, pageNumber: i + 1, order: i })
      for (let j = 0; j < per; j++) {
        outPanels.push({
          ...tplPanel, id: `acc-panel-${i}-${j}`, pageId: pid, order: j,
          description: `Panel ${i + 1}.${j + 1} ${'x'.repeat(200)}`,
          dialogue: [{ id: `acc-d-${i}-${j}`, speaker: 'A', text: `Line ${i + 1}.${j + 1}` }],
        })
      }
    }
    return { nf_comicPages: JSON.stringify(outPages), nf_comicPanels: JSON.stringify(outPanels) }
  }, { pages: PAGES, per: PER_PAGE })
  // Seed before the app boots on the next load (an in-memory store would
  // otherwise overwrite a direct write to the running page).
  await page.evaluate(() => window.__yowStorageBridge?.flush?.())
  await page.waitForTimeout(1000)
  await seedIndexedDbEntries(page, seed)

  await page.reload()
  await waitForStorageHydration(page)
  expect(await readKey(page, 'nf_comicPages')).toHaveLength(PAGES)
  expect(await readKey(page, 'nf_comicPanels')).toHaveLength(PAGES * PER_PAGE)

  await dismissLaunchPrompts(page)
  await page.getByText(title).first().click().catch(() => {})
  await enterWritingMode(page)
  await expect(page.locator('.cp-page-row').first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Project settings' }).click()
  const download = await downloadManualProjectBackup(page)
  const zipPath = `/tmp/yow-large-comic-${Date.now()}.zip`
  await download.saveAs(zipPath)
  const zip = unzipSync(new Uint8Array(readFileSync(zipPath)))
  const pick = (suffix) => JSON.parse(strFromU8(zip[Object.keys(zip).find(k => k.endsWith(suffix))]))
  expect(pick('data/comic-pages.json')).toHaveLength(PAGES)
  expect(pick('data/comic-panels.json')).toHaveLength(PAGES * PER_PAGE)

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Back to projects' }).click()
  const before = (await readStorage(page, 'nf_novels')).length
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles(zipPath)
  await page.getByRole('button', { name: 'Create Project' }).click({ timeout: 30_000 })
  await waitForStorage(page, ({ n }) => JSON.parse((window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')) || '[]').length > n, { n: before }, 30_000)
  const novels = await readStorage(page, 'nf_novels')
  const restored = novels.find(n => n.type === 'comic' && n.id !== originalId)
  expect(restored).toBeTruthy()
  const allPages = await readKey(page, 'nf_comicPages')
  const allPanels = await readKey(page, 'nf_comicPanels')
  expect(allPages.filter(p => p.novelId === restored.id)).toHaveLength(PAGES)
  expect(allPanels.filter(p => p.novelId === restored.id)).toHaveLength(PAGES * PER_PAGE)
})
