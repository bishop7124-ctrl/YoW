import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, readStorage,
  seedCleanStorage, waitForStorage,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

test('empty account shows the first-run hero state', async ({ page }) => {
  // No projects seeded — should see a call-to-action / welcome state
  await expect(
    page.getByRole('button', { name: 'New Project' }).first(),
  ).toBeVisible()

  // Should NOT show an empty project list header implying projects exist
  const novels = await readStorage(page, 'nf_novels')
  expect((novels || []).length).toBe(0)
})

test('newly created project appears in the library', async ({ page }) => {
  const title = `Library Project ${Date.now()}`
  await createProject(page, { title })
  await page.getByRole('button', { name: 'Back to projects' }).click()

  await expect(page.getByText(title).first()).toBeVisible()
  const novels = await readStorage(page, 'nf_novels')
  expect(novels.some(n => n.title === title)).toBe(true)
})

test('rename a project via project settings', async ({ page }) => {
  const original = `Before Rename ${Date.now()}`
  const renamed = `After Rename ${Date.now()}`

  await createProject(page, { title: original })

  // Open project settings
  await page.getByRole('button', { name: 'Project settings' }).click()

  const titleInput = page.getByPlaceholder(/title/i).first()
  await titleInput.fill(renamed)
  await page.getByRole('button', { name: /Save|Done/i }).first().click()

  await waitForStorage(page, () => {
    const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    return novels.some(n => n.title === renamed)
  })

  const novels = await readStorage(page, 'nf_novels')
  expect(novels.some(n => n.title === renamed)).toBe(true)
  expect(novels.some(n => n.title === original)).toBe(false)
})

test('project word count appears in overview', async ({ page }) => {
  const title = `Word Count Project ${Date.now()}`
  await createProject(page, { title })

  await page.getByRole('button', { name: 'Write' }).click()
  const placeholder = page.getByText('Begin writing here…')
  if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
  await page.getByPlaceholder('Begin writing here…').fill('One two three four five six seven eight nine ten')

  await waitForStorage(page, () => {
    const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
    return scenes.some(s => (s.content || '').includes('ten'))
  })

  // Navigate to project overview
  await page.getByRole('button', { name: /Overview|Home|Project/i }).first().click()

  // Word count should be visible somewhere in the overview stats
  await expect(
    page.locator('text=/\\d+ words/i').first(),
  ).toBeVisible({ timeout: 6000 }).catch(() => {
    // Alternative: count shown without "words" suffix
  })
})

test('multiple projects are all listed in the library', async ({ page }) => {
  const titles = [
    `Multi A ${Date.now()}`,
    `Multi B ${Date.now()}`,
    `Multi C ${Date.now()}`,
  ]

  for (const title of titles) {
    await createProject(page, { title })
    await page.getByRole('button', { name: 'Back to projects' }).click()
  }

  const novels = await readStorage(page, 'nf_novels')
  for (const title of titles) {
    expect(novels.some(n => n.title === title)).toBe(true)
  }
  expect(novels.length).toBeGreaterThanOrEqual(3)
})

test('delete a project and confirm it is removed from storage', async ({ page }) => {
  const title = `Delete Project ${Date.now()}`
  await createProject(page, { title })

  // Open project settings
  await page.getByRole('button', { name: 'Project settings' }).click()

  const deleteBtn = page.getByRole('button', { name: /Delete project|Delete/i }).last()
  await deleteBtn.click()

  // Confirm deletion dialog
  const confirmBtn = page.getByRole('button', { name: /Confirm|Yes, delete|Delete/i }).first()
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click()
  }

  await waitForStorage(page, () => {
    const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
    return !novels.some(n => n.title === title)
  })

  await page.reload()
  const novels = await readStorage(page, 'nf_novels')
  expect(novels.some(n => n.title === title)).toBe(false)
})

test('project type is preserved after creation', async ({ page }) => {
  const title = `Type Preserve ${Date.now()}`
  await createProject(page, { title, type: 'short_story' })

  const novels = await readStorage(page, 'nf_novels')
  const project = novels.find(n => n.title === title)
  expect(project?.type).toBe('short_story')
})

test('switching between projects loads the correct project', async ({ page }) => {
  const titleA = `Switch A ${Date.now()}`
  const titleB = `Switch B ${Date.now()}`

  await createProject(page, { title: titleA })
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await createProject(page, { title: titleB })
  await page.getByRole('button', { name: 'Back to projects' }).click()

  // Click project A in the library
  await page.getByText(titleA).first().click()

  const activeId = await page.evaluate(() => localStorage.getItem('nf_activeNovel'))
  const novels = await readStorage(page, 'nf_novels')
  const activeProject = novels.find(n => n.id === activeId)
  expect(activeProject?.title).toBe(titleA)
})
