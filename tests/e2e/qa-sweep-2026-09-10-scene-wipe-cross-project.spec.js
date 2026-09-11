// QA sweep 2026-09-10 (qa-engineer regression pass): permanent browser-level
// regression guard for the ROADMAP.md Bugs-table row "2026-07-19: Editing a
// scene could wipe scene text across every other project after a stale
// localStorage write" (root cause: `mergeSceneUpdateWithPersistedCopy`
// rebuilt the *entire* in-memory scenes array from a possibly-stale
// localStorage/`nf_scenes` snapshot, and `save()` silently swallowed
// `QuotaExceededError` writes — see src/store/useStore.js and
// src/storage/writeDurability.js for the fix). Unit coverage already exists
// (src/store/useStore.test.js's "immediate data-safety persistence" and
// "storage quota enforcement" describe blocks) but nothing previously drove
// this through a real browser with real IndexedDB writes, a real
// multi-project account, and a real page reload — this fills that gap.
//
// Two independent tests:
//
// 1. "many populated projects" — a multi-project account (several background
//    projects with substantial content, plus three projects edited live —
//    edit/add/delete — all through the real UI) proves the *scoping* half of
//    the fix: `mergeSceneUpdateWithPersistedCopy` only ever rebuilds the one
//    scene being edited from live state, never the whole account, so normal
//    heavy multi-project use can never cross-contaminate projects.
//
// 2. "simulated storage-quota failure" — proves the *quota-failure* half of
//    the fix and the user-facing warning end to end. The real browser quota
//    this bug depended on is IndexedDB's (hundreds of MB to several GB per
//    origin, see indexedDbBackend.js's own header comment) — actually
//    filling that in a CI-run test would be slow and non-deterministic.
//    Instead this monkey-patches `IDBObjectStore.prototype.put` (installed
//    via `addInitScript`, so it applies to the real app's real
//    `indexedDB.open`/transaction/put calls, not a mock of the app's own
//    code) to make writes for one specific scene's content key fail with a
//    real `DOMException` named `QuotaExceededError` — the exact error shape
//    `indexedDbBackend.js`'s `persist()` call would reject with under real
//    quota exhaustion. This exercises the real `onWriteError` ->
//    `markLocalWriteFailed` -> `nf_localWriteFailed` -> `localStorageWarning`
//    -> toast chain, and the real `importData` "don't trust a snapshot with
//    a known failed write" refusal on reload, without needing to actually
//    exhaust real disk quota.
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readScenesWithContent, readStorage,
  seedCleanStorage, waitForStorageHydrated, waitForWritingMode,
} from './helpers.js'

// Selects the scene at `railIndex` (0-based, in on-screen rail order) via the
// Structure rail, then activates and overwrites its content through the real
// SceneEditor textarea — works whether the scene starts empty or already has
// content, unlike helpers.js's writeInDefaultScene (which only reliably
// targets a freshly-created *empty* scene's placeholder). `sceneId` is
// required (read from storage by the caller beforehand) so the edit is
// scoped to `#ms-scene-<id>` rather than assuming DOM/rail order matches a
// specific `.ms-preview` — Manuscript.jsx can mount more than one scene's
// preview at once (virtualized continuous-scroll document), so an unscoped
// `.first()` is not reliably "the scene I just selected."
async function writeSceneContent(page, { sceneId, railIndex, text }) {
  await page.locator('.ms-rail-scene-btn').nth(railIndex).click()
  const scope = page.locator(`#ms-scene-${sceneId}`)
  const editor = scope.locator('textarea.ms-textarea').first()
  // An unfocused scene renders a plain, clickable `.ms-preview` (with an
  // onClick that activates editing and mounts the real textarea) and no
  // textarea at all. An already-focused scene (e.g. re-editing it a second
  // time) instead renders a *decorative*, aria-hidden `.ms-rich-preview
  // .ms-preview` overlay with no click handler, stacked behind the real
  // textarea — `.or()` below resolves to whichever of the two actually
  // exists for this scene right now, so this works for both states without
  // needing to probe which one is currently mounted.
  const inactivePreview = scope.locator('.ms-preview:not(.ms-rich-preview)')
  await inactivePreview.or(editor).first().click()
  await editor.waitFor({ state: 'visible', timeout: 8000 })
  await editor.fill(text)
  await editor.press('End')
  await page.waitForFunction(({ id, expected }) => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]')
    const scene = scenes.find(s => s.id === id)
    if (!scene) return false
    const content = (typeof scene.content === 'string' && scene.content) || get(`nf_scene_content:${id}`) || ''
    return content === expected
  }, { id: sceneId, expected: text }, { timeout: 10000 })
}

// Navigates from the library (or another project's studio) into `title`'s
// Write mode, ready for writeSceneContent above.
async function goToProjectWriting(page, title) {
  await page.getByText(title).first().click()
  await enterWritingMode(page)
  await waitForWritingMode(page)
}

async function getSoleSceneId(page, novelId) {
  const scenes = await readStorage(page, 'nf_scenes')
  const match = (scenes || []).filter(s => s.novelId === novelId)
  expect(match.length).toBe(1)
  return match[0].id
}

// Each test below seeds its own storage (some need IndexedDB data present
// *before* `goto`, via seedIndexedDbEntries) and navigates explicitly, so
// there is no shared top-level beforeEach/goto here — unlike most other e2e
// specs in this repo, where every test starts from the same blank state.

test.describe('cross-project scene isolation under a heavy multi-project account', () => {
  test('editing, adding, and deleting scenes in three live projects never touches other projects\' scene text, across a refresh with no logout', async ({ page }) => {
    test.setTimeout(150_000)
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)

    // ── Background load: several other projects with substantial content,
    // created through the real UI (not pre-boot IndexedDB seeding — tried
    // that first, but seedIndexedDbEntries's write races the app's own
    // IndexedDB-open-and-hydrate on first boot, per its own doc comment in
    // helpers.js ["hasn't been observed to race" elsewhere, but it did
    // here], and lost the seeded projects before the app ever read them).
    // This account is smaller than the ~25 projects the original bug was
    // found on, but the mechanism under test (mergeSceneUpdateWithPersisted-
    // Copy scoping) doesn't depend on project count, only on "other projects
    // exist and have their own persisted scene text."
    const BULK_COUNT = 4
    const bulkProjects = []
    for (let i = 0; i < BULK_COUNT; i++) {
      const title = `Bulk Project ${i} ${Date.now()}`
      const content = `Bulk project ${i} original content baseline — must never change. `.repeat(400)
      await createProject(page, { title })
      const novelId = (await readStorage(page, 'nf_novels')).find(n => n.title === title).id
      const sceneId = await getSoleSceneId(page, novelId)
      await enterWritingMode(page)
      await waitForWritingMode(page)
      await writeSceneContent(page, { sceneId, railIndex: 0, text: content })
      bulkProjects.push({ novelId, sceneId, content })
      await page.getByRole('button', { name: 'Back to projects' }).click()
    }

    // ── Three live projects, each with distinct, easy-to-spot content.
    const titleA = `Live A ${Date.now()}`
    const titleB = `Live B ${Date.now()}`
    const titleC = `Live C ${Date.now()}`

    await createProject(page, { title: titleA })
    const novelA = (await readStorage(page, 'nf_novels')).find(n => n.title === titleA).id
    const sceneA1 = await getSoleSceneId(page, novelA)
    await enterWritingMode(page)
    await waitForWritingMode(page)
    await writeSceneContent(page, { sceneId: sceneA1, railIndex: 0, text: 'Project A original content — must survive.' })

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await createProject(page, { title: titleB })
    const novelB = (await readStorage(page, 'nf_novels')).find(n => n.title === titleB).id
    const sceneB1 = await getSoleSceneId(page, novelB)
    await enterWritingMode(page)
    await waitForWritingMode(page)
    await writeSceneContent(page, { sceneId: sceneB1, railIndex: 0, text: 'Project B original content — will be deleted.' })

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await createProject(page, { title: titleC })
    const novelC = (await readStorage(page, 'nf_novels')).find(n => n.title === titleC).id
    const sceneC1 = await getSoleSceneId(page, novelC)
    await enterWritingMode(page)
    await waitForWritingMode(page)
    await writeSceneContent(page, { sceneId: sceneC1, railIndex: 0, text: 'Project C original content — must survive.' })

    // ── Edit A: overwrite its only scene.
    await page.getByRole('button', { name: 'Back to projects' }).click()
    await goToProjectWriting(page, titleA)
    await writeSceneContent(page, { sceneId: sceneA1, railIndex: 0, text: 'Project A EDITED content — must survive as-is.' })

    // ── B: add a second scene, write into it, then delete the original —
    // exercises add + delete, not just edit.
    await page.getByRole('button', { name: 'Back to projects' }).click()
    await goToProjectWriting(page, titleB)
    await page.locator('.ms-rail-add-scene').first().getByRole('button', { name: 'scene', exact: true }).click()
    await page.waitForFunction((novelId) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scenes = JSON.parse(get('nf_scenes') || '[]')
      return scenes.filter(s => s.novelId === novelId).length === 2
    }, novelB, { timeout: 8000 })
    const sceneB2 = (await readStorage(page, 'nf_scenes')).find(s => s.novelId === novelB && s.id !== sceneB1).id
    await writeSceneContent(page, { sceneId: sceneB2, railIndex: 1, text: 'Project B NEW scene content — must survive.' })

    await page.evaluate(() => { window.confirm = () => true })
    const originalRow = page.locator('.ms-rail-scene').nth(0)
    await originalRow.hover()
    await originalRow.getByLabel('Delete scene').click()
    await page.waitForFunction((novelId) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scenes = JSON.parse(get('nf_scenes') || '[]')
      return scenes.filter(s => s.novelId === novelId).length === 1
    }, novelB, { timeout: 8000 })

    // ── Edit C: overwrite its only scene a second time.
    await page.getByRole('button', { name: 'Back to projects' }).click()
    await goToProjectWriting(page, titleC)
    await writeSceneContent(page, { sceneId: sceneC1, railIndex: 0, text: 'Project C EDITED content — must survive as-is.' })

    // ── Refresh without logging out (the exact reproduction condition from
    // the roadmap row) and verify nothing bled across projects.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydrated(page)

    const finalScenes = await readScenesWithContent(page)
    const byNovel = (novelId) => finalScenes.filter(s => s.novelId === novelId)

    expect(byNovel(novelA).map(s => s.content)).toEqual(['Project A EDITED content — must survive as-is.'])
    const finalB = byNovel(novelB)
    expect(finalB.length).toBe(1)
    expect(finalB[0].content).toBe('Project B NEW scene content — must survive.')
    expect(byNovel(novelC).map(s => s.content)).toEqual(['Project C EDITED content — must survive as-is.'])

    for (const bulk of bulkProjects) {
      const scene = finalScenes.find(s => s.novelId === bulk.novelId)
      expect(scene, `bulk project ${bulk.novelId} should still have its scene`).toBeTruthy()
      expect(scene.content, `bulk project ${bulk.novelId}'s content must be untouched by edits made to unrelated live projects`).toBe(bulk.content)
    }
  })
})

test.describe('simulated browser-storage-quota failure', () => {
  test.beforeEach(async ({ page }) => {
    // Installed before the very first navigation so it re-applies on every
    // subsequent navigation this page makes, including `page.reload()` —
    // addInitScript persists for the page's lifetime. Reads its "which keys
    // should fail" list from sessionStorage on every call (not captured at
    // patch time) so the test can toggle it on/off mid-run, and sessionStorage
    // itself survives a same-tab reload the same way the rest of this test
    // relies on (no logout, no fresh context).
    await page.addInitScript(() => {
      const STORE_NAME = 'kv'
      const FLAG_KEYS = 'yow_qa_force_fail_keys'
      const shouldFail = (key) => {
        try {
          const raw = sessionStorage.getItem(FLAG_KEYS)
          if (!raw) return false
          const keys = JSON.parse(raw)
          return Array.isArray(keys) && keys.includes(key)
        } catch { return false }
      }
      const makeFailingRequest = () => {
        const req = {}
        req.error = new DOMException(
          'Simulated QuotaExceededError injected by e2e regression test (tests/e2e/qa-sweep-2026-09-10-scene-wipe-cross-project.spec.js)',
          'QuotaExceededError',
        )
        setTimeout(() => { if (typeof req.onerror === 'function') req.onerror(new Event('error')) }, 0)
        return req
      }
      if (typeof IDBObjectStore === 'undefined' || IDBObjectStore.prototype.__yowQuotaPatched) return
      const originalPut = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === STORE_NAME && shouldFail(key)) return makeFailingRequest()
        return originalPut.call(this, value, key)
      }
      IDBObjectStore.prototype.__yowQuotaPatched = true
    })
  })

  test('a scene stuck failing to persist never wipes other projects\' text, surfaces the storage-full toast, and self-heals without logout', async ({ page }) => {
    test.setTimeout(150_000)

    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)

    const titleA = `Quota A ${Date.now()}`
    const titleB = `Quota B ${Date.now()}`
    const titleC = `Quota C ${Date.now()}`

    await createProject(page, { title: titleA })
    const novelA = (await readStorage(page, 'nf_novels')).find(n => n.title === titleA).id
    const sceneA = await getSoleSceneId(page, novelA)
    await enterWritingMode(page)
    await waitForWritingMode(page)
    await writeSceneContent(page, { sceneId: sceneA, railIndex: 0, text: 'A1 — last good write before quota failure.' })
    // Confirm A1 actually reached disk (not just the in-memory mirror) before
    // we start forcing failures, so the later "reload shows A1, not A2" check
    // proves the fix, not an artifact of A1 never having persisted either.
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await createProject(page, { title: titleB })
    const novelB = (await readStorage(page, 'nf_novels')).find(n => n.title === titleB).id
    const sceneB = await getSoleSceneId(page, novelB)
    await enterWritingMode(page)
    await waitForWritingMode(page)
    await writeSceneContent(page, { sceneId: sceneB, railIndex: 0, text: 'B1' })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await createProject(page, { title: titleC })
    const novelC = (await readStorage(page, 'nf_novels')).find(n => n.title === titleC).id
    const sceneC = await getSoleSceneId(page, novelC)
    await enterWritingMode(page)
    await waitForWritingMode(page)
    await writeSceneContent(page, { sceneId: sceneC, railIndex: 0, text: 'C1' })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    const contentKeyA = `nf_scene_content:${sceneA}`

    // ── Start forcing "quota exceeded" for project A's scene content key only.
    await page.evaluate((key) => { sessionStorage.setItem('yow_qa_force_fail_keys', JSON.stringify([key])) }, contentKeyA)

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await goToProjectWriting(page, titleA)
    await writeSceneContent(page, { sceneId: sceneA, railIndex: 0, text: 'A2 — should never reach disk.' })

    // withRetry (writeDurability.js) retries 3x with backoff (~1.2s total)
    // before giving up and calling markLocalWriteFailed — poll rather than
    // assume a fixed delay.
    await expect.poll(async () => {
      const failed = await readStorage(page, 'nf_localWriteFailed')
      return Array.isArray(failed) && failed.includes(contentKeyA)
    }, { timeout: 10_000, message: 'nf_localWriteFailed should record the poisoned scene content key' }).toBe(true)

    // ── The storage-full warning toast appears and links to Storage settings.
    const toast = page.getByRole('alert').filter({ hasText: "isn't keeping a reliable local copy" })
    await expect(toast).toBeVisible({ timeout: 6000 })
    await toast.getByRole('button', { name: 'Storage settings' }).click()
    await expect(page.locator('[role="dialog"][aria-labelledby="account-settings-title"]')).toBeVisible({ timeout: 6000 })
    await page.getByLabel('Close account settings').click()

    // ── Meanwhile, edit and confirm B and C — their writes are not intercepted.
    await page.getByRole('button', { name: 'Back to projects' }).click()
    await goToProjectWriting(page, titleB)
    await writeSceneContent(page, { sceneId: sceneB, railIndex: 0, text: 'B2 — written while project A is failing to save.' })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await goToProjectWriting(page, titleC)
    await writeSceneContent(page, { sceneId: sceneC, railIndex: 0, text: 'C2 — written while project A is failing to save.' })
    await page.evaluate(() => window.__yowStorageBridge?.flush())

    // ── Refresh without logging out — the exact reproduction condition.
    await page.reload()
    await waitForStorageHydrated(page)

    const afterReload = await readScenesWithContent(page)
    expect(afterReload.find(s => s.id === sceneB)?.content).toBe('B2 — written while project A is failing to save.')
    expect(afterReload.find(s => s.id === sceneC)?.content).toBe('C2 — written while project A is failing to save.')
    // A's own unpersisted edit is expected to revert to its last
    // successfully-saved value (A2 genuinely never reached disk — that's an
    // inherent, honest consequence of real quota exhaustion, not a bug) —
    // the actual regression under test is that it must NOT come back as B2,
    // C2, empty, or missing entirely.
    const sceneAAfterReload = afterReload.find(s => s.id === sceneA)
    expect(sceneAAfterReload).toBeTruthy()
    expect(sceneAAfterReload.content).toBe('A1 — last good write before quota failure.')

    // The toast should still be showing right after reload — the underlying
    // key is still marked failed and no successful write has cleared it.
    await expect(page.getByRole('alert').filter({ hasText: "isn't keeping a reliable local copy" })).toBeVisible({ timeout: 6000 })

    // ── Self-heal: once storage stops failing, the very next write to the
    // same key should succeed and clear the warning — no logout required.
    await page.evaluate(() => sessionStorage.removeItem('yow_qa_force_fail_keys'))
    // We may have landed back on whichever project the reload's route
    // resolved to — navigate to A explicitly rather than assume.
    if (!(await page.getByText(titleA).first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Back to projects' }).click()
    }
    await goToProjectWriting(page, titleA)
    await writeSceneContent(page, { sceneId: sceneA, railIndex: 0, text: 'A3 — recovered after storage stopped failing.' })

    await expect.poll(async () => {
      const failed = await readStorage(page, 'nf_localWriteFailed')
      return Array.isArray(failed) && failed.includes(contentKeyA)
    }, { timeout: 10_000, message: 'nf_localWriteFailed should clear once a write to the same key succeeds' }).toBe(false)
    await expect(page.getByRole('alert').filter({ hasText: "isn't keeping a reliable local copy" })).not.toBeVisible({ timeout: 6000 })

    // Confirm the recovery is real (on disk), not just in the live tab's memory.
    await page.evaluate(() => window.__yowStorageBridge?.flush())
    await page.reload()
    await waitForStorageHydrated(page)
    const finalScenes = await readScenesWithContent(page)
    expect(finalScenes.find(s => s.id === sceneA)?.content).toBe('A3 — recovered after storage stopped failing.')
    expect(finalScenes.find(s => s.id === sceneB)?.content).toBe('B2 — written while project A is failing to save.')
    expect(finalScenes.find(s => s.id === sceneC)?.content).toBe('C2 — written while project A is failing to save.')
  })
})
