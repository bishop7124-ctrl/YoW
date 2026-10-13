/**
 * Sprint 12 Oct: 5E Campaign and Tabletop Campaign customer-journey acceptance.
 * create -> default sections -> session prep/recap -> encounter writing -> reload
 * (persistence) -> Word ZIP + PDF export carry prep/recap -> no player/collab promises.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { PROJECT_TYPES } from '../../src/constants/projectTypes.js'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readStorage, seedCleanStorage,
  waitForStorage, waitForStorageHydration, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

for (const typeId of ['dnd_campaign', 'tabletop_rpg']) {
  const cfg = PROJECT_TYPES[typeId]

  test(`${cfg.label}: prep/recap, encounter text, reload, export`, async ({ page }) => {
    test.setTimeout(150_000)
    const title = `Acceptance ${cfg.label} ${Date.now()}`
    const hook = `Missing caravan at the old bridge (${typeId})`
    const recap = `The party tracked wagon marks north (${typeId}).`
    const encounterText = `Wolves circle the camp (${typeId}).`

    await createProject(page, { title, type: typeId })
    const novels = await readStorage(page, 'nf_novels')
    const project = novels.find(n => n.title === title)
    expect(project?.type).toBe(typeId)

    // Default sections for the type are all offered (nav labels reachable in the DOM).
    const body = page.locator('body')
    await expect(body).toContainText(/Sessions/i)
    await expect(body).toContainText(/Map/i)

    await writeInDefaultScene(page, encounterText)
    await enterWritingMode(page)

    // Session prep & recap panel appears on the session heading and persists.
    await expect(page.getByText(`${cfg.structure.level2} prep & recap`)).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('Hooks', { exact: true }).fill(hook)
    await page.getByLabel('Recap', { exact: true }).fill(recap)
    await waitForStorage(page, ([h, r]) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const chapters = JSON.parse(get('nf_chapters') || '[]')
      return chapters.some(c => c.sessionPlan?.hooks === h && c.sessionRecap?.summary === r)
    }, [hook, recap])

    await page.evaluate(() => window.__yowStorageBridge?.flush?.())
    await page.reload()
    await waitForStorageHydration(page)
    await dismissLaunchPrompts(page)
    await page.getByText(title).first().click().catch(() => {})
    await enterWritingMode(page)
    // The panel may start collapsed or open depending on hydration timing; expand it if needed.
    await expect(page.getByText(`${cfg.structure.level2} prep & recap`)).toBeVisible({ timeout: 10_000 })
    const panelFields = page.locator('details.ms-campaign-session-panel textarea')
    if (!(await panelFields.first().isVisible().catch(() => false))) {
      await page.getByText(`${cfg.structure.level2} prep & recap`).click()
    }
    await expect(panelFields.first()).toHaveValue(hook, { timeout: 10_000 })
    await expect(panelFields.nth(6)).toHaveValue(recap)

    // Exports: Word ZIP and PDF from Project settings.
    await page.getByRole('button', { name: 'Project settings' }).first().click()
    const docx = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    const docxDl = await docx
    expect(docxDl.suggestedFilename()).toMatch(/-word-docs\.zip$/)
    expect(fs.statSync(await docxDl.path()).size).toBeGreaterThan(100)
    const pdf = page.waitForEvent('download')
    await page.locator('.project-settings-theme-button').first().click()
    const pdfDl = await pdf
    expect(pdfDl.suggestedFilename()).toMatch(/\.pdf$/)
    expect(fs.statSync(await pdfDl.path()).size).toBeGreaterThan(100)
  })
}
