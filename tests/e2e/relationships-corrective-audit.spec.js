import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import {
  createProject, dismissLaunchPrompts, openProjectSettings, readStorage,
  seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

// Browser-rendered coverage for the Relationships corrective-audit follow-up
// (docs/QA_PLAN.md Priority 6, "Relationships corrective-audit follow-up
// (2026-09-03...)") — implemented and unit/component/store/export-tested
// (src/utils/relationshipMap.test.js, src/components/relationships/
// RelationshipMap.test.jsx) but explicitly marked "browser/live-sync/render
// verification deferred" before this spec.
//
// Follows the same scope split as tests/e2e/lore-corrective-audit.spec.js and
// tests/e2e/schedule-corrective-audit.spec.js: the parts of that 5-item
// checklist a real rendered browser in offline mode (no live Supabase/AI
// credentials, no real account) can exercise are covered here with real new
// Playwright specs — same-pair multi-type/reverse social links, family-link
// survival across reload, unknown-imported-type labels and secret-family-fact
// exclusion (item 1), add/remove-connection validation and draft protection
// including a genuine two-real-tab external delete (item 2), dense-cast
// rendering/badges/responsive layout (item 4), and DOCX export section
// boundaries (item 5, DOCX only — see that describe block's own note on why
// HTML/PDF and 32+-link stress content are not attempted this pass, matching
// the Lore audit's own DOCX-only judgment call). Item 3 (a real synced
// three-project series against live Supabase) is entirely out of scope here
// — see the doc updates alongside this spec for exactly what remains open,
// item by item. The free-tier per-project read-only path is also not
// attempted, for the same reason the Schedule/Lore audits gave: this offline
// fixture user isn't on a plan that naturally exercises it, and forcing it
// convincingly enough to trust the result was judged not worth the risk of a
// misleading pass — it's already covered with a mocked store at the component
// layer (RelationshipMap.test.jsx's "keeps navigation available while
// preventing read-only edits").
//
// Item 2's cross-tab external-delete case turned up a real finding, not just
// a missing test: an idle tab does NOT react live to another tab's delete
// (nothing subscribes to the cross-tab BroadcastChannel to trigger a
// re-render), and if that idle tab then performs any unrelated save, the
// deleted record is silently written back by src/store/useStore.js's
// commitLocal cross-tab merge. That merge logic is shared by every entity
// type, not Relationships-specific, so it is documented and flagged for a
// dedicated fix rather than patched on this branch — see that test's own
// comment and the docs/QA_PLAN.md note alongside this spec for detail.

async function openRelationshipMap(page) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  const tab = page.locator('.studio-tab').filter({ hasText: /^Relationship Map$/ })
  if (await tab.count()) await tab.click()
  await page.getByLabel('Focal character').waitFor({ state: 'visible' })
}

async function openFamilyTree(page) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  const tab = page.locator('.studio-tab').filter({ hasText: /^Family Tree$/ })
  if (await tab.count()) await tab.click()
  await page.getByRole('heading', { name: 'Family Tree' }).waitFor({ state: 'visible' })
}

// Writes directly into nf_characters (bypassing the editor UI) so a test can
// arrange malformed/imported-shape records (numeric names, unknown
// relationship types) the same way a real imported project would carry them
// — mirrors characters-corrective-audit.spec.js's own seedCharacters.
async function seedCharacters(page, entries) {
  await page.evaluate((chars) => {
    const existing = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
    window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify([...existing, ...chars]))
  }, entries)
}

async function reloadAndOpenRelationshipMap(page) {
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await openRelationshipMap(page)
}

function focalSelect(page) {
  return page.getByLabel('Focal character')
}

async function focusCharacter(page, name) {
  await focalSelect(page).selectOption({ label: name })
}

// Adds a directed social connection through the real "Add a connection" panel.
async function addConnection(page, { target, type }) {
  await page.getByLabel('Connection character').selectOption({ label: target })
  if (type) await page.getByLabel('Connection type').selectOption(type)
  await page.getByRole('button', { name: 'Add Connection', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Relationships QA ${Date.now()}` })
})

test.describe('Same-pair multi-type links, reverse links, and family-link survival', () => {
  test('gives one pair two outgoing types and a reverse pair two different types, counts the pair as a single connection, coexists with a family link plus a social link on the same person, and survives removing one directed link through a real reload', async ({ page }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]
    await seedCharacters(page, [
      { id: 'mp-ada', novelId: projectId, name: 'Ada' },
      { id: 'mp-ben', novelId: projectId, name: 'Ben' },
      { id: 'mp-cora', novelId: projectId, name: 'Cora' },
    ])
    await reloadAndOpenRelationshipMap(page)

    // Same pair, one direction, two types: Ada --Friend,Ally--> Ben.
    await focusCharacter(page, 'Ada')
    await addConnection(page, { target: 'Ben', type: 'friend' })
    await expect(page.getByLabel('Connection character')).toHaveValue('')
    await addConnection(page, { target: 'Ben', type: 'ally' })

    // The exact same fact cannot be added twice: reselecting Ben+Friend must
    // disable Add Connection with an explanation, not silently no-op.
    await page.getByLabel('Connection character').selectOption({ label: 'Ben' })
    await page.getByLabel('Connection type').selectOption('friend')
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeDisabled()
    await expect(page.getByText('This outgoing connection already exists.')).toBeVisible()

    // Same pair, the REVERSE direction, two DIFFERENT types: Ben --Friend,Enemy--> Ada.
    await focusCharacter(page, 'Ben')
    await addConnection(page, { target: 'Ada', type: 'friend' })
    await addConnection(page, { target: 'Ada', type: 'enemy' })

    // One node counts the pair as a single connection (unique person), not
    // four (one per fact) — the canvas badge must dedupe by connected person.
    await focusCharacter(page, 'Ada')
    const benNode = page.getByRole('button', { name: 'Focus on Ben' })
    await expect(benNode).toHaveAttribute('title', /^Ben · 1 connection$/)
    await expect(page.getByText('3 characters · 1 connection')).toBeVisible()

    // The connections list retains every direction/type for the pair.
    const benRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Ben', exact: true }) })
    await expect(benRow.getByText('Ada → Ben', { exact: true })).toHaveCount(2) // Friend + Ally
    await expect(benRow.getByText('Ben → Ada', { exact: true })).toHaveCount(2) // Friend + Enemy
    await expect(benRow.locator('button[aria-label^="Remove"]')).toHaveCount(4)

    // Add a family link (Cora is Ada's parent) through the real Family Tree
    // UI, then add a SOCIAL link to that same family member — the two must
    // coexist on the same connection row.
    await openFamilyTree(page)
    await page.getByLabel('Focus character').selectOption({ label: 'Ada' })
    await page.getByLabel('Relative').selectOption({ label: 'Cora' })
    await page.getByRole('button', { name: 'Add to Family' }).click()
    await expect(page.getByRole('status')).toHaveText(/Cora was added as parent/)

    await openRelationshipMap(page)
    await focusCharacter(page, 'Ada')
    await addConnection(page, { target: 'Cora', type: 'friend' })
    const coraRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Cora', exact: true }) })
    await expect(coraRow.getByText('Family · read-only', { exact: true })).toBeVisible()
    await expect(coraRow.getByText('Ada → Cora', { exact: true })).toBeVisible()
    // The family fact has no Remove control (read-only); only the one social fact does.
    await expect(coraRow.locator('button[aria-label^="Remove"]')).toHaveCount(1)

    // Remove ONE selected directed link (Ada→Ben Ally) and confirm the rest —
    // the other type, the reverse links, and the family+social data on Cora —
    // survive, first live in the component...
    await benRow.getByRole('button', { name: 'Remove Ally link from Ada to Ben' }).click()
    await expect(benRow.locator('button[aria-label^="Remove"]')).toHaveCount(3)

    // ...and then through a real full-page reload (not just component state).
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await openRelationshipMap(page)
    await focusCharacter(page, 'Ada')

    const benRowAfterReload = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Ben', exact: true }) })
    await expect(benRowAfterReload.getByText('Ada → Ben', { exact: true })).toHaveCount(1) // Friend only, Ally stayed gone
    await expect(benRowAfterReload.getByText('Ben → Ada', { exact: true })).toHaveCount(2) // Friend + Enemy, untouched
    const coraRowAfterReload = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Cora', exact: true }) })
    await expect(coraRowAfterReload.getByText('Family · read-only', { exact: true })).toBeVisible()
    await expect(coraRowAfterReload.getByText('Ada → Cora', { exact: true })).toBeVisible()

    const stored = await readStorage(page, 'nf_characters')
    expect(stored.find(c => c.id === 'mp-ada').relationships).toEqual(
      expect.arrayContaining([{ targetId: 'mp-ben', type: 'friend' }, { targetId: 'mp-cora', type: 'friend' }]),
    )
    expect(stored.find(c => c.id === 'mp-ada').relationships).not.toEqual(
      expect.arrayContaining([{ targetId: 'mp-ben', type: 'ally' }]),
    )
  })

  test('keeps an unknown imported relationship type\'s own raw label instead of turning it into Spouse, and never surfaces a secret family fact on the map', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const projectId = new URL(page.url()).pathname.split('/')[2]

    await seedCharacters(page, [
      { id: 'ut-ada', novelId: projectId, name: 'Ada' },
      { id: 'ut-dax', novelId: projectId, name: 'Dax', relationships: [{ targetId: 'ut-ada', type: 'legendary-bond' }] },
    ])
    await reloadAndOpenRelationshipMap(page)

    await focusCharacter(page, 'Ada')
    const daxRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Dax', exact: true }) })
    // The fact label is a bare text node sharing its parent with the nested
    // direction span (not its own element), so match it by substring rather
    // than exact — the same reason "Ada → Ben" elsewhere can be exact (that
    // one IS its own child span) while this one cannot.
    await expect(daxRow.getByText('legendary-bond')).toBeVisible()
    await expect(daxRow.getByText('Spouse', { exact: true })).toHaveCount(0)
    await expect(daxRow.getByText('Unknown relationship')).toHaveCount(0)
    await expect(daxRow.getByText('Dax → Ada', { exact: true })).toBeVisible()

    // Now add a SECRET guardian family link between Ada and Dax through the
    // real Family Tree "Details" panel and confirm it never appears on the
    // map (default family scope excludes secret/hidden facts — this is the
    // Relationship Map's own read-only family view, distinct from Family
    // Tree's dedicated "Hidden / secret" filter checkbox there).
    await openFamilyTree(page)
    await page.getByLabel('Focus character').selectOption({ label: 'Ada' })
    await page.getByLabel('Relationship to Ada').selectOption('guardian')
    await page.getByLabel('Relative').selectOption({ label: 'Dax' })
    await page.getByText('Details', { exact: true }).click()
    await page.locator('details select').nth(1).selectOption('secret')
    await page.getByRole('button', { name: 'Add to Family' }).click()
    await expect(page.getByRole('status')).toHaveText(/Dax was added as guardian/)

    await openRelationshipMap(page)
    await focusCharacter(page, 'Ada')
    const daxRowAfterSecretLink = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Dax', exact: true }) })
    // The pre-existing social fact is still there...
    await expect(daxRowAfterSecretLink.getByText('legendary-bond')).toBeVisible()
    // ...but the secret family fact must not leak in, even though it exists in storage.
    await expect(daxRowAfterSecretLink.getByText('Family · read-only', { exact: true })).toHaveCount(0)

    const stored = await readStorage(page, 'nf_characters')
    const ada = stored.find(c => c.id === 'ut-ada')
    expect(ada.familyLinks.some(link => link.status === 'secret')).toBe(true)

    expect(errors).toEqual([])
  })
})

test.describe('Add/remove connection validation and draft protection', () => {
  test('excludes the focal character from its own target list, blocks a duplicate outgoing type with an explanation, and resets the draft when the focal character changes', async ({ page }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]
    await seedCharacters(page, [
      { id: 'dp-ada', novelId: projectId, name: 'Ada', relationships: [{ targetId: 'dp-ben', type: 'friend' }] },
      { id: 'dp-ben', novelId: projectId, name: 'Ben' },
      { id: 'dp-cora', novelId: projectId, name: 'Cora' },
    ])
    await reloadAndOpenRelationshipMap(page)
    await focusCharacter(page, 'Ada')

    const targetOptions = await page.getByLabel('Connection character').locator('option').allTextContents()
    expect(targetOptions).not.toContain('Ada')
    expect(targetOptions).toContain('Ben')
    expect(targetOptions).toContain('Cora')

    // Exact duplicate (same target + same type) is refused with an explanation.
    await page.getByLabel('Connection character').selectOption({ label: 'Ben' })
    await page.getByLabel('Connection type').selectOption('friend')
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeDisabled()
    await expect(page.getByText('This outgoing connection already exists.')).toBeVisible()

    // A DIFFERENT type on the same pair is not blocked.
    await page.getByLabel('Connection type').selectOption('ally')
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeEnabled()
    await expect(page.getByText('This outgoing connection already exists.')).toHaveCount(0)

    // Select Cora (uncommitted draft), then switch focal character: the
    // draft must NOT carry over to the new focal character's own panel.
    await page.getByLabel('Connection character').selectOption({ label: 'Cora' })
    await focusCharacter(page, 'Ben')
    await expect(page.getByLabel('Connection character')).toHaveValue('')
    await expect(page.getByLabel('Connection type')).toHaveValue('friend') // back to the default type

    // Switch back: the OLD focal character's panel is independently reset too.
    await focusCharacter(page, 'Ada')
    await expect(page.getByLabel('Connection character')).toHaveValue('')
  })

  // NOTE ON A REAL FINDING (fixed 2026-09-24): this checklist item's wording
  // ("delete the selected target externally... stale targets cannot save")
  // assumes an idle tab reactively notices another tab's write. Measured
  // directly, it does not: src/storage/browserVaultAdapter.js's cross-tab
  // BroadcastChannel only updates the OTHER tab's storage-backend mirror,
  // never that tab's live React `characters` state — nothing subscribes to
  // the channel to trigger a re-render. So an idle tab's Add-connection
  // draft is genuinely NOT invalidated while it sits idle. This part remains
  // true and is asserted below. What used to be worse — confirmed directly
  // below, that stale tab performing any unrelated save resurrected the
  // deleted character — is now fixed: src/store/useStore.js's commitLocal
  // gained a tombstone check (a record this tab last held that's now absent
  // from the freshest on-disk snapshot is dropped rather than carried
  // forward) that lives in commitLocal's generic merge logic shared by every
  // entity type, not anything Relationships-specific, so the fix was made
  // there rather than in this Relationships-only test file. See
  // docs/ROADMAP.md's 2026-08-02 "two-tab silent clobber" Bugs-table row for
  // the fix detail and regression coverage in src/store/useStore.test.js and
  // src/store/useStore.multiTabIndexedDb.test.js.
  test('documents that an idle tab does not react live to a cross-tab delete, but its next unrelated save no longer resurrects the deleted record (fixed 2026-09-24) — a real reload remains the safety net for the stale draft itself', async ({ page, context }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]
    await seedCharacters(page, [
      { id: 'xt-ada', novelId: projectId, name: 'Ada' },
      { id: 'xt-ben', novelId: projectId, name: 'Ben' },
    ])
    await reloadAndOpenRelationshipMap(page)
    await focusCharacter(page, 'Ada')

    // An uncommitted draft: Ben chosen as target, never clicked Add.
    await page.getByLabel('Connection character').selectOption({ label: 'Ben' })
    await page.getByLabel('Connection type').selectOption('ally')
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeEnabled()

    // A second real tab, same (shared-storage) browser context — the actual
    // mechanism this app uses for cross-tab sync in offline/local mode is a
    // same-origin BroadcastChannel bridging the IndexedDB-backed vault
    // (src/storage/browserVaultAdapter.js), which two Pages in one
    // Playwright BrowserContext exercise for real, not a mock.
    const pageB = await context.newPage()
    await pageB.goto(page.url())
    await dismissLaunchPrompts(pageB)
    await waitForStorageHydration(pageB)
    await pageB.getByRole('button', { name: 'Characters' }).first().click()
    // The "Characters" room remembers whichever of its four sub-tabs
    // (Characters/Relationship Map/Family Tree/Factions) was last active —
    // tab B lands on this same URL already showing Relationship Map (the
    // sub-tab tab A left it on), so force the Characters sub-tab explicitly,
    // same pattern as openRelationshipMap/openFamilyTree above.
    const charactersSubTab = pageB.locator('.studio-tab').filter({ hasText: /^Characters$/ })
    if (await charactersSubTab.count()) await charactersSubTab.click()
    await pageB.locator('.studio-record', { hasText: 'Ben' }).click()
    await pageB.evaluate(() => { window.confirm = () => true })
    await pageB.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(pageB.getByRole('heading', { name: 'Select a dossier' })).toBeVisible()

    // Confirm the delete really landed on disk (this part of cross-tab sync
    // does work — it's tab A's LIVE UI that never learns about it).
    await page.waitForFunction(() => {
      const chars = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
      return !chars.some(c => c.id === 'xt-ben')
    }, undefined, { timeout: 8000 })

    // Tab A's idle draft is UNCHANGED — Add Connection is still enabled and
    // Ben is still the selected, now-stale target (the real, verified
    // behavior, not the "stale targets cannot save" the checklist assumed).
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeEnabled()
    await expect(page.getByLabel('Connection character')).toHaveValue('xt-ben')

    // Clicking it anyway used to resurrect Ben in storage (the commitLocal
    // bug described above) — confirmed here, against the real app, that the
    // 2026-09-24 tombstone-check fix actually stops it: Ben's own character
    // record is dropped from this tab's rebase because it's absent from the
    // freshest on-disk snapshot, rather than carried forward unchanged.
    await page.getByRole('button', { name: 'Add Connection', exact: true }).click()
    const storedAfterStaleSave = await readStorage(page, 'nf_characters')
    expect(storedAfterStaleSave.some(c => c.id === 'xt-ben')).toBe(false)

    // The reload safety net (for the stale draft UI itself, not the
    // now-fixed resurrection above) still matters on its own: after
    // reloading, tab A's fresh read correctly excludes whatever is actually
    // gone on disk and the draft cannot reference it.
    await pageB.close()
    await page.reload()
    await waitForStorageHydration(page)
    await openRelationshipMap(page)
    await focusCharacter(page, 'Ada')
    await expect(page.getByRole('button', { name: 'Focus on Ben' })).toHaveCount(0)
    const remainingOptions = await page.getByLabel('Connection character').locator('option').allTextContents()
    expect(remainingOptions).not.toContain('Ben')
  })

  test('is operable end to end with the keyboard alone, and exposes accessible labels and direction text for screen reader users', async ({ page }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]
    await seedCharacters(page, [
      { id: 'kb-ada', novelId: projectId, name: 'Ada' },
      { id: 'kb-ben', novelId: projectId, name: 'Ben' },
    ])
    await reloadAndOpenRelationshipMap(page)
    await focusCharacter(page, 'Ada')

    // Every control involved has a real accessible name, reachable via role+name.
    await expect(page.getByLabel('Connection character')).toBeVisible()
    await expect(page.getByLabel('Connection type')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeVisible()

    // Drive the whole add-a-connection flow with the keyboard only: focus the
    // target select, choose Ben, tab to the type select, choose Ally, tab to
    // Add Connection, and activate it with Enter — no mouse click at all.
    await page.getByLabel('Connection character').focus()
    await page.getByLabel('Connection character').selectOption({ label: 'Ben' })
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Connection type')).toBeFocused()
    await page.getByLabel('Connection type').selectOption('ally')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Add Connection', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByLabel('Connection character')).toHaveValue('')
    const benRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Ben', exact: true }) })
    await expect(benRow).toBeVisible()

    // Direction is exposed as real accessible text, not only by color —
    // "Ada → Ben" is plain text content, and the Remove button's accessible
    // name spells out type + direction in words a screen reader can announce.
    await expect(benRow.getByText('Ada → Ben', { exact: true })).toBeVisible()
    await expect(benRow.getByRole('button', { name: 'Remove Ally link from Ada to Ben' })).toBeVisible()

    // The zoom/pan canvas region and each focus button are also independently
    // keyboard-reachable with descriptive names (not just mouse targets).
    await expect(page.getByRole('region', { name: /Interactive relationship map/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Focus on Ben' })).toBeVisible()
  })
})

test.describe('Dense-cast rendering, badges, and responsive layout', () => {
  test('shows correct badges and messaging for a focal character with zero connections and with exactly one', async ({ page }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]
    await seedCharacters(page, [
      { id: 'zc-solo', novelId: projectId, name: 'Solo' },
      { id: 'zc-a', novelId: projectId, name: 'PairA', relationships: [{ targetId: 'zc-b', type: 'friend' }] },
      { id: 'zc-b', novelId: projectId, name: 'PairB' },
    ])
    await reloadAndOpenRelationshipMap(page)

    await focusCharacter(page, 'Solo')
    await expect(page.getByText('Nothing mapped yet.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Focus on Solo' })).toHaveAttribute('title', /^Solo · 0 connections$/)
    await expect(page.getByText('3 characters · 1 connection')).toBeVisible()

    await focusCharacter(page, 'PairA')
    await expect(page.getByRole('button', { name: 'Focus on PairB' })).toHaveAttribute('title', /^PairB · 1 connection$/)
    const pairBRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'PairB', exact: true }) })
    await expect(pairBRow).toBeVisible()
  })

  test('renders a 10-character cast, counts each pair once regardless of type count, and lets the last connection be removed and stay removed after refocusing', async ({ page }) => {
    const projectId = new URL(page.url()).pathname.split('/')[2]
    const companions = Array.from({ length: 9 }, (_, i) => ({ id: `dc-c${i}`, novelId: projectId, name: `Companion ${i}` }))
    const hub = {
      id: 'dc-hub', novelId: projectId, name: 'Hub',
      relationships: [
        ...Array.from({ length: 9 }, (_, i) => ({ targetId: `dc-c${i}`, type: 'friend' })),
        { targetId: 'dc-c0', type: 'ally' }, // second type on the SAME pair — must not inflate the degree badge
      ],
    }
    await seedCharacters(page, [hub, ...companions])
    await reloadAndOpenRelationshipMap(page)
    await focusCharacter(page, 'Hub')

    // 10 characters total, 9 unique connected people (not 10 type-instances).
    await expect(page.getByText('10 characters · 9 connections')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Focus on Hub' })).toHaveAttribute('title', /^Hub · 9 connections$/)
    await expect(page.getByRole('button', { name: 'Focus on Companion 0' })).toHaveAttribute('title', /^Companion 0 · 1 connection$/)

    // There is a single scrollable connections list, not a paged control —
    // confirmed directly (RelationshipMap.test.jsx's own component test
    // already asserts this same absence with a mocked store; this confirms
    // it holds in the real rendered app too, at the same 10-cast size the
    // checklist's "page through every person" wording describes).
    await expect(page.getByRole('navigation', { name: 'Connection pages' })).toHaveCount(0)
    const connectionRows = page.locator('.space-y-2.max-h-80 > div')
    await expect(connectionRows).toHaveCount(9)

    // Remove the alphabetically-last rendered connection (Companion 8).
    const lastRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Companion 8', exact: true }) })
    await lastRow.getByRole('button', { name: /^Remove/ }).click()
    await expect(connectionRows).toHaveCount(8)
    await expect(page.getByText('10 characters · 8 connections')).toBeVisible()

    // Refocus away and back: the removed connection must not resurrect.
    await focusCharacter(page, 'Companion 0')
    await focusCharacter(page, 'Hub')
    await expect(connectionRows).toHaveCount(8)
    await expect(page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Companion 8', exact: true }) })).toHaveCount(0)
  })

  test('renders a 110-character cast without page errors and keeps the totals accurate at scale', async ({ page }) => {
    test.setTimeout(60_000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const projectId = new URL(page.url()).pathname.split('/')[2]

    const companions = Array.from({ length: 109 }, (_, i) => ({ id: `bg-c${i}`, novelId: projectId, name: `Companion ${i}` }))
    const hub = {
      id: 'bg-hub', novelId: projectId, name: 'Hub',
      relationships: Array.from({ length: 109 }, (_, i) => ({ targetId: `bg-c${i}`, type: 'friend' })),
    }
    await seedCharacters(page, [hub, ...companions])
    await reloadAndOpenRelationshipMap(page)
    await focusCharacter(page, 'Hub')

    await expect(page.getByText('110 characters · 109 connections')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Focus on Hub' })).toHaveAttribute('title', /^Hub · 109 connections$/)

    // Zoom/fit controls stay functional at this scale.
    await page.getByRole('button', { name: 'Fit all' }).click()
    await page.getByRole('button', { name: 'Zoom relationship map in' }).click()

    expect(errors).toEqual([])
  })

  test('renders long and numeric character names and a cropped/zoomed portrait without errors', async ({ page }) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const projectId = new URL(page.url()).pathname.split('/')[2]
    const longName = 'Character With An Extremely Long Full Name That Keeps Going And Going And Going'
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

    await seedCharacters(page, [
      { id: 'nm-long', novelId: projectId, name: longName, relationships: [{ targetId: 'nm-numeric', type: 'friend' }] },
      { id: 'nm-numeric', novelId: projectId, name: 42 },
      { id: 'nm-portrait', novelId: projectId, name: 'Portrait Person', image: tinyPng, imagePosition: '30% 70%', imageZoom: 2, relationships: [{ targetId: 'nm-long', type: 'ally' }] },
    ])
    await reloadAndOpenRelationshipMap(page)

    await focusCharacter(page, 'Portrait Person')
    await expect(page.getByRole('button', { name: 'Focus on 42', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Focus on ${longName}`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Focus on Portrait Person', exact: true }).locator('img')).toHaveAttribute('src', tinyPng)

    expect(errors).toEqual([])
  })

  test.describe('Responsive layout', () => {
    for (const viewport of [{ width: 375, height: 700, label: '375px' }, { width: 768, height: 900, label: '768px' }, { width: 1280, height: 900, label: 'desktop' }]) {
      test(`the relationship map is usable at ${viewport.label} with no horizontal overflow`, async ({ page }) => {
        const projectId = new URL(page.url()).pathname.split('/')[2]
        await seedCharacters(page, [
          { id: `rw-a-${viewport.width}`, novelId: projectId, name: 'Ada', relationships: [{ targetId: `rw-b-${viewport.width}`, type: 'friend' }] },
          { id: `rw-b-${viewport.width}`, novelId: projectId, name: 'Ben' },
        ])
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await reloadAndOpenRelationshipMap(page)
        await focusCharacter(page, 'Ada')

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(overflow).toBe(false)

        await expect(page.getByRole('group', { name: 'Relationship map zoom' })).toBeVisible()
        await expect(page.getByLabel('Focal character')).toBeVisible()
        await expect(page.getByLabel('Connection character')).toBeVisible()
        const benRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Ben', exact: true }) })
        await expect(benRow).toBeVisible()
      })
    }

    // A real OS-level/browser-chrome zoom (Ctrl/Cmd+=) is not controllable
    // from Playwright/headless Chromium. `document.body.style.zoom` was
    // tried as a stand-in and rejected: measured directly, it makes
    // `documentElement.scrollWidth` balloon well past `clientWidth` on
    // EVERY page in this app (confirmed against a plain seeded Relationship
    // Map: scrollWidth 2133 vs. clientWidth 1280 at a 1.5x body zoom), which
    // is an artifact of how CSS `zoom` composes with `documentElement` vs.
    // `body`, not a real responsive regression — a real Ctrl/Cmd+= browser
    // zoom does not reflow a page's own layout into overflow the way this
    // does. So this test does not assert on horizontal overflow under
    // simulated zoom (that would be measuring the simulation, not the app);
    // it only confirms the map's own controls keep working when the page is
    // scaled, and a real physical-zoom/pointer-device pass is left to the
    // doc note alongside this spec rather than approximated further here.
    test('keeps the zoom/pan controls responsive under a simulated whole-page CSS zoom', async ({ page }) => {
      const projectId = new URL(page.url()).pathname.split('/')[2]
      await seedCharacters(page, [
        { id: 'zoom-a', novelId: projectId, name: 'Ada', relationships: [{ targetId: 'zoom-b', type: 'friend' }] },
        { id: 'zoom-b', novelId: projectId, name: 'Ben' },
      ])
      await page.setViewportSize({ width: 1280, height: 900 })
      await reloadAndOpenRelationshipMap(page)
      await focusCharacter(page, 'Ada')

      await page.evaluate(() => { document.body.style.zoom = '1.5' })
      await expect(page.getByRole('button', { name: 'Zoom relationship map in' })).toBeVisible()
      await page.getByRole('button', { name: 'Zoom relationship map in' }).click()
      await page.getByRole('button', { name: 'Fit all' }).click()
      const benRow = page.locator('.space-y-2.max-h-80 > div', { has: page.getByRole('button', { name: 'Ben', exact: true }) })
      await expect(benRow).toBeVisible()
    })
  })
})

test.describe('Export rendering: Relationship Map and Family Tree sections', () => {
  // DOCX only, matching the Lore corrective-audit pass's own judgment call
  // (see its "Not attempted this pass" note on item 6): the standalone
  // HTML/PDF rendering path and a 32+-explicit-link stress/continuation-page
  // case are not exercised here and remain open for a dedicated follow-up
  // alongside the equivalent items for other worldbuilding sections. Raw
  // ZIP backup/restore data integrity is already covered by this feature's
  // existing automated store/export tests referenced in the checklist
  // header, not repeated here.
  test('keeps reciprocal and custom-typed social links distinct, excludes a secret family fact, and never leaks character biography into a Relationships/Family-Tree-only export', async ({ page }) => {
    test.setTimeout(120_000)
    const projectId = new URL(page.url()).pathname.split('/')[2]
    const ariaBioMarker = `UNIQUE_ARIA_BIO_${Date.now()}`
    const bramBioMarker = `UNIQUE_BRAM_BIO_${Date.now()}`

    await seedCharacters(page, [
      { id: 'ex-aria', novelId: projectId, name: 'Aria', bio: ariaBioMarker, relationships: [{ targetId: 'ex-bram', type: 'friend' }, { targetId: 'ex-bram', type: 'blood-oath' }] },
      { id: 'ex-bram', novelId: projectId, name: 'Bram', bio: bramBioMarker, relationships: [{ targetId: 'ex-aria', type: 'friend' }] },
      { id: 'ex-cora', novelId: projectId, name: 'Cora' },
    ])
    await reloadAndOpenRelationshipMap(page)

    // Public family fact: Aria is Bram's parent.
    await openFamilyTree(page)
    await page.getByLabel('Focus character').selectOption({ label: 'Aria' })
    await page.getByLabel('Relative').selectOption({ label: 'Bram' })
    await page.getByRole('button', { name: 'Add to Family' }).click()
    await expect(page.getByRole('status')).toBeVisible()

    // Secret family fact: Cora is Bram's guardian, marked secret. Focus Bram
    // so the connection panel's owner (source) is Bram.
    await page.getByLabel('Focus character').selectOption({ label: 'Bram' })
    await page.getByLabel('Relationship to Bram').selectOption('guardian')
    await page.getByLabel('Relative').selectOption({ label: 'Cora' })
    await page.getByText('Details', { exact: true }).click()
    await page.locator('details select').nth(1).selectOption('secret')
    await page.getByRole('button', { name: 'Add to Family' }).click()
    await expect(page.getByRole('status')).toHaveText(/Cora was added as guardian/)

    const parseDocxText = (zip, pattern) => {
      const name = Object.keys(zip).find(entry => pattern.test(entry))
      if (!name) return null
      return strFromU8(unzipSync(zip[name])['word/document.xml'])
    }

    // Both sections enabled together (the default): both docs present.
    await openProjectSettings(page)
    let downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    let download = await downloadPromise
    let zip = unzipSync(new Uint8Array(readFileSync(await download.path())))
    let relText = parseDocxText(zip, /-Relationships\.docx$/)
    let treeText = parseDocxText(zip, /-Family-Tree\.docx$/)
    expect(relText, `expected a Relationships.docx entry among: ${Object.keys(zip).join(', ')}`).toBeTruthy()
    expect(treeText, `expected a Family-Tree.docx entry among: ${Object.keys(zip).join(', ')}`).toBeTruthy()

    // Reciprocal AND custom/unknown types render as distinct directed lines,
    // not merged or dropped.
    expect(relText).toContain('Aria → Bram: Friend')
    expect(relText).toContain('Bram → Aria: Friend')
    expect(relText).toContain('Aria → Bram: blood-oath')
    // The public family fact appears exactly once (no duplicated family facts).
    expect(treeText.match(/\(Parent\)/g)?.length).toBe(1)
    expect(treeText).toContain('(Child)')
    // The secret guardian fact must never appear.
    expect(treeText).not.toContain('(Guardian)')
    expect(treeText).not.toContain('(Ward)')
    // No unrelated biography leaks into either relationship-only document.
    expect(relText).not.toContain(ariaBioMarker)
    expect(relText).not.toContain(bramBioMarker)
    expect(treeText).not.toContain(ariaBioMarker)
    expect(treeText).not.toContain(bramBioMarker)

    // Independently: Relationship Map OFF, Family Tree ON.
    const relationshipSwitch = page.getByRole('switch', { name: 'Relationship Map', exact: true })
    const treeSwitch = page.getByRole('switch', { name: 'Family Tree', exact: true })
    await relationshipSwitch.click()
    await expect(relationshipSwitch).toHaveAttribute('aria-checked', 'false')

    downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    download = await downloadPromise
    zip = unzipSync(new Uint8Array(readFileSync(await download.path())))
    expect(parseDocxText(zip, /-Relationships\.docx$/)).toBeNull()
    treeText = parseDocxText(zip, /-Family-Tree\.docx$/)
    expect(treeText).toBeTruthy()
    expect(treeText).not.toContain(ariaBioMarker)
    expect(treeText).not.toContain(bramBioMarker)

    // Independently the other way: Relationship Map back ON, Family Tree OFF.
    await relationshipSwitch.click()
    await expect(relationshipSwitch).toHaveAttribute('aria-checked', 'true')
    await treeSwitch.click()
    await expect(treeSwitch).toHaveAttribute('aria-checked', 'false')

    downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    download = await downloadPromise
    zip = unzipSync(new Uint8Array(readFileSync(await download.path())))
    relText = parseDocxText(zip, /-Relationships\.docx$/)
    expect(relText).toBeTruthy()
    expect(relText).toContain('Aria → Bram: blood-oath')
    expect(parseDocxText(zip, /-Family-Tree\.docx$/)).toBeNull()

    // Both off.
    await relationshipSwitch.click()
    await expect(relationshipSwitch).toHaveAttribute('aria-checked', 'false')

    downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Word docs ZIP/ }).click()
    download = await downloadPromise
    zip = unzipSync(new Uint8Array(readFileSync(await download.path())))
    expect(parseDocxText(zip, /-Relationships\.docx$/)).toBeNull()
    expect(parseDocxText(zip, /-Family-Tree\.docx$/)).toBeNull()
  })
})
