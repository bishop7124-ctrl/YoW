import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import {
  createProject, dismissLaunchPrompts, downloadManualProjectBackup, enterWritingMode,
  readStorage, seedCleanStorage, waitForStorage, waitForStorageHydration,
} from './helpers.js'

// Closes the specific gap recorded in docs/QA_PLAN.md's Priority 7 Comic/Graphic
// Novel row (2026-09-12 "Launch Runbook QA report, product decision" entry):
// a product decision to remove the Beta label from Comic/Graphic Novel had
// been made and recorded in docs/ROADMAP.md's Project Type Launch Scope table,
// but (a) the code still carried the Beta label in several places, and (b) the
// full create -> pages/panels/dialogue -> export -> open-and-verify workflow
// had never actually been run end-to-end and was still marked Not Tested,
// even though comic-planner.spec.js's many focused tests already covered
// each piece of it separately.
//
// This file: (1) proves no UI surface still shows a "Beta" badge/caveat for
// Comic/Graphic Novel (the app-wide product Beta banner and the unrelated
// Play/Screenplay/TV "script beta" badge are out of scope — see the PR
// description) and (2) runs the full promised workflow as one continuous
// pass, exporting and actually opening both the ZIP and DOCX exports rather
// than only checking they downloaded.

test.describe('Comic/Graphic Novel Beta label removal', () => {
  test.beforeEach(async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
  })

  test('the New Project type picker shows no Beta badge on Comic / Graphic Novel', async ({ page }) => {
    await page.getByRole('button', { name: 'New Project' }).first().click()
    const comicOption = page.getByRole('button', { name: /^Comic \/ Graphic Novel\b/ }).first()
    await expect(comicOption).toBeVisible()
    await expect(comicOption).not.toContainText('Beta')
  })

  test('a created Comic project shows no Beta label in the dashboard overview or workspace header', async ({ page }) => {
    await createProject(page, { title: 'Comic Beta Check', type: 'comic' })

    // ProjectDashboard's beta caveat paragraph ("Beta: <note>") must be gone.
    await expect(page.getByText(/^Beta:/)).toHaveCount(0)

    await enterWritingMode(page)
    // Studio.jsx's project-type badge (Layout.jsx's projectTypeLabel) must be
    // the plain type label, not "Comic / Graphic Novel · Beta". It's only
    // rendered above 1400px — index.css condenses the header and hides it
    // between 861-1400px and below 861px to save space.
    await page.setViewportSize({ width: 1600, height: 900 })
    const badge = page.locator('.studio-project-type-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toHaveText('Comic / Graphic Novel')
  })

  test('the public marketing homepage shows no Beta badge or caveat on the Comic / Graphic Novel tab', async ({ page }) => {
    // The OFFLINE_MODE dev-user fixture starts every test signed in, so reach
    // the signed-out marketing homepage the same way marketing-pages-responsive.spec.js
    // does: sign out via the user menu, then continue past the transient
    // "You've been signed out" screen.
    await page.locator('.user-menu-trigger').click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Go to homepage' }).click()
    await expect(page.locator('.yow-home')).toBeVisible()

    const comicTab = page.getByRole('tab', { name: 'Comic / Graphic Novel' })
    await comicTab.scrollIntoViewIfNeeded()
    await expect(comicTab).toBeVisible()
    await expect(comicTab).not.toContainText('Beta')

    await comicTab.click()
    await expect(page.getByText(/Beta.*core features available/i)).toHaveCount(0)
  })
})

test.describe('Comic/Graphic Novel onboarding wizard: no Beta badge', () => {
  test.beforeEach(async ({ page }) => {
    // suppressWizard:false leaves the first-run wizard live so this test can
    // drive its own type grid directly (see new-account-onboarding.spec.js).
    await seedCleanStorage(page, { suppressWizard: false })
    await page.goto('/')
    await dismissLaunchPrompts(page)
  })

  test('the first-run wizard type grid shows no Beta badge on any type', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'How would you like to begin?' })).toBeVisible()
    await page.getByRole('button', { name: /Start my own project/ }).click()
    await expect(page.getByRole('heading', { name: 'What are you working on?' })).toBeVisible()
    // Comic was the only project type still on the 'beta' stage; confirming
    // zero '.wizard-type-beta' badges across the whole grid covers it.
    await expect(page.locator('.wizard-type-beta')).toHaveCount(0)
  })
})

test.describe('Comic/Graphic Novel full workflow: create, plan, export, verify', () => {
  test.beforeEach(async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
  })

  test('create a project, plan real pages/panels/dialogue, export ZIP and DOCX, and open both to confirm the content is present', async ({ page }) => {
    await createProject(page, { title: 'Full Workflow Comic', type: 'comic' })
    await enterWritingMode(page)

    // The Comic Planner (not the prose manuscript editor) opened.
    await expect(page.locator('.cp-page-list')).toBeVisible({ timeout: 8000 })

    // Volume 1 / Issue 1 exist from the starter outline; select the issue.
    const issueBtn = page.getByRole('button', { name: /Issue|Chapter/i }).first()
    if (await issueBtn.isVisible({ timeout: 4000 }).catch(() => false)) await issueBtn.click()

    // Add two real pages.
    await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
    await page.getByRole('button', { name: /Add page|New page|\+ Page/i }).first().click()
    await waitForStorage(page, () => {
      const pages = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPages') ?? localStorage.getItem('nf_comicPages')) || '[]')
      return pages.length >= 2
    })

    await page.locator('.cp-page-row').first().click()
    await page.locator('.cp-page-editor').getByPlaceholder('Page title (optional)').fill('Splash Opening')
    await page.locator('.cp-page-editor').getByPlaceholder('What happens on this page?').fill('The hero lands in the ruined city.')

    // Add a real panel with dialogue, a caption, and an SFX line.
    await page.getByRole('button', { name: /Add panel|New panel|\+ Panel/i }).first().click()
    await waitForStorage(page, () => {
      const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
      return panels.length >= 1
    })
    const panel = page.locator('.cp-panel-card').first()
    await panel.getByPlaceholder("Describe the panel's visual content…").fill('Hero surveys the wreckage.')
    await panel.getByRole('button', { name: '+ balloon' }).click()
    await panel.getByPlaceholder('Speaker').first().fill('Hero')
    await panel.getByPlaceholder('Dialogue text…').first().fill("The city looks different now.")
    await panel.getByRole('button', { name: '+ caption' }).click()
    await panel.getByPlaceholder('Caption text…').first().fill('Three days after the collapse.')
    await panel.getByRole('button', { name: '+ sfx' }).click()
    await panel.getByPlaceholder('Sound effect…').first().fill('CRUMBLE')

    await waitForStorage(page, () => {
      const panels = JSON.parse((window.__yowStorageBridge?.getItem('nf_comicPanels') ?? localStorage.getItem('nf_comicPanels')) || '[]')
      return panels.some(p => p.dialogue?.[0]?.text === "The city looks different now.")
    })

    // Reload to confirm the whole plan actually persisted (not just component state).
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)

    const pagesAfterReload = await readStorage(page, 'nf_comicPages')
    expect(pagesAfterReload.some(p =>
      p.title === 'Splash Opening' && p.summary === 'The hero lands in the ruined city.',
    )).toBe(true)
    const panelsAfterReload = await readStorage(page, 'nf_comicPanels')
    const savedPanel = panelsAfterReload.find(p => p.description === 'Hero surveys the wreckage.')
    expect(savedPanel?.dialogue?.[0]).toMatchObject({ speaker: 'Hero', text: "The city looks different now." })
    expect(savedPanel?.captions?.[0]?.text).toBe('Three days after the collapse.')
    expect(savedPanel?.sfx?.[0]?.text).toBe('CRUMBLE')

    await enterWritingMode(page)
    await page.getByRole('button', { name: 'Project settings' }).click()

    // Export the ZIP backup and actually open it to confirm the plan round-trips.
    const zipDownload = await downloadManualProjectBackup(page)
    const zipPath = `/tmp/yow-comic-full-workflow-${Date.now()}.zip`
    await zipDownload.saveAs(zipPath)
    const zip = unzipSync(new Uint8Array(readFileSync(zipPath)))
    const pagesEntry = Object.keys(zip).find(k => k.endsWith('data/comic-pages.json'))
    const panelsEntry = Object.keys(zip).find(k => k.endsWith('data/comic-panels.json'))
    expect(pagesEntry, `expected comic-pages.json among: ${Object.keys(zip).join(', ')}`).toBeTruthy()
    expect(panelsEntry, `expected comic-panels.json among: ${Object.keys(zip).join(', ')}`).toBeTruthy()
    const exportedPages = JSON.parse(strFromU8(zip[pagesEntry]))
    const exportedPanels = JSON.parse(strFromU8(zip[panelsEntry]))
    expect(exportedPages.some(p => p.title === 'Splash Opening')).toBe(true)
    expect(exportedPanels.some(p => p.dialogue?.[0]?.text === "The city looks different now.")).toBe(true)

    // Export the DOCX comic script and actually open it to confirm the plan reads back correctly.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    const docxDownload = await downloadPromise
    const docxZip = unzipSync(new Uint8Array(readFileSync(await docxDownload.path())))
    const comicEntryName = Object.keys(docxZip).find(name => /Comic[- ]Script/i.test(name))
    expect(comicEntryName, `expected a Comic Script entry among: ${Object.keys(docxZip).join(', ')}`).toBeTruthy()
    const documentXml = strFromU8(unzipSync(docxZip[comicEntryName])['word/document.xml'])
    expect(documentXml).toContain('Comic Script')
    expect(documentXml).toContain('Splash Opening')
    expect(documentXml).toContain('The hero lands in the ruined city.')
    expect(documentXml).toContain('Hero surveys the wreckage.')
    expect(documentXml).toContain("The city looks different now.")
    expect(documentXml).toContain('Three days after the collapse.')
    expect(documentXml).toContain('CRUMBLE')
  })
})
