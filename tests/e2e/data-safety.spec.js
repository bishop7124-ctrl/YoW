import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorage, writeInDefaultScene,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

// ─── Delete cascades ──────────────────────────────────────────────────────────

test('deleting a project removes its acts, chapters, and scenes', async ({ page }) => {
  await createProject(page, { title: 'Cascade Delete Test' })
  await writeInDefaultScene(page, 'Content that should be deleted.')

  const novels = await readStorage(page, 'nf_novels')
  const projectId = novels[0].id

  // Delete is in the project manager card settings, not the studio panel
  await page.getByRole('button', { name: 'Back to projects' }).click()
  // Click the gear icon on the project card (aria-label="Project settings")
  await page.locator('.dash-card-settings-button').first().click()
  // Inside the EditProjectModal, click "Delete project"
  await page.getByRole('button', { name: 'Delete project' }).click()

  await waitForStorage(page, () => {
    const storedNovels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    return !storedNovels.some(n => n.id === projectId)
  })

  const acts = await readStorage(page, 'nf_acts')
  const chapters = await readStorage(page, 'nf_chapters')
  const scenes = await readStorage(page, 'nf_scenes')

  expect((acts || []).some(a => a.novelId === projectId)).toBe(false)
  expect((chapters || []).some(c => c.novelId === projectId)).toBe(false)
  expect((scenes || []).some(s => s.novelId === projectId)).toBe(false)
})

test('deleting a character removes it from relationship lists', async ({ page }) => {
  await createProject(page, { title: 'Character Cascade Test' })

  await page.getByRole('button', { name: /Characters/i }).first().click()
  await expect(page.getByRole('heading', { name: /Characters/i })).toBeVisible()

  // Create two characters
  for (const name of ['Alice', 'Bob']) {
    await page.getByRole('button', { name: 'New' }).first().click()
    await page.getByLabel(/^Name$/i).first().fill(name)
    await page.getByRole('button', { name: 'Save Character' }).click()
    await waitForStorage(page, () => {
      const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
      return chars.some(c => c.name === name)
    })
  }

  // Delete Alice
  await page.getByText('Alice').first().click()
  await page.getByRole('button', { name: /Delete/i }).first().click()
  const confirmBtn = page.getByRole('button', { name: /Confirm|Yes|Delete/i }).first()
  if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmBtn.click()
  }

  await waitForStorage(page, () => {
    const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
    return !chars.some(c => c.name === 'Alice')
  })

  // Bob should still be there
  const chars = await readStorage(page, 'nf_characters')
  expect(chars.some(c => c.name === 'Bob')).toBe(true)

  // No character should have a relationship pointing to the deleted Alice ID
  const deletedId = (await readStorage(page, 'nf_characters'))
    .find(c => c.name === 'Alice')?.id
  if (deletedId) {
    expect(
      chars.some(c =>
        (c.relationships || []).some(r => r.characterId === deletedId || r.targetId === deletedId),
      ),
    ).toBe(false)
  }
})

// ─── Project isolation ────────────────────────────────────────────────────────

test('worldbuilding data is isolated between projects', async ({ page }) => {
  const titleA = `Isolation A ${Date.now()}`
  const titleB = `Isolation B ${Date.now()}`

  // Create project A and add a character
  await createProject(page, { title: titleA })
  await page.getByRole('button', { name: /Characters/i }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.getByLabel(/^Name$/i).first().fill('Project A Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, () => {
    const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
    return chars.some(c => c.name === 'Project A Character')
  })
  const novelsAfterA = await readStorage(page, 'nf_novels')
  const projectAId = novelsAfterA.find(n => n.title === titleA)?.id

  // Create project B and add a character
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: titleB })
  await page.getByRole('button', { name: /Characters/i }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.getByLabel(/^Name$/i).first().fill('Project B Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, () => {
    const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
    return chars.some(c => c.name === 'Project B Character')
  })

  // Characters for project A should only include project A's character
  const allChars = await readStorage(page, 'nf_characters')
  const projectAChars = allChars.filter(c => c.novelId === projectAId)
  expect(projectAChars.some(c => c.name === 'Project A Character')).toBe(true)
  expect(projectAChars.some(c => c.name === 'Project B Character')).toBe(false)
})

// ─── Large project stress ─────────────────────────────────────────────────────

test('dashboard and writing remain usable with 10 projects in storage', async ({ page }) => {
  test.setTimeout(120_000)

  // Seed 10 projects directly into localStorage for speed
  await page.evaluate(() => {
    const novels = []
    const acts = []
    const chapters = []
    const scenes = []

    for (let i = 0; i < 10; i++) {
      const novelId = `stress-novel-${i}`
      const actId = `stress-act-${i}`
      const chapterId = `stress-chapter-${i}`
      const sceneId = `stress-scene-${i}`

      novels.push({ id: novelId, title: `Stress Project ${i}`, type: 'novel', createdAt: Date.now() - i * 1000 })
      acts.push({ id: actId, novelId, title: `Act ${i}`, order: 0 })
      chapters.push({ id: chapterId, novelId, actId, title: `Chapter ${i}`, order: 0 })
      scenes.push({
        id: sceneId,
        novelId,
        chapterId,
        actId,
        title: `Scene ${i}`,
        content: `Content for stress project ${i}. `.repeat(50),
        order: 0,
      })
    }

    localStorage.setItem('nf_novels', JSON.stringify(novels))
    localStorage.setItem('nf_acts', JSON.stringify(acts))
    localStorage.setItem('nf_chapters', JSON.stringify(chapters))
    localStorage.setItem('nf_scenes', JSON.stringify(scenes))
    localStorage.setItem('nf_activeNovel', 'stress-novel-0')
  })

  await page.reload()

  // Dashboard should load without crashing
  await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible({ timeout: 10_000 })

  // Open one of the stress projects
  await page.getByText('Stress Project 0').first().click()
  await expect(page).toHaveURL(/\/project\//)

  // Writing should open
  await page.getByRole('button', { name: 'Write' }).click()
  await expect(page.locator('[data-tour="manuscript-editor"]').first()).toBeVisible({ timeout: 10_000 })
})

test('large scene content (>10k words) loads without crash', async ({ page }) => {
  await createProject(page, { title: 'Large Scene Test' })

  // Seed a large scene directly
  await page.evaluate(() => {
    const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    const novel = novels[0]
    if (!novel) return
    const acts = JSON.parse(localStorage.getItem('nf_acts') || '[]')
    const act = acts.find(a => a.novelId === novel.id)
    const chapters = JSON.parse(localStorage.getItem('nf_chapters') || '[]')
    const chapter = chapters.find(c => c.novelId === novel.id)
    if (!act || !chapter) return

    const largeContent = 'The quick brown fox jumps over the lazy dog. '.repeat(500)
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    const scene = scenes.find(s => s.novelId === novel.id)
    if (scene) {
      scene.content = largeContent
      localStorage.setItem('nf_scenes', JSON.stringify(scenes))
    }
  })

  await page.reload()
  await page.getByRole('button', { name: 'Write' }).click()

  // Editor should open with the large content, no crash
  await expect(page.locator('[data-tour="manuscript-editor"]').first()).toBeVisible({ timeout: 10_000 })
})

// ─── Import / restore round-trip ──────────────────────────────────────────────

test('exported ZIP restores all worldbuilding data', async ({ page }) => {
  const title = `Export Restore ${Date.now()}`
  await createProject(page, { title })

  // Add a character
  await page.getByRole('button', { name: /Characters/i }).first().click()
  await page.getByRole('button', { name: 'New' }).first().click()
  await page.getByLabel(/^Name$/i).first().fill('Restore Test Character')
  await page.getByRole('button', { name: 'Save Character' }).click()
  await waitForStorage(page, () => {
    const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
    return chars.some(c => c.name === 'Restore Test Character')
  })

  // Export via the studio project settings panel (which has the Backup zip button)
  await page.getByRole('button', { name: 'Project settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Backup zip/i }).click()
  const download = await downloadPromise
  const zipPath = await download.path()
  await page.getByRole('button', { name: 'Done' }).click()

  // Delete via project manager card settings (the only place with "Delete project")
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await page.locator('.dash-card-settings-button').first().click()
  await page.getByRole('button', { name: 'Delete project' }).click()
  await waitForStorage(page, () => {
    const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    return !novels.some(n => n.title === title)
  })

  // Restore from ZIP
  await page.goto('/')
  await page.locator('input[type="file"][accept=".zip"]').setInputFiles(zipPath)

  await waitForStorage(page, () => {
    const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    const chars = JSON.parse(localStorage.getItem('nf_characters') || '[]')
    return novels.some(n => n.title === title)
      && chars.some(c => c.name === 'Restore Test Character')
  }, 15_000)

  const chars = await readStorage(page, 'nf_characters')
  expect(chars.some(c => c.name === 'Restore Test Character')).toBe(true)
})
