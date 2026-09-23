import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

// Browser-rendered coverage for the Lore corrective-audit follow-up
// (docs/QA_PLAN.md Priority 6, "Lore corrective-audit follow-up
// (2026-09-03...)") and the docs/ROADMAP.md "Lore encyclopedia" row — both
// were implemented and unit/store-tested but explicitly marked "browser QA
// pending" before this spec. This covers the parts of that 7-item checklist
// a real rendered browser in offline mode (no live Stripe/Supabase
// credentials, no real account, no live AI provider) can exercise: category/
// tag grouping and search over malformed data (item 1), sort/filter
// combinations (item 2), whitespace-title validation and discard protection
// (item 3), character/location/lore link chips including History vs Timeline
// navigation (item 4), export rendering (item 6), and a responsive pass
// (item 7). Item 5 explicitly needs a real synced multi-project series
// against live Supabase and is entirely out of scope here — see the doc
// updates alongside this spec for exactly what remains open, item by item.

async function openLore(page) {
  await page.getByRole('button', { name: 'Lore' }).first().click()
  // The "Lore" room remembers whichever of its three sub-tabs (Lore/
  // Timeline/History) was last active — after a jumpTo() navigated to
  // History or Timeline, simply reopening the room lands back on that
  // remembered tab, not "Lore" itself. Force the specific sub-tab, same
  // pattern as schedule-corrective-audit.spec.js's openSchedule().
  const loreTab = page.locator('.studio-tab').filter({ hasText: /^Lore$/ })
  if (await loreTab.count()) await loreTab.click()
  await page.getByRole('button', { name: 'New' }).first().waitFor({ state: 'visible' })
}

async function seedLoreEntries(page, entries) {
  await page.evaluate((newEntries) => {
    const existing = JSON.parse(window.__yowStorageBridge?.getItem('nf_loreEntries') || '[]')
    window.__yowStorageBridge?.setItem('nf_loreEntries', JSON.stringify([...existing, ...newEntries]))
  }, entries)
}

async function reloadAndOpenLore(page) {
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await openLore(page)
}

async function createLoreEntry(page, { title, category, tag }) {
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.getByPlaceholder(/binding laws/i).fill(title)
  if (category) await page.getByRole('dialog').getByLabel('Category').fill(category)
  if (tag) {
    await page.getByRole('dialog').getByLabel('Tags').fill(tag)
    await page.getByRole('dialog').getByLabel('Tags').press('Enter')
  }
  await page.getByRole('button', { name: 'Save Entry' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Lore QA ${Date.now()}` })
  await openLore(page)
})

test.describe('Category grouping, malformed data, and search', () => {
  test('groups malformed/edge-case categories, supports collapse and numeric search, dedupes duplicate link ids, and never rewrites raw storage merely by reading it', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    const projectId = new URL(page.url()).pathname.split('/')[2]

    // A real character/location so the duplicate-link-id case has something
    // concrete to dedupe against (fake ids that resolve to nothing would
    // never render a chip either way, proving nothing).
    await page.evaluate((novelId) => {
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify([
        { id: 'lca-char-1', novelId, name: 'Aria Nightshade' },
      ]))
      window.__yowStorageBridge?.setItem('nf_locations', JSON.stringify([
        { id: 'lca-loc-1', novelId, name: 'Sunken Archive' },
      ]))
    }, projectId)

    await seedLoreEntries(page, [
      // Numeric title/content.
      { id: 'lca-numeric', novelId: projectId, title: 42, category: 'Magic System', content: 12345, tags: [], characterIds: [], locationIds: [], loreIds: [] },
      // Blank category -> falls into "Uncategorized".
      { id: 'lca-blank-cat', novelId: projectId, title: 'Blank Category Entry', category: '', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
      // Category literally named "All" (collides with the "All categories" filter option's label).
      { id: 'lca-all-cat', novelId: projectId, title: 'All Category Entry', category: 'All', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
      // Prototype-pollution-shaped category names used as plain Map keys.
      { id: 'lca-proto', novelId: projectId, title: 'Proto Entry', category: '__proto__', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
      { id: 'lca-ctor', novelId: projectId, title: 'Ctor Entry', category: 'constructor', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
      // Duplicate link ids referencing the SAME real character/location twice.
      { id: 'lca-dupe-links', novelId: projectId, title: 'Dupe Links Entry', category: 'Other', content: '', tags: [], characterIds: ['lca-char-1', 'lca-char-1'], locationIds: ['lca-loc-1', 'lca-loc-1'], loreIds: [] },
      // Case/hash/whitespace-variant duplicate tags.
      { id: 'lca-tags', novelId: projectId, title: 'Tag Variants Entry', category: 'Other', content: '', tags: ['Magic', ' magic ', '#MAGIC', 'magic'], characterIds: [], locationIds: [], loreIds: [] },
    ])
    await reloadAndOpenLore(page)

    // Every edge-case category renders as its own visible group with a
    // correct count, without the page crashing on "__proto__"/"constructor"
    // as a Map key.
    await expect(page.getByText('Uncategorized (1)', { exact: true })).toBeVisible()
    await expect(page.getByText('All (1)', { exact: true })).toBeVisible()
    await expect(page.getByText('__proto__ (1)', { exact: true })).toBeVisible()
    await expect(page.getByText('constructor (1)', { exact: true })).toBeVisible()
    await expect(page.getByText('Other (2)', { exact: true })).toBeVisible()

    // Collapse/expand a group.
    const protoHeader = page.getByRole('button', { name: '__proto__ (1) -' })
    await expect(protoHeader).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.studio-record', { hasText: 'Proto Entry' })).toBeVisible()
    await protoHeader.click()
    await expect(page.getByRole('button', { name: '__proto__ (1) +' })).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.studio-record', { hasText: 'Proto Entry' })).not.toBeVisible()
    await page.getByRole('button', { name: '__proto__ (1) +' }).click()
    await expect(page.locator('.studio-record', { hasText: 'Proto Entry' })).toBeVisible()

    // Numeric search: only the numerically-titled entry surfaces, and other
    // groups disappear entirely rather than rendering empty.
    await page.getByLabel('Search lore').fill('42')
    await expect(page.locator('.studio-record', { hasText: '42' })).toBeVisible()
    await expect(page.getByText('__proto__ (1)', { exact: true })).not.toBeVisible()
    await expect(page.getByText('Uncategorized (1)', { exact: true })).not.toBeVisible()
    await page.getByLabel('Search lore').fill('')

    // Duplicate link ids collapse to one chip each, not two.
    await page.locator('.studio-record', { hasText: 'Dupe Links Entry' }).click()
    await expect(page.getByRole('heading', { name: 'Dupe Links Entry' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aria Nightshade' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Sunken Archive' })).toHaveCount(1)

    // Duplicate/case/hash/whitespace tag variants collapse to a single chip.
    await page.locator('.studio-record', { hasText: 'Tag Variants Entry' }).click()
    await expect(page.getByRole('heading', { name: 'Tag Variants Entry' })).toBeVisible()
    await expect(page.locator('.studio-page-header').getByText('#Magic', { exact: true })).toHaveCount(1)

    // Reading/opening/collapsing/searching must not have rewritten the raw
    // stored records (item 1's "without rewriting raw stored records merely
    // by reading them").
    const stored = await readStorage(page, 'nf_loreEntries')
    const protoEntry = stored.find(e => e.id === 'lca-proto')
    expect(protoEntry.category).toBe('__proto__')
    const tagEntry = stored.find(e => e.id === 'lca-tags')
    expect(tagEntry.tags).toEqual(['Magic', ' magic ', '#MAGIC', 'magic'])
    const dupeEntry = stored.find(e => e.id === 'lca-dupe-links')
    expect(dupeEntry.characterIds).toEqual(['lca-char-1', 'lca-char-1'])

    expect(errors).toEqual([])
  })
})

test.describe('Sort and filter combinations', () => {
  test('exercises all four sort choices, scopes the tag filter to Lore-only tags while the editor suggests cross-section tags, recovers from an externally-removed filter, reveals a saved entry despite stale filters, and follows a related-lore link across a filtered category', async ({ page }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]

    // A character-only tag (never used by any Lore entry) proves the Lore
    // tag *filter* is scoped to Lore's own tags, while a shared tag proves
    // the entry *editor's* suggestions still pull in other project sections.
    await page.evaluate((novelId) => {
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify([
        { id: 'lsf-char-1', novelId, name: 'Tag Source Character', keywords: ['character-exclusive-tag', 'shared-tag'] },
      ]))
    }, projectId)

    await seedLoreEntries(page, [
      { id: 'lsf-alpha-b', novelId: projectId, title: 'B Category Entry', category: 'Alpha Category', content: '', tags: ['shared-tag'], characterIds: [], locationIds: [], loreIds: [] },
      { id: 'lsf-alpha-a', novelId: projectId, title: 'A Category Entry', category: 'Alpha Category', content: '', tags: ['unique-lore-tag'], characterIds: [], locationIds: [], loreIds: [] },
      { id: 'lsf-zulu-y', novelId: projectId, title: 'Y Zulu Entry', category: 'Zulu Category', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
      { id: 'lsf-zulu-x', novelId: projectId, title: 'X Zulu Entry', category: 'Zulu Category', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
    ])
    await reloadAndOpenLore(page)

    const recordTitles = () => page.locator('.studio-record .text-sm').allTextContents()

    // Default is Title A→Z: groups are always alphabetical by category
    // ascending unless "Category Z→A" is chosen (confirmed directly against
    // loreEntries.js's groupLoreEntries, which always sorts groups by
    // category ascending except that one explicit case) — Alpha before Zulu,
    // titles ascending within each.
    expect(await recordTitles()).toEqual(['A Category Entry', 'B Category Entry', 'X Zulu Entry', 'Y Zulu Entry'])

    await page.getByLabel('Sort lore').selectOption('title-desc')
    expect(await recordTitles()).toEqual(['B Category Entry', 'A Category Entry', 'Y Zulu Entry', 'X Zulu Entry'])

    await page.getByLabel('Sort lore').selectOption('category-desc')
    expect(await recordTitles()).toEqual(['X Zulu Entry', 'Y Zulu Entry', 'A Category Entry', 'B Category Entry'])

    await page.getByLabel('Sort lore').selectOption('category-asc')
    expect(await recordTitles()).toEqual(['A Category Entry', 'B Category Entry', 'X Zulu Entry', 'Y Zulu Entry'])

    await page.getByLabel('Sort lore').selectOption('title-asc')

    // The Lore tag FILTER only ever lists tags actually used by a Lore
    // entry — the character-exclusive tag never appears there.
    const tagFilterOptions = await page.getByLabel('Filter by tag').locator('option').allTextContents()
    expect(tagFilterOptions).toContain('#shared-tag')
    expect(tagFilterOptions).toContain('#unique-lore-tag')
    expect(tagFilterOptions).not.toContain('#character-exclusive-tag')

    // Combined search + category + tag filter narrows to exactly one entry.
    await page.getByLabel('Filter by category').selectOption('Alpha Category')
    await page.getByLabel('Filter by tag').selectOption('unique-lore-tag')
    await page.getByLabel('Search lore').fill('A Category')
    expect(await recordTitles()).toEqual(['A Category Entry'])
    await page.getByLabel('Search lore').fill('')
    await page.getByLabel('Filter by tag').selectOption('')
    await page.getByLabel('Filter by category').selectOption('')

    // The entry editor's own tag suggestions (cross-section, unlike the
    // sidebar tag filter above) DO include a tag that only a character uses.
    await page.getByRole('button', { name: 'New' }).first().click()
    const tagDatalistOptions = await page.locator('datalist option').evaluateAll(
      opts => opts.map(o => o.value),
    )
    expect(tagDatalistOptions).toContain('character-exclusive-tag')
    await page.getByRole('button', { name: 'Cancel' }).click()

    // An externally-removed category/tag filter recovers to "All" rather
    // than getting stuck on a value that no longer exists. Give one entry a
    // unique category AND unique tag, filter down to just it, delete it, and
    // confirm both selects revert.
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Solo Entry')
    await page.getByRole('dialog').getByLabel('Category').fill('Solo Category')
    await page.getByRole('dialog').getByLabel('Tags').fill('solo-tag')
    await page.getByRole('dialog').getByLabel('Tags').press('Enter')
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByLabel('Filter by category').selectOption('Solo Category')
    await page.getByLabel('Filter by tag').selectOption('solo-tag')
    await expect(page.getByLabel('Filter by category')).toHaveValue('Solo Category')
    await expect(page.getByLabel('Filter by tag')).toHaveValue('solo-tag')

    await page.locator('.studio-record', { hasText: 'Solo Entry' }).click()
    await page.evaluate(() => { window.confirm = () => true })
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByLabel('Filter by category')).toHaveValue('')
    await expect(page.getByLabel('Filter by tag')).toHaveValue('')
    // The rest of the list is still usable, not left in a broken state.
    expect(await recordTitles()).toEqual(['A Category Entry', 'B Category Entry', 'X Zulu Entry', 'Y Zulu Entry'])

    // A successful save reveals and selects the returned entry even though
    // the current search hides everything and a group is collapsed.
    await page.getByLabel('Search lore').fill('zzz-nonexistent-zzz')
    await expect(page.getByText('No results.', { exact: true })).toBeVisible()
    // Re-show to collapse a group before filtering it away again.
    await page.getByLabel('Search lore').fill('')
    const alphaHeader = page.getByRole('button', { name: 'Alpha Category (2) -' })
    await alphaHeader.click()
    await page.getByLabel('Search lore').fill('zzz-nonexistent-zzz')

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Revealed Entry')
    await page.getByRole('dialog').getByLabel('Category').fill('Alpha Category')
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByLabel('Search lore')).toHaveValue('')
    await expect(page.getByRole('heading', { name: 'Revealed Entry' })).toBeVisible()
    await expect(page.locator('.studio-record', { hasText: 'Revealed Entry' })).toBeVisible()

    // Following a related-lore link into a different, currently-filtered-out
    // category reveals the destination.
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Hidden Target')
    await page.getByRole('dialog').getByLabel('Category').fill('Zulu Category')
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Linking Source')
    await page.getByRole('dialog').getByLabel('Category').fill('Alpha Category')
    await page.getByRole('dialog').getByRole('button', { name: 'Hidden Target', exact: true }).click()
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.getByLabel('Filter by category').selectOption('Alpha Category')
    await page.locator('.studio-record', { hasText: 'Linking Source' }).click()
    await expect(page.getByRole('heading', { name: 'Linking Source' })).toBeVisible()
    await page.locator('.studio-detail').getByRole('button', { name: 'Hidden Target', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Hidden Target' })).toBeVisible()
    await expect(page.getByLabel('Filter by category')).toHaveValue('')
  })
})

test.describe('Whitespace-title validation and discard protection', () => {
  test('retains an invalid draft through the discard prompt\'s own Save retry, includes an unsubmitted tag on a real save, and protects link/tag-only edits', async ({ page }) => {
    // Whitespace-only title is refused, and the draft survives.
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('   ')
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('alert')).toHaveText('Enter a title for this lore entry.')
    await expect(page.getByRole('dialog')).toBeVisible()

    // Attempting to close a dirty form shows the unsaved-changes prompt, and
    // the prompt's own "Save" button retries the submit — which fails
    // validation again (still invalid) but must NOT silently lose the draft:
    // the prompt should disappear while the editor itself stays open with
    // the same inline error, so the user can actually fix it.
    await page.keyboard.press('Escape')
    const prompt = page.locator('.save-changes-prompt')
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Save' }).click()
    await expect(prompt).not.toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText('Enter a title for this lore entry.')
    await expect(page.getByPlaceholder(/binding laws/i)).toHaveValue('   ')

    // Fix the title, add a tag WITHOUT pressing Enter (an unsubmitted
    // pending tag), and confirm Save includes it anyway.
    const title = `Retry Save Entry ${Date.now()}`
    await page.getByPlaceholder(/binding laws/i).fill(title)
    await page.getByRole('dialog').getByLabel('Tags').fill('pending-tag')
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    const stored = await readStorage(page, 'nf_loreEntries')
    const saved = stored.find(e => e.title === title)
    expect(saved.tags).toContain('pending-tag')

    // Changing only a link (no text field) still counts as dirty and still
    // triggers discard protection.
    await page.locator('.studio-record', { hasText: title }).click()
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.getByRole('group', { name: 'Linked Characters' }).getByText('None yet.').isVisible().catch(() => {})
    // No characters exist yet in this project, so exercise the tag-only path
    // instead (removing the one chip we just saved) — still a non-text-field
    // change, which is exactly what this item calls out.
    await page.getByRole('button', { name: 'Remove tag pending-tag' }).click()
    await page.mouse.click(10, 10) // backdrop click; this Modal does not opt out of closeOnBackdrop
    await expect(page.locator('.save-changes-prompt')).toBeVisible()
    await page.locator('.save-changes-prompt').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.save-changes-prompt')).not.toBeVisible()
    await expect(page.getByRole('dialog')).toBeVisible()
    // Cancel button on the form itself is also intercepted the same way.
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('.save-changes-prompt')).toBeVisible()
    await page.locator('.save-changes-prompt').getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Discarded — the tag removal was never saved.
    const afterDiscard = await readStorage(page, 'nf_loreEntries')
    expect(afterDiscard.find(e => e.title === title).tags).toContain('pending-tag')

    // Blocked index switching while an unrelated New Entry form is open.
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Distraction Draft')
    await expect(page.locator('.studio-record', { hasText: title })).toBeDisabled()
    await page.locator('.studio-record', { hasText: title }).click({ force: true })
    // Still on the New Entry form — clicking a disabled record must not switch.
    await expect(page.getByRole('dialog', { name: 'New Lore Entry' })).toBeVisible()
    await expect(page.getByPlaceholder(/binding laws/i)).toHaveValue('Distraction Draft')
    await page.locator('.save-changes-prompt').getByRole('button', { name: 'Discard' }).click().catch(() => {})
    // If no prompt appeared (nothing dirty registered from the forced
    // click), close via Escape + Discard as a fallback so state is clean.
    if (await page.getByRole('dialog').isVisible().catch(() => false)) {
      await page.keyboard.press('Escape')
      const discardBtn = page.locator('.save-changes-prompt').getByRole('button', { name: 'Discard' })
      if (await discardBtn.isVisible().catch(() => false)) await discardBtn.click()
    }

    // Switching projects mid-draft does not save the draft into either
    // project — LoreWorkspace is keyed by activeNovelId, so a project switch
    // hard-remounts it and the in-progress draft is simply gone, not
    // persisted anywhere.
    await page.getByRole('button', { name: 'New' }).first().click()
    const strayTitle = `Should Never Persist ${Date.now()}`
    await page.getByPlaceholder(/binding laws/i).fill(strayTitle)
    await page.goto('/')
    await createProject(page, { title: `Lore QA Second ${Date.now()}` })
    await openLore(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const secondProjectLore = await readStorage(page, 'nf_loreEntries')
    expect(secondProjectLore.some(e => e.title === strayTitle)).toBe(false)
  })
})

test.describe('Character/location/lore link chips', () => {
  test('links characters/locations/lore, dedupes reciprocal links, keeps incoming-only references distinct, survives an id collision across entity types, and routes History vs Timeline tag matches to the right destination', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await page.evaluate((novelId) => {
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify([
        { id: 'lcc-char-1', novelId, name: 'Rowan Vale' },
      ]))
      window.__yowStorageBridge?.setItem('nf_locations', JSON.stringify([
        { id: 'lcc-loc-1', novelId, name: 'The Hollow' },
      ]))
      // A World History entry and a Timeline event sharing a tag with a Lore
      // entry we'll create below, to prove tag-match chips route to the
      // correct distinct section.
      window.__yowStorageBridge?.setItem('nf_worldHistory', JSON.stringify([
        { id: 'lcc-history-1', novelId, title: 'The Age of Ash', content: '', tags: ['prophecy'] },
      ]))
      window.__yowStorageBridge?.setItem('nf_timeline', JSON.stringify([
        { id: 'lcc-timeline-1', novelId, title: 'The Falling Star', tags: ['prophecy'], year: 1 },
      ]))
    }, projectId)
    await reloadAndOpenLore(page)

    // Create the target entry first.
    await createLoreEntry(page, { title: 'Ancient Pact', category: 'Lore' })

    // Create the source entry, linking character, location, and the target lore entry.
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Binding Laws')
    await page.getByRole('dialog').getByRole('button', { name: 'Rowan Vale', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'The Hollow', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Ancient Pact', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Tags').fill('prophecy')
    await page.getByRole('dialog').getByLabel('Tags').press('Enter')
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page.getByRole('heading', { name: 'Binding Laws' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rowan Vale' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'The Hollow' })).toBeVisible()
    await expect(page.locator('.studio-detail').getByRole('button', { name: 'Ancient Pact', exact: true })).toBeVisible()

    // Ancient Pact has no outgoing link back yet — it must show an
    // incoming-only reference ("← Binding Laws"), not a plain outgoing chip.
    await page.locator('.studio-record', { hasText: 'Ancient Pact' }).click()
    await expect(page.getByRole('heading', { name: 'Ancient Pact' })).toBeVisible()
    await expect(page.getByRole('button', { name: '← Binding Laws' })).toBeVisible()

    // Make it reciprocal: Ancient Pact also links back to Binding Laws.
    await page.getByRole('button', { name: 'Edit' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: 'Binding Laws', exact: true }).click()
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Reciprocal links must not double up: Ancient Pact now has Binding Laws
    // as an OUTGOING link, so it must not also render as a separate incoming
    // "← Binding Laws" chip.
    await expect(page.getByRole('button', { name: '← Binding Laws' })).toHaveCount(0)
    await expect(page.locator('.studio-detail').getByRole('button', { name: 'Binding Laws', exact: true })).toHaveCount(1)

    // Same check from Binding Laws' side.
    await page.locator('.studio-record', { hasText: 'Binding Laws' }).click()
    await expect(page.getByRole('heading', { name: 'Binding Laws' })).toBeVisible()
    await expect(page.getByRole('button', { name: '← Ancient Pact' })).toHaveCount(0)
    await expect(page.locator('.studio-detail').getByRole('button', { name: 'Ancient Pact', exact: true })).toHaveCount(1)

    // Unlink one reference (the character) and confirm the detail refreshes
    // immediately, then again after reload.
    await page.getByRole('button', { name: 'Edit' }).first().click()
    // Already-linked LinkPicker buttons prefix a "✓ " checkmark onto their
    // accessible name (LinkPicker's `{active && <span>✓</span>}{getLabel(item)}`),
    // so this toggle-off match is intentionally not `exact`.
    await page.getByRole('dialog').getByRole('button', { name: 'Rowan Vale' }).click() // toggle off
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Rowan Vale' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'The Hollow' })).toBeVisible()

    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openLore(page)
    await page.locator('.studio-record', { hasText: 'Binding Laws' }).click()
    await expect(page.getByRole('button', { name: 'Rowan Vale' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'The Hollow' })).toBeVisible()

    // Equal ids across different entity types: seed a Lore entry whose id
    // collides with the real character's id. It must render independently
    // and must never leak into Binding Laws' character/lore reference chips.
    await seedLoreEntries(page, [
      { id: 'lcc-char-1', novelId: projectId, title: 'Collision Entry', category: 'Other', content: '', tags: [], characterIds: [], locationIds: [], loreIds: [] },
    ])
    await reloadAndOpenLore(page)
    await expect(page.locator('.studio-record', { hasText: 'Collision Entry' })).toBeVisible()
    await page.locator('.studio-record', { hasText: 'Binding Laws' }).click()
    await expect(page.getByRole('heading', { name: 'Binding Laws' })).toBeVisible()
    await expect(page.locator('.studio-detail').getByText('Collision Entry')).toHaveCount(0)
    await page.locator('.studio-record', { hasText: 'Collision Entry' }).click()
    await expect(page.getByRole('heading', { name: 'Collision Entry' })).toBeVisible()
    await expect(page.getByText('Related Lore', { exact: true })).toHaveCount(0)

    // Related-By-Tag chips route to the correct, distinct destination:
    // History vs Timeline, both sharing the "prophecy" tag with Binding Laws.
    await page.locator('.studio-record', { hasText: 'Binding Laws' }).click()
    await expect(page.getByRole('heading', { name: 'Binding Laws' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'History: The Age of Ash' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Timeline: The Falling Star' })).toBeVisible()

    await page.getByRole('button', { name: 'History: The Age of Ash' }).click()
    await expect(page.getByRole('heading', { name: 'History', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'The Age of Ash' })).toBeVisible()

    await openLore(page)
    await page.locator('.studio-record', { hasText: 'Binding Laws' }).click()
    await page.getByRole('button', { name: 'Timeline: The Falling Star' }).click()
    await expect(page.getByRole('heading', { name: 'Timeline', level: 2 })).toBeVisible()

    expect(errors).toEqual([])
  })
})

test.describe('Export rendering', () => {
  test('a full-project export includes Lore reference names, and a Lore-only export (other sections disabled) drops other sections while keeping linked names without leaking biographies', async ({ page }) => {
    test.setTimeout(90_000)
    const projectId = new URL(page.url()).pathname.split('/')[2]
    const charBioMarker = `UNIQUE_BIO_MARKER_${Date.now()}`
    const locDescMarker = `UNIQUE_DESC_MARKER_${Date.now()}`

    await page.evaluate(({ novelId, charBioMarker, locDescMarker }) => {
      window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify([
        { id: 'lex-char-1', novelId, name: 'Export Character', bio: charBioMarker },
      ]))
      window.__yowStorageBridge?.setItem('nf_locations', JSON.stringify([
        { id: 'lex-loc-1', novelId, name: 'Export Location', description: locDescMarker },
      ]))
    }, { novelId: projectId, charBioMarker, locDescMarker })
    await reloadAndOpenLore(page)

    await createLoreEntry(page, { title: 'Export Target Entry', category: 'Lore' })
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByPlaceholder(/binding laws/i).fill('Export Source Entry')
    await page.getByRole('dialog').getByRole('button', { name: 'Export Character', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Export Location', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Export Target Entry', exact: true }).click()
    await page.getByRole('button', { name: 'Save Entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Full-project export: Lore.docx exists and contains the linked names.
    await page.getByRole('button', { name: 'Project settings' }).click()
    const fullDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    const fullDownload = await fullDownloadPromise
    const fullZip = unzipSync(new Uint8Array(readFileSync(await fullDownload.path())))
    const loreEntryName = Object.keys(fullZip).find(name => /-Lore\.docx$/.test(name))
    expect(loreEntryName, `expected a Lore.docx entry among: ${Object.keys(fullZip).join(', ')}`).toBeTruthy()
    const loreDocXml = strFromU8(unzipSync(fullZip[loreEntryName])['word/document.xml'])
    expect(loreDocXml).toContain('Export Source Entry')
    expect(loreDocXml).toContain('Export Character')
    expect(loreDocXml).toContain('Export Location')
    expect(loreDocXml).toContain('Export Target Entry')

    // Disable every section except Lore, then export again. Collect every
    // currently-enabled switch's label up front and toggle each off in turn,
    // waiting for that exact switch's own aria-checked to flip before moving
    // on — clicking through a live re-queried locator in a tight loop with
    // only a fixed sleep between clicks was observed to occasionally race
    // React's commit (a benign dev-mode "setState while rendering" console
    // warning from Layout.jsx's ProjectSettings, not a data-safety issue —
    // see the doc note alongside this spec), so this waits on real state
    // rather than a timeout.
    const enabledLabels = await page.locator('[role="switch"][aria-checked="true"]').evaluateAll(
      nodes => nodes.map(n => n.getAttribute('aria-label')),
    )
    for (const label of enabledLabels) {
      if (label === 'Lore') continue
      const toggle = page.getByRole('switch', { name: label, exact: true })
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false')
    }
    await expect(page.getByRole('switch', { name: 'Lore' })).toHaveAttribute('aria-checked', 'true')

    const loreOnlyDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    const loreOnlyDownload = await loreOnlyDownloadPromise
    const loreOnlyZip = unzipSync(new Uint8Array(readFileSync(await loreOnlyDownload.path())))
    const entryNames = Object.keys(loreOnlyZip)
    expect(entryNames.some(name => /-Lore\.docx$/.test(name))).toBe(true)
    expect(entryNames.some(name => /-Characters\.docx$/.test(name))).toBe(false)
    expect(entryNames.some(name => /-Locations\.docx$/.test(name))).toBe(false)

    // Across every remaining .docx in the Lore-only export, linked names
    // appear somewhere, but neither the character's biography nor the
    // location's description text ever does.
    let combinedText = ''
    for (const name of entryNames) {
      const inner = unzipSync(loreOnlyZip[name])
      if (inner['word/document.xml']) combinedText += strFromU8(inner['word/document.xml'])
    }
    expect(combinedText).toContain('Export Character')
    expect(combinedText).toContain('Export Location')
    expect(combinedText).not.toContain(charBioMarker)
    expect(combinedText).not.toContain(locDescMarker)
  })
})

test.describe('Responsive layout', () => {
  for (const viewport of [{ width: 375, height: 700, label: '375px' }, { width: 768, height: 900, label: '768px' }, { width: 1280, height: 900, label: 'desktop' }]) {
    test(`the Lore index, detail, and editor are usable at ${viewport.label} with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })

      // Saving a new entry selects it directly (no click on a sidebar
      // .studio-record), so the mobile index-vs-detail collapse (<=860px,
      // StudioSplit's is-mobile-index-collapsed) isn't triggered yet here —
      // both panels are reachable and the sidebar controls are checked first.
      await createLoreEntry(page, { title: 'Responsive Check Entry', category: 'Lore', tag: 'responsive' })
      await expect(page.getByRole('heading', { name: 'Responsive Check Entry' })).toBeVisible()

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
      expect(overflow).toBe(false)

      await expect(page.getByLabel('Search lore')).toBeVisible()
      await expect(page.getByLabel('Filter by category')).toBeVisible()
      await expect(page.getByLabel('Filter by tag')).toBeVisible()
      await expect(page.getByLabel('Sort lore')).toBeVisible()

      // Now deliberately tap the sidebar record itself — on <=860px widths
      // this collapses the index behind a "Browse list" toggle so the
      // detail pane gets the full screen; confirm that round-trips cleanly.
      if (viewport.width <= 860) {
        await page.locator('.studio-record', { hasText: 'Responsive Check Entry' }).click()
        await expect(page.getByRole('heading', { name: 'Responsive Check Entry' })).toBeVisible()
        const browseList = page.getByRole('button', { name: 'Browse list' })
        await expect(browseList).toBeVisible()
        await browseList.click()
        await expect(page.getByLabel('Search lore')).toBeVisible()
        await page.locator('.studio-record', { hasText: 'Responsive Check Entry' }).click()
        await expect(page.getByRole('heading', { name: 'Responsive Check Entry' })).toBeVisible()
      }

      await page.getByRole('button', { name: 'Edit' }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const dialogOverflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1)
      expect(dialogOverflow).toBe(false)
      await expect(page.getByPlaceholder(/binding laws/i)).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
    })
  }
})
