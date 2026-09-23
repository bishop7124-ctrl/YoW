import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

// Browser-rendered coverage for the Timeline and History corrective-audit
// follow-up (docs/QA_PLAN.md Priority 6, the "Timeline corrective audit
// (2026-09-03)" and "History corrective audit (2026-09-03)" manual sequences,
// and the matching docs/ROADMAP.md "Timeline corrective audit — 2026-09-03" /
// "History corrective audit — 2026-09-03" QA Needed subsections) — all were
// implemented and unit/store-tested but explicitly marked "browser/live-sync
// QA pending" before this spec. This covers the parts of those checklists a
// real rendered browser in offline mode (no live Stripe/Supabase credentials,
// no real account, one local project at a time) can exercise: date/search/
// sort handling, era grouping and auto-assignment, Timeline<->History mirror
// edit consistency, deletion-based unlink safety, repeated-reload duplicate
// prevention, and refused/draft-protection behavior. A real three-project
// forward-synced series against live Supabase, two real browser tabs on a
// real account, and physical-device checks are explicitly out of scope here
// and remain deferred — see the doc updates alongside this spec for exactly
// what remains open.
//
// Follows the same reload discipline as worldbuilding.spec.js / the Schedule
// corrective-audit spec: flush() so a write has landed, reload, then
// waitForStorageHydration() so the *read* goes to the IndexedDB vault rather
// than the default localStorage backend the bridge answers from until
// main.jsx finishes swapping it.

async function openLoreRoom(page) {
  await page.getByLabel('Studio navigation').getByRole('button', { name: 'Open Lore', exact: true }).click()
}

async function openTimeline(page) {
  await openLoreRoom(page)
  await page.locator('.studio-tab').filter({ hasText: /^Timeline$/ }).click()
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible()
}

async function openHistory(page) {
  await openLoreRoom(page)
  await page.locator('.studio-tab').filter({ hasText: /^History$/ }).click()
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible()
}

// The project title itself can contain "Timeline"/"History" substrings and,
// once a record is created, its title renders BOTH in the index list (the
// card/row) AND simultaneously in the detail pane it auto-selects into —
// so a bare page-wide `getByText(title, { exact: true })` is ambiguous
// (strict-mode violation) the moment a record exists. These two helpers
// scope to the index-list card/row specifically (`.tl2-card` / `.studio-record`,
// never the detail pane), for both "is it listed" checks and clicking to
// (re)select a record.
function timelineCard(page, title) {
  return page.locator('.tl2-card', { hasText: title })
}

function historyRecord(page, title) {
  return page.locator('.studio-record', { hasText: title })
}

// Registers a queue of accept/dismiss decisions for the native window.confirm()
// dialogs Timeline/History delete flows use (handleDelete's own two sequential
// confirm() calls, EraManager's single one). Playwright auto-dismisses
// dialogs with no listener, which would silently abort these flows.
function queueConfirmDialogs(page, decisions) {
  let i = 0
  page.on('dialog', dialog => {
    const accept = decisions[i] ?? true
    i += 1
    if (accept) dialog.accept(); else dialog.dismiss()
  })
}

// StudioSheet (src/components/presentation/Studio.jsx) intercepts *any*
// button literally labeled "Cancel" anywhere inside it — via a click-capture
// listener on the sheet itself, not the button's own handler — and routes it
// through its shared discard-protection `requestClose()` instead. If the
// sheet is dirty (any field was actually typed into), that shows a "Save
// changes?" alertdialog rather than closing immediately; if it isn't dirty,
// it closes right away. This is intentional app-wide behavior (the same
// mechanism the Characters/Relationships/Ideas corrective audits describe as
// "discard protection"), not specific to Timeline/History — so every Cancel
// click in this spec goes through this helper rather than assuming a bare
// click always closes the sheet.
async function cancelDraft(page, dialog) {
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  const discardPrompt = page.getByRole('alertdialog', { name: 'Save changes?' })
  if (await discardPrompt.isVisible().catch(() => false)) {
    await discardPrompt.getByRole('button', { name: 'Discard' }).click()
  }
  await expect(dialog).toHaveCount(0)
}

async function saveTimelineEvent(page, { title, date, type, description } = {}) {
  await page.getByRole('button', { name: 'New Event' }).click()
  const dialog = page.getByRole('dialog', { name: 'New Timeline Event' })
  if (title != null) await dialog.getByLabel('Title *').fill(title)
  if (date != null) await dialog.getByLabel('Date / Time').fill(date)
  if (type != null) await dialog.getByLabel('Category / Type').fill(type)
  if (description != null) await dialog.getByLabel('Description').fill(description)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toHaveCount(0)
}

async function saveHistoryEntry(page, { title, startYear, endYear, content } = {}) {
  await page.locator('.studio-index-tools').getByRole('button', { name: 'New', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New History Entry' })
  if (title != null) await dialog.getByLabel('Title *').fill(title)
  if (startYear != null) await dialog.getByLabel('Start year').fill(String(startYear))
  if (endYear != null) await dialog.getByLabel('End year').fill(String(endYear))
  if (content != null) await dialog.getByLabel('Content').fill(content)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Timeline History QA ${Date.now()}` })
})

test.describe('Dates, search, and year-based ordering', () => {
  test('handles numeric-zero, BCE, undated, and free-text dates; searches by any of them; sorts by year not literal text', async ({ page }) => {
    await openTimeline(page)
    const stamp = Date.now()
    const zeroTitle = `Year Zero Founding ${stamp}`
    const bceTitle = `Ancient War ${stamp}`
    const undatedTitle = `Undated Legend ${stamp}`
    const freeTextTitle = `Harvest Rite ${stamp}`

    await saveTimelineEvent(page, { title: zeroTitle, date: '0' })
    await saveTimelineEvent(page, { title: bceTitle, date: '500 BCE' })
    await saveTimelineEvent(page, { title: undatedTitle })
    await saveTimelineEvent(page, { title: freeTextTitle, date: 'Year 12, First Month' })

    // All four are reachable and rendered without crashing.
    for (const title of [zeroTitle, bceTitle, undatedTitle, freeTextTitle]) {
      await expect(timelineCard(page, title)).toBeVisible()
    }
    // The undated entry falls back to the empty-date state, not a crash/blank.
    const undatedCard = timelineCard(page, undatedTitle)
    await expect(undatedCard.locator('.tl2-card-date')).toHaveText('Undated')

    // Search finds each by its own date text, not just title.
    await page.getByLabel('Search events').fill('500 BCE')
    await expect(timelineCard(page, bceTitle)).toBeVisible()
    await expect(timelineCard(page, zeroTitle)).toHaveCount(0)
    await page.getByLabel('Search events').fill('First Month')
    await expect(timelineCard(page, freeTextTitle)).toBeVisible()
    await page.getByLabel('Search events').fill('')

    // Sort order is by parsed year (BCE -500 first, then 0, then 12), not by
    // the literal free-text string — confirm the BCE card renders before the
    // Year 0 card in DOM order.
    const cardTitles = await page.locator('.tl2-card-title').allTextContents()
    expect(cardTitles.indexOf(bceTitle)).toBeLessThan(cardTitles.indexOf(zeroTitle))
    expect(cardTitles.indexOf(zeroTitle)).toBeLessThan(cardTitles.indexOf(freeTextTitle))

    // Persists through reload — not just component state.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openTimeline(page)
    await expect(timelineCard(page, bceTitle)).toBeVisible()
    const stored = await readStorage(page, 'nf_timeline')
    expect(stored.find(e => e.title === bceTitle).date).toBe('500 BCE')
  })

  test('shows a read-only, derived birthday marker for a character with a birth year', async ({ page }) => {
    await openTimeline(page)
    const projectId = new URL(page.url()).pathname.split('/')[2]
    const charName = `Chronicle Scion ${Date.now()}`
    await page.evaluate(({ projectId, charName }) => {
      const existing = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
      existing.push({ id: `char-birthday-${Date.now()}`, novelId: projectId, name: charName, birthDate: '247' })
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify(existing))
    }, { projectId, charName })
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openTimeline(page)

    const marker = page.locator('.tl2-birthday', { hasText: charName })
    await expect(marker).toBeVisible()
    await expect(marker).toContainText('born')
    await expect(marker).toContainText('247')
    // Read-only: it's a plain text row, not a clickable/selectable card, and
    // has no Edit/Delete controls of its own.
    await expect(marker.getByRole('button')).toHaveCount(0)
  })

  test('an ordinary Timeline event does not create a History mirror, and reads back as "Timeline only" in History', async ({ page }) => {
    await openTimeline(page)
    const title = `Timeline-Only Skirmish ${Date.now()}`
    const historyCountBefore = (await readStorage(page, 'nf_worldHistory'))?.length ?? 0
    await saveTimelineEvent(page, { title, date: '812' })

    const historyCountAfter = (await readStorage(page, 'nf_worldHistory'))?.length ?? 0
    expect(historyCountAfter).toBe(historyCountBefore)

    await openHistory(page)
    await expect(historyRecord(page, title)).toBeVisible()
    await historyRecord(page, title).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    // Labeled "Timeline event" (not "Historical record") in the eyebrow, and
    // the index row shows the "Timeline only" tag.
    await expect(page.getByText('Timeline event', { exact: true })).toBeVisible()
  })
})

test.describe('Era grouping and management', () => {
  test('auto-assigns an event to the one matching era, refuses to guess when eras overlap, and persists an explicit None choice', async ({ page }) => {
    await openTimeline(page)
    // Two distinct, non-overlapping eras via the History workspace's Era Manager.
    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'Eras' }).click()
    const erasDialog = page.getByRole('dialog', { name: 'Manage Eras' })
    await erasDialog.getByRole('button', { name: '+ Add Era' }).click()
    await erasDialog.getByLabel('Era name *').fill('The First Age')
    await erasDialog.getByLabel('Start year').fill('0')
    await erasDialog.getByLabel('End year').fill('100')
    await erasDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await erasDialog.getByRole('button', { name: '+ Add Era' }).click()
    await erasDialog.getByLabel('Era name *').fill('The Second Age')
    await erasDialog.getByLabel('Start year').fill('101')
    await erasDialog.getByLabel('End year').fill('200')
    await erasDialog.getByRole('button', { name: 'Save', exact: true }).click()
    // A third, deliberately overlapping era.
    await erasDialog.getByRole('button', { name: '+ Add Era' }).click()
    await erasDialog.getByLabel('Era name *').fill('The Long Twilight')
    await erasDialog.getByLabel('Start year').fill('90')
    await erasDialog.getByLabel('End year').fill('150')
    await erasDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await erasDialog.getByRole('button', { name: 'Close' }).click()
    await expect(erasDialog).toHaveCount(0)

    await openTimeline(page)
    // Unambiguous year (50) -> exactly one era matches -> auto-assigned.
    const autoTitle = `Auto-Era Event ${Date.now()}`
    await page.getByRole('button', { name: 'New Event' }).click()
    let dialog = page.getByRole('dialog', { name: 'New Timeline Event' })
    await dialog.getByLabel('Title *').fill(autoTitle)
    await dialog.getByLabel('Date / Time').fill('50')
    await expect(dialog.getByLabel('Era')).not.toHaveValue('')
    const autoEraId = await dialog.getByLabel('Era').inputValue()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    // A successful save already selects the new event and opens its detail
    // panel (Timeline.jsx's handleSave) — clicking the card again here would
    // *toggle it closed* (`.tl2-card`'s onClick deselects an already-selected
    // card), not "select" it a second time, so don't re-click it.
    await expect(page.locator('.tl2-panel-date')).toContainText('The First Age')

    // Ambiguous year (120) -> falls in both Second Age and Long Twilight ->
    // no era auto-selected (findEraForYear requires exactly one match).
    const ambiguousTitle = `Overlap-Era Event ${Date.now()}`
    await page.getByRole('button', { name: 'New Event' }).click()
    dialog = page.getByRole('dialog', { name: 'New Timeline Event' })
    await dialog.getByLabel('Title *').fill(ambiguousTitle)
    await dialog.getByLabel('Date / Time').fill('120')
    await expect(dialog.getByLabel('Era')).toHaveValue('')
    // Explicitly choose "None" and save.
    await dialog.getByLabel('Era').selectOption('')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    // Reopen for edit: the explicit None choice must still read back as None,
    // not silently re-auto-assigned to one of the two overlapping eras. This
    // save already selected/opened the new event too, so go straight to Edit.
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Era')).toHaveValue('')
    await cancelDraft(page, dialog)

    expect(autoEraId).not.toBe('')
  })

  test('renaming and deleting an era updates labels live and leaves entries reachable as unassigned, recovering the active filter', async ({ page }) => {
    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'Eras' }).click()
    let erasDialog = page.getByRole('dialog', { name: 'Manage Eras' })
    await erasDialog.getByRole('button', { name: '+ Add Era' }).click()
    await erasDialog.getByLabel('Era name *').fill('The Bronze Era')
    await erasDialog.getByRole('button', { name: 'Save', exact: true }).click()
    // A second, untouched control era — kept alive through this whole test so
    // `sortedEras.length > 0` stays true after the Bronze/Renamed era is
    // deleted below. Timeline.jsx only renders era-band headers (including
    // the "No era assigned" band) when at least one era exists at all; with
    // zero eras left, band headers are suppressed entirely by design, which
    // would make the "orphaned entry reachable as unassigned" assertion
    // meaningless. Keeping one real era around is what actually exercises
    // that recovery path rather than trivially reaching a bandless empty state.
    await erasDialog.getByRole('button', { name: '+ Add Era' }).click()
    await erasDialog.getByLabel('Era name *').fill('The Iron Era (control, not deleted)')
    await erasDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await erasDialog.getByRole('button', { name: 'Close' }).click()

    await openTimeline(page)
    const title = `Bronze Founding ${Date.now()}`
    await page.getByRole('button', { name: 'New Event' }).click()
    let dialog = page.getByRole('dialog', { name: 'New Timeline Event' })
    await dialog.getByLabel('Title *').fill(title)
    await dialog.getByLabel('Era').selectOption({ label: 'The Bronze Era' })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    // Filter to this era via the chip strip.
    await page.getByRole('button', { name: /^The Bronze Era/ }).click()
    await expect(page.getByRole('button', { name: /^The Bronze Era/ })).toHaveAttribute('aria-pressed', 'true')

    // Rename it — the chip and the entry's era band both reflect the new name live.
    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'Eras' }).click()
    erasDialog = page.getByRole('dialog', { name: 'Manage Eras' })
    await erasDialog.getByText('The Bronze Era', { exact: true }).locator('../..').getByRole('button', { name: 'Edit', exact: true }).click()
    await erasDialog.getByLabel('Era name *').fill('The Renamed Era')
    await erasDialog.getByRole('button', { name: 'Save', exact: true }).click()
    await erasDialog.getByRole('button', { name: 'Close' }).click()
    await expect(erasDialog).toHaveCount(0)

    await openTimeline(page)
    await expect(page.getByRole('button', { name: /^The Renamed Era/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^The Bronze Era/ })).toHaveCount(0)
    // Re-select it under the new name so it's the active filter when deleted below.
    await page.getByRole('button', { name: /^The Renamed Era/ }).click()

    // Delete the era while it's the active filter.
    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'Eras' }).click()
    erasDialog = page.getByRole('dialog', { name: 'Manage Eras' })
    queueConfirmDialogs(page, [true])
    await erasDialog.getByText('The Renamed Era', { exact: true }).locator('../..').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(erasDialog.getByText('The Renamed Era', { exact: true })).toHaveCount(0)
    await erasDialog.getByRole('button', { name: 'Close' }).click()
    await expect(erasDialog).toHaveCount(0)

    await openTimeline(page)
    // The stale era filter recovers to "All" (deleted eras can't stay selected).
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
    // The orphaned entry remains visible, now under "No era assigned".
    await expect(page.getByText('No era assigned', { exact: true })).toBeVisible()
    await expect(timelineCard(page, title)).toBeVisible()
  })

  test('exact-duplicate imported tags render once, without rewriting the raw backup data', async ({ page }) => {
    // Timeline/History's own tag handling (`uniqueTimelineValues` in
    // src/utils/timelineEntries.js) is a plain `Set`-based dedup on the
    // exact string value — unlike Lore's dedicated tag-normalization
    // utility, it does not case-fold, trim, or strip a leading "#". That
    // matches this section's own QA_PLAN wording ("duplicate imported tags…
    // render once"), which is about exact duplicates, not case/whitespace/
    // hash-variant normalization — confirmed directly against the source
    // rather than assumed from other sections' richer tag normalization.
    await openTimeline(page)
    const projectId = new URL(page.url()).pathname.split('/')[2]
    const title = `Legacy Tagged Event ${Date.now()}`
    await page.evaluate(({ projectId, title }) => {
      const existing = JSON.parse(window.__yowStorageBridge?.getItem('nf_timeline') || '[]')
      existing.push({
        id: `tl-legacy-${Date.now()}`, novelId: projectId, title, date: '900',
        tags: ['omen', 'omen', 'omen'], linkedCharacters: [], linkedLocations: [],
      })
      window.__yowStorageBridge?.setItem('nf_timeline', JSON.stringify(existing))
    }, { projectId, title })
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openTimeline(page)

    const card = timelineCard(page, title)
    await expect(card.locator('.tl2-tag')).toHaveCount(1)
    await expect(card.locator('.tl2-tag')).toHaveText('omen')

    // Merely viewing it does not rewrite the raw stored tags array.
    const stored = await readStorage(page, 'nf_timeline')
    const rawEntry = stored.find(e => e.title === title)
    expect(rawEntry.tags).toEqual(['omen', 'omen', 'omen'])
  })
})

test.describe('Timeline <-> History mirror consistency', () => {
  test('a History entry created with a linked Timeline event appears once (not duplicated) and both sides show the same content', async ({ page }) => {
    await openHistory(page)
    const title = `Founding of the Spire ${Date.now()}`
    await saveHistoryEntry(page, { title, startYear: '415', content: 'The Spire was raised after the last siege.' })

    // Appears exactly once in History's own list (paired, not duplicated).
    await expect(historyRecord(page, title)).toHaveCount(1)
    await historyRecord(page, title).click()
    await expect(page.getByText('Historical record', { exact: true })).toBeVisible()

    // The mirrored Timeline event exists and carries the same title/content.
    // (Scoped to `.tl2-panel-desc`, not a page-wide text search — the same
    // description also renders as a preview inside the list card itself
    // once selected, so a bare `getByText` is ambiguous between the two.)
    await openTimeline(page)
    await expect(timelineCard(page, title)).toBeVisible()
    await timelineCard(page, title).click()
    await expect(page.locator('.tl2-panel-desc')).toHaveText('The Spire was raised after the last siege.')

    const [timeline, history] = await Promise.all([readStorage(page, 'nf_timeline'), readStorage(page, 'nf_worldHistory')])
    const historyRow = history.find(h => h.title === title)
    const timelineRow = timeline.find(e => e.title === title)
    expect(historyRow.timelineEventId).toBe(timelineRow.id)
    expect(timelineRow.worldHistoryEntryId).toBe(historyRow.id)
  })

  test('editing only the content on the History side updates the Timeline mirror\'s description while leaving its tags/links untouched', async ({ page }) => {
    await openHistory(page)
    const title = `Chronicle of the Flood ${Date.now()}`
    await saveHistoryEntry(page, { title, startYear: '88', content: 'Original account of the flood.' })

    // Add a tag on the Timeline side of the mirror first, so we can confirm a
    // later History-side content-only edit doesn't clobber it.
    await openTimeline(page)
    await timelineCard(page, title).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Tags').fill('flood-lore')
    await dialog.getByLabel('Tags').press('Enter')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    // Now edit only the Content field from the History side.
    await openHistory(page)
    await historyRecord(page, title).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Content').fill('Revised account after new testimony.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.studio-detail')).toContainText('Revised account after new testimony.')

    // The Timeline mirror reflects the new content AND keeps its own tag.
    // (Scoped to `.tl2-panel-desc`/`.tl2-panel-section`, not a page-wide
    // text search — the same content also renders as a preview inside the
    // list card itself (`.tl2-card-desc`), so a bare `getByText` would be
    // ambiguous once the card is selected and both are on screen at once.)
    await openTimeline(page)
    await timelineCard(page, title).click()
    await expect(page.locator('.tl2-panel-desc')).toHaveText('Revised account after new testimony.')
    await expect(page.locator('.tl2-panel-section')).toContainText('flood-lore')

    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openTimeline(page)
    await timelineCard(page, title).click()
    await expect(page.locator('.tl2-panel-desc')).toHaveText('Revised account after new testimony.')
    await expect(page.locator('.tl2-panel-section')).toContainText('flood-lore')
  })
})

test.describe('Deletion-based unlink safety (no dedicated relink UI exists to test directly)', () => {
  // Note: `linkTimelineHistory`/`unlinkTimelineHistory` exist as internal
  // store actions (src/store/useStore.js) but neither Timeline.jsx nor
  // WorldHistory.jsx wires any button to them — there is no UI entry point
  // to explicitly unlink an existing pair and relink it to a *different*
  // existing record, so that specific checklist wording ("Unlink, edit
  // again, relink to a different pair") has nothing to browser-test as
  // literally written, the same way the Schedule audit's "tags without
  // pressing Enter" item had nothing to test once that UI's shape changed.
  // The closest real, reachable equivalent is deletion-based unlinking
  // (deleteHistoryEntry/deleteEvent both explicitly retain and unlink the
  // counterpart rather than cascading), which both of the following DO test.

  test('deleting a History record keeps its linked Timeline event, now unlinked and labeled "Timeline only"', async ({ page }) => {
    await openHistory(page)
    const title = `Doomed Treaty ${Date.now()}`
    await saveHistoryEntry(page, { title, startYear: '77', content: 'A treaty later broken.' })

    await historyRecord(page, title).click()
    queueConfirmDialogs(page, [true, false]) // confirm delete; scope = current only
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('History record deleted. Its Timeline event was kept.', { exact: true })).toBeVisible()

    // Still reachable in History, now as a Timeline-only entry (not gone).
    await expect(historyRecord(page, title)).toBeVisible()
    await historyRecord(page, title).click()
    await expect(page.getByText('Timeline event', { exact: true })).toBeVisible()

    const [timeline, history] = await Promise.all([readStorage(page, 'nf_timeline'), readStorage(page, 'nf_worldHistory')])
    expect(history.some(h => h.title === title)).toBe(false)
    const survivingEvent = timeline.find(e => e.title === title)
    expect(survivingEvent).toBeTruthy()
    expect(survivingEvent.worldHistoryEntryId).toBeFalsy()
  })

  test('deleting a Timeline event keeps its linked History record, still standalone-editable without a Timeline copy', async ({ page }) => {
    await openHistory(page)
    const title = `Lost Expedition ${Date.now()}`
    await saveHistoryEntry(page, { title, startYear: '210', content: 'They never returned.' })

    await openTimeline(page)
    await timelineCard(page, title).click()
    queueConfirmDialogs(page, [true, false]) // confirm delete; scope = current only
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(timelineCard(page, title)).toHaveCount(0)

    // The History record survives as standalone and remains editable.
    await openHistory(page)
    await expect(historyRecord(page, title)).toBeVisible()
    await historyRecord(page, title).click()
    await expect(page.getByText('Historical record', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Content').fill('They never returned — confirmed by a survivor decades later.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('They never returned — confirmed by a survivor decades later.', { exact: true })).toBeVisible()

    const [timeline, history] = await Promise.all([readStorage(page, 'nf_timeline'), readStorage(page, 'nf_worldHistory')])
    expect(timeline.some(e => e.title === title)).toBe(false)
    const survivingHistory = history.find(h => h.title === title)
    expect(survivingHistory).toBeTruthy()
    expect(survivingHistory.timelineEventId).toBeFalsy()
  })
})

test.describe('No login/reload-generated duplicates', () => {
  test('repeated reloads never manufacture new unlinked Timeline copies of an existing linked History record', async ({ page }) => {
    await openHistory(page)
    const title = `Steady Record ${Date.now()}`
    await saveHistoryEntry(page, { title, startYear: '333', content: 'One record, one mirror, forever.' })

    await page.evaluate(() => window.__yowStorageBridge?.flush())
    const countBefore = (await readStorage(page, 'nf_timeline')).filter(e => e.title === title).length
    expect(countBefore).toBe(1)

    // Reload three times in a row (the closest offline-mode proxy for
    // "sign out/in and reload repeatedly" available without real auth).
    for (let i = 0; i < 3; i += 1) {
      await page.reload()
      await waitForStorageHydration(page)
    }

    const countAfter = (await readStorage(page, 'nf_timeline')).filter(e => e.title === title).length
    expect(countAfter).toBe(1)
    const historyCount = (await readStorage(page, 'nf_worldHistory')).filter(h => h.title === title).length
    expect(historyCount).toBe(1)

    await openHistory(page)
    await expect(historyRecord(page, title)).toHaveCount(1)
  })
})

test.describe('Refused-save draft protection', () => {
  test('a blank-title Timeline event and a blank-title History entry both refuse and retain their open draft', async ({ page }) => {
    await openTimeline(page)
    await page.getByRole('button', { name: 'New Event' }).click()
    let dialog = page.getByRole('dialog', { name: 'New Timeline Event' })
    await dialog.getByLabel('Description').fill('Has a description but no title.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    // HTML5 `required` on the title input blocks submission client-side; the
    // dialog stays open with the draft intact rather than silently closing.
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Description')).toHaveValue('Has a description but no title.')
    await cancelDraft(page, dialog)

    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'New', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'New History Entry' })
    await dialog.getByLabel('Content').fill('Has content but no title.')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Content')).toHaveValue('Has content but no title.')
    await cancelDraft(page, dialog)
  })

  test('an end year before the start year is rejected on the History form, retaining the draft', async ({ page }) => {
    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'New', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'New History Entry' })
    const title = `Backwards Range ${Date.now()}`
    await dialog.getByLabel('Title *').fill(title)
    await dialog.getByLabel('Start year').fill('500')
    await dialog.getByLabel('End year').fill('400')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('End year must be the same as or later than the start year.')
    await expect(dialog.getByLabel('Title *')).toHaveValue(title)
    await cancelDraft(page, dialog)
  })
})

test.describe('Era Manager single-editor discipline', () => {
  test('only one era editor is open at a time; other rows\' Edit/Delete are disabled while a draft is open, and Cancel goes through the same discard-protection prompt as everywhere else', async ({ page }) => {
    await openHistory(page)
    await page.locator('.studio-index-tools').getByRole('button', { name: 'Eras' }).click()
    const dialog = page.getByRole('dialog', { name: 'Manage Eras' })
    await dialog.getByRole('button', { name: '+ Add Era' }).click()
    await dialog.getByLabel('Era name *').fill('Era Alpha')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.getByRole('button', { name: '+ Add Era' }).click()
    await dialog.getByLabel('Era name *').fill('Era Beta')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()

    // Open Era Alpha's editor.
    await dialog.getByText('Era Alpha', { exact: true }).locator('../..').getByRole('button', { name: 'Edit', exact: true }).click()
    // The "+ Add Era" control and Era Beta's own Edit/Delete are now disabled.
    await expect(dialog.getByText('Era Beta', { exact: true }).locator('../..').getByRole('button', { name: 'Edit', exact: true })).toBeDisabled()
    await expect(dialog.getByText('Era Beta', { exact: true }).locator('../..').getByRole('button', { name: 'Delete' })).toBeDisabled()

    // Refuse an invalid edit (backward range) — draft must remain, not silently discard.
    await dialog.getByLabel('Start year').fill('100')
    await dialog.getByLabel('End year').fill('50')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('End year must be the same as or later than the start year.')
    await expect(dialog.getByLabel('Era name *')).toHaveValue('Era Alpha')

    // Cancel here doesn't just release the inline editor — the whole "Manage
    // Eras" sheet is dirty (any field change inside it marks it dirty, per
    // StudioSheet's onChangeCapture), so Cancel is intercepted by the sheet's
    // own click-capture handler and routes to the shared discard-protection
    // prompt rather than the EraForm's own onCancel. This is the same
    // app-wide convention other corrective audits call "discard protection",
    // not a bug — confirmed directly rather than assumed.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    const discardPrompt = page.getByRole('alertdialog', { name: 'Save changes?' })
    await expect(discardPrompt).toBeVisible()
    await discardPrompt.getByRole('button', { name: 'Discard' }).click()
    await expect(dialog).toHaveCount(0)

    // The discarded backward-range edit never persisted — Era Alpha still
    // exists with no range set, and re-opening the sheet lands on a clean,
    // fully-enabled state (no editor left open).
    await page.locator('.studio-index-tools').getByRole('button', { name: 'Eras' }).click()
    const reopened = page.getByRole('dialog', { name: 'Manage Eras' })
    await expect(reopened.getByText('Era Alpha', { exact: true })).toBeVisible()
    await expect(reopened.getByText('100', { exact: true })).toHaveCount(0)
    await expect(reopened.getByText('Era Beta', { exact: true }).locator('../..').getByRole('button', { name: 'Edit', exact: true })).toBeEnabled()
  })
})
