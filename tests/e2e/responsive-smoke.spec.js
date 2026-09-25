import { expect, test } from '@playwright/test'
import { dismissLaunchPrompts, readScenesWithContent, seedCleanStorage, seedFakeAiConfig } from './helpers.js'

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
})

for (const viewport of viewports) {
  test(`core writing flow is reachable on ${viewport.name}`, async ({ page }) => {
    const projectTitle = `Responsive ${viewport.name} ${Date.now()}`
    const sentence = `Responsive ${viewport.name} sentence ${Date.now()}`

    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/')
    await dismissLaunchPrompts(page)

    await page.getByRole('button', { name: 'New Project' }).first().click()
    await page.getByPlaceholder('Title *').fill(projectTitle)
    await page.getByRole('button', { name: 'Create' }).click()

    await expect(page).toHaveURL(/\/project\//)
    await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible()

    // At mobile/tablet widths the persistent top-nav "Write" tab collapses
    // into the hamburger menu, but the Overview page's own "Open manuscript"
    // hero CTA (ProjectDashboard.jsx) stays reachable and opens the same
    // editor — accept either, matching whichever this viewport shows.
    await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).click()
    await page.getByText('Begin writing here…').click()
    const editor = page.locator('main textarea').first()
    await expect(editor).toBeVisible()

    // Focusing a scene reveals its complete formatting/action cluster. That
    // cluster used to stay on one intrinsic-width row on phones, pushing
    // "Copy scene" (and the manuscript canvas) beyond the right edge.
    const writingCanvas = page.locator('.ms-scroll-container')
    await expect(page.getByRole('button', { name: 'Copy scene' })).toBeVisible()
    await expect.poll(() => writingCanvas.evaluate(
      node => node.scrollWidth - node.clientWidth,
    )).toBeLessThanOrEqual(1)

    const modeSwitch = page.getByRole('group', { name: 'Editor mode' })
    const breadcrumb = page.locator('.ms-topbar-crumb')
    await expect(modeSwitch).toBeVisible()
    await expect(page.locator('.ms-topbar-crumb-path')).toBeHidden()
    if (viewport.width <= 640) {
      await expect(breadcrumb).toBeHidden()
    } else {
      await expect.poll(async () => (await breadcrumb.boundingBox())?.width || 0).toBeGreaterThan(40)
      await expect.poll(async () => {
        const [crumbBox, modeBox] = await Promise.all([breadcrumb.boundingBox(), modeSwitch.boundingBox()])
        return crumbBox && modeBox ? crumbBox.x + crumbBox.width - modeBox.x : Number.POSITIVE_INFINITY
      }).toBeLessThanOrEqual(1)
    }

    if (viewport.width <= 640) {
      const noteButton = page.getByRole('button', { name: 'Add note', exact: true })
      await expect(noteButton).toBeVisible()
      await expect(page.getByRole('button', { name: 'Add note at cursor' })).toBeHidden()
      await expect.poll(() => editor.evaluate(node => {
        const style = getComputedStyle(node)
        return Number.parseFloat(style.textIndent) / Number.parseFloat(style.fontSize)
      })).toBeLessThanOrEqual(1.6)
    }

    await editor.click()
    await editor.fill(sentence)
    await expect(editor).toHaveValue(sentence)
    await page.waitForFunction(
      (expected) => {
        const get = (k) => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
        const scenes = JSON.parse(get('nf_scenes') || '[]')
        return scenes.some(s => s.content === expected || get(`nf_scene_content:${s.id}`) === expected)
      },
      sentence,
      { timeout: 8000 },
    )

    await page.reload()
    await expect(page).toHaveURL(/\/project\/.+\/writing/)
    await expect.poll(async () => {
      const scenes = await readScenesWithContent(page)
      return scenes.some(scene => scene.content === sentence)
    }).toBe(true)
  })
}

test('mobile AI workspace shows a focused setup state when AI is not connected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(`AI workspace ${Date.now()}`)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()
  await page.getByRole('navigation', { name: 'Manuscript navigation' }).getByRole('button', { name: 'AI' }).click()

  const surface = page.locator('.ms-surface')
  await expect(surface.getByText('Connect AI to begin')).toBeVisible()
  await expect(surface.getByRole('button', { name: 'Open AI settings' })).toBeVisible()
  await expect(surface.getByText('Quick actions')).toHaveCount(0)
  await expect(surface.getByText('Rewrite point of view or tense')).toHaveCount(0)
  await expect(surface.getByRole('textbox')).toHaveCount(0)
  await expect.poll(() => surface.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1)
})

// docs/QA_PLAN.md Priority 10 flagged a ~24px horizontal overflow on
// `.ms-surface` (the AI/Search/History/Finalise/Reference right-hand panel,
// see ManuscriptSurface.jsx) specifically at a 320px viewport — narrower than
// this file's other checks (390/768/1024px) — found while investigating the
// 2026-09-12 search-panel bug (see the matching Bugs-table row in
// docs/ROADMAP.md) but never actually pinned to a cause. Re-investigating did
// not reproduce it anywhere in the current layout (every ancestor from
// `.ms-surface` up to the app shell now measures exactly 320px, no slack), so
// this guards against it recurring rather than fixing a located bug — 320px
// is the narrowest width this repo otherwise tests at, and every pane the
// original note named (AI, Search, History, Finalise) is checked here.
test('no .ms-surface pane overflows the viewport at a 320px phone width', async ({ page }) => {
  await seedFakeAiConfig(page)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(`Surface width ${Date.now()}`)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()

  // Focus and fill the default scene so Search has real content to match and
  // History has a real scene to attach seeded versions to below — an empty,
  // never-focused scene would leave both panes on their trivial empty-state
  // markup instead of the populated result/version-list layout the original
  // ~24px overflow note was actually about.
  await page.getByText('Begin writing here…').click()
  const editor = page.locator('main textarea').first()
  const sentence = `Surface width check ${Date.now()}`
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)

  // Seed a couple of real version-history entries directly into storage so
  // SceneVersionHistory renders its populated `.ms-vh-cols` two-pane layout
  // (time/badge/word-count/title-tag rows) rather than its empty state.
  await page.evaluate(() => {
    const scenes = JSON.parse(window.__yowStorageBridge.getItem('nf_scenes') || '[]')
    const scene = scenes[0]
    if (!scene) return
    const longTitle = 'A Very Long Scene Title That Stresses The Version History Row Layout'
    const versions = [
      { id: 'w320-v1', sceneId: scene.id, novelId: scene.novelId, title: longTitle, content: 'First version content.', wordCount: 3, timestamp: Date.now() - 60000 },
      { id: 'w320-v2', sceneId: scene.id, novelId: scene.novelId, title: longTitle, content: 'Second, slightly longer version content.', wordCount: 5, timestamp: Date.now() },
    ]
    window.__yowStorageBridge.setItem('nf_scene_versions', JSON.stringify(versions))
  })

  const surface = page.locator('.ms-surface')
  const assertNoOverflow = async (label) => {
    await expect.poll(
      () => surface.evaluate(node => node.scrollWidth - node.clientWidth),
      { message: `${label} surface pane overflowed its own box` },
    ).toBeLessThanOrEqual(1)
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      { message: `${label} surface pane overflowed the viewport` },
    ).toBeLessThanOrEqual(1)
  }

  const nav = page.getByRole('navigation', { name: 'Manuscript navigation' })
  await nav.getByRole('button', { name: 'AI' }).click()
  await assertNoOverflow('AI')

  const moreBtn = page.getByRole('button', { name: 'More' })
  await moreBtn.click()
  await page.getByRole('button', { name: /search & replace/i }).click()
  await assertNoOverflow('Search')
  await page.locator('.ms-search-input').first().fill('width')
  await expect(page.locator('.ms-search-result-group')).toHaveCount(1)
  await assertNoOverflow('Search (with results)')

  await moreBtn.click()
  await page.getByRole('button', { name: /version history/i }).click()
  await expect(page.locator('.ms-vh-item-row')).toHaveCount(2)
  await assertNoOverflow('History')

  await moreBtn.click()
  await page.getByRole('button', { name: /^finalise draft$/i }).click()
  await assertNoOverflow('Finalise')
})

test('rotating a tablet into portrait does not leave a panel covering the editor', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await dismissLaunchPrompts(page)

  await page.getByRole('button', { name: 'New Project' }).first().click()
  await page.getByPlaceholder('Title *').fill(`Rotate ${Date.now()}`)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()

  const placeholder = page.getByText('Begin writing here…')
  await expect(placeholder).toBeVisible()

  await page.setViewportSize({ width: 768, height: 1024 })
  await placeholder.click()

  const editor = page.getByPlaceholder('Begin writing here…')
  const sentence = `Rotated and still writable ${Date.now()}`
  await editor.fill(sentence)
  await expect(editor).toHaveValue(sentence)
})
