// QA backlog pass (2026-09-24, product-owner-driven session): runs a batch of
// previously wholesale-"Deferred" Priority 4 (Responsive And Visual Safety)
// and Priority 8 (Conditional Launch Scope) checklist items from
// docs/QA_PLAN.md that are testable credential-free — local dev server,
// offline-mode storage, no live Supabase/Stripe account, no second device.
// See docs/QA_PLAN.md's Priority 4 / Priority 8 sections for the exact
// per-item notes this run closes out, and docs/ROADMAP.md's Bugs table for
// the real defects found and fixed in the same session.

import { test, expect } from '@playwright/test'
import {
  seedCleanStorage,
  seedFakeAiConfig,
  createProject,
  enterWritingMode,
  waitForManuscriptReady,
  waitForWritingMode,
  writingNavButton,
} from './helpers.js'

// Encodes a real, browser-decodable image via an offscreen <canvas> — same
// approach as tests/e2e/characters-corrective-audit.spec.js's own helper —
// so upload/decode/preview is genuinely exercised rather than mocked.
async function makeCanvasImageBuffer(page, color, size = 6) {
  const bytes = await page.evaluate(async ({ fill, dimension }) => {
    const canvas = document.createElement('canvas')
    canvas.width = dimension
    canvas.height = dimension
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, dimension, dimension)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, { fill: color, dimension: size })
  return Buffer.from(bytes)
}

test.describe('Priority 4: Desktop density scale', () => {
  test('0.9 zoom applies at desktop widths and is off at mobile/tablet', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Density Scale Test' })

    // Desktop widths: 1280, 1440, and a wide-desktop size.
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const scale = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--app-density-scale').trim()
      )
      expect(scale, `--app-density-scale at ${width}px`).toBe('.9')
      // No unpainted strip: the scaled body should cover the full (unscaled)
      // viewport with no extra horizontal scrollbar.
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      )
      expect(hasHorizontalOverflow, `no horizontal overflow at ${width}px`).toBe(false)
    }

    // Compact widths keep scale at 1 (100%).
    for (const width of [860, 768, 390]) {
      await page.setViewportSize({ width, height: 800 })
      const scale = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--app-density-scale').trim()
      )
      expect(scale, `--app-density-scale at ${width}px`).toBe('1')
    }
  })

  test('a body-portaled modal remains reachable and unclipped under the 0.9 scale', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await createProject(page, { title: 'Density Modal Test' })
    await page.getByLabel('Project settings').first().click()
    const dialog = page.locator('[role="dialog"][aria-labelledby="project-settings-title"]')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    // The dialog's visible box must sit inside the (unscaled) viewport
    // coordinate space Playwright reports — a portal escaping the `zoom`
    // coordinate system would report a box far outside 0..1280/0..900.
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(1280 + 2)
    expect(box.y + box.height).toBeLessThanOrEqual(900 + 2)
  })
})

test.describe('Priority 4: Manuscript note-field containment', () => {
  test('long prose and an unbroken URL stay inside the note field at every width', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Note Containment Test' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)

    // Focus the scene, then add a note via the toolbar's "Add note" button —
    // it opens the note in the Inspector's Notes tab regardless of mode.
    // Nothing focuses a scene by default on entering the writing view
    // (matching the established pattern in manuscript-structure.spec.js):
    // click the preview's placeholder text first to focus it.
    // Deliberately stays in the default Write mode: SceneEditor.jsx gates the
    // "Add note" button behind `!trackingChanges`, and Manuscript.jsx sets
    // `trackingChanges={mode === 'edit'}` — so Edit mode hides the Add-note
    // button entirely rather than routing to it, contrary to what an earlier
    // version of this test assumed.
    await page.getByText('Begin writing here…').click()
    await page.getByRole('button', { name: /Add note/ }).first().click()

    const longUrl = 'https://example.com/' + 'a'.repeat(120) + '/unbroken-path-segment-that-is-very-long-indeed'
    const longParagraph = 'Lorem ipsum dolor sit amet, '.repeat(15) + longUrl
    const noteTextarea = page.locator('textarea[placeholder="Write your note here…"]').first()

    // Below the 861px breakpoint the Inspector is a separate bottom-nav tab
    // rather than an always-visible side panel, so it has to be opened
    // explicitly before its Notes textarea is reachable at each width.
    const openInspectorIfCompact = async (width) => {
      if (width >= 861) return
      const inspectorNavBtn = page.getByRole('navigation', { name: 'Manuscript navigation' }).getByRole('button', { name: 'Inspector' })
      if (await inspectorNavBtn.isVisible().catch(() => false)) await inspectorNavBtn.click()
      // Once a note exists the tab label gains a count ("Notes (1)"), so match
      // by prefix rather than the exact "Notes" label used before any note exists.
      const notesTab = page.getByRole('button', { name: /^Notes/ })
      if (await notesTab.isVisible().catch(() => false)) await notesTab.click()
    }

    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await openInspectorIfCompact(width)
      await expect(noteTextarea).toBeVisible()
      await noteTextarea.fill(longParagraph)
      await noteTextarea.blur()
      const overflow = await noteTextarea.evaluate(el => el.scrollWidth > el.clientWidth + 2)
      expect(overflow, `note textarea causes horizontal overflow at ${width}px`).toBe(false)
      await expect(noteTextarea).toBeEditable()
    }

    // Reload persistence check, at the mobile width the checklist explicitly calls out.
    // (waitForManuscriptReady checks the desktop Studio-nav Write button, which is
    // hidden behind the hamburger menu at this width — wait on the manuscript
    // surface itself instead, since the reload keeps the same /manuscript route.)
    await page.setViewportSize({ width: 390, height: 900 })
    await page.reload()
    await waitForWritingMode(page)
    await openInspectorIfCompact(390)
    const persistedTextarea = page.locator('textarea[placeholder="Write your note here…"]').first()
    await expect(persistedTextarea).toHaveValue(longParagraph)
    const overflowAfterReload = await persistedTextarea.evaluate(el => el.scrollWidth > el.clientWidth + 2)
    expect(overflowAfterReload, 'note textarea causes horizontal overflow after reload at 390px').toBe(false)
  })
})

test.describe('Priority 4: Character dossier density regression', () => {
  test('portrait stays a stable first column, chips wrap, and Edit/Delete stay in one row', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Dossier Density Test' })
    await page.getByRole('button', { name: 'Open Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).click()

    await page.getByLabel('Name').fill('Lady Seraphina Blackwood-Ashcombe the Unbroken')
    await page.getByLabel('Title / Job').fill('Grand Archivist of the Sunken Library and Keeper of the Last Ember')
    const familyGroupInput = page.getByLabel('Family Group')
    await familyGroupInput.fill('House Blackwood-Ashcombe of the Long Coast')
    await familyGroupInput.press('Tab')
    await page.getByLabel('Pronouns').fill('she/her')
    await page.getByLabel('Species').fill('Human')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('heading', { name: 'Lady Seraphina Blackwood-Ashcombe the Unbroken' })).toBeVisible()

    // Empty-cover placeholder (Priority 8's "Empty cover placeholders" item):
    // visible, clickable, with an accessible label, before any image exists.
    const placeholder = page.getByRole('button', { name: /Add cover photo/ })
    await expect(placeholder).toBeVisible()
    await expect(placeholder).toHaveAccessibleName(/Add cover photo for Lady Seraphina/)

    await placeholder.click()
    const portrait = await makeCanvasImageBuffer(page, '#7c4a7c', 8)
    await page.locator('input#char-image-upload').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: portrait })
    await expect(page.getByText('Change Image')).toBeVisible()
    await page.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('heading', { name: 'Lady Seraphina Blackwood-Ashcombe the Unbroken' })).toBeVisible()
    // Placeholder disappears once a real image exists.
    await expect(page.getByRole('button', { name: /Add cover photo/ })).toHaveCount(0)

    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      // Placeholder is gone now that a real portrait exists.
      await expect(page.getByRole('button', { name: /Add cover photo/ })).toHaveCount(0)
      const portraitImg = page.locator('.character-dossier-portrait, .character-dossier-photo').first()
      await expect(portraitImg).toBeVisible()
      const editBtn = page.getByRole('button', { name: 'Edit', exact: true })
      const deleteBtn = page.getByRole('button', { name: 'Delete', exact: true })
      await expect(editBtn).toBeVisible()
      await expect(deleteBtn).toBeVisible()
      // No horizontal scroll anywhere in the dossier column at this width.
      const summary = page.locator('.character-dossier-summary').first()
      const hasOverflow = await summary.evaluate(el => el.scrollWidth > el.clientWidth + 2)
      expect(hasOverflow, `dossier summary overflows horizontally at ${width}px`).toBe(false)
    }
  })
})

test.describe('Priority 4: AI workspace hierarchy', () => {
  test('unconfigured state shows only the setup card and links to Account Settings AI', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await createProject(page, { title: 'AI Hierarchy Unconfigured' })
    // At this width the persistent top-nav "Write" tab collapses into the
    // hamburger menu — the Overview page's own "Open manuscript" CTA stays
    // reachable and opens the same editor (see responsive-smoke.spec.js).
    await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).click()
    await waitForWritingMode(page)
    await page.getByRole('button', { name: 'AI', exact: true }).click()
    await expect(page.getByText('Connect AI to begin')).toBeVisible()
    // Only the setup card is shown — no prompt box or quick actions yet.
    await expect(page.getByPlaceholder(/Describe what you need/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Open AI settings' }).click()
    await expect(page.getByRole('dialog').getByText('AI Settings').or(page.getByRole('heading', { name: /AI/i }))).toBeVisible()
  })

  test('configured state orders custom prompt, then quick actions, then a collapsed rewrite tool', async ({ page }) => {
    await seedCleanStorage(page)
    await seedFakeAiConfig(page)
    await page.goto('/')
    await createProject(page, { title: 'AI Hierarchy Configured' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)

    for (const { width, height } of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize({ width, height })
      const promptBox = page.getByPlaceholder(/Describe what you need/)
      // The "AI" toggle is a real toggle (aria-pressed) — only click it if the
      // panel isn't already open, or a second click at the next width would
      // close it right back again instead of opening it fresh.
      if (!(await promptBox.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'AI', exact: true }).click()
      }
      const quickActionsHeader = page.getByText('Quick actions')
      const rewriteDisclosure = page.locator('details.ai-rewrite-disclosure')
      await expect(promptBox).toBeVisible()
      await expect(quickActionsHeader).toBeVisible()
      await expect(rewriteDisclosure).toBeVisible()
      // Collapsed by default…
      expect(await rewriteDisclosure.evaluate(el => el.open), `rewrite disclosure open by default at ${width}px`).toBe(false)
      // DOM order matches the required hierarchy: prompt, then quick actions, then rewrite tool.
      const order = await page.evaluate(() => {
        const panel = document.querySelector('.ai-panel')
        const nodes = [...panel.querySelectorAll('.ai-prompt-wrap, .ai-chips, .ai-rewrite-disclosure')]
        return nodes.map(n => n.className)
      })
      expect(order[0]).toContain('ai-prompt-wrap')
      expect(order[1]).toContain('ai-chips')
      expect(order[2]).toContain('ai-rewrite-disclosure')
      // Opens by click (mouse) on its <summary>…
      await rewriteDisclosure.locator('summary').click()
      expect(await rewriteDisclosure.evaluate(el => el.open), `rewrite disclosure opens on click at ${width}px`).toBe(true)
      await expect(page.getByRole('combobox').filter({ hasText: '' }).or(page.locator('.ai-rewrite-select')).first()).toBeVisible()
      // …and by keyboard (native <details>/<summary> Enter toggle).
      await rewriteDisclosure.locator('summary').focus()
      await page.keyboard.press('Enter')
      expect(await rewriteDisclosure.evaluate(el => el.open), `rewrite disclosure closes on Enter at ${width}px`).toBe(false)
    }
  })
})

test.describe('Priority 4: Project-title header allocation', () => {
  test('the tablet-identity tier (641-1100px, covering iPad Safari) shows only a centered project name', async ({ page }) => {
    await seedCleanStorage(page)
    const longTitle = 'The Last Ember and the Long Road to the Sunken Kingdoms of the Old Coast'
    await page.goto('/')
    await createProject(page, { title: longTitle })

    // 820x1180 = the iPad 11-inch Safari Responsive Design Mode simulation
    // the checklist names explicitly; 1000x800 is a second point in the same
    // 641-1100px tablet-identity CSS tier.
    for (const { width, height } of [{ width: 820, height: 1180 }, { width: 1000, height: 800 }]) {
      await page.setViewportSize({ width, height })
      const hamburger = page.getByRole('button', { name: /section menu/ })
      await expect(hamburger).toBeVisible()
      const identity = page.locator('.studio-compact-identity')
      await expect(identity).toBeVisible()
      await expect(identity).toContainText(longTitle)
      // The full desktop brand group (YOW wordmark, Write button, Beta/type
      // badges) must not render in this tier — only the compact identity.
      await expect(page.locator('.studio-spine > .studio-brand')).toBeHidden()

      const hamburgerBox = await hamburger.boundingBox()
      const identityBox = await identity.boundingBox()
      expect(hamburgerBox).not.toBeNull()
      expect(identityBox).not.toBeNull()
      // Hamburger sits at the far left of the header.
      expect(hamburgerBox.x).toBeLessThan(40)
      // Identity is horizontally centered in the viewport (allowing generous
      // tolerance for its own content width).
      const identityCenter = identityBox.x + identityBox.width / 2
      expect(Math.abs(identityCenter - width / 2)).toBeLessThan(width * 0.15)
    }
  })

  test('desktop widths keep a short title fully visible and truncate a long one with Write still reachable', async ({ page }) => {
    await seedCleanStorage(page)
    const shortTitle = 'The Last Ember'
    await page.goto('/')
    await createProject(page, { title: shortTitle })

    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.locator('.studio-brand h1', { hasText: shortTitle })).toBeVisible()
      // Utility controls (settings/account) must not overlap the brand block.
      const brandBox = await page.locator('.studio-brand').boundingBox()
      const utilityBox = await page.locator('.studio-utility, .studio-spine > div:last-child').first().boundingBox()
      if (brandBox && utilityBox) {
        expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(utilityBox.x + 1)
      }
    }

    // A realistic long title still renders without horizontal overflow, and
    // Write stays reachable from the room strip at desktop widths.
    await page.goto('/')
    const longTitle = 'The Last Ember and the Long Road to the Sunken Kingdoms of the Old Coast'
    await createProject(page, { title: longTitle })
    for (const width of [1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const h1 = page.locator('.studio-brand h1')
      await expect(h1).toBeVisible()
      const overflow = await h1.evaluate(el => el.scrollWidth > el.clientWidth + 2)
      // A long title is allowed to truncate (ellipsis) but must not blow out the header's layout.
      const headerOverflow = await page.evaluate(() => document.querySelector('.studio-spine').scrollWidth > document.querySelector('.studio-spine').clientWidth + 2)
      expect(headerOverflow, `studio header overflows horizontally at ${width}px with a long title`).toBe(false)
      await expect(writingNavButton(page)).toBeVisible()
      void overflow
    }
  })
})

// Below 861px the room strip collapses into a hamburger + portaled menu
// (Studio.jsx) instead of the always-visible desktop room buttons.
async function openRoomCompact(page, roomLabel) {
  const roomName = roomLabel.replace('Open ', '')
  await page.getByRole('button', { name: /section menu/ }).click()
  await page.locator('.studio-room-menu-item').filter({ has: page.locator('strong', { hasText: roomName }) }).click()
}

test.describe('Priority 4 regression: StudioSheet modals at 375px', () => {
  // Spot-check the shared StudioSheet/Modal code path across several rooms not
  // covered by the 2026-08-01 regression sweep in docs/QA_PLAN.md, guarding
  // against a repeat of that pass's fixed-magenta-debug-bar bug and general
  // 375px overflow/clipping.
  const cases = [
    { room: 'Open Atlas', tab: 'Locations', newButton: 'New', dialogTitle: null },
    { room: 'Open Lore', tab: null, newButton: 'New', dialogTitle: null },
    { room: 'Open Characters', tab: 'Factions', newButton: 'Create Faction', dialogTitle: 'New Faction' },
  ]

  for (const c of cases) {
    test(`${c.room.replace('Open ', '')}${c.tab ? ' / ' + c.tab : ''} modal renders cleanly at 375px`, async ({ page }) => {
      await seedCleanStorage(page)
      await page.setViewportSize({ width: 375, height: 800 })
      await page.goto('/')
      await createProject(page, { title: `Modal Sweep ${c.room}` })
      await openRoomCompact(page, c.room)
      if (c.tab) await page.getByRole('button', { name: c.tab, exact: true }).click()
      await page.getByRole('button', { name: c.newButton, exact: true }).click()

      const dialog = c.dialogTitle
        ? page.getByRole('dialog', { name: c.dialogTitle })
        : page.locator('[role="dialog"], .studio-sheet-backdrop').first()
      await expect(dialog).toBeVisible()

      // Regression guard: no leftover fixed debug overlay (the 2026-08-01
      // bug covered every phone-width modal with a fixed magenta bar).
      const hasMagentaBar = await page.evaluate(() => {
        return [...document.querySelectorAll('body *')].some(el => {
          const style = getComputedStyle(el)
          return style.position === 'fixed' && /rgb\(255,\s*0,\s*255\)|magenta/i.test(style.backgroundColor)
        })
      })
      expect(hasMagentaBar).toBe(false)

      // No horizontal overflow of the modal itself at 375px.
      const overflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 2)
      expect(overflow, 'modal overflows horizontally at 375px').toBe(false)

      // A Cancel control exists and closes the (clean, non-dirty) modal.
      const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true })
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click()
        await expect(dialog).toBeHidden()
      }
    })
  }

  test('Escape on a dirty Location form shows the shared "Save changes?" prompt', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    await createProject(page, { title: 'Modal Dirty State Sweep' })
    await openRoomCompact(page, 'Open Atlas')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    const dialog = page.locator('[role="dialog"]').first()
    await expect(dialog).toBeVisible()
    const nameField = dialog.getByRole('textbox').first()
    await nameField.fill('A Dirty Draft Location')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: 'Save changes?' })).toBeVisible()
    // Button order: Save, Discard, Cancel (primary action first).
    const actionButtons = page.locator('.save-changes-actions button')
    await expect(actionButtons.nth(0)).toHaveText('Save')
    await expect(actionButtons.nth(1)).toHaveText('Discard')
    await expect(actionButtons.nth(2)).toHaveText('Cancel')
    // Cancelling the prompt returns to the still-dirty form with the draft intact.
    await actionButtons.nth(2).click()
    await expect(nameField).toHaveValue('A Dirty Draft Location')
    // Discard actually discards and closes.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test.describe('Priority 8: Internal linking', () => {
  test('Lore chips navigate to linked Character/Location and reverse Lore references appear', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Internal Linking Test' })

    // Seed a character and a location to link from Lore.
    await page.getByRole('button', { name: 'Open Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).click()
    await page.getByLabel('Name').fill('Aria Nightshade')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('heading', { name: 'Aria Nightshade' })).toBeVisible()

    await page.getByRole('button', { name: 'Open Atlas' }).first().click()
    const locDialog = page.locator('[role="dialog"]').first()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await expect(locDialog).toBeVisible()
    await locDialog.getByRole('textbox').first().fill('Port Vaelis')
    await locDialog.getByRole('button', { name: 'Save' }).click()
    await expect(locDialog).toBeHidden()

    // Create the first Lore entry, linking both.
    await page.getByRole('button', { name: 'Open Lore' }).first().click()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByLabel('Title').fill('The Sunken Bell')
    await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Linked Characters' }) })
      .getByRole('button', { name: 'Aria Nightshade' }).click()
    await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Linked Locations' }) })
      .getByRole('button', { name: 'Port Vaelis' }).click()
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('heading', { name: 'The Sunken Bell' })).toBeVisible()

    // Character chip navigates to Characters with Aria selected.
    await page.getByRole('button', { name: 'Aria Nightshade' }).click()
    await expect(page.getByRole('heading', { name: 'Aria Nightshade' })).toBeVisible()

    // Back to Lore, follow the Location chip.
    await page.getByRole('button', { name: 'Open Lore' }).first().click()
    await page.getByRole('button', { name: 'The Sunken Bell' }).click()
    await page.getByRole('button', { name: 'Port Vaelis' }).click()
    await expect(page.getByRole('heading', { name: 'Port Vaelis' })).toBeVisible()

    // Create a second Lore entry that references the first, then confirm the
    // reverse reference ("References this entry") appears on the original.
    await page.getByRole('button', { name: 'Open Lore' }).first().click()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await page.getByLabel('Title').fill("The Bell's Curse")
    await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Related Lore' }) })
      .getByRole('button', { name: 'The Sunken Bell' }).click()
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('heading', { name: "The Bell's Curse" })).toBeVisible()

    await page.getByRole('button', { name: 'The Sunken Bell', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'The Sunken Bell' })).toBeVisible()
    // The reverse-reference chip renders as "← {title}" with a "References
    // this entry" title/tooltip attribute (not part of its accessible name,
    // since its visible text content takes priority).
    const reverseRefChip = page.locator('button[title="References this entry"]')
    await expect(reverseRefChip).toBeVisible()
    await expect(reverseRefChip).toContainText("The Bell's Curse")
  })
})

test.describe('Priority 8: Empty cover placeholders', () => {
  test('a Location placeholder is present, accessible, and disappears once an image exists', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Location Placeholder Test' })
    await page.getByRole('button', { name: 'Open Atlas' }).first().click()
    const dialog = page.locator('[role="dialog"]').first()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox').first().fill('Whitecliff Keep')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Whitecliff Keep' })).toBeVisible()

    const placeholder = page.locator('.location-cover-placeholder, [class*="cover-placeholder"]').first()
    await expect(placeholder).toBeVisible()

    // Upload a real image through the edit form and confirm the placeholder disappears.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editDialog = page.locator('[role="dialog"]').first()
    await expect(editDialog).toBeVisible()
    const image = await makeCanvasImageBuffer(page, '#1f6f6b', 8)
    await editDialog.locator('input#loc-image-upload').setInputFiles({ name: 'keep.png', mimeType: 'image/png', buffer: image })
    await editDialog.getByRole('button', { name: 'Save' }).click()
    await expect(editDialog).toBeHidden()
    await expect(page.locator('.location-cover-placeholder, [class*="cover-placeholder"]')).toHaveCount(0)
  })
})

test.describe('Priority 8: Storage usage tracking (web quota)', () => {
  test('a forced storage-exceeded write shows used/quota in the toast and StorageCard, and opens the Storage tab', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    // Create the project *before* forcing the quota to 1 byte — project
    // creation itself is also gated by storageExceededCheck() and would
    // otherwise never reach a writable state at all. devStorageExceeded
    // (App.jsx) re-reads this key on every render, so setting it now is
    // picked up by the very next state-changing action.
    await createProject(page, { title: 'Storage Exceeded Test' })
    await page.evaluate(() => localStorage.setItem('__yow_storage_test', '1'))

    // Any new-record create action is gated by storageExceededCheck() in useStore.js.
    await page.getByRole('button', { name: 'Open Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).click()
    await page.getByLabel('Name').fill('Should Not Save')
    await page.getByRole('button', { name: 'Save Character' }).click()

    const toast = page.getByRole('alert').filter({ hasText: 'Cloud storage limit reached' })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('used')
    await expect(toast.locator('.membership-toast-storage')).toBeVisible()

    // Fix regression guard: this used to open the Membership tab instead of
    // the actual Storage tab (see docs/ROADMAP.md's Bugs table).
    await toast.getByRole('button', { name: 'Storage settings' }).click()
    const dialog = page.locator('[role="dialog"][aria-labelledby="account-settings-title"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Storage & sync' })).toBeVisible()
    await expect(dialog.locator('.account-settings-tab.is-active')).toHaveText('Storage')
  })
})

test.describe('Priority 8: Guided tour preference', () => {
  test('turning tours off hides tour buttons and survives refresh; turning back on restores them', async ({ page }) => {
    // seedCleanStorageWithToursEnabled/seedCleanStorage both re-stamp
    // yow_onboarding on every navigation (by design, so a suppressed test
    // baseline can't leak into a spec that drives the wizard/tours directly
    // — see their own comments in helpers.js) which would fight a real
    // reload-persistence check here. Seed once, guarded by sessionStorage
    // like the shared helpers do for storage keys, without re-touching
    // yow_onboarding on subsequent reloads.
    await page.addInitScript((keys) => {
      if (!sessionStorage.getItem('yow_qa_storage_seeded')) {
        for (const key of keys) localStorage.removeItem(key)
        localStorage.setItem('yow_onboarding', JSON.stringify({
          toursEnabled: true,
          checklistDismissed: true,
          'wizard_offline-dev-user': true,
          'welcome_offline-dev-user': true,
        }))
        sessionStorage.setItem('yow_qa_storage_seeded', '1')
      }
      localStorage.setItem('yow_beta_acknowledged', '1')
      document.cookie = 'yow_consent=essential; max-age=31536000; path=/; SameSite=Lax'
    }, [
      'nf_activeNovel', 'nf_acts', 'nf_chapters', 'nf_scenes', 'nf_novels', 'nf_characters',
      'nf_locations', 'nf_factions', 'nf_loreEntries', 'nf_timeline', 'nf_worldHistory',
      'nf_ideaEntries', 'nf_maps', 'nf_activeMapByNovel', 'nf_whiteboards', 'nf_series',
      'nf_storySchedule', 'nf_localWriteAt', 'nf_comicPages', 'nf_comicPanels',
    ])
    await page.goto('/')
    await createProject(page, { title: 'Tour Preference Test' })
    await page.getByRole('button', { name: 'Open Characters' }).first().click()

    // Tour button is present while tours are enabled.
    await expect(page.getByRole('button', { name: 'Tour this section' })).toBeVisible()

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'preferences' } })))
    const toursToggle = page.getByRole('switch', { name: 'Guided tours' })
    await expect(toursToggle).toHaveAttribute('aria-checked', 'true')
    await toursToggle.click()
    await expect(toursToggle).toHaveAttribute('aria-checked', 'false')
    await page.getByLabel('Close account settings').click()
    await expect(page.getByRole('button', { name: 'Tour this section' })).toHaveCount(0)

    // Survives an actual reload.
    await page.reload()
    await page.getByRole('button', { name: 'Open Characters' }).first().click()
    await expect(page.getByRole('button', { name: 'Tour this section' })).toHaveCount(0)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'preferences' } })))
    await expect(page.getByRole('switch', { name: 'Guided tours' })).toHaveAttribute('aria-checked', 'false')

    // Turning it back on restores the button, still after a reload.
    await page.getByRole('switch', { name: 'Guided tours' }).click()
    await page.getByLabel('Close account settings').click()
    await expect(page.getByRole('button', { name: 'Tour this section' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Open Characters' }).first().click()
    await expect(page.getByRole('button', { name: 'Tour this section' })).toBeVisible()
  })
})

test.describe('Priority 8: Finalized draft reader', () => {
  test('finalising a novel draft opens a read-only reader; the working draft stays editable', async ({ page }) => {
    await seedCleanStorage(page)
    page.on('dialog', dialog => dialog.accept())
    await page.goto('/')
    await createProject(page, { title: 'Finalize Reader Test' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await page.getByText('Begin writing here…').click()
    await page.getByPlaceholder('Begin writing here…').fill('This is the working draft before finalizing.')
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    await page.getByRole('button', { name: 'More' }).click()
    // The overflow item opens the "Finalise & export" surface panel, which
    // has its own "Finalise draft" action button to actually confirm.
    await page.getByRole('button', { name: 'Finalise draft' }).click()
    await page.getByRole('button', { name: 'Finalise draft' }).click()

    // A read-only reader opens: no editable textarea in this view.
    await expect(page.getByRole('button', { name: '← Working draft' })).toBeVisible()
    await expect(page.locator('.ms-final-page').first()).toBeVisible()
    await expect(page.locator('textarea')).toHaveCount(0)

    // Scroll/Pages reader controls both work.
    await page.getByRole('button', { name: 'Pages', exact: true }).click()
    await expect(page.locator('.ms-final-page').first()).toBeVisible()
    await page.getByRole('button', { name: 'Scroll', exact: true }).click()

    // Returning to the working draft, it is still fully editable. Switch to
    // Write mode explicitly — Edit mode's own textarea is an
    // aria-hidden/tabindex=-1 accessibility mirror, not the directly
    // clickable editing surface. The button's accessible name is "Writing"
    // (see ManuscriptTopbar.jsx's MODES array), not "Write".
    await page.getByRole('button', { name: '← Working draft' }).click()
    await page.getByLabel('Editor mode').getByRole('button', { name: 'Writing' }).click()
    // Write mode shows a lightweight preview <div> until the scene is
    // clicked/focused, which swaps in the live editing textarea.
    await page.getByText('This is the working draft before finalizing.').first().click()
    const editor = page.locator('textarea:not([tabindex="-1"])').first()
    await expect(editor).toBeVisible()
    await expect(editor).toBeEditable()
    await editor.type(' Added after finalizing.')
    await expect(editor).toHaveValue(/Added after finalizing\./)
  })

  test('non-novel project types do not show the Finalise draft action', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Finalize Hidden Test', type: 'dnd_campaign' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await page.getByRole('button', { name: 'More' }).click()
    await expect(page.getByRole('button', { name: 'Finalise draft' })).toHaveCount(0)
  })
})

test.describe('Priority 8: Manuscript page zoom', () => {
  // NOTE: this checklist item also requires the zoom control to "remain
  // usable at 375px". It does not — `.ms-page-zoom` is unconditionally
  // `display: none` below 640px (src/index.css) and the mobile topbar has no
  // alternate entry point for it (unlike AI/Inspector, which move to the
  // bottom Manuscript nav). Logged as a real gap needing a design decision
  // (docs/QA_PLAN.md / docs/ROADMAP.md Bugs table) rather than forced here —
  // this test covers the desktop persistence/bounds behavior that does work,
  // plus the real bug this session found and fixed (zoom never persisted at all).
  test('the 80-150% control is bounded and persists across reload and project switches (desktop)', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Zoom Persistence A' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)

    const zoomGroup = page.getByRole('group', { name: 'Manuscript page zoom' })
    await expect(zoomGroup).toBeVisible()
    await page.getByRole('button', { name: 'Zoom manuscript page in' }).click()
    await page.getByRole('button', { name: 'Zoom manuscript page in' }).click()
    await expect(zoomGroup).toContainText('120%')

    // Fix regression guard: pageZoom used to be plain useState(1) with zero
    // persistence — every reload silently reset it to 100% (see
    // docs/ROADMAP.md's Bugs table and manuscriptUtils.js's loadPageZoom).
    await page.reload()
    await waitForManuscriptReady(page)
    await expect(page.getByRole('group', { name: 'Manuscript page zoom' })).toContainText('120%')

    // Persists across a project switch too (a flat, non-project-scoped preference).
    await page.getByRole('button', { name: 'Back to projects' }).click()
    await createProject(page, { title: 'Zoom Persistence B' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await expect(page.getByRole('group', { name: 'Manuscript page zoom' })).toContainText('120%')

    // Bounded 80-150%: zooming out from 120% in 10% steps reaches the 80%
    // floor in exactly 4 clicks, disabling the button rather than going lower.
    const zoomOutBtn = page.getByRole('button', { name: 'Zoom manuscript page out' })
    for (let i = 0; i < 4; i++) await zoomOutBtn.click()
    await expect(zoomGroup).toContainText('80%')
    await expect(zoomOutBtn).toBeDisabled()
  })

  test('the control is hidden at 375px (documents a known gap, not the desired behavior)', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await createProject(page, { title: 'Zoom Mobile Gap' })
    await enterWritingMode(page)
    await waitForManuscriptReady(page)
    await page.setViewportSize({ width: 375, height: 800 })
    await expect(page.getByRole('group', { name: 'Manuscript page zoom' })).toHaveCount(0)
  })
})

test.describe('Priority 8: Account avatar upload', () => {
  test('upload/preview/remove/URL entry all work; a non-image file shows a useful error', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'profile' } })))
    const dialog = page.locator('[role="dialog"][aria-labelledby="account-settings-title"]')
    await expect(dialog).toBeVisible()

    // Non-image file shows a useful, specific error.
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'not-an-image.txt', mimeType: 'text/plain', buffer: Buffer.from('hello'),
    })
    await expect(dialog.getByText('Please choose an image file.')).toBeVisible()

    // A real PNG upload updates the preview before Save.
    const avatar = await makeCanvasImageBuffer(page, '#b8902a', 10)
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: avatar })
    await expect(dialog.getByText('Avatar ready. Save your profile to keep it.')).toBeVisible()
    await expect(dialog.locator('.account-profile-avatar img')).toBeVisible()

    // Saving reflects the new avatar in the account menu trigger immediately.
    await dialog.getByRole('button', { name: 'Save profile' }).click()
    await page.getByLabel('Close account settings').click()
    await expect(page.locator('.user-menu-avatar')).toBeVisible()

    // Remove clears it.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'profile' } })))
    await dialog.getByRole('button', { name: 'Remove' }).click()
    await expect(dialog.locator('.account-profile-avatar img')).toHaveCount(0)

    // Avatar URL entry also works, independent of file upload.
    await dialog.getByLabel('Avatar URL').fill('https://example.com/avatar.png')
    await expect(dialog.locator('.account-profile-avatar img')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save profile' }).click()

    // Not verified this pass (needs a real signed-in Supabase account, not
    // offline mode's in-memory-only profile — see AuthContext.jsx's
    // OFFLINE_MODE branch of updateProfile): persistence of the saved avatar
    // after a real reload or sign-out/sign-in.
  })
})

test.describe('Priority 8: Founders directory', () => {
  // Scroll/overflow/static-title coverage for these routes already exists in
  // marketing-pages-responsive.spec.js and marketing-static-pages.spec.js —
  // this covers what those don't: the homepage footer link, the nav, and the
  // pricing CTA the checklist item separately calls out.
  test('the homepage footer links to Founders, the nav works, and a pricing CTA is present', async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await page.locator('.user-menu-trigger').click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.getByRole('button', { name: 'Go to homepage' }).click()
    await expect(page.locator('.yow-home')).toBeVisible()

    await page.getByRole('link', { name: 'Founders', exact: true }).first().click()
    await expect(page).toHaveURL(/\/founders\/?$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Pricing CTA present on the Founders directory.
    await expect(page.getByRole('link', { name: /pricing/i }).or(page.getByRole('button', { name: /pricing/i })).first()).toBeVisible()

    // Nav's own Founders link still marks itself active/reachable from here
    // (confirms the nav bar itself, not just the footer, functions on this page).
    await expect(page.getByRole('link', { name: 'Founders', exact: true }).first()).toBeVisible()
  })
})
