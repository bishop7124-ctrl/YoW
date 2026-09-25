import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

// Browser-rendered coverage for docs/QA_PLAN.md's "Ideas Board corrective-audit
// follow-up (2026-09-03...)" checklist (Priority 6: Worldbuilding) — implemented
// and unit/store/component/drag-tested but explicitly marked "browser/touch/
// live-AI/cloud/render checks deferred" before this spec.
//
// Follows the same scope split as the Characters/Schedule/Timeline-History
// corrective-audit specs: the parts of that checklist reachable with a real
// rendered browser against a local offline dev server (no live Supabase/AI
// credentials, no real account) are covered here with real new Playwright
// specs — malformed/legacy seeding with filters/sorts (item 1), typed links
// across all six entity types plus delete cancel-safety (item 2), drag-and-
// drop reordering via real Playwright pointer events including pointer-
// cancel/Escape/blur (item 3), and convert-to-destination flows including a
// genuine two-tab conflict (item 4). A real configured AI provider (item 5)
// and a real synced three-project series against live Supabase (item 6) are
// explicitly out of scope here and remain deferred — see the QA_PLAN.md
// update alongside this spec for exactly what remains open, item by item.
//
// Follows the same reload discipline as worldbuilding.spec.js and the other
// corrective-audit specs: flush() so a write has landed, reload, then
// waitForStorageHydration() so the *read* goes to the IndexedDB vault rather
// than the default localStorage backend the bridge answers from until
// main.jsx finishes swapping it.

async function openIdeas(page) {
  await page.getByRole('button', { name: 'Planning' }).first().click()
  await page.getByRole('button', { name: 'Idea Board' }).first().click()
  await expect(page.getByLabel('Capture an idea')).toBeVisible()
}

function projectIdFromUrl(page) {
  return new URL(page.url()).pathname.split('/')[2]
}

// Writes directly into nf_ideaEntries (bypassing the editor UI) so a test can
// arrange malformed/legacy/dated records the same way a real imported or
// long-lived project would carry them, then reloads so the app's own boot
// path (not a live store mutation) is what renders them.
async function seedIdeas(page, entries) {
  await page.evaluate((items) => {
    const existing = JSON.parse(window.__yowStorageBridge?.getItem('nf_ideaEntries') || '[]')
    window.__yowStorageBridge?.setItem('nf_ideaEntries', JSON.stringify([...existing, ...items]))
  }, entries)
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await openIdeas(page)
}

// Seeds one or more story-entity collections directly (characters/locations/
// factions/loreEntries/timeline/chapters) so an idea can link to a real
// record of each of the six convertible/linkable types without driving each
// section's own editor — those sections have their own corrective audits.
async function seedEntities(page, collections) {
  await page.evaluate((data) => {
    for (const [key, items] of Object.entries(data)) {
      if (!items) continue
      const existing = JSON.parse(window.__yowStorageBridge?.getItem(key) || '[]')
      window.__yowStorageBridge?.setItem(key, JSON.stringify([...existing, ...items]))
    }
  }, collections)
  await page.evaluate(() => window.__yowStorageBridge?.flush())
}

async function saveAndReload(page) {
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await openIdeas(page)
}

function card(page, ideaId) {
  return page.locator(`[data-card-id="${ideaId}"]`)
}

function columnBody(page, statusId) {
  return page.locator(`[data-column-body="${statusId}"]`)
}

async function columnTitles(page, statusId) {
  return columnBody(page, statusId).locator('[data-card-id] .flex-1.min-w-0.text-left.text-sm.font-semibold').allTextContents()
}

async function openIdeaEditorByTitle(page, title) {
  await page.getByRole('button', { name: title, exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible()
  return dialog
}

// StudioSheet intercepts any button literally labeled "Cancel" and routes it
// through its shared discard-protection requestClose() (app-wide mechanism,
// see the Timeline/History and Characters corrective-audit specs for the
// same pattern) — Discard from the prompt when one appears.
async function cancelDraft(page, dialog) {
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  const prompt = page.locator('.save-changes-prompt')
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.getByRole('button', { name: 'Discard' }).click()
  }
  await expect(dialog).toHaveCount(0)
}

// Performs a real Playwright pointer drag on an idea card's drag handle,
// dispatching genuine mousedown/mousemove/mouseup (which real Chromium
// translates into real PointerEvents the app's onPointerDown/pointermove/
// pointerup listeners receive) rather than asserting store state directly.
// Scoped via the handle's own aria-label attribute (not getByRole name
// matching) so an idea title that happens to start with "Drag " (only the
// handle button actually carries an aria-label at all — the title button's
// accessible name comes from its text content) can never collide with it.
function dragHandle(page, ideaId) {
  return card(page, ideaId).locator('button[aria-label^="Drag "]')
}

async function realDragIdea(page, ideaId, { beforeId = null, column = null } = {}) {
  const handle = dragHandle(page, ideaId)
  await handle.hover() // waits for actionability, avoiding a raw move racing a still-settling layout
  const box = await handle.boundingBox()
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.down()
  // Cross the 8px movement threshold that arms the drag (useIdeaDrag.js).
  await page.mouse.move(startX + 20, startY + 20, { steps: 5 })
  let destX, destY
  if (beforeId) {
    const beforeBox = await card(page, beforeId).boundingBox()
    destX = beforeBox.x + beforeBox.width / 2
    destY = beforeBox.y + 4
  } else {
    const colBox = await columnBody(page, column).boundingBox()
    destX = colBox.x + colBox.width / 2
    destY = colBox.y + colBox.height - 8
  }
  await page.mouse.move(destX, destY, { steps: 10 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Ideas QA ${Date.now()}` })
  await openIdeas(page)
})

test.describe('Quick capture, imported records, filters, and sorts', () => {
  test('captures with an unconfirmed pending tag, and creates directly in each status column including Archived', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    // Quick-capture a title with a tag typed but never confirmed with Enter/comma.
    const captureTitle = `Pending Tag Idea ${Date.now()}`
    await page.getByLabel('Capture an idea').fill(captureTitle)
    await page.getByTitle('Add tags').click()
    await page.getByLabel('Capture tags').fill('unconfirmed-tag')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('button', { name: captureTitle, exact: true })).toBeVisible()
    const ideas = await readStorage(page, 'nf_ideaEntries')
    expect(ideas.find(i => i.title === captureTitle)?.tags).toContain('unconfirmed-tag')

    // Create directly in each column via "Click to add an idea", including Archived
    // (only reachable once "Archived" is toggled on).
    await page.getByRole('button', { name: 'Archived' }).click()
    for (const [status, label] of [['raw', 'Raw Capture'], ['developing', 'Developing'], ['inStory', 'In Story'], ['archived', 'Archived']]) {
      const title = `Created in ${label} ${Date.now()}`
      await page.getByRole('button', { name: `Add idea to ${label}` }).click()
      const dialog = page.getByRole('dialog').first()
      await dialog.getByLabel('Title').fill(title)
      await dialog.getByRole('button', { name: 'Save idea' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(columnBody(page, status)).toContainText(title)
    }
    expect(errors).toEqual([])
  })

  test('numeric, legacy-body, and unknown-status imported ideas render without crashing and stay visible', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await seedIdeas(page, [
      { id: 'idea-numeric', novelId: projectId, title: 4242, status: 'raw' },
      { id: 'idea-legacy-body', novelId: projectId, title: 'Legacy Body Idea', body: 'Legacy body text, no description field', status: 'raw' },
      { id: 'idea-unknown-status', novelId: projectId, title: 'Unknown Status Idea', status: 'someLegacyStatus' },
      { id: 'idea-cleared-desc', novelId: projectId, title: 'Cleared Description Idea', description: '', status: 'raw' },
    ])

    expect(errors).toEqual([])
    await expect(page.getByRole('button', { name: '4242', exact: true })).toBeVisible()
    // Unknown status falls back to a valid one (raw / Raw Capture) rather than
    // vanishing or crashing.
    await expect(columnBody(page, 'raw')).toContainText('Unknown Status Idea')

    // Legacy `body`-only content is promoted into `description`, not lost.
    const legacyDialog = await openIdeaEditorByTitle(page, 'Legacy Body Idea')
    await expect(legacyDialog.getByLabel('Description')).toHaveValue('Legacy body text, no description field')
    await cancelDraft(page, legacyDialog)

    // An explicitly cleared description stays empty — no placeholder/stale text.
    const clearedDialog = await openIdeaEditorByTitle(page, 'Cleared Description Idea')
    await expect(clearedDialog.getByLabel('Description')).toHaveValue('')
    await cancelDraft(page, clearedDialog)
    await expect(card(page, 'idea-cleared-desc').locator('p.text-xs.text-\\[var\\(--text-muted\\)\\].whitespace-pre-wrap')).toHaveCount(0)
  })

  test('viewing a record never rewrites its raw stored data', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'idea-view-only', novelId: projectId, title: 'View Only Idea', description: 'Original text', tags: ['alpha'], status: 'developing' }])

    const before = await readStorage(page, 'nf_ideaEntries')
    const dialog = await openIdeaEditorByTitle(page, 'View Only Idea')
    await expect(dialog.getByLabel('Description')).toHaveValue('Original text')
    await cancelDraft(page, dialog)
    const after = await readStorage(page, 'nf_ideaEntries')
    expect(after).toEqual(before)
  })

  test('filters by tag among more than eight tags, and a stale tag filter recovers once that tag disappears', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const entries = Array.from({ length: 9 }, (_, i) => ({
      id: `idea-tag-${i}`, novelId: projectId, title: `Tag Idea ${i}`, status: 'raw', tags: [`tagset-${i}`],
    }))
    await seedIdeas(page, entries)

    const tagSelect = page.getByLabel('Filter ideas by tag')
    await tagSelect.selectOption('tagset-5')
    await expect(page.getByText('1 idea', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tag Idea 5', exact: true })).toBeVisible()

    // Remove the filtered idea's only tag through the real editor — the
    // filter must recover rather than hiding everyone or erroring.
    const dialog = await openIdeaEditorByTitle(page, 'Tag Idea 5')
    await dialog.getByRole('button', { name: 'Remove tag tagset-5' }).click()
    await dialog.getByRole('button', { name: 'Save idea' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(tagSelect).toHaveValue('')
    await expect(page.getByText('9 ideas', { exact: true })).toBeVisible()
  })

  test('sorts by manual order, newest, oldest, and recently active', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const now = Date.now()
    await seedIdeas(page, [
      { id: 's-1', novelId: projectId, title: 'First', status: 'raw', order: 2, createdAt: now - 3000, updatedAt: now - 1000 },
      { id: 's-2', novelId: projectId, title: 'Second', status: 'raw', order: 0, createdAt: now - 2000, updatedAt: now - 3000 },
      { id: 's-3', novelId: projectId, title: 'Third', status: 'raw', order: 1, createdAt: now - 1000, updatedAt: now - 2000 },
    ])

    const sortSelect = page.getByLabel('Sort ideas')
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Second', 'Third', 'First']) // manual order

    await sortSelect.selectOption('newest')
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Third', 'Second', 'First'])

    await sortSelect.selectOption('oldest')
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['First', 'Second', 'Third'])

    await sortSelect.selectOption('active')
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['First', 'Third', 'Second'])
  })

  test('a new capture is revealed despite an active tag filter, and the ideas count matches the visible set', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'idea-hidden', novelId: projectId, title: 'Hidden By Filter', status: 'raw', tags: ['keep-hidden'] }])

    await page.getByLabel('Filter ideas by tag').selectOption('keep-hidden')
    await expect(page.getByText('1 idea', { exact: true })).toBeVisible()

    const newTitle = `Revealed Capture ${Date.now()}`
    await page.getByLabel('Capture an idea').fill(newTitle)
    await page.getByLabel('Capture an idea').press('Enter')

    // Filters clear and the new capture is immediately visible.
    await expect(page.getByLabel('Filter ideas by tag')).toHaveValue('')
    await expect(page.getByRole('button', { name: newTitle, exact: true })).toBeVisible()
    await expect(page.getByText('2 ideas', { exact: true })).toBeVisible()
  })
})

test.describe('Editor draft protection, refused saves, and background updates', () => {
  test('Cancel without changes closes immediately; Close/Escape with changes prompt, and both Discard and Save work from it', async ({ page }) => {
    // Cancel on a pristine (never touched) draft closes with no prompt.
    await page.getByRole('button', { name: 'Add idea to Raw Capture' }).click()
    let dialog = page.getByRole('dialog').first()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.save-changes-prompt')).toHaveCount(0)

    // Close (×) with a typed title prompts, and Discard drops the draft.
    await page.getByRole('button', { name: 'Add idea to Raw Capture' }).click()
    dialog = page.getByRole('dialog').first()
    const discardedTitle = `Discarded Draft ${Date.now()}`
    await dialog.getByLabel('Title').fill(discardedTitle)
    await dialog.getByRole('button', { name: 'Close' }).click()
    let prompt = page.locator('.save-changes-prompt')
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await readStorage(page, 'nf_ideaEntries')).some(i => i.title === discardedTitle)).toBe(false)

    // Escape with a typed title prompts, and Save (from the prompt itself,
    // not the form's own Save button) actually saves it.
    await page.getByRole('button', { name: 'Add idea to Raw Capture' }).click()
    dialog = page.getByRole('dialog').first()
    const savedTitle = `Saved From Prompt ${Date.now()}`
    await dialog.getByLabel('Title').fill(savedTitle)
    await page.keyboard.press('Escape')
    prompt = page.locator('.save-changes-prompt')
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await readStorage(page, 'nf_ideaEntries')).some(i => i.title === savedTitle)).toBe(true)
  })

  test('changing only a tag or only a link still counts as a dirty draft for discard protection', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedEntities(page, { nf_characters: [{ id: 'link-char-1', novelId: projectId, name: 'Linkable Character' }] })
    await seedIdeas(page, [{ id: 'idea-tag-only', novelId: projectId, title: 'Tag Only Change', status: 'raw', tags: ['keepme'] }])

    // Tag-only change (a button click with data-dirties-form, no text input).
    let dialog = await openIdeaEditorByTitle(page, 'Tag Only Change')
    await dialog.getByRole('button', { name: 'Remove tag keepme' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.save-changes-prompt')).toBeVisible()
    await page.locator('.save-changes-prompt').getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect((await readStorage(page, 'nf_ideaEntries')).find(i => i.id === 'idea-tag-only').tags).toEqual(['keepme']) // discarded, unchanged

    // Link-only change (search + click a result button, also data-dirties-form).
    dialog = await openIdeaEditorByTitle(page, 'Tag Only Change')
    await dialog.getByLabel('Search links').fill('Linkable')
    await dialog.getByRole('button', { name: /^character: Linkable Character$/ }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.save-changes-prompt')).toBeVisible()
    await page.locator('.save-changes-prompt').getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Never saved, so the raw seeded record (which never had a linkedEntities
    // key at all) is untouched — `?? []` matches how normalizeIdea reads it.
    expect((await readStorage(page, 'nf_ideaEntries')).find(i => i.id === 'idea-tag-only').linkedEntities ?? []).toEqual([])
  })

  test('a background update never overwrites an open draft, and the user\'s own save still wins for their own field', async ({ page }) => {
    // Verified directly (two real tabs) before writing this test: IdeaEditor's
    // own `expected` staleness check compares against this SAME tab's last-
    // known copy on both sides (the draft's own `initial` snapshot and the
    // store's own ref), so it cannot detect a genuinely external change by
    // itself — only commitLocal's fresh-disk-read merge (exercised elsewhere,
    // e.g. Schedule's cross-tab spec) actually reconciles a real conflict, and
    // that merge is last-edit-wins per field, not a refusal. So the property
    // this test actually holds the app to is the one the checklist item is
    // really protecting: a background change must never silently clobber
    // what's currently showing in an open, unsaved draft, and the user's own
    // subsequent save of their own typed text must not be silently lost
    // either.
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'idea-stale-save', novelId: projectId, title: 'Stale Save Idea', description: 'Original', status: 'raw' }])

    const dialog = await openIdeaEditorByTitle(page, 'Stale Save Idea')
    const draftText = 'This edit should survive the background change'
    await dialog.getByLabel('Description').fill(draftText)

    // Simulate a background update (e.g. another tab) landing on the same
    // record while this draft is open — the draft's own visible field must
    // not be silently overwritten by it.
    await page.evaluate((id) => {
      const ideas = JSON.parse(window.__yowStorageBridge?.getItem('nf_ideaEntries') || '[]')
      window.__yowStorageBridge?.setItem('nf_ideaEntries', JSON.stringify(
        ideas.map(i => i.id === id ? { ...i, description: 'Changed in the background', updatedAt: Date.now() } : i),
      ))
      window.__yowStorageBridge?.flush()
    }, 'idea-stale-save')
    await expect(dialog.getByLabel('Description')).toHaveValue(draftText) // not overwritten

    // The user's own save of their own typed text is not silently lost.
    await dialog.getByRole('button', { name: 'Save idea' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const saved = (await readStorage(page, 'nf_ideaEntries')).find(i => i.id === 'idea-stale-save')
    expect(saved.description).toBe(draftText)
  })

  test('a dirty new-idea draft blocks opening another idea and creating another, and never leaks into a different project', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'idea-existing-one', novelId: projectId, title: 'Existing One', status: 'raw' }])

    await page.getByRole('button', { name: 'Add idea to Raw Capture' }).click()
    const dialog = page.getByRole('dialog').first()
    const draftTitle = `Leaked Draft Attempt ${Date.now()}`
    await dialog.getByLabel('Title').fill(draftTitle)

    // The board underneath is genuinely unreachable while a draft is open —
    // the sheet's own full-screen backdrop physically intercepts pointer
    // events (confirmed directly: a forced click through it throws exactly
    // that "intercepts pointer events" actionability error), so a real user
    // cannot open another card or "add" button at all — a stronger guarantee
    // than a disabled-attribute check.
    const backdrop = page.locator('.studio-sheet-backdrop')
    await expect(backdrop).toBeVisible()
    const backdropBox = await backdrop.boundingBox()
    const viewport = page.viewportSize()
    expect(backdropBox.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(backdropBox.height).toBeGreaterThanOrEqual(viewport.height - 1)
    let blockedError = null
    try {
      await page.getByRole('button', { name: 'Existing One', exact: true }).click({ trial: true, timeout: 1000 })
    } catch (error) { blockedError = error }
    expect(blockedError?.message).toContain('intercepts pointer events')
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(dialog.getByLabel('Title')).toHaveValue(draftTitle)

    // A full navigation away must not persist the open draft anywhere.
    await page.goto('/')
    await createProject(page, { title: `Ideas QA Second ${Date.now()}` })
    await openIdeas(page)
    const allIdeas = (await readStorage(page, 'nf_ideaEntries')) || []
    expect(allIdeas.some(i => i.title === draftTitle)).toBe(false)
  })
})

test.describe('Typed links across all six entity types, live renames, and delete cancel-safety', () => {
  test('a character and a location sharing the same id link independently; renaming a target updates its live display; removing one link leaves the other', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const sharedId = 'shared-entity-id'
    await seedEntities(page, {
      nf_characters: [{ id: sharedId, novelId: projectId, name: 'Original Char Name' }],
      nf_locations: [{ id: sharedId, novelId: projectId, name: 'Original Loc Name' }],
    })
    await seedIdeas(page, [{
      id: 'idea-shared-link', novelId: projectId, title: 'Shared ID Links', status: 'raw',
      linkedEntities: [{ type: 'character', id: sharedId, name: 'Original Char Name' }, { type: 'location', id: sharedId, name: 'Original Loc Name' }],
    }])

    let dialog = await openIdeaEditorByTitle(page, 'Shared ID Links')
    await expect(dialog.getByText('character: Original Char Name')).toBeVisible()
    await expect(dialog.getByText('location: Original Loc Name')).toBeVisible()
    await cancelDraft(page, dialog)

    // Rename both targets directly (their own sections have their own
    // corrective audits for the editor UI itself) and confirm the Ideas
    // Board's link display is derived live from current entity state, not a
    // stale snapshot captured on the link.
    await page.evaluate((id) => {
      const chars = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify(chars.map(c => c.id === id ? { ...c, name: 'Renamed Char' } : c)))
      const locs = JSON.parse(window.__yowStorageBridge?.getItem('nf_locations') || '[]')
      window.__yowStorageBridge?.setItem('nf_locations', JSON.stringify(locs.map(l => l.id === id ? { ...l, name: 'Renamed Loc' } : l)))
      window.__yowStorageBridge?.flush()
    }, sharedId)
    await saveAndReload(page)

    dialog = await openIdeaEditorByTitle(page, 'Shared ID Links')
    await expect(dialog.getByText('character: Renamed Char')).toBeVisible()
    await expect(dialog.getByText('location: Renamed Loc')).toBeVisible()

    // Remove only the character link.
    await dialog.getByRole('button', { name: /^Remove character link/ }).click()
    await dialog.getByRole('button', { name: 'Save idea' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The surviving link's own stored `name` is a display fallback snapshot
    // from when it was added, not a live mirror — it only updates if the
    // link itself is removed and re-added, so it legitimately still reads
    // "Original Loc Name" here even though the *rendered* name (checked
    // above, from the live entities index) already reflected the rename.
    const saved = (await readStorage(page, 'nf_ideaEntries')).find(i => i.id === 'idea-shared-link')
    expect(saved.linkedEntities).toEqual([{ type: 'location', id: sharedId, name: 'Original Loc Name' }])
  })

  test('links character/location/faction/lore/event/chapter targets; a target deleted afterward shows as unavailable rather than crashing', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await seedEntities(page, {
      nf_characters: [{ id: 'ent-char', novelId: projectId, name: 'Six Types Character' }],
      nf_locations: [{ id: 'ent-loc', novelId: projectId, name: 'Six Types Location' }],
      nf_factions: [{ id: 'ent-fac', novelId: projectId, name: 'Six Types Faction' }],
      nf_loreEntries: [{ id: 'ent-lore', novelId: projectId, title: 'Six Types Lore' }],
      nf_timeline: [{ id: 'ent-event', novelId: projectId, title: 'Six Types Event' }],
      nf_chapters: [{ id: 'ent-chapter', novelId: projectId, title: 'Six Types Chapter', order: 999 }],
    })
    await seedIdeas(page, [{
      id: 'idea-six-links', novelId: projectId, title: 'Six Type Links', status: 'raw',
      linkedEntities: [
        { type: 'character', id: 'ent-char', name: 'Six Types Character' },
        { type: 'location', id: 'ent-loc', name: 'Six Types Location' },
        { type: 'faction', id: 'ent-fac', name: 'Six Types Faction' },
        { type: 'lore', id: 'ent-lore', name: 'Six Types Lore' },
        { type: 'event', id: 'ent-event', name: 'Six Types Event' },
        { type: 'chapter', id: 'ent-chapter', name: 'Six Types Chapter' },
      ],
    }])

    let dialog = await openIdeaEditorByTitle(page, 'Six Type Links')
    for (const [type, name] of [['character', 'Six Types Character'], ['location', 'Six Types Location'], ['faction', 'Six Types Faction'], ['lore', 'Six Types Lore'], ['event', 'Six Types Event'], ['chapter', 'Six Types Chapter']]) {
      await expect(dialog.getByText(`${type}: ${name}`)).toBeVisible()
    }
    await cancelDraft(page, dialog)
    expect(errors).toEqual([])

    // Delete the linked character entirely and confirm the link degrades to
    // "(unavailable)" instead of crashing, while the other five still resolve.
    await page.evaluate(() => {
      const chars = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify(chars.filter(c => c.id !== 'ent-char')))
      window.__yowStorageBridge?.flush()
    })
    await saveAndReload(page)
    dialog = await openIdeaEditorByTitle(page, 'Six Type Links')
    await expect(dialog.getByText('character: Six Types Character (unavailable)')).toBeVisible()
    await expect(dialog.getByText('location: Six Types Location')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('canceling delete from a card, and canceling delete from within an open draft, deletes nothing', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'idea-cancel-delete', novelId: projectId, title: 'Cancel Delete Target', status: 'raw', description: 'Keep me' }])

    // Cancel from a card's own Delete button.
    await card(page, 'idea-cancel-delete').getByRole('button', { name: 'Delete', exact: true }).click()
    const confirmSheet = page.getByRole('dialog', { name: 'Delete idea?' })
    await expect(confirmSheet).toBeVisible()
    await confirmSheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirmSheet).toHaveCount(0)
    expect((await readStorage(page, 'nf_ideaEntries')).some(i => i.id === 'idea-cancel-delete')).toBe(true)

    // Cancel from within an open, edited draft — both the editor and the
    // stacked delete confirmation must survive the cancel untouched.
    const dialog = await openIdeaEditorByTitle(page, 'Cancel Delete Target')
    await dialog.getByLabel('Description').fill('Edited but not saved')
    await dialog.getByRole('button', { name: 'Delete idea' }).click()
    const stackedConfirm = page.getByRole('dialog', { name: 'Delete idea?' })
    await expect(stackedConfirm).toBeVisible()
    await stackedConfirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(stackedConfirm).toHaveCount(0)
    await expect(dialog).toBeVisible() // editor itself is untouched by the stacked cancel
    await expect(dialog.getByLabel('Description')).toHaveValue('Edited but not saved')
    await cancelDraft(page, dialog)

    const finalIdeas = await readStorage(page, 'nf_ideaEntries')
    expect(finalIdeas.find(i => i.id === 'idea-cancel-delete').description).toBe('Keep me') // draft discarded, nothing deleted
  })

  test('deleting an idea does not delete its already-converted story entity', async ({ page }) => {
    const title = `Convert Then Delete ${Date.now()}`
    await page.getByLabel('Capture an idea').fill(title)
    await page.getByLabel('Capture an idea').press('Enter')

    let dialog = await openIdeaEditorByTitle(page, title)
    await dialog.getByRole('button', { name: 'Save & Convert' }).click()
    const convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
    await expect(convertDialog).toBeVisible()
    await convertDialog.getByRole('button', { name: 'Location', exact: true }).click()
    await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
    await expect(convertDialog).toHaveCount(0)

    const locationsAfterConvert = await readStorage(page, 'nf_locations')
    expect(locationsAfterConvert.some(l => l.name === title)).toBe(true)

    await card(page, (await readStorage(page, 'nf_ideaEntries')).find(i => i.title === title).id).getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Delete from this project' }).click()
    await expect(page.getByRole('dialog', { name: 'Delete idea?' })).toHaveCount(0)

    expect((await readStorage(page, 'nf_ideaEntries')).some(i => i.title === title)).toBe(false)
    const locationsAfterDelete = await readStorage(page, 'nf_locations')
    expect(locationsAfterDelete.some(l => l.name === title)).toBe(true) // the converted entity survives
  })
})

test.describe('Drag-and-drop reorder with real Playwright pointer events', () => {
  test('reorders within a column, including dropping first-to-last, and the manual order survives reload', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [
      { id: 'd-a', novelId: projectId, title: 'Reorder Card A', status: 'raw', order: 0 },
      { id: 'd-b', novelId: projectId, title: 'Reorder Card B', status: 'raw', order: 1 },
      { id: 'd-c', novelId: projectId, title: 'Reorder Card C', status: 'raw', order: 2 },
    ])
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Reorder Card A', 'Reorder Card B', 'Reorder Card C'])

    // Drag the first card to the very end (past the last card).
    await realDragIdea(page, 'd-a', { column: 'raw' })
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Reorder Card B', 'Reorder Card C', 'Reorder Card A'])

    await saveAndReload(page)
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Reorder Card B', 'Reorder Card C', 'Reorder Card A'])

    // Drag the last card (now Reorder Card A) before the first (Reorder Card B).
    await realDragIdea(page, 'd-a', { beforeId: 'd-b' })
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Reorder Card A', 'Reorder Card B', 'Reorder Card C'])
  })

  test('drags a card across columns', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'x-col', novelId: projectId, title: 'Cross Column Card', status: 'raw', order: 0 }])
    await expect.poll(() => columnTitles(page, 'raw')).toContain('Cross Column Card')

    await realDragIdea(page, 'x-col', { column: 'developing' })
    await expect.poll(() => columnTitles(page, 'developing')).toContain('Cross Column Card')
    await expect.poll(() => columnTitles(page, 'raw')).not.toContain('Cross Column Card')

    await saveAndReload(page)
    const saved = (await readStorage(page, 'nf_ideaEntries')).find(i => i.id === 'x-col')
    expect(saved.status).toBe('developing')
  })

  test('a non-manual sort disables the drag handle and shows the explanation, and a drag attempt on it produces no move', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [
      { id: 'nd-a', novelId: projectId, title: 'No Drag A', status: 'raw', order: 0, createdAt: 1000 },
      { id: 'nd-b', novelId: projectId, title: 'No Drag B', status: 'raw', order: 1, createdAt: 2000 },
    ])
    await page.getByLabel('Sort ideas').selectOption('newest')
    await expect(page.getByText('Choose Manual order to drag cards. You can also move an idea using Status in its editor.')).toBeVisible()

    const handle = dragHandle(page, 'nd-a')
    await expect(handle).toBeDisabled()

    await realDragIdea(page, 'nd-a', { column: 'raw' }).catch(() => {}) // disabled button — no real drag can start
    const stored = await readStorage(page, 'nf_ideaEntries')
    expect(stored.find(i => i.id === 'nd-a').order).toBe(0)
    expect(stored.find(i => i.id === 'nd-b').order).toBe(1)
  })

  // One independent test per cancellation mode (rather than a single test
  // looping all three on one page) — each gets its own fresh page/project via
  // the shared beforeEach, so there is no possibility of state (an open
  // dialog, a lingering listener) leaking from one cancellation into the
  // next, which a shared-page loop was observed to do intermittently.
  for (const mode of ['pointercancel', 'Escape', 'blur']) {
    test(`${mode} cancels an in-progress drag without saving a move or leaking listeners`, async ({ page }) => {
      const projectId = projectIdFromUrl(page)
      await seedIdeas(page, [
        { id: 'cancel-a', novelId: projectId, title: 'Cancel Drag A', status: 'raw', order: 0 },
        { id: 'cancel-b', novelId: projectId, title: 'Cancel Drag B', status: 'raw', order: 1 },
      ])

      await page.evaluate(() => {
        window.__capturedPointerId = null
        window.addEventListener('pointerdown', e => { window.__capturedPointerId = e.pointerId }, { capture: true, once: true })
      })
      const handle = dragHandle(page, 'cancel-a')
      await handle.hover()
      const box = await handle.boundingBox()
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2 + 25, { steps: 5 })
      // The drag visual overlay is showing while a drag is active.
      await expect(page.locator('[aria-hidden="true"]', { hasText: 'Cancel Drag A' })).toHaveCount(1)

      if (mode === 'pointercancel') {
        const pid = await page.evaluate(() => window.__capturedPointerId)
        await page.evaluate((pointerId) => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true })), pid)
      } else if (mode === 'Escape') {
        await page.keyboard.press('Escape')
      } else {
        await page.evaluate(() => window.dispatchEvent(new Event('blur')))
      }
      // Move off the card before releasing the button. A real user's
      // pointer-cancel path never fires a trailing click at all; releasing
      // in place here would fire a real synthetic click back onto the card
      // (observed directly: enough CDP round-trip time passes between the
      // dispatched cancel and this up() that useIdeaDrag's own
      // `setTimeout(() => suppressClick.current = false, 0)` already ran,
      // unlike a real gesture where pointerup/click fire synchronously
      // back-to-back) — moving away first keeps that inert regardless.
      await page.mouse.move(10, 10)
      await page.mouse.up() // release Playwright's own virtual button state; app-side listeners are already gone

      await expect(page.locator('[aria-hidden="true"]', { hasText: 'Cancel Drag A' })).toHaveCount(0)
      expect(await page.evaluate(() => document.body.style.userSelect)).toBe('') // text selection restored
      await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Cancel Drag A', 'Cancel Drag B']) // no move committed
      // No leftover dialog either — confirms cancellation didn't misfire into
      // some other app-level Escape/blur handler.
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  }

  test('equal/tied imported order values render and remain draggable without crashing', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await seedIdeas(page, [
      { id: 'tie-a', novelId: projectId, title: 'Tied Order A', status: 'raw', order: 5 },
      { id: 'tie-b', novelId: projectId, title: 'Tied Order B', status: 'raw', order: 5 },
    ])
    expect(errors).toEqual([])
    await expect(columnBody(page, 'raw').locator('[data-card-id]')).toHaveCount(2)

    await realDragIdea(page, 'tie-b', { beforeId: 'tie-a' })
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Tied Order B', 'Tied Order A'])
    expect(errors).toEqual([])
  })

  test('dragging within a tag-filtered subset still reorders correctly and survives reload', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [
      { id: 'filt-a', novelId: projectId, title: 'Filtered A', status: 'raw', order: 0, tags: ['filterset'] },
      { id: 'filt-noise', novelId: projectId, title: 'Filtered Noise', status: 'raw', order: 1, tags: ['other'] },
      { id: 'filt-b', novelId: projectId, title: 'Filtered B', status: 'raw', order: 2, tags: ['filterset'] },
    ])
    await page.getByLabel('Filter ideas by tag').selectOption('filterset')
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Filtered A', 'Filtered B'])

    await realDragIdea(page, 'filt-a', { column: 'raw' }) // drag to end of the visible (filtered) column
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Filtered B', 'Filtered A'])

    await saveAndReload(page)
    await page.getByLabel('Filter ideas by tag').selectOption('filterset')
    await expect.poll(() => columnTitles(page, 'raw')).toEqual(['Filtered B', 'Filtered A'])
  })

  test('the editor Status field moves an idea between columns without dragging', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedIdeas(page, [{ id: 'status-move', novelId: projectId, title: 'Status Move Idea', status: 'raw' }])

    const dialog = await openIdeaEditorByTitle(page, 'Status Move Idea')
    await dialog.getByLabel('Status').selectOption('inStory')
    await dialog.getByRole('button', { name: 'Save idea' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect.poll(() => columnTitles(page, 'inStory')).toContain('Status Move Idea')
    await expect.poll(() => columnTitles(page, 'raw')).not.toContain('Status Move Idea')
  })
})

test.describe('Convert to each destination, act-less chapter guard, and cross-tab conflicts', () => {
  test('converts to a character, location, faction, and lore entry, each creating a real linked record', async ({ page }) => {
    for (const [label, key] of [['Character', 'nf_characters'], ['Location', 'nf_locations'], ['Faction', 'nf_factions'], ['Lore Entry', 'nf_loreEntries']]) {
      const title = `Convert To ${label} ${Date.now()}`
      await page.getByLabel('Capture an idea').fill(title)
      await page.getByLabel('Capture an idea').press('Enter')
      const dialog = await openIdeaEditorByTitle(page, title)
      await dialog.getByRole('button', { name: 'Save & Convert' }).click()
      const convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
      await expect(convertDialog).toBeVisible()
      await convertDialog.getByRole('button', { name: label, exact: true }).click()
      await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
      await expect(convertDialog).toHaveCount(0)

      const created = await readStorage(page, key)
      expect(created.some(item => (item.name || item.title) === title)).toBe(true)
      const idea = (await readStorage(page, 'nf_ideaEntries')).find(i => i.title === title)
      expect(idea.status).toBe('inStory')
      expect(idea.convertedTo?.name).toBe(title)
    }
  })

  test('converts to a Timeline event without creating an unsolicited History copy', async ({ page }) => {
    const historyBefore = (await readStorage(page, 'nf_worldHistory')) || []
    const title = `Convert To Event ${Date.now()}`
    await page.getByLabel('Capture an idea').fill(title)
    await page.getByLabel('Capture an idea').press('Enter')
    const dialog = await openIdeaEditorByTitle(page, title)
    await dialog.getByRole('button', { name: 'Save & Convert' }).click()
    const convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
    await convertDialog.getByRole('button', { name: 'Timeline Event', exact: true }).click()
    await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
    await expect(convertDialog).toHaveCount(0)

    const timeline = await readStorage(page, 'nf_timeline')
    expect(timeline.some(e => e.title === title)).toBe(true)
    const historyAfter = await readStorage(page, 'nf_worldHistory')
    expect(historyAfter.length).toBe(historyBefore.length) // no unsolicited History entry
  })

  test('converts to a chapter under the existing act; with no acts at all, conversion is refused with an explanation and no orphan chapter', async ({ page }) => {
    const chaptersBefore = (await readStorage(page, 'nf_chapters')) || []
    const okTitle = `Convert To Chapter ${Date.now()}`
    await page.getByLabel('Capture an idea').fill(okTitle)
    await page.getByLabel('Capture an idea').press('Enter')
    let dialog = await openIdeaEditorByTitle(page, okTitle)
    await dialog.getByRole('button', { name: 'Save & Convert' }).click()
    let convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
    await convertDialog.getByRole('button', { name: 'Chapter', exact: true }).click()
    await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
    await expect(convertDialog).toHaveCount(0)
    const chaptersAfterOk = await readStorage(page, 'nf_chapters')
    expect(chaptersAfterOk.some(c => c.title === okTitle)).toBe(true)
    expect(chaptersAfterOk.length).toBe(chaptersBefore.length + 1)

    // Remove every act in this project, then attempt another chapter conversion.
    const projectId = projectIdFromUrl(page)
    await page.evaluate((pid) => {
      const acts = JSON.parse(window.__yowStorageBridge?.getItem('nf_acts') || '[]')
      window.__yowStorageBridge?.setItem('nf_acts', JSON.stringify(acts.filter(a => a.novelId !== pid)))
      window.__yowStorageBridge?.flush()
    }, projectId)
    await saveAndReload(page)

    const noActTitle = `No Act Chapter ${Date.now()}`
    await page.getByLabel('Capture an idea').fill(noActTitle)
    await page.getByLabel('Capture an idea').press('Enter')
    dialog = await openIdeaEditorByTitle(page, noActTitle)
    await dialog.getByRole('button', { name: 'Save & Convert' }).click()
    convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
    await convertDialog.getByRole('button', { name: 'Chapter', exact: true }).click()
    await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
    await expect(convertDialog.getByRole('alert')).toHaveText('Create an act in the outline before converting an idea to a chapter.')
    await expect(convertDialog).toBeVisible() // stays open, no orphan chapter

    const chaptersAfterNoAct = await readStorage(page, 'nf_chapters')
    expect(chaptersAfterNoAct.some(c => c.title === noActTitle)).toBe(false)
  })

  test.describe('Cross-tab source conflicts while the convert dialog is open', () => {
    async function openSecondTab(context, url) {
      const pageB = await context.newPage()
      await pageB.goto(url)
      await dismissLaunchPrompts(pageB)
      await waitForStorageHydration(pageB)
      await openIdeas(pageB)
      return pageB
    }

    test('a rename committed in another tab refuses conversion with an explicit conflict message and creates nothing', async ({ page, context }) => {
      const title = `Cross Tab Rename ${Date.now()}`
      await page.getByLabel('Capture an idea').fill(title)
      await page.getByLabel('Capture an idea').press('Enter')

      const pageB = await openSecondTab(context, page.url())

      const dialog = await openIdeaEditorByTitle(page, title)
      await dialog.getByRole('button', { name: 'Save & Convert' }).click()
      const convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
      await expect(convertDialog).toBeVisible()

      // Tab B renames the same idea through its own editor and saves.
      const dialogB = await openIdeaEditorByTitle(pageB, title)
      await dialogB.getByLabel('Title').fill('Renamed In Tab B')
      await dialogB.getByRole('button', { name: 'Save idea' }).click()
      await expect(pageB.getByRole('dialog')).toHaveCount(0)
      await page.waitForTimeout(500) // let the cross-tab BroadcastChannel write land

      await convertDialog.getByRole('button', { name: 'Character', exact: true }).click()
      await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
      await expect(convertDialog.getByRole('alert')).toHaveText('The source idea changed or is no longer available for conversion. Close this dialog and review the current idea before retrying.')
      await expect(convertDialog).toBeVisible()

      const chars = await readStorage(page, 'nf_characters')
      expect(chars.some(c => c.name === title || c.name === 'Renamed In Tab B')).toBe(false)
      await pageB.close()
    })

    test('a deletion committed in another tab refuses conversion the same way and creates nothing', async ({ page, context }) => {
      const title = `Cross Tab Delete ${Date.now()}`
      await page.getByLabel('Capture an idea').fill(title)
      await page.getByLabel('Capture an idea').press('Enter')

      const pageB = await openSecondTab(context, page.url())

      const dialog = await openIdeaEditorByTitle(page, title)
      await dialog.getByRole('button', { name: 'Save & Convert' }).click()
      const convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
      await expect(convertDialog).toBeVisible()

      // Tab B deletes the same idea from its own card.
      const ideaId = (await readStorage(pageB, 'nf_ideaEntries')).find(i => i.title === title).id
      await card(pageB, ideaId).getByRole('button', { name: 'Delete', exact: true }).click()
      await pageB.getByRole('button', { name: 'Delete from this project' }).click()
      await expect(pageB.getByRole('dialog', { name: 'Delete idea?' })).toHaveCount(0)
      await page.waitForTimeout(500)

      await convertDialog.getByRole('button', { name: 'Character', exact: true }).click()
      await convertDialog.getByRole('button', { name: 'Convert & Link' }).click()
      await expect(convertDialog.getByRole('alert')).toHaveText('The source idea changed or is no longer available for conversion. Close this dialog and review the current idea before retrying.')
      await expect(convertDialog).toBeVisible()

      const chars = await readStorage(page, 'nf_characters')
      expect(chars.some(c => c.name === title)).toBe(false)
      await pageB.close()
    })
  })
})

test.describe('Responsive layout with long text and many tags', () => {
  test('board, editor, and convert modal stay usable at 375px, 768px, and desktop widths', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const longTitle = 'A Very Long Idea Title That Should Wrap Instead Of Overflowing The Card Or The Sheet Layout On A Narrow Screen '.repeat(2).trim()
    await seedIdeas(page, [{
      id: 'responsive-idea', novelId: projectId, title: longTitle, status: 'raw',
      description: 'A reasonably long description to check wrapping.',
      tags: Array.from({ length: 10 }, (_, i) => `resp-tag-${i}`),
    }])

    for (const viewport of [{ width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport)
      await expect(card(page, 'responsive-idea')).toBeVisible()
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflowX).toBeLessThanOrEqual(1)

      const dialog = await openIdeaEditorByTitle(page, longTitle)
      await expect(dialog).toBeVisible()
      const dialogOverflow = await dialog.evaluate(el => el.scrollWidth - el.clientWidth)
      expect(dialogOverflow).toBeLessThanOrEqual(4)
      await dialog.getByRole('button', { name: 'Save & Convert' }).click()
      const convertDialog = page.getByRole('dialog', { name: 'Convert to Story Entity' })
      await expect(convertDialog).toBeVisible()
      await convertDialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  })
})
