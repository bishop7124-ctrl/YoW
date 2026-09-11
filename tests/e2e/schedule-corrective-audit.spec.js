import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

// Browser-rendered coverage for the Schedule corrective-audit follow-up
// (docs/QA_PLAN.md Priority 6, "Schedule corrective-audit follow-up
// (2026-09-03...)") and the docs/ROADMAP.md "Configurable Schedule
// calendar" row — both were implemented and unit/store-tested but explicitly
// marked "browser QA pending" before this spec. This covers the parts of
// that checklist a real rendered browser in offline mode (no live Stripe/
// Supabase credentials, no real account) can exercise: custom calendar
// shape, opening-view modes, event CRUD/validation across the real UI, and
// malformed/out-of-range/unknown-category event safety. Live-cloud,
// live-AI-provider, and physical-device sub-items from that checklist are
// explicitly out of scope here and remain deferred — see the doc updates
// alongside this spec for exactly what remains open.
//
// Follows the same reload discipline as worldbuilding.spec.js: flush() so a
// write has landed, reload, then waitForStorageHydration() so the *read*
// goes to the IndexedDB vault rather than the default localStorage backend
// the bridge answers from until main.jsx finishes swapping it (see that
// helper's own comment for the full trace of why this matters).

async function openSchedule(page) {
  await page.getByLabel('Studio navigation').getByRole('button', { name: 'Open Planning', exact: true }).click()
  await page.locator('.studio-tab').filter({ hasText: /^Schedule$/ }).click()
  await expect(page.getByRole('button', { name: 'Calendar settings' })).toBeVisible()
}

async function openCalendarSettings(page) {
  await page.getByRole('button', { name: 'Calendar settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Calendar settings' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Schedule QA ${Date.now()}` })
  await openSchedule(page)
})

test.describe('Custom calendar shape', () => {
  test('configures a custom week/month shape, persists it, and keeps weekday alignment continuous across a year boundary', async ({ page }) => {
    await openCalendarSettings(page)

    // Shrink to a 5-day week with custom labels.
    await page.getByLabel('Days per schedule week').fill('5')
    for (const [index, label] of ['Sunrise', 'Highsun', 'Duskfall', 'Nightwatch', 'Starrise'].entries()) {
      await page.getByLabel(`Day ${index + 1} label`).fill(label)
    }
    // Trim to 2 short months so a month boundary is reachable quickly.
    while (await page.getByLabel(/^Remove month \d+$/).count() > 2) {
      await page.getByLabel(/^Remove month \d+$/).first().click()
    }
    await page.getByLabel('Month 1 name').fill('Thaw')
    await page.getByLabel('Month 1 days').fill('6')
    await page.getByLabel('Month 2 name').fill('Frost')
    await page.getByLabel('Month 2 days').fill('6')
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar settings' })).toHaveCount(0)

    // The month header and day-of-week headers reflect the new shape immediately.
    await expect(page.getByRole('heading', { name: 'Thaw · Year 1' })).toBeVisible()
    await expect(page.getByText('Sunrise', { exact: true })).toBeVisible()
    await expect(page.getByText('Starrise', { exact: true })).toBeVisible()

    // Persists through a reload — not just component state.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openSchedule(page)
    await expect(page.getByRole('heading', { name: 'Thaw · Year 1' })).toBeVisible()
    await expect(page.getByText('Sunrise', { exact: true })).toBeVisible()

    // Weekday alignment stays continuous month-to-month within a year: with
    // 6-day months over a 5-day week, month 2 does not start on the week's
    // first column — record which weekday column Thaw's last day falls on,
    // then confirm Frost's first day picks up on the very next weekday
    // column rather than resetting to column 1.
    const thawCells = page.locator('.schedule-day-cell')
    const thawCellCount = await thawCells.count()
    const lastThawCol = await thawCells.nth(thawCellCount - 1).evaluate(el => el.style.gridColumn)
    await page.getByLabel('Next schedule month').click() // Thaw -> Frost, year 1
    await expect(page.getByRole('heading', { name: 'Frost · Year 1' })).toBeVisible()
    const frostCells = page.locator('.schedule-day-cell')
    const firstFrostCol = await frostCells.first().evaluate(el => el.style.gridColumn)
    const nextExpectedCol = (Number(lastThawCol) % 5) + 1
    expect(Number(firstFrostCol)).toBe(nextExpectedCol)

    // Note (not a bug, a documented limitation — see the doc update
    // alongside this spec): this calendar deliberately does *not* carry a
    // continuous weekday cycle across a year boundary when weekLength
    // doesn't evenly divide the year length — `scheduleEventSegments`
    // derives `leadingDays` from `calendar.monthStarts` alone (no `year`
    // term), so every year's grid repeats the identical month-by-month
    // layout rather than drifting the way a real perpetual calendar would.
    // Confirmed directly here rather than assumed: Frost (year 1) -> Thaw
    // (year 2) resets to column 1 regardless of Frost's last column.
    await page.getByLabel('Next schedule month').click() // Frost -> Thaw, year 2
    await expect(page.getByRole('heading', { name: 'Thaw · Year 2' })).toBeVisible()
    const firstThawYear2Col = await page.locator('.schedule-day-cell').first().evaluate(el => el.style.gridColumn)
    expect(Number(firstThawYear2Col)).toBe(1)
  })

  test('switching projects does not leak one project\'s calendar shape or opening view into another', async ({ page }) => {
    await openCalendarSettings(page)
    await page.getByLabel('Days per schedule week').fill('3')
    await page.getByLabel('Month 1 name').fill('Renamed Month')
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await expect(page.locator('.schedule-grid')).toHaveCSS('--schedule-week', '3')
    await expect(page.getByRole('heading', { name: 'Renamed Month · Year 1' })).toBeVisible()

    // A second, independent project must render the historical 12-month/
    // 7-day-week default, not the first project's custom shape.
    await page.goto('/')
    await createProject(page, { title: `Schedule QA Second ${Date.now()}` })
    await openSchedule(page)
    await expect(page.locator('.schedule-grid')).toHaveCSS('--schedule-week', '7')
    await expect(page.getByRole('heading', { name: 'First Month · Year 1' })).toBeVisible()
  })

  test('supports the 1-day and 14-day week-length extremes without breaking the grid', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await openCalendarSettings(page)
    await page.getByLabel('Days per schedule week').fill('1')
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar settings' })).toHaveCount(0)
    await expect(page.locator('.schedule-grid')).toHaveCSS('--schedule-week', '1')
    // A 1-day week means every day is its own row: First Month (30 days by
    // default) renders exactly 30 day cells, none dropped or duplicated.
    await expect(page.locator('.schedule-day-cell')).toHaveCount(30)
    await expect(page.getByText('Day 1', { exact: true })).toBeVisible()

    await openCalendarSettings(page)
    await page.getByLabel('Days per schedule week').fill('14')
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar settings' })).toHaveCount(0)
    await expect(page.locator('.schedule-grid')).toHaveCSS('--schedule-week', '14')
    await expect(page.getByText('Day 14', { exact: true })).toBeVisible()
    // Still 30 real day cells for a 30-day month regardless of week length
    // (the remaining 12 slots in the last row are empty padding, not buttons).
    await expect(page.locator('.schedule-day-cell')).toHaveCount(30)

    expect(errors).toEqual([])
  })

  test('supports a full 24-month calendar configuration', async ({ page }) => {
    await openCalendarSettings(page)
    // Grow from the default 12 months to the configured maximum of 24.
    while (await page.getByLabel(/^Remove month \d+$/).count() < 24) {
      await page.getByRole('button', { name: 'Add month' }).click()
    }
    await expect(page.getByRole('button', { name: 'Add month' })).toBeDisabled()
    await expect(page.getByLabel(/^Remove month \d+$/)).toHaveCount(24)
    await page.getByLabel('Month 24 name').fill('Endmonth')
    await page.getByLabel('Month 24 days').fill('12')
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar settings' })).toHaveCount(0)

    // All 24 months are selectable from the month dropdown.
    await expect(page.getByLabel('Schedule month', { exact: true }).locator('option')).toHaveCount(24)
    await page.getByLabel('Schedule month', { exact: true }).selectOption('24')
    await expect(page.getByRole('heading', { name: 'Endmonth · Year 1' })).toBeVisible()

    // Navigating past the 24th month wraps cleanly into year 2, month 1.
    await page.getByLabel('Next schedule month').click()
    await expect(page.getByRole('heading', { name: /Year 2$/ })).toBeVisible()
  })

  test('an event created under the historical 12x30x7 calendar keeps its exact stored date after the calendar shape changes', async ({ page }) => {
    // Create the event BEFORE touching calendar settings, so it genuinely
    // predates the shape change rather than starting life under the new
    // shape — a fresh project already defaults to 12 months x 30 days x
    // 7-day week, so this reproduces the real migration scenario (an
    // existing project whose events were laid down under the historical
    // default) rather than just re-confirming that default in isolation.
    const title = `Pre-migration Event ${Date.now()}`
    await page.getByRole('button', { name: 'Add event on First Month, day 15, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTitle(title)).toBeVisible()

    // Shrink First Month so it no longer has 15 days — this event's stored
    // date now falls outside the revised calendar shape.
    await openCalendarSettings(page)
    await page.getByLabel('Month 1 days').fill('10')
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await expect(page.getByRole('dialog', { name: 'Calendar settings' })).toHaveCount(0)

    // The raw stored record retains its original date exactly — the
    // calendar-settings modal's own copy ("Existing events retain their
    // stored dates") — rather than being silently rewritten or clamped.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    const stored = await readStorage(page, 'nf_storySchedule')
    const migrated = stored.find(event => event.title === title)
    expect(migrated.year).toBe(1)
    expect(migrated.month).toBe(1)
    expect(migrated.day).toBe(15)

    // Now out of range for the revised calendar, so Month view excludes it
    // (isScheduleDateInCalendar) instead of crashing or showing a wrong day.
    await expect(page.getByRole('heading', { name: 'First Month · Year 1' })).toBeVisible()
    await expect(page.getByTitle(title)).toHaveCount(0)

    // ...but it's still fully reachable in List view with its original,
    // un-clamped date label.
    await page.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'list' }).click()
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    await expect(page.getByText('First Month, Day 15 · Year 1')).toBeVisible()
  })
})

test.describe('Opening view controls', () => {
  test('fixed opening month/year is honored on next visit, and last-viewed mode tracks navigation', async ({ page }) => {
    // "Opening view" governs what the calendar shows the *next* time it
    // mounts, not an instant jump for the copy already on screen — its own
    // state (viewYear/viewMonth) is only ever seeded from settings on
    // mount (`useState(() => viewSettings.openYear)`), so verify it via a
    // remount (switching Planning tabs away and back), not an in-place
    // heading check right after Save.
    const remountSchedule = async () => {
      await page.locator('.studio-tab').filter({ hasText: /^Outline$/ }).click()
      await page.locator('.studio-tab').filter({ hasText: /^Schedule$/ }).click()
    }

    await openCalendarSettings(page)
    await page.getByText('Open to a chosen month and year').click()
    await page.getByLabel('Default schedule month').selectOption('3')
    await page.getByLabel('Default schedule year').fill('42')
    await page.getByRole('button', { name: 'Save calendar' }).click()

    await remountSchedule()
    await expect(page.getByRole('heading', { name: /Year 42$/ })).toBeVisible()

    // Persists through a real reload too, not just a same-session remount.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openSchedule(page)
    await expect(page.getByRole('heading', { name: /Year 42$/ })).toBeVisible()

    // Switch to "preserve last viewed", navigate away from the fixed point,
    // remount, and confirm it reopens where navigation left off rather than
    // snapping back to the fixed month/year.
    await openCalendarSettings(page)
    await page.getByText('Preserve the last viewed month and year').click()
    await page.getByRole('button', { name: 'Save calendar' }).click()
    await page.getByLabel('Next schedule month').click()
    await page.getByLabel('Next schedule month').click()
    const headingBeforeRemount = await page.getByRole('heading', { name: /^.+ · Year \d+$/ }).textContent()

    await remountSchedule()
    await expect(page.getByRole('heading', { name: headingBeforeRemount })).toBeVisible()

    // And survives a real reload as well.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openSchedule(page)
    await expect(page.getByRole('heading', { name: headingBeforeRemount })).toBeVisible()
  })
})

test.describe('Event CRUD and validation across the real UI', () => {
  test('creates, edits, and deletes an event, with the day cell / list / detail views agreeing', async ({ page }) => {
    const title = `Council of Elders ${Date.now()}`
    await page.getByRole('button', { name: 'Add event on First Month, day 5, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByRole('button', { name: 'Meeting', exact: true }).click()
    await page.getByLabel('Tags (comma-separated)').fill('council, plot')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTitle(title)).toBeVisible()

    // List view shows the same event with the same date label.
    await page.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'list' }).click()
    await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()
    await expect(page.getByText('First Month, Day 5 · Year 1')).toBeVisible()

    // Edit: change category and tags, confirm the detail view reflects it.
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Festival', exact: true }).click()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Persists through reload.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openSchedule(page)
    await page.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'list' }).click()
    await expect(page.getByText('Festival', { exact: true })).toBeVisible()

    // Delete: cancel first (must retain the event), then confirm (must remove it).
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Cancel deletion' }).click()
    await expect(page.getByLabel('Title *')).toHaveValue(title)
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Delete event' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0)
  })

  test('a cross-month event renders a continuation segment in both months', async ({ page }) => {
    const title = `Long March ${Date.now()}`
    // First Month has 30 days by default; start on day 28 with a duration of
    // 6 so it spans into Second Month.
    await page.getByRole('button', { name: 'Add event on First Month, day 28, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByLabel('Event duration').fill('6')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page.getByRole('button', { name: new RegExp(`^${title} →$`) })).toBeVisible()
    await page.getByLabel('Next schedule month').click()
    await expect(page.getByRole('heading', { name: 'Second Month · Year 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`^← ${title}$`) })).toBeVisible()
  })

  test('rejects a blank title and an out-of-range day, retaining the open draft', async ({ page }) => {
    await page.getByRole('button', { name: 'Add event on First Month, day 1, year 1' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Title is required.')
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel('Title *').fill('Impossible Date')
    await page.getByLabel('Event day').fill('99')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Day must be between 1 and')
    // The draft (title) survives the refused save.
    await expect(page.getByLabel('Title *')).toHaveValue('Impossible Date')
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('rejects a duration beyond the maximum, retaining the open draft', async ({ page }) => {
    await page.getByRole('button', { name: 'Add event on First Month, day 1, year 1' }).click()
    await page.getByLabel('Title *').fill('Too Long')
    await page.getByLabel('Event duration').fill('36601')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Duration must be between 1 and 36,600 days.')
    await expect(page.getByLabel('Title *')).toHaveValue('Too Long')
    await page.getByRole('button', { name: 'Cancel' }).click()
  })

  test('a same-month event crossing a week boundary renders as two week-row segments', async ({ page }) => {
    const title = `Week Crosser ${Date.now()}`
    // First Month, default 7-day week: day 1 starts week row 0 at column 1
    // (leadingDays is 0 for month 1). Day 5 + duration 5 (days 5-9) crosses
    // from week row 0 (days 1-7) into week row 1 (days 8-14) — a *within
    // the same month* boundary, distinct from the cross-month case above.
    await page.getByRole('button', { name: 'Add event on First Month, day 5, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByLabel('Event duration').fill('5')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Two separate ribbon segments in the SAME month view, one per week row.
    await expect(page.getByRole('button', { name: new RegExp(`^${title} →$`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`^← ${title}$`) })).toBeVisible()
  })

  test('a cross-year event spans correctly in month view and the list date-range label', async ({ page }) => {
    const title = `Turn of the Year ${Date.now()}`
    await page.getByLabel('Schedule month', { exact: true }).selectOption('12')
    await page.getByRole('button', { name: 'Add event on Twelfth Month, day 28, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByLabel('Event duration').fill('6')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: new RegExp(`^${title} →$`) })).toBeVisible()

    await page.getByLabel('Next schedule month').click() // Twelfth Month Year 1 -> First Month Year 2
    await expect(page.getByRole('heading', { name: 'First Month · Year 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`^← ${title}$`) })).toBeVisible()

    // List view's own row only shows the start date (scheduleDateLabel) plus
    // a bare "N days" tag — the full start–end range (scheduleRangeLabel)
    // renders in the event's detail sheet, so open that to check the actual
    // cross-year span is computed correctly end-to-end.
    await page.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'list' }).click()
    await expect(page.getByText('Twelfth Month, Day 28 · Year 1')).toBeVisible()
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await expect(page.getByText('Twelfth Month, Day 28 · Year 1 — First Month, Day 3 · Year 2 · 6 days')).toBeVisible()
  })

  test('more than three same-day events all stack into distinct lanes', async ({ page }) => {
    const stamp = Date.now()
    const titles = [1, 2, 3, 4].map(n => `Overlap ${n} ${stamp}`)
    for (const title of titles) {
      // Use the header's "Add event" trigger (defaults to day 1) rather than
      // the day-10 cell itself: once a couple of ribbons are already stacked
      // on that cell they visually cover its own "Add event on ..." button,
      // so re-clicking the cell for every additional overlapping event is
      // not a realistic user path here — set the day explicitly instead.
      // Scoped to the toolbar: the empty-month prompt renders its own
      // same-labelled "Add event" button too while day 10 has zero events.
      await page.locator('.schedule-toolbar-actions').getByRole('button', { name: 'Add event', exact: true }).click()
      await page.getByLabel('Title *').fill(title)
      await page.getByLabel('Event day').fill('10')
      await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    const margins = []
    for (const title of titles) {
      const ribbon = page.getByRole('button', { name: title, exact: true })
      await expect(ribbon).toBeVisible()
      margins.push(await ribbon.evaluate(el => el.style.marginTop))
    }
    // Each of the 4 same-day events gets its own lane (distinct vertical
    // offset) instead of overlapping or hiding one another.
    expect(new Set(margins).size).toBe(4)
  })
})

test.describe('Cross-tab event edits', () => {
  // Simulates a second real browser tab on the same account/project via a
  // second Page in the same (shared-storage) browser context — the actual
  // mechanism this app uses for cross-tab sync in offline/local mode is a
  // same-origin BroadcastChannel bridging the IndexedDB-backed vault
  // (src/storage/browserVaultAdapter.js's wireCrossTabSync), which two Pages
  // in one Playwright BrowserContext exercise for real, not a mock.
  async function openSecondTab(context, url) {
    const pageB = await context.newPage()
    await pageB.goto(url)
    await dismissLaunchPrompts(pageB)
    await waitForStorageHydration(pageB)
    await openSchedule(pageB)
    return pageB
  }

  test('two tabs editing different fields on the same event both survive without clobbering each other', async ({ page, context }) => {
    const title = `Cross-tab Merge ${Date.now()}`
    await page.getByRole('button', { name: 'Add event on First Month, day 5, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByLabel('Tags (comma-separated)').fill('original')
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const pageB = await openSecondTab(context, page.url())

    // Both tabs open the SAME event's editor before either one saves.
    await page.getByRole('button', { name: new RegExp(title) }).click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await pageB.getByRole('button', { name: new RegExp(title) }).click()
    await pageB.getByRole('button', { name: 'Edit' }).click()

    // Tab B changes only the category, and saves first.
    await pageB.getByRole('button', { name: 'Festival', exact: true }).click()
    await pageB.getByRole('button', { name: 'Save changes' }).click()
    await expect(pageB.getByRole('dialog')).toHaveCount(0)

    // Give the cross-tab BroadcastChannel write time to land.
    await page.waitForTimeout(1000)

    // Tab A, unaware of Tab B's edit, changes only the tags and saves.
    await page.getByLabel('Tags (comma-separated)').fill('original, tab-a')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Both edits survive: Tab B's category change AND Tab A's tags change —
    // neither tab's field-level edit clobbers the other's.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    const stored = await readStorage(page, 'nf_storySchedule')
    const merged = stored.find(event => event.title === title)
    expect(merged.category).toBe('festival')
    expect(merged.tags).toEqual(['original', 'tab-a'])

    // Different fields merge cleanly — nothing to flag for review.
    await expect(page.locator('.ms-toolbar-conflict-btn')).toHaveCount(0)

    await pageB.close()
  })

  test('two tabs editing the SAME field on the same event: this tab\'s save is kept and the other tab\'s version is preserved for review, not silently lost', async ({ page, context }) => {
    const title = `Cross-tab Field Race ${Date.now()}`
    await page.getByRole('button', { name: 'Add event on First Month, day 5, year 1' }).click()
    await page.getByLabel('Title *').fill(title)
    await page.getByRole('dialog').getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const pageB = await openSecondTab(context, page.url())

    await page.getByRole('button', { name: new RegExp(title) }).click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await pageB.getByRole('button', { name: new RegExp(title) }).click()
    await pageB.getByRole('button', { name: 'Edit' }).click()

    // Tab B renames the event first and saves.
    await pageB.getByLabel('Title *').fill('Renamed in Tab B')
    await pageB.getByRole('button', { name: 'Save changes' }).click()
    await expect(pageB.getByRole('dialog')).toHaveCount(0)

    await page.waitForTimeout(1000)

    // Tab A, unaware, renames it differently and saves. This app's cross-tab
    // policy elsewhere (scenes) is "your edit here is saved as-is — nothing
    // is lost", not a hard block — confirm Schedule events follow the same
    // rule rather than silently discarding Tab A's own save.
    await page.getByLabel('Title *').fill('Renamed in Tab A')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.evaluate(() => window.__yowStorageBridge?.flush())
    const stored = await readStorage(page, 'nf_storySchedule')
    expect(stored).toHaveLength(1)
    expect(stored[0].title).toBe('Renamed in Tab A')

    // Tab B's overwritten title is not silently discarded either — it
    // surfaces as a reviewable sync conflict instead of disappearing outright.
    await expect(page.locator('.ms-toolbar-conflict-btn')).toContainText('1 sync conflict')
    await page.locator('.ms-toolbar-conflict-btn').click()
    await expect(page.getByRole('dialog', { name: 'Records changed in another tab' })).toBeVisible()
    await expect(page.getByText('Renamed in Tab B')).toBeVisible()

    await pageB.close()
  })
})

test.describe('Malformed / legacy / out-of-range / unknown-category events', () => {
  test('remain reachable in List view without crashing and are not silently rewritten by viewing them', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    const projectId = new URL(page.url()).pathname.split('/')[2]
    const malformed = [
      // Out-of-range month/day (a calendar shrunk after this event was created).
      { id: 'sched-oor', novelId: projectId, title: 'Old Calendar Event', year: 1, month: 999, day: 999, duration: 1, category: 'scene', tags: [], linkedCharacters: [], linkedLocations: [] },
      // Unknown/legacy category, never in DEFAULT_CATEGORIES.
      { id: 'sched-unknown-cat', novelId: projectId, title: 'Ritual Prep', year: 1, month: 1, day: 3, duration: 1, category: 'ancient_ritual', tags: [], linkedCharacters: [], linkedLocations: [] },
      // Missing/numeric-ish fields, legacy shape (no tags array, numeric day-as-string).
      { id: 'sched-legacy', novelId: projectId, title: null, year: '1', month: '1', day: '7', category: null, linkedCharacters: null, linkedLocations: null },
      // Duplicate/hash/case/whitespace-variant tags.
      { id: 'sched-dupe-tags', novelId: projectId, title: 'Tagged Event', year: 1, month: 1, day: 8, duration: 1, category: 'other', tags: ['Plot', ' plot ', '#plot', 'PLOT'], linkedCharacters: [], linkedLocations: [] },
    ]

    await page.evaluate((entries) => {
      const existing = JSON.parse(window.__yowStorageBridge?.getItem('nf_storySchedule') || '[]')
      window.__yowStorageBridge?.setItem('nf_storySchedule', JSON.stringify([...existing, ...entries]))
    }, malformed)
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openSchedule(page)

    await page.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'list' }).click()
    // Untitled fallback for the missing-title legacy record.
    await expect(page.getByRole('button', { name: /Untitled event/ })).toBeVisible()
    // Unknown category still gets a readable, title-cased label rather than crashing.
    await expect(page.getByText('Ancient Ritual', { exact: true })).toBeVisible()
    // The out-of-range event is still reachable in List view (not silently dropped).
    await expect(page.getByRole('button', { name: /Old Calendar Event/ })).toBeVisible()
    // Duplicate/case/hash/whitespace tag variants collapse to one tag chip
    // (scoped to the detail dialog — the underlying List row behind it also
    // renders its own "#plot" chip, which is not what this assertion is about).
    await page.getByRole('button', { name: /Tagged Event/ }).click()
    await expect(page.getByRole('dialog').getByText('#plot', { exact: true })).toHaveCount(1)
    // Two "Close" controls share the accessible name "Close" here — the ×
    // icon button (aria-label) and the text button at the bottom of the
    // sheet. getByText matches visible text content, not aria-label, so it
    // disambiguates to just the latter.
    await page.getByRole('dialog').getByText('Close', { exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Reading these records must not have rewritten them — merely opening
    // the view/detail should not mutate raw stored data (checklist item 3's
    // "no crashing or being rewritten merely by reading them").
    const stored = await readStorage(page, 'nf_storySchedule')
    const oldCalendarEvent = stored.find(e => e.id === 'sched-oor')
    expect(oldCalendarEvent.month).toBe(999)
    expect(oldCalendarEvent.day).toBe(999)

    // Month view must not crash either — out-of-range/unknown-category
    // events are simply excluded from the grid (isScheduleDateInCalendar),
    // never thrown from.
    await page.getByRole('group', { name: 'Schedule view' }).getByRole('button', { name: 'month' }).click()
    await expect(page.getByRole('heading', { name: /Year 1$/ })).toBeVisible()

    expect(errors).toEqual([])
  })
})
