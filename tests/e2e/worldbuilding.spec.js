import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorage,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Worldbuilding Test Project' })
})

// ─── Characters ───────────────────────────────────────────────────────────────

test.describe('Characters', () => {
  test.beforeEach(async ({ page }) => {
    // "Characters" is a top-level room button in the studio nav
    await page.getByRole('button', { name: 'Characters' }).first().click()
    await expect(page.getByRole('heading', { name: /Characters/i })).toBeVisible()
  })

  test('create a character and verify localStorage persistence', async ({ page }) => {
    const charName = `Character ${Date.now()}`

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(charName)
    await page.getByRole('button', { name: 'Save Character' }).click()

    // Pass charName as arg so it's available in the browser context
    await waitForStorage(page, (n) => {
      const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
      return chars.some(c => c.name === n)
    }, charName)

    await page.reload()
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.some(c => c.name === charName)).toBe(true)
  })

  test('edit a character and verify the change persists', async ({ page }) => {
    const originalName = `Edit Target ${Date.now()}`
    const updatedName = `Updated ${Date.now()}`

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(originalName)
    await page.getByRole('button', { name: 'Save Character' }).click()

    await waitForStorage(page, (n) => {
      const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
      return chars.some(c => c.name === n)
    }, originalName)

    await page.getByText(originalName).first().click()
    await page.getByRole('button', { name: /^Edit$/i }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(updatedName)
    await page.getByRole('button', { name: 'Save Character' }).click()

    await waitForStorage(page, (n) => {
      const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
      return chars.some(c => c.name === n)
    }, updatedName)

    await page.reload()
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.some(c => c.name === updatedName)).toBe(true)
    expect(chars.some(c => c.name === originalName)).toBe(false)
  })

  test('delete a character and verify it is removed', async ({ page }) => {
    const charName = `Delete Me ${Date.now()}`

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(charName)
    await page.getByRole('button', { name: 'Save Character' }).click()

    await waitForStorage(page, (n) => {
      const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
      return chars.some(c => c.name === n)
    }, charName)

    await page.getByText(charName).first().click()
    await page.getByRole('button', { name: /Delete/i }).first().click()

    const confirmBtn = page.getByRole('button', { name: /Confirm|Yes|Delete/i }).first()
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
    }

    await waitForStorage(page, (n) => {
      const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
      return !chars.some(c => c.name === n)
    }, charName)

    await page.reload()
    const chars = await readStorage(page, 'nf_characters')
    expect(chars.some(c => c.name === charName)).toBe(false)
  })

  test('character search filters the list', async ({ page }) => {
    const nameA = `Alpha ${Date.now()}`
    const nameB = `Beta ${Date.now()}`

    for (const charName of [nameA, nameB]) {
      await page.getByRole('button', { name: 'New' }).first().click()
      await page.locator('[role="dialog"] input[required]').first().fill(charName)
      await page.getByRole('button', { name: 'Save Character' }).click()
      await waitForStorage(page, (n) => {
        const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
        return chars.some(c => c.name === n)
      }, charName)
    }

    const searchBox = page.getByPlaceholder(/search/i).first()
    if (!(await searchBox.isVisible().catch(() => false))) {
      test.skip()
      return
    }

    await searchBox.fill('Alpha')
    await expect(page.getByText(nameA)).toBeVisible()
    await expect(page.getByText(nameB)).not.toBeVisible()
  })
})

// ─── Locations ────────────────────────────────────────────────────────────────

test.describe('Locations', () => {
  test.beforeEach(async ({ page }) => {
    // "Locations" is a section inside the "Atlas" room — click the room first
    await page.getByRole('button', { name: 'Atlas' }).first().click()
    await expect(page.getByRole('heading', { name: /Locations/i })).toBeVisible()
  })

  test('create a location and verify persistence', async ({ page }) => {
    const locName = `Location ${Date.now()}`

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(locName)
    await page.getByRole('button', { name: 'Save' }).click()

    await waitForStorage(page, (n) => {
      const locs = JSON.parse(localStorage.getItem('nf_locations') || '[]')
      return locs.some(l => l.name === n)
    }, locName)

    await page.reload()
    const locs = await readStorage(page, 'nf_locations')
    expect(locs.some(l => l.name === locName)).toBe(true)
  })

  test('edit a location and verify the change persists', async ({ page }) => {
    const original = `Loc Edit ${Date.now()}`
    const updated = `Loc Updated ${Date.now()}`

    await page.getByRole('button', { name: 'New' }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(original)
    await page.getByRole('button', { name: 'Save' }).click()

    await waitForStorage(page, (n) => {
      const locs = JSON.parse(localStorage.getItem('nf_locations') || '[]')
      return locs.some(l => l.name === n)
    }, original)

    await page.getByText(original).first().click()
    await page.getByRole('button', { name: /^Edit$/i }).first().click()
    await page.locator('[role="dialog"] input[required]').first().fill(updated)
    await page.getByRole('button', { name: 'Save' }).click()

    await waitForStorage(page, (n) => {
      const locs = JSON.parse(localStorage.getItem('nf_locations') || '[]')
      return locs.some(l => l.name === n)
    }, updated)

    const locs = await readStorage(page, 'nf_locations')
    expect(locs.some(l => l.name === updated)).toBe(true)
  })
})

// ─── Lore ─────────────────────────────────────────────────────────────────────

test.describe('Lore', () => {
  test.beforeEach(async ({ page }) => {
    // "Lore" is a top-level room button
    await page.getByRole('button', { name: 'Lore' }).first().click()
    await expect(page.getByRole('heading', { name: /Lore/i })).toBeVisible()
  })

  test('create a lore entry and verify persistence', async ({ page }) => {
    const loreTitle = `Lore Entry ${Date.now()}`

    await page.getByRole('button', { name: 'New' }).first().click()
    // Lore title input has placeholder "e.g. The Binding Laws"
    await page.getByPlaceholder(/binding laws/i).first().fill(loreTitle)
    await page.getByRole('button', { name: 'Save Entry' }).click()

    await waitForStorage(page, (t) => {
      const lore = JSON.parse(localStorage.getItem('nf_loreEntries') || '[]')
      return lore.some(e => e.title === t || e.name === t)
    }, loreTitle)

    await page.reload()
    const lore = await readStorage(page, 'nf_loreEntries')
    expect(lore.some(e => e.title === loreTitle || e.name === loreTitle)).toBe(true)
  })

  test('lore entries are scoped to the active project', async ({ page }) => {
    const activeId = await page.evaluate(() => localStorage.getItem('nf_activeNovel'))
    const lore = await readStorage(page, 'nf_loreEntries')
    const scoped = lore.filter(e => e.novelId === activeId)
    expect(scoped.length).toBe(lore.filter(e => e.novelId).length)
  })
})

// ─── Timeline ─────────────────────────────────────────────────────────────────

test.describe('Timeline', () => {
  test.beforeEach(async ({ page }) => {
    // Timeline is a section inside the "Lore" room
    await page.getByRole('button', { name: 'Lore' }).first().click()
    await page.getByRole('button', { name: 'Timeline' }).first().click()
    await expect(page.getByRole('heading', { name: /Timeline/i })).toBeVisible()
  })

  test('create a timeline event and verify persistence', async ({ page }) => {
    const eventTitle = `Event ${Date.now()}`

    await page.getByRole('button', { name: 'New Event' }).click()
    await page.locator('[role="dialog"] input[required]').first().fill(eventTitle)
    await page.getByRole('button', { name: 'Save' }).click()

    await waitForStorage(page, (t) => {
      const timeline = JSON.parse(localStorage.getItem('nf_timeline') || '[]')
      return timeline.some(e => e.title === t || e.name === t)
    }, eventTitle)

    await page.reload()
    const timeline = await readStorage(page, 'nf_timeline')
    expect(timeline.some(e => e.title === eventTitle || e.name === eventTitle)).toBe(true)
  })
})

// ─── Ideas ────────────────────────────────────────────────────────────────────

test.describe('Ideas', () => {
  test('create an idea and verify persistence', async ({ page }) => {
    // Ideas ("Idea Board") is a section inside the "Planning" room
    await page.getByRole('button', { name: 'Planning' }).first().click()
    await page.getByRole('button', { name: 'Idea Board' }).first().click()
    await expect(page.getByRole('heading', { name: /Ideas|Idea Board/i })).toBeVisible()

    const ideaText = `Idea ${Date.now()}`
    const captureInput = page.getByPlaceholder(/capture|idea|quick/i).first()

    if (!(await captureInput.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Add idea|New idea|\+/i }).first().click()
    }

    const field = page.getByPlaceholder(/capture|idea|quick|title/i).first()
    await field.fill(ideaText)
    await field.press('Enter')

    const prefix = ideaText.slice(0, 15)
    await waitForStorage(page, (p) => {
      const ideas = JSON.parse(localStorage.getItem('nf_ideaEntries') || '[]')
      return ideas.some(e => (e.title || e.text || e.content || '').includes(p))
    }, prefix)

    await page.reload()
    const ideas = await readStorage(page, 'nf_ideaEntries')
    expect(ideas.some(e =>
      (e.title || e.text || e.content || '').includes(prefix),
    )).toBe(true)
  })
})
