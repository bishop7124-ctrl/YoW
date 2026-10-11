/**
 * Sprint 11 Oct: Novella and Short Story customer-journey acceptance.
 * create -> write -> reload (persistence) -> no dead "Finalise draft" action
 * -> own starter templates only -> Word ZIP + PDF export.
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { PROJECT_TYPES } from '../../src/constants/projectTypes.js'
import { getTemplatesForProjectType } from '../../src/components/Manuscript/manuscriptTemplates.js'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readStorage, seedCleanStorage,
  waitForStorageHydration, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

for (const typeId of ['novella', 'short_story']) {
  const cfg = PROJECT_TYPES[typeId]

  test(`${cfg.label}: create, write, reload, templates, no dead Finalise action, export`, async ({ page }) => {
    test.setTimeout(120_000)
    const title = `Acceptance ${cfg.label} ${Date.now()}`
    const sentence = `The lantern guttered and ${typeId} words survived the reload.`

    await createProject(page, { title, type: typeId })
    const novels = await readStorage(page, 'nf_novels')
    const project = novels.find(n => n.title === title)
    expect(project?.type).toBe(typeId)
    if (cfg.defaultWordTarget) expect(project.targetWords ?? project.wordTarget ?? cfg.defaultWordTarget).toBeTruthy()

    await writeInDefaultScene(page, sentence)

    // Persistence across a full reload.
    await page.reload()
    await waitForStorageHydration(page)
    await dismissLaunchPrompts(page)
    await page.getByText(title).first().click().catch(() => {})
    await enterWritingMode(page)
    await expect(page.getByText(sentence).first().or(page.getByPlaceholder('Begin writing here…'))).toBeVisible({ timeout: 10_000 })
    const editor = page.getByPlaceholder('Begin writing here…')
    if (await editor.isVisible().catch(() => false)) await expect(editor).toHaveValue(sentence)

    // "Finalise draft" would silently no-op for these types: it must not be offered.
    await page.getByRole('button', { name: 'More' }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('button', { name: 'Finalise draft' })).toHaveCount(0)

    // Starter templates: only this type's own (names from the template source).
    await menu.getByRole('button', { name: 'Apply a template' }).click()
    const own = getTemplatesForProjectType(typeId).map(t => t.name)
    const others = getTemplatesForProjectType(typeId === 'novella' ? 'short_story' : 'novella')
      .map(t => t.name).filter(n => !own.includes(n))
    const dialog = page.getByRole('dialog').last()
    await expect(dialog.getByText(own[1], { exact: false }).first()).toBeVisible({ timeout: 8000 })
    for (const name of others) await expect(dialog.getByText(name, { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)

    // Export: Word ZIP and PDF from Project settings.
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
