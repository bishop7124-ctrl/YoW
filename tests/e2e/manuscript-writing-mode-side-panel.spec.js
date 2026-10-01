import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, readScenesWithContent, seedCleanStorage, waitForWritingMode } from './helpers.js'

// Deferred real-browser regression pass for docs/ROADMAP.md's Bugs table row
// "2026-09-21 user report: 'Open in side panel' did not behave as a stable
// Writing-mode action" (docs/QA_PLAN.md's matching "Writing-mode
// linked-reference side panel" item). The bug: Writing hid the desktop
// Inspector control, and re-selecting the already-active Writing tab closed
// the newly-opened side panel. Fixed in code with focused component tests
// (ManuscriptCampaignWorkflow.test.jsx); this spec is the deferred
// real-browser drive-through of the exact documented workflow: enter
// Writing, open a linked reference in the side panel (via the "Open in side
// panel" popover button on an in-prose mention), continue typing, switch
// linked references, close/reopen Inspector, re-click the already-active
// Writing tab, and repeat at desktop/tablet/mobile widths.

// At mobile/tablet widths the persistent Studio nav collapses into a
// hamburger ("Open section menu") once away from the project overview page
// (manuscript-reference-panel.spec.js documents the same thing for its own
// "Write" navigation) — the overview's own dashboard buttons are only
// reachable directly from the overview itself. Try the direct button first
// (desktop, or still on the overview) and fall back to the hamburger menu,
// whose opened panel shares the same "Workspace" nav label as the desktop
// room list.
async function openRoom(page, label) {
  const direct = page.getByRole('button', { name: label }).first()
  const hamburger = page.getByRole('button', { name: 'Open section menu' })
  if (await direct.isVisible().catch(() => false)) {
    await direct.click()
    return
  }
  await hamburger.click()
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: label }).first().click()
}

async function addCharacter(page, name) {
  await openRoom(page, 'Characters')
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save Character' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function addLocation(page, name) {
  await openRoom(page, 'Atlas')
  await page.getByRole('button', { name: 'New' }).first().waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.locator('[role="dialog"] input[required]').first().fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

// Same hamburger/direct-button fallback manuscript-reference-panel.spec.js
// uses to get back into the manuscript editor after navigating into the
// Characters/Atlas rooms above.
async function backToWriting(page) {
  const directWrite = page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first()
  const hamburger = page.getByRole('button', { name: 'Open section menu' })
  if (await directWrite.isVisible().catch(() => false)) {
    await directWrite.click()
  } else {
    await hamburger.click()
    await page.getByRole('button', { name: /^Write\b/ }).click()
  }
  await waitForWritingMode(page)
}

function modeSwitcher(page) {
  return page.getByRole('group', { name: 'Editor mode' })
}

// Hover the in-prose mention span for `name` to reveal its popover, then
// click its "Open in side panel" button — the actual UI trigger for this
// workflow (SceneEditor.jsx's EntityLink), not the separate floating
// "Reference" panel covered by manuscript-reference-panel.spec.js. The
// mention/popover live inside an `aria-hidden="true"` preview overlay (the
// read-only styled duplicate of the textarea's text — see SceneEditor.jsx),
// so plain CSS locators are used here rather than getByRole/getByText,
// which would look for these nodes in the accessibility tree and never find
// them.
async function openInSidePanel(page, name) {
  const mention = page.locator('.ms-entity-wrap', { hasText: name }).first()
  await mention.scrollIntoViewIfNeeded()
  await mention.hover()
  const popover = mention.locator('.ms-entity-popover')
  await expect(popover).toBeVisible()
  await popover.locator('button', { hasText: 'Open in side panel' }).click()
}

const editorTextarea = (page) => page.getByPlaceholder('Begin writing here…')

// Confirms the scene's actual persisted content (not just whatever the
// live textarea currently shows — SceneEditor.jsx unmounts the real
// `<textarea>` back to a static, click-to-reactivate preview whenever it
// loses focus, e.g. from clicking an Inspector control, so a DOM value
// check right after such a click can spuriously fail even though nothing
// was lost). This is the actual "no content loss/corruption" signal this
// workflow needs, and matches how the rest of this suite verifies saved
// prose (see helpers.js's readScenesWithContent).
async function expectSavedSceneContent(page, expected) {
  await expect(async () => {
    const scenes = await readScenesWithContent(page)
    expect(scenes.some(s => s.content === expected)).toBe(true)
  }).toPass({ timeout: 10_000 })
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`Writing-mode side panel stays a stable action at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })

    const charName = `Cassian Vale ${Date.now()}`
    const locName = `Ashport Docks ${Date.now()}`
    await createProject(page, { title: `Writing Side Panel ${viewport.name} ${Date.now()}` })
    await addCharacter(page, charName)
    await addLocation(page, locName)
    await backToWriting(page)

    const modes = modeSwitcher(page)
    const writingTab = modes.getByRole('button', { name: 'Writing' })
    const editingTab = modes.getByRole('button', { name: 'Editing' })

    // Fresh projects default to Writing already; explicitly go via Editing
    // so entering Writing is a genuine mode transition, matching the
    // documented "enter Writing from Editing" step and its own entry action
    // (both secondary panels close) rather than trusting the initial state.
    await editingTab.click()
    await expect(editingTab).toHaveAttribute('aria-pressed', 'true')
    await writingTab.click()
    await expect(writingTab).toHaveAttribute('aria-pressed', 'true')

    // Desktop only: the core regression was the Inspector toggle vanishing
    // while in Writing. At tablet/mobile the topbar tools (including
    // Inspector) are intentionally replaced by the bottom tab bar — this is
    // an established, CSS-driven responsive convention (see index.css's
    // ≤900px rule), not the bug, so only assert the desktop control here.
    if (viewport.name === 'desktop') {
      const topbarInspectorBtn = page.locator('.ms-topbar-zone-tools').getByRole('button', { name: 'Inspector' })
      await expect(topbarInspectorBtn).toBeVisible()
    }

    // Type prose mentioning both linked references so their in-prose
    // mentions render. A fresh scene shows an inert "Begin writing here…"
    // placeholder that must be clicked once to mount the real textarea
    // (SceneSlot's activate-placeholder step) before it answers to
    // getByPlaceholder — same as helpers.js's writeInDefaultScene.
    const inertPlaceholder = page.getByText('Begin writing here…')
    if (await inertPlaceholder.isVisible().catch(() => false)) await inertPlaceholder.click()
    const editor = editorTextarea(page)
    await editor.click()
    await editor.fill(`${charName} walked toward ${locName} at dusk.`)
    await expect(editor).toHaveValue(`${charName} walked toward ${locName} at dusk.`)

    // Open the character reference in the side panel.
    await openInSidePanel(page, charName)
    await expect(writingTab).toHaveAttribute('aria-pressed', 'true')
    const inspector = page.getByRole('complementary', { name: 'Scene inspector' })
    await expect(inspector).toBeVisible()
    const catalogueEntry = page.getByRole('region', { name: 'Selected catalogue entry' })
    await expect(catalogueEntry).toContainText(charName)
    // Tracked Editing must not have been silently enabled by opening the panel.
    await expect(editingTab).toHaveAttribute('aria-pressed', 'false')

    // Continue typing while the panel is open — no content loss/corruption,
    // no silent mode change. Focus (not click) here: the entity mention
    // spans overlaid on the preview are real, individually-clickable
    // elements once content mentions references, and a coordinate click at
    // the textarea's center can land on one of them instead.
    await editor.focus()
    await editor.press('End')
    await editor.type(' The tide was rising fast.')
    await expect(editor).toHaveValue(`${charName} walked toward ${locName} at dusk. The tide was rising fast.`)
    await expect(writingTab).toHaveAttribute('aria-pressed', 'true')
    await expect(inspector).toBeVisible()

    // Switch linked references: open the location mention instead. At
    // desktop the side-by-side layout means the panel updates in place
    // without ever closing. At tablet/mobile the Inspector is a bottom
    // sheet that visually covers the prose (a real, established responsive
    // convention — see the screenshot-verified 62vh overlay in index.css),
    // so the equivalent real workflow is: close the sheet to reach the next
    // mention in the scene, click it, and confirm the sheet reopens
    // pointed at the new reference rather than staying stuck on the old one
    // or failing to reopen.
    if (viewport.name === 'desktop') {
      await openInSidePanel(page, locName)
    } else {
      await page.getByRole('button', { name: 'Close inspector' }).click()
      await expect(inspector).toHaveCount(0)
      await openInSidePanel(page, locName)
    }
    await expect(inspector).toBeVisible()
    await expect(catalogueEntry).toContainText(locName)
    await expect(catalogueEntry).not.toContainText(charName)
    await expect(writingTab).toHaveAttribute('aria-pressed', 'true')

    // Close and reopen the Inspector.
    if (viewport.name === 'desktop') {
      const topbarInspectorBtn = page.locator('.ms-topbar-zone-tools').getByRole('button', { name: 'Inspector' })
      await topbarInspectorBtn.click()
      await expect(inspector).toHaveCount(0)
      await topbarInspectorBtn.click()
      await expect(inspector).toBeVisible()
    } else {
      // Tablet/mobile: the equivalent Inspector bottom sheet, reachable from
      // the bottom tab bar, with its own dedicated close control.
      await page.getByRole('button', { name: 'Close inspector' }).click()
      await expect(inspector).toHaveCount(0)
      await page.getByRole('navigation', { name: 'Manuscript navigation' }).getByRole('button', { name: 'Inspector' }).click()
      await expect(inspector).toBeVisible()
    }
    // Reopening still shows the same reference (it was left on Catalogue),
    // and prose is unchanged.
    await expect(catalogueEntry).toContainText(locName)
    await expectSavedSceneContent(page, `${charName} walked toward ${locName} at dusk. The tide was rising fast.`)

    // The core regression: re-selecting the already-active Writing tab must
    // not act as a hidden panel-close command.
    await writingTab.click()
    await expect(writingTab).toHaveAttribute('aria-pressed', 'true')
    await expect(inspector).toBeVisible()
    await expect(catalogueEntry).toContainText(locName)
    await expectSavedSceneContent(page, `${charName} walked toward ${locName} at dusk. The tide was rising fast.`)
  })
}
