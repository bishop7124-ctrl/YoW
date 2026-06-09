import { expect, test } from '@playwright/test'
import { PROJECT_TYPES } from '../../src/constants/projectTypes.js'
import { dismissLaunchPrompts, escapeRegExp, seedCleanStorage } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

test('all configured project types can be created with starter structure', async ({ page }) => {
  await page.goto('/')
  await dismissLaunchPrompts(page)

  for (const [typeId, config] of Object.entries(PROJECT_TYPES)) {
    const title = `Smoke ${config.label} ${Date.now()}`
    const starterLevel1 = config.starterOutline?.[0]?.title
    const starterLevel2 = config.starterOutline?.[0]?.children?.[0]?.title
    const starterLevel3 = config.starterOutline?.[0]?.children?.[0]?.scenes?.[0]

    await page.getByRole('button', { name: 'New Project' }).first().click()
    await page.getByPlaceholder('Title *').fill(title)

    const typeButton = page
      .getByRole('button', { name: new RegExp(`^${escapeRegExp(config.label)}\\b`) })
      .first()
    await typeButton.click()
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByText(title).first()).toBeVisible()

    await expect.poll(async () => page.evaluate(({ title: expectedTitle }) => {
      const novels = JSON.parse(localStorage.getItem('nf_novels') || '[]')
      const acts = JSON.parse(localStorage.getItem('nf_acts') || '[]')
      const chapters = JSON.parse(localStorage.getItem('nf_chapters') || '[]')
      const scenes = JSON.parse(localStorage.getItem('nf_scenes') || '[]')
      const project = novels.find(item => item.title === expectedTitle)
      if (!project) return null
      return {
        type: project.type,
        enabledSections: project.enabledSections || [],
        level1Titles: acts.filter(item => item.novelId === project.id).map(item => item.title),
        level2Titles: chapters.filter(item => item.novelId === project.id).map(item => item.title),
        level3Titles: scenes.filter(item => item.novelId === project.id).map(item => item.title),
      }
    }, { title })).toMatchObject({
      type: typeId,
      enabledSections: config.defaultSections || [],
      level1Titles: starterLevel1 ? expect.arrayContaining([starterLevel1]) : expect.any(Array),
      level2Titles: starterLevel2 ? expect.arrayContaining([starterLevel2]) : expect.any(Array),
      level3Titles: starterLevel3 ? expect.arrayContaining([starterLevel3]) : expect.any(Array),
    })

    await page.getByRole('button', { name: 'Back to projects' }).click()
    await expect(page.getByRole('button', { name: 'New Project' }).first()).toBeVisible()
  }
})
