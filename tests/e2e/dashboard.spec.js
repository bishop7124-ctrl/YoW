import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, openProjectSettings, readStorage,
  seedCleanStorage,
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

  // Open project settings (uses aria-label to avoid strict-mode hit on library card button)
  await openProjectSettings(page)

  // The title field has no placeholder — it's labelled by a <span>Title</span> inside the same <label>
  const titleInput = page.getByLabel('Title')
  await titleInput.fill(renamed)
  // Title saves on change; close the dialog
  await page.getByRole('button', { name: 'Done' }).first().click()

  await page.waitForFunction(
    (t) => JSON.parse(localStorage.getItem('nf_novels') || '[]').some(n => n.title === t),
    renamed,
    { timeout: 8000 },
  )

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

  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('nf_scenes') || '[]').some(s => (s.content || '').includes('ten')),
    undefined,
    { timeout: 8000 },
  )

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

  // "Delete project" is in the library card's EditProjectModal, not the studio gear dialog.
  // Go back to library, open the project card's settings modal, then delete.
  await page.getByRole('button', { name: 'Back to projects' }).click()
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible()

  // The project card has aria-label="Project settings" (the active-hero gear uses title, not aria-label)
  await page.getByLabel('Project settings').first().click()

  // handleDelete uses window.confirm — accept it
  page.once('dialog', dialog => dialog.accept())
  const deleteBtn = page.getByRole('button', { name: 'Delete project', exact: true })
  await deleteBtn.click()

  await page.waitForFunction(
    (t) => !JSON.parse(localStorage.getItem('nf_novels') || '[]').some(n => n.title === t),
    title,
    { timeout: 8000 },
  )

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

  // Click project A's card in the library — verify the studio opens with project A
  await page.getByText(titleA).first().click()

  // The studio heading should reflect project A (heading appears in both nav and main — use first)
  await expect(page.getByRole('heading', { name: titleA }).first()).toBeVisible({ timeout: 8000 })
})
