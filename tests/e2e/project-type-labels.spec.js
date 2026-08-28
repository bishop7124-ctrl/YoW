/**
 * Project-type structure label tests — verify that each project type renders
 * the correct level1/level2/level3 labels in the manuscript structure sidebar
 * and that the default word target is stored on the project at creation.
 *
 * Roadmap QA_PLAN Priority 6: Novella, Short Story, D&D Campaign, TTRPG Campaign.
 */
import { expect, test } from '@playwright/test'
import { PROJECT_TYPES } from '../../src/constants/projectTypes.js'
import { createProject, dismissLaunchPrompts, readStorage, seedCleanStorage } from './helpers.js'

// Types that have non-Novel structure labels — the ones QA_PLAN flags as needing verification.
const LABEL_TYPES = [
  'novella',        // Part / Chapter / Scene
  'short_story',    // Part / Section / Scene
  'dnd_campaign',   // Story Arc / Session / Encounter
  'tabletop_rpg',   // Campaign Arc / Session / Encounter
]

// Guard against the silent-skip that hid the TTRPG case: this list previously
// said 'ttrpg_campaign', which is not a key in PROJECT_TYPES (the real key is
// 'tabletop_rpg'), so the `if (!cfg) continue` below dropped that project type's
// coverage entirely while QA_PLAN Priority 6 recorded it as covered.
for (const typeId of LABEL_TYPES) {
  if (!PROJECT_TYPES[typeId]) {
    throw new Error(`LABEL_TYPES contains unknown project type "${typeId}" — coverage would be silently skipped`)
  }
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

for (const typeId of LABEL_TYPES) {
  const cfg = PROJECT_TYPES[typeId]
  if (!cfg) continue

  test(`${cfg.label}: structure sidebar shows ${cfg.structure.level1}/${cfg.structure.level2}/${cfg.structure.level3} labels`, async ({ page }) => {
    const title = `Label Test ${cfg.label} ${Date.now()}`
    await createProject(page, { title, type: typeId })

    // Navigate to Write mode so the structure sidebar renders
    await page.getByRole('button', { name: 'Write' }).click()
    await expect(page).toHaveURL(/\/project\/.+\/writing/)

    // The sidebar renders "+ {level1}", "+ {level2}", "+ {level3}" as button text
    await expect(
      page.getByRole('button', { name: new RegExp(cfg.structure.level1, 'i') }).first()
    ).toBeVisible({ timeout: 8000 })

    await expect(
      page.getByRole('button', { name: new RegExp(cfg.structure.level2, 'i') }).first()
    ).toBeVisible({ timeout: 5000 })

    // level3 appears as the "+ Scene" / "+ Encounter" / "+ Page" button inside a chapter row
    await expect(
      page.getByRole('button', { name: new RegExp(cfg.structure.level3, 'i') }).first()
    ).toBeVisible({ timeout: 5000 })
  })

  if (cfg.defaultWordTarget) {
    test(`${cfg.label}: default word target (${cfg.defaultWordTarget}) is stored at project creation`, async ({ page }) => {
      const title = `WordTarget ${cfg.label} ${Date.now()}`
      await createProject(page, { title, type: typeId })

      // Must go through readStorage (window.__yowStorageBridge), not raw
      // localStorage: the app's active backend for a regular browser session is
      // the IndexedDB-backed vault (src/storage/browserVaultAdapter.js), so
      // `localStorage.getItem('nf_novels')` is null for *every* project type —
      // see the 2026-08-25 storage-migration row in docs/ROADMAP.md's Bugs
      // table. This file was the last spec still reading raw localStorage.
      const novels = (await readStorage(page, 'nf_novels')) || []
      const project = novels.find(n => n.title === title)

      expect(project).toBeTruthy()
      // NovelManager saves it as "wordTarget" on the novel object
      expect(project.wordTarget).toBe(cfg.defaultWordTarget)
    })
  }
}
