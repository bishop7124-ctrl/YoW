import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorageHydration,
} from './helpers.js'

// Browser-rendered coverage for docs/QA_PLAN.md's "Characters corrective-audit
// follow-up (2026-09-03...)" checklist and the matching docs/ROADMAP.md
// "Character system" row — implemented and unit/store-tested but explicitly
// marked "automated QA passes, browser/live-sync QA pending" before this spec.
//
// Follows the same scope split as tests/e2e/schedule-corrective-audit.spec.js:
// the parts of that checklist reachable with a real rendered browser against a
// local offline dev server (no live Supabase/AI credentials, no real account)
// are covered here with real new Playwright specs — search/sort/filter with
// malformed data (item 1), biography/age edits and date isolation (item 2),
// draft/discard protection including Save & Open Family Tree (item 3), and
// portrait upload/replace/remove races plus the nested photo editor (item 4).
// Three-project live-cloud sync, a real AI provider, and rendered PDF/Word
// export inspection (items 5-7) are explicitly out of scope here and remain
// deferred — see the doc updates alongside this spec for exactly what remains
// open, item by item.
//
// Follows the same reload discipline as worldbuilding.spec.js and
// schedule-corrective-audit.spec.js: flush() so a write has landed, reload,
// then waitForStorageHydration() so the *read* goes to the IndexedDB vault
// rather than the default localStorage backend the bridge answers from until
// main.jsx finishes swapping it (see that helper's own comment for the full
// trace of why this matters).

async function openCharacters(page) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await expect(page.getByRole('button', { name: 'New' }).first()).toBeVisible()
}

// Writes directly into nf_characters (bypassing the editor UI) so a test can
// arrange malformed/legacy/dated records the same way a real imported or
// long-lived project would carry them, then reloads so the app's own boot
// path (not a live store mutation) is what renders them.
async function seedCharacters(page, entries, { factions } = {}) {
  await page.evaluate(({ chars, facs }) => {
    const existingChars = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
    window.__yowStorageBridge?.setItem('nf_characters', JSON.stringify([...existingChars, ...chars]))
    if (facs) {
      const existingFacs = JSON.parse(window.__yowStorageBridge?.getItem('nf_factions') || '[]')
      window.__yowStorageBridge?.setItem('nf_factions', JSON.stringify([...existingFacs, ...facs]))
    }
  }, { chars: entries, facs: factions })
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await openCharacters(page)
}

function projectIdFromUrl(page) {
  return new URL(page.url()).pathname.split('/')[2]
}

// Reads a labeled value out of the (non-editing) profile "Profile Details"
// note — DetailLine renders label/value as two sibling <div>s inside one
// wrapper, so the label's own nextElementSibling is always its value,
// regardless of which other fields are present or absent around it.
async function getProfileDetailValue(page, label) {
  return page.evaluate((lbl) => {
    const note = [...document.querySelectorAll('.studio-note')].find(n => n.textContent.includes('Profile Details'))
    if (!note) return null
    const labelDivs = [...note.querySelectorAll('div')].filter(d => d.children.length === 0 && d.textContent.trim() === lbl)
    for (const labelDiv of labelDivs) {
      const value = labelDiv.nextElementSibling
      if (value) return value.textContent.trim()
    }
    return null
  }, label)
}

async function openCharacterEditor(page, name) {
  await page.locator('.studio-record', { hasText: name }).first().click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.locator('.studio-page-actions').getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog').first()
  await expect(dialog).toBeVisible()
  return dialog
}

async function saveAndReload(page) {
  await page.evaluate(() => window.__yowStorageBridge?.flush())
  await page.reload()
  await waitForStorageHydration(page)
  await openCharacters(page)
}

// Encodes a real, browser-decodable image (not hand-rolled bytes) via an
// offscreen <canvas>, matching tests/e2e/comic-planner.spec.js's own helper —
// uploadUserMedia's genuine createImageBitmap() decode step needs a real
// image, and a large `size` gives a slow-enough real async decode to
// reproduce the in-flight-upload races item 4 asks for without any network
// mocking (offline mode's uploadUserMedia never touches the network at all —
// it's optimizeImageToDataUrl, a purely client-side async decode/resize/
// encode/FileReader chain, so *that* chain's own latency is the real race
// surface here, not a network delay).
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

// Decodes a data-URL image back to its top-left pixel so a "which of two
// uploaded images actually ended up saved" assertion is a real pixel read,
// not a guess from string length or upload order.
async function topLeftPixel(page, dataUrl) {
  return page.evaluate(async (src) => {
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || 1
    canvas.height = img.naturalHeight || 1
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return [...ctx.getImageData(0, 0, 1, 1).data]
  }, dataUrl)
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: `Characters QA ${Date.now()}` })
  await openCharacters(page)
})

test.describe('Search, sort, and filter with malformed data', () => {
  test('searches by name, alias, role, family, species, and faction across numeric/missing/legacy records without crashing', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const factionId = 'char-qa-faction'
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await seedCharacters(page, [
      // Numeric name — normalizeCharacter must coerce it to a searchable string.
      { id: 'char-numeric-name', novelId: projectId, name: 42, role: 'Herald' },
      // Missing/null name — must render and stay selectable, not crash the list.
      { id: 'char-missing-name', novelId: projectId, name: null, role: 'Unnamed Extra' },
      // Legacy shape: trait text stored at the top level instead of under `traits`.
      { id: 'char-legacy-traits', novelId: projectId, name: 'Legacy Traits Char', strengths: 'Legacy resolve', familyGroup: 'Ashworth' },
      // Case/whitespace-variant duplicate aliases.
      { id: 'char-alias', novelId: projectId, name: 'Alias Variant', keywords: ['Raven', ' raven ', 'RAVEN'] },
      { id: 'char-species', novelId: projectId, name: 'Species Match', species: 'Gryphonkin' },
      { id: 'char-faction', novelId: projectId, name: 'Faction Match', factionId },
      // Multiple relationship types to the same person, plus an exact duplicate.
      { id: 'char-rel-target', novelId: projectId, name: 'Rel Target' },
      {
        id: 'char-rel-source', novelId: projectId, name: 'Rel Source',
        relationships: [
          { targetId: 'char-rel-target', type: 'ally' },
          { targetId: 'char-rel-target', type: 'enemy' },
          { targetId: 'char-rel-target', type: 'ally' }, // exact duplicate — must collapse
        ],
      },
    ], { factions: [{ id: factionId, name: 'The Verdant Concord', novelId: projectId }] })

    // Nothing crashed rendering the malformed set.
    expect(errors).toEqual([])
    await expect(page.locator('.studio-record')).toHaveCount(8)

    const search = page.getByLabel('Search characters')

    // Numeric name is searchable as text.
    await search.fill('42')
    await expect(page.locator('.studio-record', { hasText: 'Herald' })).toBeVisible()
    await expect(page.locator('.studio-record')).toHaveCount(1)

    // Missing name doesn't crash and stays reachable by its role subtitle.
    await search.fill('')
    await expect(page.locator('.studio-record', { hasText: 'Unnamed Extra' })).toBeVisible()

    // Alias search is case/whitespace-insensitive and hash-variants collapse
    // to one chip in the editor (checked separately below).
    await search.fill('raven')
    await expect(page.locator('.studio-record', { hasText: 'Alias Variant' })).toBeVisible()
    await expect(page.locator('.studio-record')).toHaveCount(1)

    // Family search.
    await search.fill('Ashworth')
    await expect(page.locator('.studio-record', { hasText: 'Legacy Traits Char' })).toBeVisible()
    await expect(page.locator('.studio-record')).toHaveCount(1)

    // Species search.
    await search.fill('Gryphonkin')
    await expect(page.locator('.studio-record', { hasText: 'Species Match' })).toBeVisible()
    await expect(page.locator('.studio-record')).toHaveCount(1)

    // Faction search (matches the faction's own name, not just the character's).
    await search.fill('Verdant')
    await expect(page.locator('.studio-record', { hasText: 'Faction Match' })).toBeVisible()
    await expect(page.locator('.studio-record')).toHaveCount(1)
    await search.fill('')

    // Legacy top-level trait text was promoted into the Traits tab, not lost.
    await page.locator('.studio-record', { hasText: 'Legacy Traits Char' }).click()
    await page.getByRole('button', { name: 'Character Traits' }).click()
    await expect(page.getByText('Legacy resolve')).toBeVisible()

    // Duplicate case/whitespace/hash-variant alias entries collapsed to one
    // chip in the editor (normalizeCharacterKeywords dedupes by lowercased,
    // trimmed value — the first-seen casing, "Raven", is what survives), and
    // the exact-duplicate relationship link collapsed while the two distinct
    // types to the same person both survived.
    await page.locator('.studio-record', { hasText: 'Alias Variant' }).click()
    await page.locator('.studio-page-actions').getByRole('button', { name: 'Edit' }).click()
    // profileTab is shared workspace state, not per-character — the previous
    // Legacy Traits Char check above left it on "Character Traits", so the
    // editor for this character reopens there too; the Alias field lives on
    // Overview.
    const editDialog = page.getByRole('dialog').first()
    await editDialog.getByRole('button', { name: 'Overview', exact: true }).click()
    const aliasChips = editDialog.locator('button[aria-label^="Remove alias"]')
    await expect(aliasChips).toHaveCount(1)
    await expect(aliasChips.first()).toHaveAccessibleName('Remove alias Raven')
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.locator('.studio-record', { hasText: 'Rel Source' }).click()
    await page.getByRole('button', { name: 'Relationships', exact: true }).click()
    const relLinksNote = page.locator('.studio-note').filter({ hasText: 'Relationship Links' })
    await expect(relLinksNote.getByText('Ally', { exact: true })).toBeVisible()
    await expect(relLinksNote.getByText('Enemy', { exact: true })).toBeVisible()
    await expect(relLinksNote.getByText('Rel Target', { exact: true })).toHaveCount(2) // Ally + Enemy blocks, not 3
  })

  test('sorts by name, role, and faction, breaking role/faction ties by name', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [
      { id: 's1', novelId: projectId, name: 'Bram', role: 'Ally' },
      { id: 's2', novelId: projectId, name: 'Aria', role: 'Rival' },
      { id: 's3', novelId: projectId, name: 'Corwin', role: 'Ally', factionId: 'fac-1' },
      { id: 's4', novelId: projectId, name: 'Ashra', role: 'Scout', factionId: 'fac-1' },
    ], { factions: [{ id: 'fac-1', name: 'Order of Ash', novelId: projectId }] })

    const names = () => page.locator('.studio-record .text-sm.font-medium').allTextContents()
    const sortSelect = page.getByLabel('Sort characters')

    await expect.poll(names).toEqual(['Aria', 'Ashra', 'Bram', 'Corwin']) // default name-asc

    await sortSelect.selectOption('name-desc')
    await expect.poll(names).toEqual(['Corwin', 'Bram', 'Ashra', 'Aria'])

    await sortSelect.selectOption('role')
    // Ally (Bram, Corwin by name) < Rival (Aria) < Scout (Ashra)
    await expect.poll(names).toEqual(['Bram', 'Corwin', 'Aria', 'Ashra'])

    await sortSelect.selectOption('faction')
    // No faction ('') sorts before "Order of Ash"; within the same faction,
    // ties break by name (Ashra before Corwin) — faction order follows names.
    await expect.poll(names).toEqual(['Aria', 'Bram', 'Ashra', 'Corwin'])
  })

  test('a renamed family and a deleted faction recover their stale filters, a filtered-out selection hides its detail, and viewing a record never rewrites it', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    const factionId = 'char-fade-faction'
    await seedCharacters(page, [
      { id: 'char-fam-a', novelId: projectId, name: 'Fam A', familyGroup: 'Thistlewood' },
      { id: 'char-fac-a', novelId: projectId, name: 'Fac A', factionId },
    ], { factions: [{ id: factionId, name: 'Fading House', novelId: projectId }] })

    // Filter by family, then rename that family away through the real editor
    // (the actual "rename" path a user would take) — the stale filter must
    // recover rather than hiding everything or erroring.
    await page.getByLabel('Filter by family').selectOption('Thistlewood')
    await expect(page.locator('.studio-record')).toHaveCount(1)
    await page.locator('.studio-record', { hasText: 'Fam A' }).click()
    await page.locator('.studio-page-actions').getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('combobox', { name: 'Family Group' }).fill('')
    await page.getByLabel('Biography').click() // blur the combobox to commit the cleared value
    await page.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByLabel('Filter by family')).toHaveCount(0) // no family groups left at all
    await expect(page.locator('.studio-record')).toHaveCount(2)

    // Filter by faction, then delete that faction through the real Factions
    // delete control (a plain card grid, not the shared .studio-record index)
    // — the stale filter must recover here too.
    await page.getByLabel('Filter by faction').selectOption(`id:${factionId}`)
    await expect(page.locator('.studio-record')).toHaveCount(1)
    await page.locator('.studio-tab').filter({ hasText: /^Factions$/ }).click()
    await page.evaluate(() => { window.confirm = () => true })
    await page.locator('.panel', { hasText: 'Fading House' }).getByRole('button', { name: 'Delete' }).click()
    await page.locator('.studio-tab').filter({ hasText: /^Characters$/ }).click()
    // This project's only faction was just deleted — the whole "Filter by
    // faction" control disappears (factions.length > 0 gates it), the same
    // way the family filter disappeared above; either way the stale filter
    // no longer hides anyone.
    await expect(page.getByLabel('Filter by faction')).toHaveCount(0)
    await expect(page.locator('.studio-record')).toHaveCount(2)

    // Filtered-out selection hides its detail rather than showing stale data.
    await page.locator('.studio-record', { hasText: 'Fam A' }).click()
    await expect(page.getByRole('heading', { name: 'Fam A' })).toBeVisible()
    await page.getByLabel('Search characters').fill('Fac A')
    await expect(page.getByRole('heading', { name: 'Fam A' })).toHaveCount(0)
    await expect(page.getByText('Select a dossier')).toBeVisible()
    await page.getByLabel('Search characters').fill('')

    // Merely selecting/viewing a record must not rewrite its raw stored data.
    const before = await readStorage(page, 'nf_characters')
    await page.locator('.studio-record', { hasText: 'Fac A' }).click()
    await expect(page.getByRole('heading', { name: 'Fac A' })).toBeVisible()
    await page.getByRole('button', { name: 'Character Traits' }).click()
    await page.getByRole('button', { name: 'Background' }).click()
    const after = await readStorage(page, 'nf_characters')
    expect(after).toEqual(before)
  })
})

test.describe('Biography and age edits isolate untouched date and family-tree fields', () => {
  test('editing only the biography leaves birthDate and family-tree link fields untouched', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [{
      id: 'char-bio-only', novelId: projectId, name: 'Bio Only', bio: 'Original biography.',
      birthDate: 'Year -40', familyGroup: 'Ashworth', parentIds: ['ghost-parent-id'],
    }])

    const dialog = await openCharacterEditor(page, 'Bio Only')
    await dialog.getByLabel('Biography').fill('Updated biography text.')
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    const saved = chars.find(c => c.id === 'char-bio-only')
    expect(saved.bio).toBe('Updated biography text.')
    expect(saved.birthDate).toBe('Year -40')
    expect(saved.familyGroup).toBe('Ashworth')
    expect(saved.parentIds).toEqual(['ghost-parent-id'])
  })

  test('explicitly editing age recalculates the birth year, and clearing age wipes it', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [{ id: 'char-age-edit', novelId: projectId, name: 'Age Edit', birthDate: '' }])

    // exact:true — a substring match on "Age" also matches the hidden
    // portrait file input's own label, "Upload Image" (it literally ends in
    // "age"), which is a real getByLabel footgun worth documenting here.
    let dialog = await openCharacterEditor(page, 'Age Edit')
    await dialog.getByLabel('Age', { exact: true }).fill('30')
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await saveAndReload(page)
    let chars = await readStorage(page, 'nf_characters')
    // currentYear defaults to 0 for a fresh project — Year 0 - 30 = Year -30.
    expect(chars.find(c => c.id === 'char-age-edit').birthDate).toBe('Year -30')

    dialog = await openCharacterEditor(page, 'Age Edit')
    await dialog.getByLabel('Age', { exact: true }).fill('')
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await saveAndReload(page)
    chars = await readStorage(page, 'nf_characters')
    expect(chars.find(c => c.id === 'char-age-edit').birthDate).toBe('')
  })

  test('future birth dates, BCE years, and zero years display the correct age or Born-year label', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [
      { id: 'c-future', novelId: projectId, name: 'Future Birth', birthDate: 'Year 10', status: 'alive' },
      { id: 'c-bce', novelId: projectId, name: 'BCE Birth', birthDate: 'Year 40 BCE', status: 'alive' },
      { id: 'c-zero', novelId: projectId, name: 'Zero Year Birth', birthDate: 'Year 0', status: 'alive' },
      { id: 'c-unknown', novelId: projectId, name: 'Undated Birth', birthDate: 'Long before records began', status: 'alive' },
    ])

    await page.locator('.studio-record', { hasText: 'Future Birth' }).click()
    expect(await getProfileDetailValue(page, 'Age')).toBe('Born 10')

    await page.locator('.studio-record', { hasText: 'BCE Birth' }).click()
    expect(await getProfileDetailValue(page, 'Age')).toBe('40')

    await page.locator('.studio-record', { hasText: 'Zero Year Birth' }).click()
    expect(await getProfileDetailValue(page, 'Age')).toBe('0')

    await page.locator('.studio-record', { hasText: 'Undated Birth' }).click()
    expect(await getProfileDetailValue(page, 'Age')).toBe('Not set')
  })

  test('changing death year and status updates the displayed age without moving the untouched birth year', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [{ id: 'char-death-edit', novelId: projectId, name: 'Death Edit', birthDate: 'Year -40', status: 'alive' }])

    await page.locator('.studio-record', { hasText: 'Death Edit' }).click()
    expect(await getProfileDetailValue(page, 'Age')).toBe('40')

    const dialog = await openCharacterEditor(page, 'Death Edit')
    await dialog.getByRole('combobox', { name: 'Status' }).click()
    await dialog.getByRole('option', { name: 'Dead', exact: true }).click()
    await dialog.getByLabel('Death Year (Optional)').fill('Year -10')
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    const saved = chars.find(c => c.id === 'char-death-edit')
    expect(saved.birthDate).toBe('Year -40') // untouched
    expect(saved.deathDate).toBe('Year -10')
    await page.locator('.studio-record', { hasText: 'Death Edit' }).click()
    expect(await getProfileDetailValue(page, 'Age')).toBe('30 at death')
  })
})

test.describe('Editor validation and inline-commit quirks', () => {
  test('refuses a blank name from a non-overview tab and returns to Overview with the error', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    await dialog.getByRole('button', { name: 'Character Traits' }).click()
    await expect(dialog.getByLabel('Strengths')).toBeVisible()

    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Enter a name for this character.')
    await expect(dialog.getByLabel('Name')).toBeVisible() // forced back to Overview
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })

  test('commits a typed-but-unselected custom Role on blur, without pressing Enter', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Blur Commit ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('combobox', { name: 'Role' }).fill('Court Alchemist')
    await dialog.getByLabel('Pronouns').click() // blur the Role combobox to commit
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.find(c => c.name === name)?.role).toBe('Court Alchemist')
  })

  test('includes an alias typed but never confirmed with Enter when the form is saved', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Uncommitted Alias ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByLabel('Alias / Keywords').fill('Nightshade')
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.find(c => c.name === name)?.keywords).toContain('Nightshade')
  })

  test('a successful save is revealed and selected even though the list is still filtered', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [{ id: 'char-existing', novelId: projectId, name: 'Existing Character' }])

    await page.getByLabel('Search characters').fill('zzz-no-match')
    await expect(page.locator('.studio-record')).toHaveCount(0)

    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Filtered Reveal ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await expect(page.getByLabel('Search characters')).toHaveValue('')
    await expect(page.getByRole('heading', { name })).toBeVisible()
  })
})

test.describe('Draft discard protection and blocked navigation while editing', () => {
  test('a dirty draft disables New and every index row, and never leaks into a different project', async ({ page }) => {
    const projectId = projectIdFromUrl(page)
    await seedCharacters(page, [{ id: 'char-existing-one', novelId: projectId, name: 'Existing One' }])

    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const draftName = `Leaked Draft Attempt ${Date.now()}`
    await dialog.getByLabel('Name').fill(draftName)

    await expect(page.getByRole('button', { name: 'New' }).first()).toBeDisabled()
    await expect(page.locator('.studio-record', { hasText: 'Existing One' })).toBeDisabled()

    // Leaving the project entirely (a full navigation, the strongest form of
    // "switching projects") must not persist the open draft anywhere.
    await page.goto('/')
    await createProject(page, { title: `Characters QA Second ${Date.now()}` })
    await openCharacters(page)
    await expect(page.locator('.studio-record', { hasText: draftName })).toHaveCount(0)
    const allChars = (await readStorage(page, 'nf_characters')) || []
    expect(allChars.some(c => c.name === draftName)).toBe(false)
  })

  test('Save & Open Family Tree saves the draft before navigating and focuses the new character there', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Fork Ready ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('button', { name: 'Relationships', exact: true }).click()
    await dialog.getByRole('button', { name: /Save & Open Family Tree/ }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Family Tree' })).toBeVisible()
    await expect(page.getByLabel('Focus character')).toHaveValue(await page.evaluate(async (n) => {
      const chars = JSON.parse(window.__yowStorageBridge?.getItem('nf_characters') || '[]')
      return chars.find(c => c.name === n)?.id
    }, name))

    const chars = await readStorage(page, 'nf_characters')
    expect(chars.some(c => c.name === name)).toBe(true)
  })
})

test.describe('Portrait upload, replace, remove races, and the nested photo editor', () => {
  test('uploads, replaces, and removes a real portrait, each persisting correctly', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Portrait Lifecycle ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)

    const fileInput = dialog.locator('input#char-image-upload')
    const redImage = await makeCanvasImageBuffer(page, '#ff0000')
    await fileInput.setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: redImage })
    await expect(dialog.getByText('Change Image')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    let chars = await readStorage(page, 'nf_characters')
    let saved = chars.find(c => c.name === name)
    expect(saved.image).toMatch(/^data:image\//)
    let pixel = await topLeftPixel(page, saved.image)
    expect(pixel[0]).toBeGreaterThan(pixel[2]) // red channel dominant

    // Replace with a visually distinct image.
    let editDialog = await openCharacterEditor(page, name)
    const blueImage = await makeCanvasImageBuffer(page, '#0000ff')
    await editDialog.locator('input#char-image-upload').setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: blueImage })
    await expect(editDialog.getByText('Change Image')).toBeVisible()
    await editDialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    chars = await readStorage(page, 'nf_characters')
    saved = chars.find(c => c.name === name)
    pixel = await topLeftPixel(page, saved.image)
    expect(pixel[2]).toBeGreaterThan(pixel[0]) // now blue channel dominant

    // Remove it.
    editDialog = await openCharacterEditor(page, name)
    await editDialog.getByRole('button', { name: 'Remove' }).click()
    await expect(editDialog.getByText('Upload Image')).toBeVisible()
    await editDialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    chars = await readStorage(page, 'nf_characters')
    expect(chars.find(c => c.name === name).image).toBe('')
  })

  test('a save attempted while a portrait upload is still in flight is refused, keeping the draft open', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Upload Race ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)

    // A large real image gives the real async decode/resize/encode chain
    // enough genuine latency to reliably still be in flight when Save fires
    // immediately after it, without any artificial delay/mocking.
    const slowImage = await makeCanvasImageBuffer(page, '#33cc99', 3000)
    await dialog.locator('input#char-image-upload').setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: slowImage })
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Wait for the portrait upload to finish.')
    await expect(dialog).toBeVisible()

    await expect(dialog.getByText('Change Image')).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.find(c => c.name === name)?.image).toMatch(/^data:image\//)
  })

  test('replacing an upload before the first one finishes keeps only the latest image', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Replace Race ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)

    const fileInput = dialog.locator('input#char-image-upload')
    const slowRed = await makeCanvasImageBuffer(page, '#ff0000', 3000) // slow, started first
    const fastBlue = await makeCanvasImageBuffer(page, '#0000ff', 6)   // fast, started second, resolves first

    await fileInput.setInputFiles({ name: 'slow-red.png', mimeType: 'image/png', buffer: slowRed })
    await fileInput.setInputFiles({ name: 'fast-blue.png', mimeType: 'image/png', buffer: fastBlue })
    await expect(dialog.getByText('Change Image')).toBeVisible()

    // Give the slow, superseded red upload plenty of time to also resolve in
    // the background — its stale result must be discarded, not silently
    // reopen/repopulate the form with red.
    await page.waitForTimeout(2000)
    await dialog.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    const saved = chars.find(c => c.name === name)
    const pixel = await topLeftPixel(page, saved.image)
    expect(pixel[2]).toBeGreaterThan(pixel[0]) // blue (the latest), not red
  })

  test('discarding a draft while its portrait upload is still in flight does not reopen the editor or save the pending image', async ({ page }) => {
    const before = (await readStorage(page, 'nf_characters')) || []

    await page.getByRole('button', { name: 'New' }).first().click()
    const dialog = page.getByRole('dialog').first()
    const name = `Discard Race ${Date.now()}`
    await dialog.getByLabel('Name').fill(name)
    const slowImage = await makeCanvasImageBuffer(page, '#ffaa00', 3000)
    await dialog.locator('input#char-image-upload').setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: slowImage })

    await page.keyboard.press('Escape')
    const prompt = page.locator('.save-changes-prompt')
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Let the in-flight upload's promise settle in the background.
    await page.waitForTimeout(3000)
    await expect(page.getByRole('dialog')).toHaveCount(0) // still no reopen

    await saveAndReload(page)
    const after = await readStorage(page, 'nf_characters')
    expect(after.length).toBe(before.length)
    expect(after.some(c => c.name === name)).toBe(false)
  })

  test('the nested photo editor tracks its own unsaved crop independently of the parent character draft', async ({ page }) => {
    await page.getByRole('button', { name: 'New' }).first().click()
    const parentDialog = page.getByRole('dialog', { name: 'Create Character' })
    const name = `Nested Editor Char ${Date.now()}`
    await parentDialog.getByLabel('Name').fill(name)

    const image = await makeCanvasImageBuffer(page, '#22aa66')
    await parentDialog.locator('input#char-image-upload').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: image })
    await expect(parentDialog.getByText('Change Image')).toBeVisible()

    await parentDialog.getByRole('button', { name: 'Edit Photo' }).click()
    const photoDialog = page.getByRole('dialog', { name: 'Edit Portrait' })
    await expect(photoDialog).toBeVisible()
    await expect(photoDialog.getByAltText('Portrait')).toBeVisible()

    // Drag the crop box to a new position — a real pointer move, not a click.
    const picker = photoDialog.locator('.relative.select-none.touch-none')
    const box = await picker.boundingBox()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2, { steps: 5 })
    await page.mouse.up()

    // Escape on the nested editor shows only its own unsaved-changes prompt,
    // scoped to that dialog — not the parent's.
    await page.keyboard.press('Escape')
    const nestedPrompt = photoDialog.locator('.save-changes-prompt')
    await expect(nestedPrompt).toBeVisible()
    await nestedPrompt.getByRole('button', { name: 'Discard' }).click()
    await expect(photoDialog).toHaveCount(0)

    // The parent character draft is still open and still prompts before it
    // discards, independent of what happened in the (now-closed) nested one.
    await expect(parentDialog).toBeVisible()
    await page.keyboard.press('Escape')
    const parentPrompt = parentDialog.locator('.save-changes-prompt')
    await expect(parentPrompt).toBeVisible()
    // Save from the discard prompt itself (not the form's own Save button)
    // still runs the real save.
    await parentPrompt.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await saveAndReload(page)
    const chars = await readStorage(page, 'nf_characters')
    const saved = chars.find(c => c.name === name)
    expect(saved.image).toMatch(/^data:image\//)
    // The discarded crop change did not apply — default position/zoom held.
    expect(saved.imagePosition).toBe('50% 50%')
    expect(saved.imageZoom).toBe(1)
  })
})
