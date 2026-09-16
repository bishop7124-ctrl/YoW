// QA sweep 2026-09-16 (qa-engineer session): follow-up coverage for
// docs/ROADMAP.md's "4. Manuscript | Consecutive daily-goal writing streaks"
// row, which was "Partially verified 2026-09-15" — a prior qa-engineer pass
// live-browser-confirmed setting a goal, the "Goal streak" card rendering,
// and the pre-goal/legacy caption, but explicitly left four cases uncovered
// because they "need synthetic multi-day date manipulation that a single
// browser session can't easily set up":
//
//   1. Goal changes on consecutive dates — does changing the daily goal on
//      one day, then again the next, avoid retroactively rewriting earlier
//      days' pass/fail status?
//   2. An in-progress-today case — today's partial progress must read as
//      "in progress", not a broken streak, before the local day ends.
//   3. Missed-day reset — a missed day must zero the *current* streak while
//      leaving personal best and total goal days alone.
//   4. A genuinely legacy project — `writingGoals.daily` set, but NO
//      `writingGoals.dailyHistory` at all (an account that set a goal before
//      the history-tracking feature existed) — must not crash and must
//      retroactively apply the current goal rather than treating the
//      missing history as corrupt data.
//
// Per that row's own Next Action, the underlying streak math is already
// covered by deterministic unit tests (src/utils/writingStreak.test.js) —
// this file is specifically about whether the real UI (Dashboard
// Overview/Insights' "Goal streak" card, and the Manuscript Progress
// inspector tab) surfaces that math correctly. Rather than waiting through
// real days or driving Playwright's clock, dates are seeded directly via
// `window.__yowStorageBridge` (approach (a) from the task brief), using the
// exact same `nf_scenes[].wordHistory` / `project.writingGoals.daily` /
// `writingGoals.dailyHistory` shapes the app itself reads (confirmed against
// src/utils/writingStreak.js, src/components/dashboard/ProjectDashboard.jsx,
// and src/components/Manuscript/{ManuscriptInspector,manuscriptUtils}.js —
// see each test's own comments) and matching the shape
// ProjectDashboard.test.jsx's own unit tests already seed. All dates are
// computed from the real "today" via the app's own localDateKey/shiftDateKey
// helpers, so no fake-clock/page.clock mocking is needed — Node and the
// browser share the same wall clock in this environment.
import { expect, test } from '@playwright/test'
import { localDateKey, shiftDateKey } from '../../src/utils/writingStreak.js'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readStorage,
  seedCleanStorage, waitForStorageHydration, waitForWritingMode,
} from './helpers.js'

const today = localDateKey()
const d = offset => shiftDateKey(today, offset)

// Builds a scene's wordHistory as a list of {date, words, timestamp} entries
// from cumulative per-day totals (matching sceneNetByDate/getSceneHistory's
// own "wordHistory is a cumulative daily log" convention — each surface
// derives net words-written-that-day by diffing consecutive cumulative
// entries). `cumulative` is an ordered list of [dateOffset, cumulativeTotal]
// pairs.
function buildWordHistory(cumulative) {
  return cumulative.map(([offset, words]) => ({
    date: d(offset),
    words,
    timestamp: new Date(`${d(offset)}T12:00:00`).getTime(),
  }))
}

// Seeds one scene's wordHistory and a project's writingGoals directly via
// the storage bridge, then reloads so the app re-hydrates from that seeded
// state — the same pre-boot-storage-seeding pattern atlas-builder.spec.js
// uses for nf_maps. `scene.content`'s own word count is set to exactly match
// the wordHistory's last (most recent) cumulative total: ProjectDashboard.jsx's
// syncCurrentSceneHistory() reconciles a scene's live `content` word count
// against wordHistory's last entry on every render, and only leaves a seeded
// history alone when the two already agree (`latest.words === currentWords`)
// — otherwise it silently appends/overwrites the last entry with whatever
// countWords(scene.content) actually is, which would quietly corrupt this
// seeding. The Manuscript Inspector's own dailyWordsForScenes/sceneNetByDate
// (manuscriptUtils.js) has no equivalent reconciliation and reads
// wordHistory directly, so this also keeps both surfaces consistent.
async function seedDailyGoalScenario(page, { novelId, sceneId, writingGoals, cumulativeWordHistory }) {
  const wordHistory = buildWordHistory(cumulativeWordHistory)
  const lastWords = wordHistory[wordHistory.length - 1].words
  const content = Array.from({ length: lastWords }, (_, i) => `word${i}`).join(' ')

  await page.evaluate(async ({ novelId, sceneId, writingGoals, wordHistory, content }) => {
    const get = key => window.__yowStorageBridge.getItem(key)
    const set = (key, value) => window.__yowStorageBridge.setItem(key, value)

    const novels = JSON.parse(get('nf_novels'))
    const novel = novels.find(n => n.id === novelId)
    novel.writingGoals = writingGoals
    set('nf_novels', JSON.stringify(novels))

    const scenes = JSON.parse(get('nf_scenes'))
    const scene = scenes.find(s => s.id === sceneId)
    scene.wordHistory = wordHistory
    set('nf_scenes', JSON.stringify(scenes))

    set(`nf_scene_content:${sceneId}`, content)

    await window.__yowStorageBridge.flush()
  }, { novelId, sceneId, writingGoals, wordHistory, content })

  await page.reload()
  await waitForStorageHydration(page)
}

async function setupProject(page, title) {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title })
  const novelId = (await readStorage(page, 'nf_novels'))[0].id
  const sceneId = (await readStorage(page, 'nf_scenes'))[0].id
  return { novelId, sceneId }
}

function overviewStreakDay(page, indexFromEnd) {
  // recentDays (Dashboard's WritingStreakCard, 14-day window) renders
  // chronologically ascending with today last — index from the end so
  // callers can address "today", "yesterday", etc. without hardcoding the
  // window length.
  return page.locator('.overview-streak-days > [role="listitem"]').nth(13 - indexFromEnd)
}

function inspectorStreakDay(page, indexFromEnd) {
  // ManuscriptInspector's ProgressTab uses a 7-day window.
  return page.locator('.ms-insp-streak-days > [role="listitem"]').nth(6 - indexFromEnd)
}

async function openProgressTab(page) {
  await enterWritingMode(page)
  await waitForWritingMode(page)
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
}

// ─── 1. Goal changes on consecutive dates — no retroactive rewrite ────────
// docs/ROADMAP.md row 4's Next Action, case 1. Seeds a goal change effective
// two days ago (300 -> 600) via storage, confirms the day judged under the
// old 300 goal still reads "met" even though it would fail under the new
// 600 goal, then drives a REAL second goal change through the live "Daily
// writing goal" UI control (the next "day" in the sequence) and confirms
// both earlier days' statuses are still byte-identical after that edit.
test.describe('Goal changes on consecutive dates do not rewrite earlier results', () => {
  test('Dashboard Overview/Insights', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `Goal Change Streak ${Date.now()}`)
    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      // Goal was 300 through d(-2), changed to 600 effective d(-1) — still
      // 600 as of "now", before today's live edit below.
      writingGoals: { daily: 600, dailyHistory: [{ date: d(-2), goal: 300 }, { date: d(-1), goal: 600 }] },
      // d(-10) is a baseline entry before any dailyHistory coverage (goal
      // resolves to 0 there, so it can never count as "met" and can't
      // contaminate the streak/best-streak math below).
      cumulativeWordHistory: [[-10, 1000], [-2, 1350], [-1, 1750]],
    })

    // d(-2): wrote 350 words against the 300 goal in effect that day -> met.
    // d(-1): wrote 400 words against the NEW 600 goal in effect that day ->
    // not met, even though 400 >= the OLD 300 goal — proves the day is
    // judged by the goal that was actually active on it, not today's goal.
    const twoDaysAgo = overviewStreakDay(page, 2)
    const yesterday = overviewStreakDay(page, 1)
    await expect(twoDaysAgo).toHaveClass(/is-met/)
    await expect(twoDaysAgo).toHaveAttribute('title', /350 of 300 words — Goal met/)
    await expect(yesterday).not.toHaveClass(/is-met/)
    await expect(yesterday).toHaveAttribute('title', /400 of 600 words — Goal not met/)

    const card = page.locator('[aria-label="Writing goal streak"]')
    // Best streak is exactly 1 (only d(-2)), current is 0 (today and
    // yesterday are both unmet) — confirms d(-2)'s "met" day isn't chained
    // into a fictitious multi-day streak with the (missed) day after it.
    const stats = await card.locator('.overview-streak-summary strong').allTextContents()
    expect(stats).toEqual(['0', '1', '1'])

    // Now make the SECOND, "next day" goal change through the real UI, the
    // same control ProjectDashboard.test.jsx's unit test drives.
    await page.getByRole('button', { name: 'Insights', exact: true }).click()
    const goalInput = page.getByRole('textbox', { name: 'Daily writing goal' })
    await goalInput.fill('250')
    await goalInput.blur()

    await expect.poll(async () => {
      const novels = await readStorage(page, 'nf_novels')
      return novels.find(n => n.id === novelId)?.writingGoals
    }).toEqual({
      daily: 250,
      dailyHistory: [
        { date: d(-2), goal: 300 },
        { date: d(-1), goal: 600 },
        { date: today, goal: 250 },
      ],
    })

    // Back on Overview, d(-2) and d(-1) must show EXACTLY the same
    // status/words/goal as before this second edit — the whole point of the
    // "no retroactive rewrite" acceptance criterion.
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await expect(overviewStreakDay(page, 2)).toHaveClass(/is-met/)
    await expect(overviewStreakDay(page, 2)).toHaveAttribute('title', /350 of 300 words — Goal met/)
    await expect(overviewStreakDay(page, 1)).not.toHaveClass(/is-met/)
    await expect(overviewStreakDay(page, 1)).toHaveAttribute('title', /400 of 600 words — Goal not met/)
  })

  test('Manuscript Progress inspector shows the same two days unchanged', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `Goal Change Inspector ${Date.now()}`)
    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      writingGoals: { daily: 600, dailyHistory: [{ date: d(-2), goal: 300 }, { date: d(-1), goal: 600 }] },
      cumulativeWordHistory: [[-10, 1000], [-2, 1350], [-1, 1750]],
    })

    await openProgressTab(page)
    await expect(inspectorStreakDay(page, 2)).toHaveClass(/is-met/)
    await expect(inspectorStreakDay(page, 2)).toHaveAttribute('title', /350 of 300 words/)
    await expect(inspectorStreakDay(page, 1)).not.toHaveClass(/is-met/)
    await expect(inspectorStreakDay(page, 1)).toHaveAttribute('title', /400 of 600 words/)
    const stats = await page.locator('.ms-insp-streak-stats b').allTextContents()
    expect(stats).toEqual(['0', '1', '1'])
  })
})

// ─── 2. In-progress-today reads as "in progress", not a broken streak ─────
// docs/ROADMAP.md row 4's Next Action, case 2. Yesterday met its goal
// (building a 1-day streak); today has partial progress toward the same
// goal but hasn't met it yet. The acceptance criterion is "Today remains
// recoverable until the local day ends" — currentStreak must stay at 1
// (not reset to 0 just because today isn't finished) and the UI copy must
// read as "in progress" language, not a failure/reset message.
test.describe('In-progress-today does not read as a broken streak', () => {
  test('Dashboard Overview card', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `In Progress Today ${Date.now()}`)
    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      writingGoals: { daily: 500, dailyHistory: [{ date: d(-7), goal: 500 }] },
      // d(-10) baseline (predates dailyHistory, excluded). d(-1): exactly
      // met the 500 goal. Today: 200 of 500 so far -> in progress.
      cumulativeWordHistory: [[-10, 2000], [-1, 2500], [0, 2700]],
    })

    const card = page.locator('[aria-label="Writing goal streak"]')
    const stats = await card.locator('.overview-streak-summary strong').allTextContents()
    // Current streak is 1 (from yesterday) — NOT reset to 0 by today being
    // incomplete.
    expect(stats).toEqual(['1', '1', '1'])
    // Caption reads as "keep the streak alive", never a failure/reset message.
    await expect(card.locator('.overview-streak-caption'))
      .toHaveText('300 words today will keep your 1-day streak alive.')

    const todayChip = overviewStreakDay(page, 0)
    await expect(todayChip).toHaveClass(/is-today/)
    await expect(todayChip).not.toHaveClass(/is-met/)
    await expect(todayChip).toHaveAttribute('title', /200 of 500 words/)
  })

  test('Manuscript Progress inspector', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `In Progress Today Inspector ${Date.now()}`)
    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      writingGoals: { daily: 500, dailyHistory: [{ date: d(-7), goal: 500 }] },
      cumulativeWordHistory: [[-10, 2000], [-1, 2500], [0, 2700]],
    })

    await openProgressTab(page)
    const stats = await page.locator('.ms-insp-streak-stats b').allTextContents()
    expect(stats).toEqual(['1', '1', '1'])
    await expect(page.locator('.ms-insp-streak p')).toHaveText('300 words today will keep the streak alive.')
    await expect(page.locator('.ms-insp-goal-top b')).toHaveText('200')
    await expect(inspectorStreakDay(page, 0)).toHaveClass(/is-today/)
    await expect(inspectorStreakDay(page, 0)).not.toHaveClass(/is-met/)
  })
})

// ─── 3. A missed day resets the current streak, not best/total ────────────
// docs/ROADMAP.md row 4's Next Action, case 3. Seven days: a 3-day met
// streak (d(-6)..d(-4)), a missed day (d(-3)), a single met day (d(-2)), a
// second missed day (d(-1)), then today met. Current streak must reflect
// only the most recent unbroken run (today alone = 1), while personal best
// stays at the earlier 3-day run and total goal days counts every met day
// across the whole history (5), not just the visible window.
test.describe('A missed day resets the current streak but not personal best/total goal days', () => {
  test('Dashboard Overview card', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `Missed Day Reset ${Date.now()}`)
    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      writingGoals: { daily: 400, dailyHistory: [{ date: d(-8), goal: 400 }] },
      cumulativeWordHistory: [
        [-9, 1000], // baseline, excluded (predates dailyHistory)
        [-6, 1450], // +450 met
        [-5, 1870], // +420 met
        [-4, 2370], // +500 met (3-day streak so far)
        [-3, 2470], // +100 missed -> resets
        [-2, 2920], // +450 met
        [-1, 2970], // +50 missed -> resets again
        [0, 3370], // +400 met (today, exactly at goal)
      ],
    })

    const card = page.locator('[aria-label="Writing goal streak"]')
    const stats = await card.locator('.overview-streak-summary strong').allTextContents()
    expect(stats).toEqual(['1', '3', '5']) // current, best, total goal days
    await expect(card.locator('.overview-streak-caption')).toHaveText("Today's 400-word goal is complete.")

    await expect(overviewStreakDay(page, 6)).toHaveClass(/is-met/) // d(-6)
    await expect(overviewStreakDay(page, 5)).toHaveClass(/is-met/) // d(-5)
    await expect(overviewStreakDay(page, 4)).toHaveClass(/is-met/) // d(-4)
    await expect(overviewStreakDay(page, 3)).not.toHaveClass(/is-met/) // d(-3) missed
    await expect(overviewStreakDay(page, 2)).toHaveClass(/is-met/) // d(-2)
    await expect(overviewStreakDay(page, 1)).not.toHaveClass(/is-met/) // d(-1) missed
    await expect(overviewStreakDay(page, 0)).toHaveClass(/is-met/) // today
  })

  test('Manuscript Progress inspector', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `Missed Day Reset Inspector ${Date.now()}`)
    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      writingGoals: { daily: 400, dailyHistory: [{ date: d(-8), goal: 400 }] },
      cumulativeWordHistory: [
        [-9, 1000], [-6, 1450], [-5, 1870], [-4, 2370], [-3, 2470], [-2, 2920], [-1, 2970], [0, 3370],
      ],
    })

    await openProgressTab(page)
    const stats = await page.locator('.ms-insp-streak-stats b').allTextContents()
    expect(stats).toEqual(['1', '3', '5'])
    await expect(page.locator('.ms-insp-streak p')).toHaveText('Goal met today — the streak is secure.')
  })
})

// ─── 4. A genuinely legacy project (goal set, but zero goal-history) ──────
// docs/ROADMAP.md row 4's Next Action, case 4. Simulates an account that set
// a daily goal before writingGoals.dailyHistory existed: writingGoals.daily
// is set, dailyHistory is entirely absent (not an empty array placeholder,
// not present at all). Per writingStreak.js's buildWritingGoalStreak, an
// empty/missing history makes goalForDate() return the CURRENT goal for
// every date, i.e. it treats the goal as always having applied — the
// correct "legacy" interpretation, not corrupt/missing data. Confirms no
// crash on either surface, correct math under that interpretation, and that
// editing the goal live then correctly adds the documented "receive a
// baseline only when first changed" dailyHistory entry (withDailyGoalHistory)
// without touching any earlier day's already-displayed result.
test.describe('A legacy project (daily goal, but no dailyHistory at all) does not crash', () => {
  test('Dashboard Overview/Insights build history from this point without crashing', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `Legacy Goal No History ${Date.now()}`)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      // No dailyHistory key at all — the exact shape of a project that set
      // a goal before goal-history tracking shipped.
      writingGoals: { daily: 400 },
      cumulativeWordHistory: [
        [-6, 450], [-5, 800], [-4, 1300], [-3, 1400], [-2, 1850], [-1, 2300], [0, 2800],
      ],
    })

    expect(await readStorage(page, 'nf_novels')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: novelId, writingGoals: { daily: 400 } })]),
    )

    // No crash: no error-boundary fallback text, no uncaught page errors.
    await expect(page.getByText('This section ran into an error.')).toHaveCount(0)

    const card = page.locator('[aria-label="Writing goal streak"]')
    await expect(card).toBeVisible()
    let stats = await card.locator('.overview-streak-summary strong').allTextContents()
    // Every day is judged against the current 400 goal, retroactively —
    // correct for a genuinely legacy project (this goal really did apply
    // the whole time), not a bug.
    expect(stats).toEqual(['3', '3', '5']) // current, best, total goal days

    await page.getByRole('button', { name: 'Insights', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Daily writing goal' })).toHaveValue('400')
    await expect(page.getByText('This section ran into an error.')).toHaveCount(0)

    // Live-edit the goal — the first-ever change for this project — and
    // confirm the documented legacy baseline gets written.
    const goalInput = page.getByRole('textbox', { name: 'Daily writing goal' })
    await goalInput.fill('300')
    await goalInput.blur()
    await expect.poll(async () => {
      const novels = await readStorage(page, 'nf_novels')
      return novels.find(n => n.id === novelId)?.writingGoals
    }).toEqual({
      daily: 300,
      dailyHistory: [{ date: '1970-01-01', goal: 400 }, { date: today, goal: 300 }],
    })

    // Earlier days are unaffected by that edit (still judged against 400,
    // same met/missed outcome as before).
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    stats = await card.locator('.overview-streak-summary strong').allTextContents()
    expect(stats).toEqual(['3', '3', '5'])
    expect(errors).toEqual([])
  })

  test('Manuscript Progress inspector does not crash and computes the same totals', async ({ page }) => {
    const { novelId, sceneId } = await setupProject(page, `Legacy Goal No History Inspector ${Date.now()}`)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))

    await seedDailyGoalScenario(page, {
      novelId,
      sceneId,
      writingGoals: { daily: 400 },
      cumulativeWordHistory: [
        [-6, 450], [-5, 800], [-4, 1300], [-3, 1400], [-2, 1850], [-1, 2300], [0, 2800],
      ],
    })

    await openProgressTab(page)
    await expect(page.getByText('This section ran into an error.')).toHaveCount(0)
    const stats = await page.locator('.ms-insp-streak-stats b').allTextContents()
    expect(stats).toEqual(['3', '3', '5'])
    expect(errors).toEqual([])
  })
})
