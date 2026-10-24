import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorage, waitForStorageHydrated, writeInDefaultScene, readScenesWithContent,
} from './helpers.js'

// Re-verification (2026-09-17, QA/autonomous session) of the docs/ROADMAP.md
// Bugs table row "Project deletion does not persist after logout." That row
// was already closed on 2026-08-28 via a manual/ad-hoc browser pass that was
// never captured as a committed regression test — this file promotes that
// pass into a permanent, automated one, and additionally drives it through
// the *real* signOut()/signIn() code paths in AuthContext (via the actual
// "Sign out" menu item and the real login form, which OFFLINE_MODE answers
// by accepting any credentials — see src/context/AuthContext.jsx's
// `signIn`/`signOut`) rather than only the `page.reload()` proxy the rest of
// this suite uses elsewhere (e.g. autosave.spec.js's "content survives
// logout then login" test).
//
// Scope note carried over honestly from the roadmap row: OFFLINE_MODE stubs
// out every cloud call (deleteProjectData, debouncedSaveItems, etc. all
// short-circuit — see firestoreSync.js), so this test exercises the local/
// session persistence layer only (replaceProjectStorageAtomically /
// projectReplacement.js, IndexedDB-backed vault). It does NOT exercise the
// live Supabase cloud-delete RPC (`delete_project_data_atomic`) or a real
// account's server-side round trip, which still needs a real-account pass
// against a live Supabase project to fully close out.
test.describe('project deletion persists across sign-out and sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await waitForStorageHydrated(page)
  })

  test('a deleted project stays deleted after a real sign-out and sign-in round trip', async ({ page }) => {
    const title = `Logout Delete QA ${Date.now()}`
    await createProject(page, { title })

    // Back to the library, delete the project the same way dashboard.spec.js's
    // "delete a project and confirm it is removed from storage" test does.
    await page.getByRole('button', { name: 'Back to projects' }).click()
    await expect(page.getByRole('heading', { name: title }).first()).toBeVisible()

    await page.getByLabel('Project settings').first().click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Delete project', exact: true }).click()

    // Confirm the local commit is immediate — no debounce wait — matching
    // deleteNovel's synchronous replaceProjectStorageAtomically write.
    await waitForStorage(page, (t) => {
      const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
      return !JSON.parse(raw || '[]').some(n => n.title === t)
    }, title)

    // Real sign-out via the user menu (not a reload) — exercises AuthContext's
    // actual signOut(), which in OFFLINE_MODE clears `user` synchronously and
    // in real (non-offline) mode awaits runSyncFlush() first.
    await page.locator('.user-menu-trigger').click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: "You've been signed out" })).toBeVisible()

    // Real sign-in via the actual login form (not a reload) — OFFLINE_MODE's
    // signIn() accepts any credentials, matching the way a real account would
    // re-authenticate and reload its data.
    await page.getByRole('button', { name: 'Log in again' }).click()
    await page.getByPlaceholder('Email').fill('qa-relogin@example.com')
    await page.getByPlaceholder('Password').fill('not-a-real-password')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()

    await dismissLaunchPrompts(page)
    await waitForStorageHydrated(page)

    // The deleted project must not have reappeared in storage or in the
    // library UI after the fresh "session."
    await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
    const novels = await readStorage(page, 'nf_novels')
    expect(novels.some(n => n.title === title)).toBe(false)
  })

  test('failed sign-out archive preserves prose and login retry resumes after storage recovers', async ({ page }) => {
    const prose = `Unconfirmed offline prose ${Date.now()}`
    await createProject(page, { title: 'Archive retry regression' })
    await writeInDefaultScene(page, prose)
    await page.evaluate(async () => {
      await window.__yowStorageBridge.flush()
      const { getStorageBackend } = await import('/src/storage/projectStorage.js')
      const backend = getStorageBackend()
      const original = backend.replaceItems
      window.__restoreArchiveWrites = () => { backend.replaceItems = original }
      backend.replaceItems = () => Promise.reject(new Error('Injected archive transaction abort'))
    })
    await page.locator('.user-menu-trigger').click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: "You've been signed out" })).toBeVisible()
    expect((await readScenesWithContent(page)).some(s => s.content === prose)).toBe(true)
    await page.getByRole('button', { name: 'Log in again' }).click()
    await page.getByPlaceholder('Email').fill('qa-relogin@example.com')
    await page.getByPlaceholder('Password').fill('not-a-real-password')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    expect((await readScenesWithContent(page)).some(s => s.content === prose)).toBe(true)
    await page.evaluate(() => window.__restoreArchiveWrites())
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await dismissLaunchPrompts(page)
    await expect.poll(async () => (await readScenesWithContent(page)).some(s => s.content === prose)).toBe(true)
    const archived = await readStorage(page, 'nf_unsyncedRecovery:offline-dev-user')
    expect(archived.data.scenes.some(s => s.content === prose)).toBe(true)
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0)
  })

})
