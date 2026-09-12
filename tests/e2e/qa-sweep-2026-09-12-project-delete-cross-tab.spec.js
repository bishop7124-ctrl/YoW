// QA sweep 2026-09-12 (product-owner autonomous session): live two-tab
// verification of the last still-open half of the "Project deletion can
// leave per-scene keys" item (audit finding #16 — see docs/ROADMAP.md Bugs
// table and docs/QA_PLAN.md's "Data durability, restore, and deletion"
// entry). The 2026-09-10 sweep (qa-sweep-2026-09-10.spec.js) already proved
// single-tab project deletion purges both the deleted project's own scene-
// content key and a pre-existing unrelated orphan. What was left deferred
// was the documented "KNOWN CROSS-TAB RACE" comment in
// src/storage/sceneContentStore.js's deleteAllSceneContentForNovel: a scene
// edit's content-key write and its nf_scenes metadata write used to
// broadcast to other tabs as two separate, sequential BroadcastChannel
// messages, so a concurrent orphan sweep in another tab could momentarily
// see the new content key without yet seeing the metadata that would prove
// it belongs to a live, undeleted project.
//
// Investigation for this sweep found that the *live* project-deletion path
// (`deleteNovel` in useStore.js) no longer goes through
// deleteAllSceneContentForNovel at all — it hasn't since the atomic full-
// state replacement work landed (`replaceProjectStorageAtomically` /
// projectReplacement.js, verified in this sweep to be the only call site
// deleteNovel actually uses for storage). That path computes the complete
// authoritative set of every retained scene's content key and removes
// every *other* nf_scene_content:* key already in storage in the exact
// same replaceItemsAtomically() call — which browserVaultAdapter.js's
// wireCrossTabSync broadcasts as a single atomic `{ type: 'replace' }`
// message, not two sequential ones. There is no "metadata updated but
// content key not yet visible" window for another tab to observe, because
// there is only one message. deleteAllSceneContentForNovel and
// sceneVersions.js's clearSceneVersionsForNovel are now unused in
// production (confirmed via a full grep — only their own test files
// reference them); the documented race lives in dead code, not the code
// path an account's real projects go through.
//
// This test exercises the real, live two-tab scenario the QA_PLAN item
// asks for — edit/create content in one tab while an unrelated project is
// deleted in another — against the actual deleteNovel/replaceItems path,
// rather than relying on the code-reading conclusion above alone.
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readScenesWithContent,
  seedCleanStorage, waitForStorage, waitForStorageHydration, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await waitForStorageHydration(page)
})

test('deleting a project in one tab does not clobber a scene just written in another tab', async ({ page, context }) => {
  // Tab A: the project that will be deleted.
  await createProject(page, { title: `Delete Me ${Date.now()}` })
  const novelsBefore = await page.evaluate(() => JSON.parse(window.__yowStorageBridge?.getItem('nf_novels') || localStorage.getItem('nf_novels') || '[]'))
  const deletedProjectId = novelsBefore[novelsBefore.length - 1].id

  // Tab B: a second, unrelated project sharing the same IndexedDB vault,
  // opened after tab A's boot so it picks up tab A's project via the same
  // shared storage (not a cross-tab broadcast — both read the same DB at
  // boot). Navigates to the app root (not page.url(), which is already deep
  // in tab A's project view after createProject) so the library's "New
  // Project" button is reachable.
  const pageB = await context.newPage()
  await pageB.goto('/')
  await dismissLaunchPrompts(pageB)
  await waitForStorageHydration(pageB)

  const keptTitle = `Keep Me ${Date.now()}`
  await createProject(pageB, { title: keptTitle })
  const proseText = 'This sentence must survive an unrelated deletion happening in another tab.'

  // Fire tab B's scene write and tab A's unrelated-project delete back to
  // back, without waiting for tab B's save (and its cross-tab broadcast) to
  // fully settle first — maximizing overlap between the two tabs' storage
  // operations rather than serializing them, which is what the documented
  // race needed to matter at all.
  const writePromise = writeInDefaultScene(pageB, proseText)

  await page.evaluate(() => { window.confirm = () => true })
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.locator('.dash-card-settings-button').first().click()
  await page.getByRole('button', { name: 'Delete project' }).click()

  await writePromise

  await waitForStorage(page, (id) => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    const novels = JSON.parse(raw || '[]')
    return !novels.some(n => n.id === id)
  }, deletedProjectId)

  // Tab B's own view of its just-written content must be intact regardless.
  const scenesInB = await readScenesWithContent(pageB)
  expect(scenesInB.some(s => s.content === proseText)).toBe(true)

  // The real cross-tab race concern: does tab A's delete (and the storage
  // it just rewrote) still show tab B's project and scene content intact,
  // once tab A's own view has caught up via the shared vault/broadcast?
  await pageB.close()
  await page.waitForTimeout(500) // let the cross-tab broadcast settle
  const novelsInA = await page.evaluate(() => JSON.parse(window.__yowStorageBridge?.getItem('nf_novels') || localStorage.getItem('nf_novels') || '[]'))
  expect(novelsInA.some(n => n.title === keptTitle)).toBe(true)
  expect(novelsInA.some(n => n.id === deletedProjectId)).toBe(false)

  const scenesInA = await readScenesWithContent(page)
  expect(scenesInA.some(s => s.content === proseText)).toBe(true)
})
