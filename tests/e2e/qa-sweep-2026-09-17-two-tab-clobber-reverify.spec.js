import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readStorage,
  seedCleanStorage, waitForManuscriptReady, waitForStorage, waitForStorageHydration,
} from './helpers.js'

// Re-verification pass for the docs/ROADMAP.md Bugs-table row "Two browser
// tabs on the same account silently clobber each other's edits..." (added
// 2026-08-02). Uses two real Playwright Pages sharing one BrowserContext
// against the local VITE_OFFLINE_MODE dev build — same origin, so both
// "tabs" share the same real IndexedDB-backed vault and BroadcastChannel
// bridges (src/storage/browserVaultAdapter.js, src/utils/useTabPresence.js)
// exactly the way two real browser tabs of the same signed-in profile would.
// No real Supabase account is available in this sandbox, so this exercises
// the local/IndexedDB reconciliation layers and the presence-warning/lease
// UI, not the cloud-sync-specific layer or a real logout/login cycle — see
// the matching docs/ROADMAP.md note for what still needs a credentialed pass.

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

async function openSecondTab(context, url) {
  const pageB = await context.newPage()
  await pageB.goto(url)
  await dismissLaunchPrompts(pageB)
  await waitForStorageHydration(pageB)
  return pageB
}

async function openCharacter(page, name) {
  await page.getByRole('button', { name: 'Characters' }).first().click()
  await page.locator('.studio-record', { hasText: name }).first().click()
  await page.getByRole('button', { name: /^Edit$/i }).first().click()
}

test.describe('Structured-record conflicts (conflict-structured-records repro)', () => {
  test.beforeEach(async ({ page }) => {
    await createProject(page, { title: 'Two-Tab Structured Records' })
  })

  test('two tabs editing different records do not clobber each other', async ({ page, context }) => {
    // Seed a character and a location in tab A first.
    await page.getByRole('button', { name: 'Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill('Alpha Char')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await waitForStorage(page, () => {
      const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters')) || '[]')
      return chars.some(c => c.name === 'Alpha Char')
    })

    await page.getByRole('button', { name: 'Atlas' }).first().click()
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill('Beta Loc')
    await page.getByRole('button', { name: 'Save' }).click()
    await waitForStorage(page, () => {
      const locs = JSON.parse((window.__yowStorageBridge?.getItem('nf_locations')) || '[]')
      return locs.some(l => l.name === 'Beta Loc')
    })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    const pageB = await openSecondTab(context, page.url())

    // Tab A edits the character's Title / Job field.
    await openCharacter(page, 'Alpha Char')
    await page.getByLabel('Title / Job').fill('Cartographer')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await waitForStorage(page, () => {
      const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters')) || '[]')
      return chars.find(c => c.name === 'Alpha Char')?.titleJob === 'Cartographer'
    })

    // Tab B, concurrently, edits the location's description.
    await pageB.getByRole('button', { name: 'Atlas' }).first().click()
    await pageB.locator('.studio-record', { hasText: 'Beta Loc' }).first().click()
    await pageB.getByRole('button', { name: /^Edit$/i }).first().click()
    await pageB.locator('textarea').first().fill('A cliffside outpost.')
    await pageB.getByRole('button', { name: 'Save' }).click()
    await waitForStorage(pageB, () => {
      const locs = JSON.parse((window.__yowStorageBridge?.getItem('nf_locations')) || '[]')
      return locs.find(l => l.name === 'Beta Loc')?.description === 'A cliffside outpost.'
    })

    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await pageB.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)

    const chars = await readStorage(page, 'nf_characters')
    const locs = await readStorage(page, 'nf_locations')
    expect(chars.find(c => c.name === 'Alpha Char')?.titleJob).toBe('Cartographer')
    expect(locs.find(l => l.name === 'Beta Loc')?.description).toBe('A cliffside outpost.')
    await expect(page.locator('.ms-toolbar-conflict-btn')).toHaveCount(0)

    await pageB.close()
  })

  test('two tabs editing different fields on the same character merge without clobbering', async ({ page, context }) => {
    await page.getByRole('button', { name: 'Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill('Merge Target')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await waitForStorage(page, () => {
      const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters')) || '[]')
      return chars.some(c => c.name === 'Merge Target')
    })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    const pageB = await openSecondTab(context, page.url())

    // Both tabs open the SAME character's editor before either one saves.
    await openCharacter(page, 'Merge Target')
    await pageB.getByRole('button', { name: 'Characters' }).first().click()
    await openCharacter(pageB, 'Merge Target')

    // Tab B changes Species and saves first.
    await pageB.getByLabel('Species').fill('Elf')
    await pageB.getByRole('button', { name: 'Save Character' }).click()
    await expect(pageB.getByRole('dialog')).toHaveCount(0)

    // Give the cross-tab BroadcastChannel write time to land.
    await page.waitForTimeout(1000)

    // Tab A, unaware of Tab B's edit, changes only Title / Job and saves.
    await page.getByLabel('Title / Job').fill('Cartographer')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.evaluate(() => window.__yowStorageBridge?.flush())
    const chars = await readStorage(page, 'nf_characters')
    const merged = chars.find(c => c.name === 'Merge Target')
    expect(merged.species).toBe('Elf')
    expect(merged.titleJob).toBe('Cartographer')

    // Different fields merge cleanly — nothing to flag for review.
    await expect(page.locator('.ms-toolbar-conflict-btn')).toHaveCount(0)

    await pageB.close()
  })

  test('two tabs editing the SAME field on the same character: this tab\'s save is kept and the other tab\'s version is preserved for review via the sync-conflicts banner', async ({ page, context }) => {
    await page.getByRole('button', { name: 'Characters' }).first().click()
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill('Conflict Target')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await waitForStorage(page, () => {
      const chars = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters')) || '[]')
      return chars.some(c => c.name === 'Conflict Target')
    })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    const pageB = await openSecondTab(context, page.url())

    await openCharacter(page, 'Conflict Target')
    await pageB.getByRole('button', { name: 'Characters' }).first().click()
    await openCharacter(pageB, 'Conflict Target')

    // Tab B renames the Pronouns field first and saves.
    await pageB.getByLabel('Pronouns').fill('she/her')
    await pageB.getByRole('button', { name: 'Save Character' }).click()
    await expect(pageB.getByRole('dialog')).toHaveCount(0)

    await page.waitForTimeout(1000)

    // Tab A, unaware, sets the SAME field to a different value and saves.
    await page.getByLabel('Pronouns').fill('they/them')
    await page.getByRole('button', { name: 'Save Character' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Tab A's save is kept as-is — nothing silently lost.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.find(c => c.name === 'Conflict Target')?.pronouns).toBe('they/them')

    // The genuine same-field clash surfaces as a reviewable sync conflict —
    // top utility bar banner, "⚠ N sync conflicts".
    const banner = page.locator('.ms-toolbar-conflict-btn')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText('1 sync conflict')

    // Survives a refresh.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydration(page)
    await expect(page.locator('.ms-toolbar-conflict-btn')).toBeVisible({ timeout: 5000 })

    // Restore/Keep-mine actions work.
    await page.locator('.ms-toolbar-conflict-btn').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const restoreBtn = page.getByRole('button', { name: /Restore other tab's version/i }).first()
    await expect(restoreBtn).toBeVisible()
    await restoreBtn.click()
    await waitForStorage(page, () => {
      const chars2 = JSON.parse((window.__yowStorageBridge?.getItem('nf_characters')) || '[]')
      return chars2.find(c => c.name === 'Conflict Target')?.pronouns === 'she/her'
    })
    await expect(page.locator('.ms-toolbar-conflict-btn')).toHaveCount(0, { timeout: 5000 })

    await pageB.close()
  })
})

test.describe('Same-scene presence warning / first-editor lease (conflict-same-scene repro)', () => {
  test.beforeEach(async ({ page }) => {
    await createProject(page, { title: 'Two-Tab Scene Presence' })
    await enterWritingMode(page)
    // A second scene, so "a different scene shows nothing" has something to open.
    await page.locator('.ms-rail-add-scene').first().getByRole('button', { name: 'scene', exact: true }).click()
    await waitForStorage(page, () => {
      const scenes = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes')) || '[]')
      return scenes.length >= 2
    })
    await page.evaluate(() => window.__yowStorageBridge?.flush())
  })

  test('focusing a scene already focused in another tab warns immediately with only "Return to read-only", and warns again on a later attempt', async ({ page, context }) => {
    // Tab A focuses (and starts editing) the first scene.
    await page.locator('.ms-preview').first().click()
    await page.locator('.ms-textarea').first().fill('Sentinel from tab A.')

    const pageB = await openSecondTab(context, page.url())
    await enterWritingMode(pageB)

    // Tab B tries to focus the SAME (first) scene.
    await pageB.locator('.ms-preview').first().click()

    const warning = pageB.getByRole('dialog', { name: 'Also open in another tab' })
    await expect(warning).toBeVisible({ timeout: 5000 })
    // The unsafe "Edit anyway" override was removed — only a single
    // "Return to read-only" action remains (first-editor lease design).
    await expect(warning.getByRole('button', { name: 'Edit anyway' })).toHaveCount(0)
    const backBtn = warning.getByRole('button', { name: 'Return to read-only' })
    await expect(backBtn).toBeVisible()
    await backBtn.click()
    await expect(warning).toHaveCount(0)
    // Back in read-only preview, not a live editable textarea.
    await expect(pageB.locator('.ms-textarea').first()).toHaveCount(0)

    // Tab A is unaffected and keeps its own edit.
    await expect(page.locator('.ms-textarea').first()).toHaveValue(/Sentinel from tab A\./)

    // Trying again while Tab A is still active warns again (not a one-time nag).
    await pageB.waitForTimeout(500)
    await pageB.locator('.ms-preview').first().click()
    await expect(pageB.getByRole('dialog', { name: 'Also open in another tab' })).toBeVisible({ timeout: 5000 })
    await pageB.getByRole('button', { name: 'Return to read-only' }).click()
    await expect(pageB.getByRole('dialog', { name: 'Also open in another tab' })).toHaveCount(0)

    await pageB.close()
  })

  test('releases the lease once the first tab stops editing, letting the second tab edit', async ({ page, context }) => {
    // Tab A focuses (and starts editing) the first scene.
    await page.locator('.ms-preview').first().click()
    await page.locator('.ms-textarea').first().fill('Sentinel from tab A.')

    const pageB = await openSecondTab(context, page.url())
    await enterWritingMode(pageB)

    // Tab B tries to focus the SAME scene and is warned/blocked.
    await pageB.locator('.ms-preview').first().click()
    await expect(pageB.getByRole('dialog', { name: 'Also open in another tab' })).toBeVisible({ timeout: 5000 })
    await pageB.getByRole('button', { name: 'Return to read-only' }).click()
    await expect(pageB.getByRole('dialog', { name: 'Also open in another tab' })).toHaveCount(0)
    await pageB.waitForTimeout(500)

    // Tab A releases the lease by blurring the scene (releases presence,
    // which broadcasts a 'bye' over the yow-record-presence BroadcastChannel).
    // A generous settle window here is deliberate: this only needs to prove
    // the lease is releasable and re-acquirable at all, not bound the exact
    // release latency, and the app itself has no such latency guarantee.
    await page.evaluate(() => document.activeElement?.blur())
    await expect(page.locator('.ms-textarea')).toHaveCount(0)
    await page.waitForTimeout(1500)

    // Tab B can now focus and actually edit.
    await pageB.locator('.ms-preview').first().click()
    await expect(pageB.getByRole('dialog', { name: 'Also open in another tab' })).toHaveCount(0, { timeout: 5000 })
    const taB = pageB.locator('.ms-textarea').first()
    await expect(taB).toBeVisible({ timeout: 5000 })
    await taB.fill('Sentinel from tab B, after A released it.')
    await expect(taB).toHaveValue(/Sentinel from tab B, after A released it\./)

    await pageB.close()
  })

  test('opening a different scene, or the same scene when nobody else has it open, shows no warning', async ({ page, context }) => {
    // Tab A focuses the FIRST scene.
    await page.locator('.ms-preview').first().click()
    await page.locator('.ms-textarea').first().fill('Tab A editing scene 1.')

    const pageB = await openSecondTab(context, page.url())
    await enterWritingMode(pageB)

    // Tab B opens a DIFFERENT scene (the second one) — no warning expected.
    // (Only one scene is ever focused per tab at a time — a focused scene's
    // own decorative rich-preview overlay also carries the "ms-preview"
    // class, so `.ms-preview` can have more than one match once something is
    // focused; `.ms-textarea` stays a reliable singleton per tab instead.)
    await pageB.locator('.ms-preview').nth(1).click()
    await expect(pageB.getByRole('dialog', { name: 'Also open in another tab' })).toHaveCount(0)
    await expect(pageB.locator('.ms-textarea').first()).toBeVisible({ timeout: 5000 })

    await pageB.close()

    // A fresh tab C opens the first scene once nobody else has it open
    // (Tab A blurs first) — no warning expected.
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(200)
    const pageC = await openSecondTab(context, page.url())
    await enterWritingMode(pageC)
    await pageC.locator('.ms-preview').first().click()
    await expect(pageC.getByRole('dialog', { name: 'Also open in another tab' })).toHaveCount(0)
    await expect(pageC.locator('.ms-textarea').first()).toBeVisible({ timeout: 5000 })

    await pageC.close()
  })
})

test.describe('Scene conflict-copy banner (manuscript toolbar)', () => {
  test.beforeEach(async ({ page }) => {
    await createProject(page, { title: 'Two-Tab Scene Conflict Copies' })
    await enterWritingMode(page)
  })

  test('a seeded scene conflict copy shows the toolbar banner, and Restore/Discard work and survive a refresh', async ({ page }) => {
    await page.locator('.ms-preview').first().click()
    await page.locator('.ms-textarea').first().fill('Original scene content, kept as main.')
    await waitForStorage(page, () => {
      const scenes = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes')) || '[]')
      return scenes.length >= 1
    })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    const novels = await readStorage(page, 'nf_novels')
    const novelId = novels[0].id
    const scenes = await readStorage(page, 'nf_scenes')
    const scene = scenes[0]

    // Seed a scene conflict copy directly in storage — this is exactly the
    // shape mergeSceneUpdateWithPersistedCopy (useStore.js) produces when a
    // stale tab's cloud push loses a race (docs/ROADMAP.md root cause (5)).
    await page.evaluate(({ scene, novelId }) => {
      const existing = JSON.parse(window.__yowStorageBridge.getItem('nf_scenes') || '[]')
      const copy = {
        ...scene,
        id: `conflict-copy-${Date.now()}`,
        novelId,
        title: `${scene.title || 'Scene'} (conflict copy)`,
        content: 'Attempted edit that lost the race, preserved as a conflict copy.',
        conflictOf: scene.id,
        conflictCreatedAt: Date.now(),
      }
      window.__yowStorageBridge.setItem('nf_scenes', JSON.stringify([...existing, copy]))
    }, { scene, novelId })

    await page.reload()
    await waitForManuscriptReady(page)

    const banner = page.locator('.ms-topbar-conflict-btn')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await expect(banner).toContainText('1 conflict copy')

    await banner.click()
    const modal = page.getByRole('dialog', { name: 'Scene conflict copies' })
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('Attempted edit that lost the race')

    // Restore replaces the live scene's content with the conflict copy's.
    await modal.getByRole('button', { name: /Restore/i }).first().click()
    await waitForStorage(page, () => {
      const list = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes')) || '[]')
      return !list.some(s => s.conflictOf)
    })
    await expect(page.locator('.ms-topbar-conflict-btn')).toHaveCount(0, { timeout: 5000 })

    // Survives a refresh (no conflict copy resurrected, no banner).
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForManuscriptReady(page)
    await expect(page.locator('.ms-topbar-conflict-btn')).toHaveCount(0)
    const finalScenes = await readStorage(page, 'nf_scenes')
    expect(finalScenes.some(s => s.id === scene.id && s.content?.includes('Attempted edit'))).toBe(false)
  })
})

test.describe('General multi-tab pass', () => {
  test('two tabs editing two different scenes concurrently do not lose data', async ({ page, context }) => {
    await createProject(page, { title: 'Two-Tab General Pass' })
    await enterWritingMode(page)
    await page.locator('.ms-rail-add-scene').first().getByRole('button', { name: 'scene', exact: true }).click()
    await waitForStorage(page, () => {
      const scenes = JSON.parse((window.__yowStorageBridge?.getItem('nf_scenes')) || '[]')
      return scenes.length >= 2
    })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    const pageB = await openSecondTab(context, page.url())
    await enterWritingMode(pageB)

    await page.locator('.ms-preview').first().click()
    await page.locator('.ms-textarea').first().fill('Tab A content in scene one.')

    await pageB.locator('.ms-preview').nth(1).click()
    await pageB.locator('.ms-textarea').first().fill('Tab B content in scene two.')

    await page.waitForTimeout(1000)
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await pageB.evaluate(() => window.__yowStorageBridge?.flush())

    await page.reload()
    await waitForManuscriptReady(page)
    const scenes = await readStorage(page, 'nf_scenes')
    const get = (k) => page.evaluate((key) => window.__yowStorageBridge?.getItem(key), k)
    const contents = await Promise.all(scenes.map(async s => s.content || await get(`nf_scene_content:${s.id}`)))
    expect(contents.some(c => (c || '').includes('Tab A content in scene one.'))).toBe(true)
    expect(contents.some(c => (c || '').includes('Tab B content in scene two.'))).toBe(true)

    await pageB.close()
  })
})
