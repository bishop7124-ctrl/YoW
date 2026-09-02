import { DB_NAME, DB_VERSION, STORE_NAME } from '../../src/storage/browserVaultAdapter.js'

// The fixed user id assigned to every e2e run by the VITE_OFFLINE_MODE dev-user
// fixture (see src/utils/offlineMock.js). useTourStore keys wizard/welcome
// dismissal per-user (`wizard_<userId>` / `welcome_<userId>`), not as a flat
// `wizardShown` flag, so suppression here must match that shape or the
// first-run "How would you like to begin?" wizard reappears on every run.
export const OFFLINE_USER_ID = 'offline-dev-user'

export const storageKeys = [
  'nf_activeNovel',
  'nf_acts',
  'nf_chapters',
  'nf_scenes',
  'nf_novels',
  'nf_characters',
  'nf_locations',
  'nf_factions',
  'nf_loreEntries',
  'nf_timeline',
  'nf_worldHistory',
  'nf_ideaEntries',
  'nf_maps',
  'nf_activeMapByNovel',
  'nf_whiteboards',
  'nf_series',
  'nf_storySchedule',
  'nf_localWriteAt',
  'nf_comicPages',
  'nf_comicPanels',
]

export async function seedCleanStorage(page) {
  await page.addInitScript((keys) => {
    if (!sessionStorage.getItem('yow_qa_storage_seeded')) {
      for (const key of keys) localStorage.removeItem(key)
      sessionStorage.setItem('yow_qa_storage_seeded', '1')
    }
    localStorage.setItem('yow_beta_acknowledged', '1')
    // Suppress the first-run wizard and all tours so they never block button clicks.
    // useTourStore reads these per-userId ('wizard_<id>'/'welcome_<id>'), not a flat
    // 'wizardShown' flag — see the OFFLINE_USER_ID comment above.
    localStorage.setItem('yow_onboarding', JSON.stringify({
      toursEnabled: false,
      checklistDismissed: true,
      'wizard_offline-dev-user': true,
      'welcome_offline-dev-user': true,
    }))
    document.cookie = 'yow_consent=essential; max-age=31536000; path=/; SameSite=Lax'
  }, storageKeys)
}

export async function dismissLaunchPrompts(page) {
  const betaDialog = page.getByRole('dialog', { name: 'Beta disclaimer' })
  if (await betaDialog.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Got it, let me in' }).click()
  }

  const cookieBanner = page.getByRole('region', { name: 'Cookie consent' })
  if (await cookieBanner.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Essential only' }).click()
  }

  const tourDialog = page.getByRole('dialog', { name: /^Tour:/ })
  if (await tourDialog.isVisible().catch(() => false)) {
    const skipBtn = page.getByRole('button', { name: /skip/i })
    if (await skipBtn.isVisible().catch(() => false)) await skipBtn.click()
  }
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Create a project and return to its overview page.
export async function createProject(page, { title, type = 'novel' } = {}) {
  const projectTitle = title || `Test Project ${Date.now()}`
  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(projectTitle)
  if (type !== 'novel') {
    const { PROJECT_TYPES } = await import('../../src/constants/projectTypes.js')
    const label = PROJECT_TYPES[type]?.label
    if (label) {
      await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}\\b`) }).first().click()
    }
  }
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL(/\/project\//)
  return projectTitle
}

export function writingNavButton(page) {
  return page.getByLabel('Studio navigation').getByRole('button', { name: 'Write' })
}

export async function enterWritingMode(page) {
  await writingNavButton(page).click()
}

export async function waitForWritingMode(page) {
  await page.locator('.manuscript-processor').waitFor({ state: 'visible', timeout: 10_000 })
}

// Click the studio "Project settings" gear button (aria-label, not the library card text button).
export async function openProjectSettings(page) {
  await page.getByLabel('Project settings').first().click()
  // Wait for the settings dialog to appear
  await page.waitForSelector('[role="dialog"][aria-labelledby="project-settings-title"]', { timeout: 6000 })
}

// Open the Import dropdown and click "Import ZIP", then return the file input locator.
export async function openImportZip(page) {
  await page.getByRole('button', { name: /Import/i }).first().click()
  await page.getByRole('menuitem', { name: /Import ZIP/i })
    .or(page.getByRole('button', { name: /Import ZIP/i }))
    .first()
    .click()
  // The AIImportModal file input accepts zip among other types
  return page.locator('input[type="file"]').first()
}

// Wait for the manuscript/writing view to be hydrated and ready after a
// reload — e.g. before reading persisted storage back out. A bare
// `getByRole('button', { name: 'Write' })` is ambiguous once already on the
// writing route: the redesigned editor's own Write/Edit mode toggle
// (ManuscriptTopbar.jsx, `aria-label="Editor mode"`) is also labeled
// "Write", alongside the persistent Studio nav's own "Write" room button
// (Studio.jsx, `aria-label="Studio navigation"`) — a strict-mode violation
// (2 elements) rather than the single match this used to be pre-redesign.
// Scope to the Studio nav one specifically, matching this call's original
// intent (confirm navigation/hydration is stable after reload).
export async function waitForManuscriptReady(page) {
  await page.getByLabel('Studio navigation').getByRole('button', { name: 'Write' }).waitFor()
}

// Navigate to writing and fill the default scene, waiting for autosave to localStorage.
export async function writeInDefaultScene(page, text) {
  await enterWritingMode(page)
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await editor.fill(text)
  await editor.press('End')
  // Wait for project storage to reflect the written content. Goes through
  // window.__yowStorageBridge (see src/storage/projectStorage.js) rather than
  // raw localStorage — the app's active backend can be an IndexedDB-backed
  // vault, which raw localStorage reads can't see. Content itself lives
  // under a per-scene `nf_scene_content:<id>` key, not inline on the
  // nf_scenes record (src/storage/sceneContentStore.js splits it out) — a
  // scene can transiently still show inline content here too (right after
  // the first local commit, before its content key is confirmed written),
  // so check both rather than assuming either one is authoritative.
  await page.waitForFunction(
    (expected) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scenes = JSON.parse(get('nf_scenes') || '[]')
      const matches = (content) => content === expected || (content || '').includes(expected.slice(0, 40))
      return scenes.some(s => matches(s.content) || matches(get(`nf_scene_content:${s.id}`)))
    },
    text,
    { timeout: 8000 },
  )
}

// Wait, after a navigation/reload, until reads through the storage bridge will
// actually see the IndexedDB-backed data rather than an empty localStorage.
//
// `flush()` before a reload is only half the job, and the missing half is what
// made worldbuilding.spec.js flaky for so long. The two are different races:
// flush covers "the write hadn't landed yet"; this covers "the read went to the
// wrong backend". `window.__yowStorageBridge` is installed at projectStorage.js
// *module* evaluation, but `activeBackend` starts as localStorage and is only
// swapped for the IndexedDB vault when main.jsx's `boot()` awaits
// `initializeIndexedDbStorage()`. So immediately after a reload the bridge is
// already present and already answering `getItem()` — from the default
// localStorage backend, where the app's nf_* keys do not live. Every such read
// returns `null`, silently and plausibly, which is exactly the failure
// signature that spec showed: a different subset of tests failing each run on
// `readStorage` returning null, masked in CI by playwright.config.mjs's
// `retries: 1`.
//
// Measured directly (2026-08-28): over five reloads, `__yowStorageBridge` was
// truthy immediately in 5/5 — so its presence is *not* a usable readiness
// signal — while `getItem('nf_novels')` returned null in 2/5, in exactly the
// samples where `#root` had not yet rendered.
//
// `boot()` renders React strictly *after* awaiting the backend swap, so "#root
// has any children" is a sufficient and reliable signal that the swap is done.
// It is also deliberately not a UI-specific locator: waiting on a named button
// (what the same fix reached for in autosave.spec.js and
// account-isolation.spec.js) re-couples storage readiness to whatever the
// current design calls that control, which is the exact failure mode that let
// focused-writing.spec.js rot to 4/4 failing across the editor redesign.
// The backend-name check below is not belt-and-braces: `boot()` wraps the vault
// init in a try/catch and `initializeIndexedDbStorage` returns null when
// IndexedDB is unavailable or its open/read throws, and React renders either
// way. So "#root has children" alone is also satisfied when the swap never
// happened — leaving every nf_* read null and the tests reporting "the data was
// never saved" for what is actually "the vault failed to start". Naming that
// distinction here keeps it from costing another debugging pass.
export async function waitForStorageHydration(page, timeout = 10000) {
  await page.waitForFunction(
    () => Boolean(window.__yowStorageBridge)
      && (document.getElementById('root')?.children.length ?? 0) > 0,
    undefined,
    { timeout },
  )
  // Optional-chained so this helper still works against a build predating
  // `backendName` on the bridge; only a positive mismatch is treated as fatal.
  const backendName = await page.evaluate(() => window.__yowStorageBridge?.backendName?.() ?? null)
  if (backendName !== null && backendName !== 'indexeddb') {
    throw new Error(
      `storage vault did not initialise: the bridge is answering reads from the "${backendName}" `
      + 'backend, so every nf_* key will read as null no matter what the app saved. '
      + 'This is an environment/boot failure, not a persistence bug in the code under test.',
    )
  }
}

// Poll localStorage until predicate returns truthy, or throw on timeout.
// Pass `arg` as the third param to forward a value into the browser predicate.
export async function waitForStorage(page, predicate, arg, timeout = 8000) {
  if (typeof arg === 'number') { timeout = arg; arg = undefined }
  await page.waitForFunction(predicate, arg, { timeout })
}

// Seed project-storage entries (nf_* keys) directly into the app's IndexedDB
// vault (see src/storage/browserVaultAdapter.js for the DB_NAME/DB_VERSION/
// STORE_NAME schema, imported above rather than duplicated — out-of-line
// string keys) *before* the app boots, so
// initializeIndexedDbStorage()'s hydration picks them up as if they were
// already there. This is the pre-boot equivalent of window.__yowStorageBridge
// (which only exists once the app's JS has actually loaded) — use this from
// page.addInitScript for "arrange as if this data already existed" seeding,
// and the bridge for writes made to an already-running page mid-test.
// Falls back to a no-op if IndexedDB is unavailable (matches the app's own
// fallback-to-localStorage behavior — real localStorage seeding still works
// as a last resort since that's projectStorage.js's default backend too).
export async function seedIndexedDbEntries(page, entries) {
  // Async and awaits the write transaction's actual completion (not just each
  // put() request firing) before resolving — addInitScript's injected code
  // still runs before the page's own scripts regardless, but this at least
  // ensures our writes are fully committed relative to each other rather than
  // racing our own open()/put() calls internally. It can't guarantee ordering
  // against the app's *own* later indexedDB.open('yow-storage') call in
  // main.jsx (Playwright doesn't block navigation on an init script's
  // returned promise) — in practice the app's module scripts take far longer
  // to fetch/parse/execute than this synchronous open+put chain takes to
  // issue, so this hasn't been observed to race, but if this ever proves
  // flaky in real CI, that's the first place to look.
  await page.addInitScript(async ({ data, dbName, dbVersion, storeName }) => {
    if (typeof indexedDB === 'undefined') return
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, dbVersion)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName)
      }
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        for (const [key, value] of Object.entries(data)) store.put(String(value), key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  }, { data: entries, dbName: DB_NAME, dbVersion: DB_VERSION, storeName: STORE_NAME })
}

// Read a project-storage key and JSON-parse it. Goes through
// window.__yowStorageBridge (see src/storage/projectStorage.js) when present,
// since the app's active backend can be real localStorage or an IndexedDB-
// backed vault depending on runtime — reading raw `localStorage` directly
// silently sees nothing once IndexedDB is active. Falls back to raw
// localStorage for keys the app never routes through that abstraction (e.g.
// onboarding/consent flags this test suite sets directly).
export async function readStorage(page, key) {
  return page.evaluate((k) => {
    const raw = window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    try { return raw ? JSON.parse(raw) : null } catch { return raw }
  }, key)
}

// Read `nf_scenes` and merge each scene's prose back in from its own
// `nf_scene_content:<id>` key (see src/storage/sceneContentStore.js — a
// 2026-08 perf refactor strips `.content` out of the nf_scenes metadata
// array unconditionally and stores it per-scene instead, exactly the way
// the app's own hydrateScenesFromStorage() does for React state). A plain
// `readStorage(page, 'nf_scenes')` scene will never have `.content` — use
// this instead for any assertion that needs to see what was actually typed.
// Mirrors hydrateScenesFromStorage()'s own precedence exactly, not the
// reverse: prefers the metadata record's own inline `.content` when it's a
// non-empty string (right after the very first local commit for a scene,
// the content key can transiently lag behind the metadata — see
// writeInDefaultScene's wait for the same check), only falling back to the
// content key when inline content is empty/missing. Getting this backwards
// would make a test trust a stale/empty content key over the scene's real
// current content — the same class of bug as the 2026-08-09 data-loss
// incident sceneContentStore.js's own comments describe.
export async function readScenesWithContent(page) {
  return page.evaluate(() => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]')
    return scenes.map(scene => ({
      ...scene,
      content: (typeof scene.content === 'string' && scene.content.length > 0)
        ? scene.content
        : (get(`nf_scene_content:${scene.id}`) || ''),
    }))
  })
}
