/**
 * 17 Oct launch sprint, Performance gate: a realistic 80k+ word novel loads and
 * stays responsive, and a single very long scene shows the in-app notice
 * (decision D1: documented limit and warning, full fix after launch).
 * The bundle budgets are a separate gate: scripts/check-bundle-budget.mjs.
 */
import { expect, test } from '@playwright/test'
import { LARGE_SCENE_CHAR_THRESHOLD } from '../../src/components/Manuscript/manuscriptUtils.js'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, seedCleanStorage, seedIndexedDbEntries,
  waitForStorageHydration, writeInDefaultScene,
} from './helpers.js'

const SENTENCE = 'The wardens walked along the ridge while mist gathered below in the valley where the old road once ran. '
const prose = (words, offset = 0) => {
  const per = SENTENCE.split(' ').length - 1
  let out = ''
  for (let i = 0; i < Math.ceil(words / per); i++) out += (i + offset) % 5 === 4 ? `${SENTENCE}\n\n` : SENTENCE
  return out.trim()
}

const NOVEL_ID = 'perf-novel'
const WORDS_PER_SCENE = 1050

const buildLargeNovel = () => {
  const acts = [], chapters = [], scenes = []
  for (let a = 0; a < 5; a++) {
    acts.push({ id: `perf-act-${a}`, novelId: NOVEL_ID, title: `Act ${a + 1}`, synopsis: '', order: a })
    for (let c = 0; c < 4; c++) {
      const chapterIndex = a * 4 + c
      chapters.push({ id: `perf-ch-${chapterIndex}`, novelId: NOVEL_ID, actId: `perf-act-${a}`, title: `Chapter ${chapterIndex + 1}`, synopsis: '', order: chapterIndex })
      for (let s = 0; s < 4; s++) {
        const index = chapterIndex * 4 + s
        scenes.push({
          id: `perf-scene-${index}`, novelId: NOVEL_ID, chapterId: `perf-ch-${chapterIndex}`, title: `Scene ${s + 1}`,
          synopsis: '', content: prose(WORDS_PER_SCENE, index), order: index, lastModified: Date.now(),
        })
      }
    }
  }
  const characters = Array.from({ length: 50 }, (_, i) => ({ id: `perf-char-${i}`, novelId: NOVEL_ID, name: `Perf Character ${i + 1}`, role: 'Supporting', description: 'Load test character.', order: i, createdAt: Date.now() - i }))
  const locations = Array.from({ length: 30 }, (_, i) => ({ id: `perf-loc-${i}`, novelId: NOVEL_ID, name: `Perf Location ${i + 1}`, description: 'Load test location.', order: i, createdAt: Date.now() - i }))
  const novel = { id: NOVEL_ID, title: 'Performance Novel', type: 'novel', createdAt: new Date().toISOString(), synopsis: 'Load test.', wordTarget: 90000, genre: 'Fantasy' }
  return {
    nf_novels: JSON.stringify([novel]), nf_acts: JSON.stringify(acts), nf_chapters: JSON.stringify(chapters),
    nf_scenes: JSON.stringify(scenes), nf_characters: JSON.stringify(characters), nf_locations: JSON.stringify(locations),
    nf_activeNovel: JSON.stringify(NOVEL_ID),
  }
}

test.describe('Performance acceptance (large projects)', () => {
  test('an 80k+ word novel opens, scrolls and takes typing without long freezes', async ({ page }) => {
    test.setTimeout(180_000)
    await seedCleanStorage(page)
    await page.addInitScript(() => {
      window.__longTaskMs = 0
      try {
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__longTaskMs += e.duration }).observe({ entryTypes: ['longtask'] })
      } catch { /* longtask not supported */ }
    })
    // Same pattern as the Comic large-project test: create a throwaway project
    // so the vault is live, flush, then seed the large project before the next boot.
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'Throwaway' })
    await page.evaluate(() => window.__yowStorageBridge?.flush?.())
    await page.waitForTimeout(1000)
    await seedIndexedDbEntries(page, buildLargeNovel())

    const started = Date.now()
    await page.goto('/')
    await waitForStorageHydration(page)
    await dismissLaunchPrompts(page)
    await page.getByText('Performance Novel').first().click({ timeout: 60_000 })
    await page.waitForURL(/\/project\//)
    const coldMs = Date.now() - started
    await enterWritingMode(page)
    const firstProse = page.locator('.manuscript-processor').getByText('The wardens walked along the ridge').first()
    await expect(firstProse).toBeVisible({ timeout: 30_000 })
    const openMs = Date.now() - started
    console.log(`80k-word novel: project opens in ${coldMs} ms, writing view ready in ${openMs} ms`)
    expect(openMs).toBeLessThan(30_000)

    await firstProse.click()
    const editor = page.locator('.manuscript-processor textarea:focus')
    await expect(editor).toBeVisible()
    await page.keyboard.press('Control+End')
    await page.evaluate(() => { window.__longTaskMs = 0 })
    const typed = 'A fresh sentence typed into a very large manuscript. '.repeat(2)
    const typingStart = Date.now()
    await page.keyboard.type(typed, { delay: 20 })
    const typingMs = Date.now() - typingStart
    const longTaskMs = await page.evaluate(() => window.__longTaskMs)
    console.log(`Typing ${typed.length} characters: ${typingMs} ms wall clock, ${Math.round(longTaskMs)} ms in long tasks`)
    // These specs run on the Vite dev server (React development build, roughly 100x
    // slower per keystroke than production: 17 Oct measured ~52 ms of long tasks for
    // 159 characters in the production build versus ~10 s here). The ceilings catch
    // a regression to per-keystroke whole-project work, not hardware variance. The
    // production figures are recorded in docs/QA_PLAN.md.
    // 26 Oct: CI runners measured 15.9-19.0 s here against ~13.5 s locally (same code that passed on 24 Oct),
    // so the old 15 s ceiling was inside hardware noise. 30 s still fails on per-keystroke whole-project work.
    expect(longTaskMs).toBeLessThan(30_000)
    expect(typingMs).toBeLessThan(60_000)
    await expect(editor).toHaveValue(/A fresh sentence typed into a very large manuscript\./)
  })

  test('a very long scene shows the in-app notice; an ordinary scene does not', async ({ page }) => {
    test.setTimeout(120_000)
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'Very Long Scene Notice' })
    await writeInDefaultScene(page, 'An ordinary scene, far below the limit.')
    await expect(page.locator('.ms-large-scene-notice')).toHaveCount(0)

    const long = prose(Math.ceil((LARGE_SCENE_CHAR_THRESHOLD + 12_000) / 6))
    expect(long.length).toBeGreaterThan(LARGE_SCENE_CHAR_THRESHOLD)
    const editor = page.getByPlaceholder('Begin writing here…').first()
    await editor.fill(long)
    const notice = page.locator('.ms-large-scene-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('very long')
    await expect(notice).toContainText('nothing is lost')
  })
})
