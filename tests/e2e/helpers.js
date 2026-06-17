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
    // Suppress the first-run wizard so it never blocks button clicks
    localStorage.setItem('yow_onboarding', JSON.stringify({ wizardShown: true, checklistDismissed: true }))
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

// Navigate to writing and fill the default scene, waiting for autosave to localStorage.
export async function writeInDefaultScene(page, text) {
  await page.getByRole('button', { name: 'Write' }).click()
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  const editor = page.getByPlaceholder('Begin writing here…')
  await editor.fill(text)
  await editor.press('End')
  // Wait for localStorage to reflect the written content
  await page.waitForFunction(
    (expected) => {
      const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
      return scenes.some(s => s.content === expected || (s.content || '').includes(expected.slice(0, 40)))
    },
    text,
    { timeout: 8000 },
  )
}

// Poll localStorage until predicate returns truthy, or throw on timeout.
export async function waitForStorage(page, predicate, timeout = 8000) {
  await page.waitForFunction(predicate, undefined, { timeout })
}

// Read a localStorage key and JSON-parse it.
export async function readStorage(page, key) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k)
    try { return raw ? JSON.parse(raw) : null } catch { return raw }
  }, key)
}
