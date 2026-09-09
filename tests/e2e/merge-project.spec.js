import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, openProjectSettings, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

// Covers "Merge another project in", the second half of the "Import into an
// existing project and project merging" row in docs/ROADMAP.md's Bugs table
// — reuses AIImportModal.jsx's own populateYowProject/ID-remap machinery
// (see MergeProjectModal.jsx) against a source project's live data instead
// of an uploaded file, so this exercises that same code path end to end.
test('Merge another project in adds a source project\'s content without touching the source or losing the destination\'s own content', async ({ page }) => {
  const sourceSentence = `Source project sentence ${Date.now()}.`
  const destSentence = `Destination project's own sentence ${Date.now()}.`

  await page.goto('/')
  await dismissLaunchPrompts(page)

  // Build the source project with its own content.
  const sourceTitle = await createProject(page, { title: `Merge Source ${Date.now()}` })
  const sourceProjectId = page.url().match(/\/project\/([^/]+)/)[1]
  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  const sourceEditor = page.getByPlaceholder('Begin writing here…')
  await sourceEditor.fill(sourceSentence)
  await expect(sourceEditor).toHaveValue(sourceSentence)
  await page.waitForFunction(
    (expected) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scenes = JSON.parse(get('nf_scenes') || '[]')
      return scenes.some(s => (s.content || get(`nf_scene_content:${s.id}`) || '').includes(expected.slice(0, 40)))
    },
    sourceSentence,
    { timeout: 8000 },
  )
  await page.getByRole('button', { name: 'Back to projects' }).click()

  // Build the destination project with its own distinct content.
  await createProject(page, { title: `Merge Destination ${Date.now()}` })
  const destProjectId = page.url().match(/\/project\/([^/]+)/)[1]
  await page.getByRole('button', { name: 'Write' }).click()
  await page.getByText('Begin writing here…').click()
  const destEditor = page.getByPlaceholder('Begin writing here…')
  await destEditor.fill(destSentence)
  await expect(destEditor).toHaveValue(destSentence)
  await page.waitForFunction(
    (expected) => {
      const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scenes = JSON.parse(get('nf_scenes') || '[]')
      return scenes.some(s => (s.content || get(`nf_scene_content:${s.id}`) || '').includes(expected.slice(0, 40)))
    },
    destSentence,
    { timeout: 8000 },
  )

  const novelCountBefore = await page.evaluate(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    return JSON.parse(raw || '[]').length
  })
  expect(novelCountBefore).toBe(2)

  // Merge the source project's content into the (now active) destination project.
  await openProjectSettings(page)
  await page.getByRole('button', { name: 'Merge another project in' }).click()
  await expect(page.getByLabel(/merge from/i)).toBeVisible()
  await page.getByLabel(/merge from/i).selectOption({ label: sourceTitle })
  await expect(page.getByRole('button', { name: 'Merge in' })).toBeEnabled()
  await page.getByRole('button', { name: 'Merge in' }).click()
  await expect(page.getByText('merged into', { exact: false })).toBeVisible({ timeout: 15_000 })

  // No third project was created, and the source project is untouched.
  await expect.poll(async () => page.evaluate(() => {
    const raw = window.__yowStorageBridge?.getItem('nf_novels') ?? localStorage.getItem('nf_novels')
    return JSON.parse(raw || '[]').length
  }), { timeout: 20_000 }).toBe(2)

  // The destination project gained the source's scene content, and its own
  // pre-existing scene content is untouched — a real merge, not a replace.
  await expect.poll(async () => page.evaluate((nid) => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]').filter(s => s.novelId === nid)
    return scenes.map(s => s.content || get(`nf_scene_content:${s.id}`) || '')
  }, destProjectId), { timeout: 15_000 }).toEqual(
    expect.arrayContaining([
      expect.stringContaining(destSentence.slice(0, 40)),
      expect.stringContaining(sourceSentence.slice(0, 40)),
    ]),
  )

  // The source project's own scene is still exactly what it was — merge
  // only ever reads from the source, never writes to it.
  const sourceSceneContents = await page.evaluate((nid) => {
    const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
    const scenes = JSON.parse(get('nf_scenes') || '[]').filter(s => s.novelId === nid)
    return scenes.map(s => s.content || get(`nf_scene_content:${s.id}`) || '')
  }, sourceProjectId)
  expect(sourceSceneContents).toEqual([expect.stringContaining(sourceSentence.slice(0, 40))])
})
