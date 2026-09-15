import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { dismissLaunchPrompts, downloadManualProjectBackup, enterWritingMode, openImportZip, openProjectSettings, seedCleanStorage } from './helpers.js'

const readProjectBackup = (path) => {
  const files = unzipSync(new Uint8Array(fs.readFileSync(path)))
  return JSON.parse(strFromU8(files['project-data.json']))
}

const canonicalRoundTripData = (source, restored) => {
  const restoredToSourceId = new Map()
  const pairIds = (left, right) => {
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return
    if (Array.isArray(left) || Array.isArray(right)) {
      if (Array.isArray(left) && Array.isArray(right)) left.forEach((item, index) => pairIds(item, right[index]))
      return
    }
    if (typeof left.id === 'string' && typeof right.id === 'string') restoredToSourceId.set(right.id, left.id)
    Object.keys(left).forEach(key => pairIds(left[key], right[key]))
  }
  pairIds(source, restored)

  const normalize = (value, path = []) => {
    if (typeof value === 'string') return restoredToSourceId.get(value) || value
    if (Array.isArray(value)) return value.map((item, index) => normalize(item, [...path, index]))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => key !== 'exportedAt' && !(path.length === 0 && key === 'backup'))
      .map(([key, item]) => [key, normalize(item, [...path, key])]))
  }
  return { source: normalize(source), restored: normalize(restored) }
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

test('create, write, refresh, export, and restore a project', async ({ page }) => {
  const projectTitle = `Smoke Project ${Date.now()}`
  const sentence = `Smoke test sentence ${Date.now()} survives refresh.`

  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(projectTitle)
  await page.getByPlaceholder('Description (optional)').fill('Automated launch smoke project.')
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/project\//)
  await expect(page.getByText(projectTitle).first()).toBeVisible()

  await enterWritingMode(page)
  await page.getByText('Begin writing here…').click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await expect(editor).toBeVisible()
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)

  // Flush before reload — the IndexedDB backend persists asynchronously, so
  // reloading immediately after typing can race it and lose the write (see
  // autosave.spec.js's identical pattern for this same scenario).
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await expect(page).toHaveURL(/\/project\/.+\/writing/)
  await expect(page.locator('.ms-preview').filter({ hasText: sentence })).toBeVisible()

  await openProjectSettings(page)
  const download = await downloadManualProjectBackup(page)
  expect(download.suggestedFilename()).toMatch(/\.zip$/)

  // Playwright temp downloads have no extension; save with .zip so the import modal accepts it
  const tmpZipPath = `/tmp/yow-smoke-${Date.now()}.zip`
  await download.saveAs(tmpZipPath)
  expect(fs.statSync(tmpZipPath).size).toBeGreaterThan(100)

  // Scoped to the Project Settings dialog specifically — the redesigned
  // Scene Inspector's own Format-tab "Done" button (`.ms-opt`) coincidentally
  // shares this label and can be present at the same time.
  await page.getByLabel('Project Settings', { exact: true }).getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Back to projects' }).click()

  // 'Import ▾' dropdown replaced the old bare 'Restore' button
  await expect(page.getByRole('button', { name: /Import/i }).first()).toBeVisible()

  // Open Import > Import ZIP, upload the backup, then confirm on the preview screen
  const fileInput = await openImportZip(page)
  await fileInput.setInputFiles(tmpZipPath)

  // The modal moves to a preview phase showing the YOW export; click "Create Project" to confirm
  await page.getByRole('button', { name: 'Create Project' }).click({ timeout: 15_000 })

  // After import, storage should have 2 projects (original + restored copy).
  // Goes through window.__yowStorageBridge — the app's active backend can be
  // an IndexedDB-backed vault, which raw localStorage reads can't see.
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    const novels = JSON.parse(raw || '[]')
    if (novels.length !== 2) return novels.length
    for (const key of ['nf_acts', 'nf_chapters', 'nf_scenes']) {
      const rows = JSON.parse(window.__yowStorageBridge?.getItem(key) ?? localStorage.getItem(key) ?? '[]')
      if (novels.some(novel => rows.filter(row => row.novelId === novel.id).length !== 1)) return -1
    }
    return novels.length
  }), { timeout: 20_000 }).toBe(2)

  // Re-export the restored copy and compare the complete JSON payload. Fresh
  // ids and per-download backup metadata are intentionally normalized; every
  // project setting, collection field, ordering value and content payload must
  // otherwise be identical.
  await openProjectSettings(page)
  const restoredDownload = await downloadManualProjectBackup(page)
  const restoredZipPath = `/tmp/yow-smoke-restored-${Date.now()}.zip`
  await restoredDownload.saveAs(restoredZipPath)
  const comparison = canonicalRoundTripData(readProjectBackup(tmpZipPath), readProjectBackup(restoredZipPath))
  expect(comparison.restored).toEqual(comparison.source)
})
