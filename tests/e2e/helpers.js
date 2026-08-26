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
    // Suppress the first-run wizard and all tours so they never block button clicks
    localStorage.setItem('yow_onboarding', JSON.stringify({
      wizard_local: true,
      'wizard_offline-dev-user': true,
      welcome_local: true,
      'welcome_offline-dev-user': true,
      checklistDismissed: true,
      toursEnabled: false,
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

// Read project storage from the app's browser vault. Modern browser sessions
// use IndexedDB with a synchronous in-memory mirror; older/fallback sessions
// still use localStorage. Tests call this helper so specs can stay agnostic.
async function readRawStorage(page, key) {
  return page.evaluate(async (k) => {
    const readFromIndexedDb = () => new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return }
      const request = window.indexedDB.open('yow-storage', 1)
      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('kv')) {
          db.close()
          resolve(null)
          return
        }
        const tx = db.transaction('kv', 'readonly')
        const get = tx.objectStore('kv').get(k)
        get.onsuccess = () => {
          const value = get.result ?? null
          db.close()
          resolve(value)
        }
        get.onerror = () => {
          db.close()
          resolve(null)
        }
      }
    })
    const indexedValue = await readFromIndexedDb()
    return indexedValue ?? localStorage.getItem(k)
  }, key)
}

async function syncStorageSnapshotToLocalStorage(page) {
  await page.evaluate(async (keys) => {
    const readAllFromIndexedDb = () => new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return }
      const request = window.indexedDB.open('yow-storage', 1)
      request.onerror = () => resolve(null)
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('kv')) {
          db.close()
          resolve(null)
          return
        }
        const tx = db.transaction('kv', 'readonly')
        const store = tx.objectStore('kv')
        const snapshot = {}
        let remaining = keys.length
        if (!remaining) {
          db.close()
          resolve(snapshot)
          return
        }
        for (const key of keys) {
          const get = store.get(key)
          get.onsuccess = () => {
            if (get.result != null) snapshot[key] = get.result
            remaining -= 1
            if (remaining === 0) {
              db.close()
              resolve(snapshot)
            }
          }
          get.onerror = () => {
            remaining -= 1
            if (remaining === 0) {
              db.close()
              resolve(snapshot)
            }
          }
        }
      }
    })
    const snapshot = await readAllFromIndexedDb()
    if (!snapshot) return
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) localStorage.setItem(key, snapshot[key])
      else localStorage.removeItem(key)
    }
  }, storageKeys)
}

// Navigate to writing and fill the default scene, waiting for autosave to project storage.
export async function writeInDefaultScene(page, text) {
  await page.getByRole('button', { name: 'Write' }).click()
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await editor.fill(text)
  await editor.press('End')
  await waitForStorage(page, (expected) => {
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    return scenes.some(s => s.content === expected || (s.content || '').includes(expected.slice(0, 40)))
  }, text)
}

// Poll project storage until predicate returns truthy, or throw on timeout.
// Pass `arg` as the third param to forward a value into the browser predicate.
export async function waitForStorage(page, predicate, arg, timeout = 8000) {
  if (typeof arg === 'number') { timeout = arg; arg = undefined }
  await page.waitForFunction(
    async ({ source, value, keys }) => {
      const readAllFromIndexedDb = () => new Promise((resolve) => {
        if (!window.indexedDB) { resolve(null); return }
        const request = window.indexedDB.open('yow-storage', 1)
        request.onerror = () => resolve(null)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('kv')) {
            db.close()
            resolve(null)
            return
          }
          const tx = db.transaction('kv', 'readonly')
          const store = tx.objectStore('kv')
          const snapshot = {}
          let remaining = keys.length
          if (!remaining) {
            db.close()
            resolve(snapshot)
            return
          }
          for (const key of keys) {
            const get = store.get(key)
            get.onsuccess = () => {
              if (get.result != null) snapshot[key] = get.result
              remaining -= 1
              if (remaining === 0) {
                db.close()
                resolve(snapshot)
              }
            }
            get.onerror = () => {
              remaining -= 1
              if (remaining === 0) {
                db.close()
                resolve(snapshot)
              }
            }
          }
        }
      })
      const snapshot = await readAllFromIndexedDb()
      if (snapshot) {
        for (const key of keys) {
          if (Object.prototype.hasOwnProperty.call(snapshot, key)) localStorage.setItem(key, snapshot[key])
          else localStorage.removeItem(key)
        }
      }
      return (0, eval)(`(${source})`)(value)
    },
    { source: predicate.toString(), value: arg, keys: storageKeys },
    { timeout },
  )
}

// Read a project-storage key and JSON-parse it.
export async function readStorage(page, key) {
  await syncStorageSnapshotToLocalStorage(page)
  const raw = await readRawStorage(page, key)
  try { return raw ? JSON.parse(raw) : null } catch { return raw }
}

// Read a project-storage key as a string.
export async function readStorageRaw(page, key) {
  await syncStorageSnapshotToLocalStorage(page)
  return readRawStorage(page, key)
}

// Write directly to the current storage snapshot for setup-heavy specs.
export async function writeStorage(page, key, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  await page.evaluate(({ k, v }) => {
    localStorage.setItem(k, v)
    return new Promise((resolve) => {
      if (!window.indexedDB) { resolve(); return }
      const request = window.indexedDB.open('yow-storage', 1)
      request.onerror = () => resolve()
      request.onsuccess = () => {
        const db = request.result
        if (!db.objectStoreNames.contains('kv')) {
          db.close()
          resolve()
          return
        }
        const tx = db.transaction('kv', 'readwrite')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
        tx.objectStore('kv').put(v, k)
      }
    })
  }, { k: key, v: raw })
}

// Keep direct localStorage assertions usable in specs while the app migrates to IndexedDB.
export async function syncStorageForAssertions(page) {
  await syncStorageSnapshotToLocalStorage(page)
}
