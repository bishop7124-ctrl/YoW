import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, seedCleanStorage,
  seedCleanStorageWithToursEnabled, seedFakeAiConfig,
} from './helpers.js'
import { AI_CONFIG_REQUIRED_TEXT } from '../../src/components/ai/AiConfigRequired.jsx'

// Regression coverage for the ROADMAP.md Bugs table row "Onboarding tour,
// Story Outline, Insights, and AI discovery polish" (2026-07-22/2026-08-08
// fixes), verified here at desktop (~1440px), tablet (~820px — also where
// Studio's own nav collapses into a hamburger menu, see the 860px breakpoint
// in src/index.css's `.studio-room-list`/`.studio-room-hamburger` rules) and
// mobile (~390px) widths against the offline/dev-mode app.
//
// Not covered here, and not coverable headless: real Chrome/Safari/Firefox
// password-manager behavior against the chat composer. The composer's
// autofill-safe `name`/`autocomplete` attributes (checked below) are the
// mitigation; whether a real browser's password manager actually leaves the
// field alone needs a manual pass in each real browser — see the ROADMAP.md
// row's dated note.

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180 }, // also the collapsed-nav (hamburger) state
  mobile: { width: 390, height: 844 },
}

async function skipTourIfOpen(page) {
  const skipBtn = page.getByRole('button', { name: /skip/i })
  if (await skipBtn.isVisible().catch(() => false)) await skipBtn.click()
}

// Opens a room, tolerating both the full nav (desktop) and the collapsed
// hamburger nav (tablet/mobile, and any width ≤860px per the CSS breakpoint
// above) that "collapsed nav" in this row's next-action refers to.
async function openRoom(page, viewportWidth, label) {
  if (viewportWidth <= 860) {
    await page.getByRole('button', { name: 'Open section menu' }).click()
    await page.getByRole('button', { name: label }).click()
  } else {
    await page.getByLabel('Studio navigation').getByRole('button', { name: `Open ${label}` }).click()
  }
}

async function openWriting(page, viewportWidth) {
  if (viewportWidth <= 860) {
    await page.getByRole('button', { name: 'Open section menu' }).click()
    await page.getByRole('button', { name: /Write/ }).first().click()
  } else {
    await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).first().click()
  }
}

// Steps a currently-open tour through to completion, asserting at every step
// that if a spotlight is rendered it actually lands on-screen. This is the
// direct regression check for the "tour spotlight could target blank space"
// bug: a spotlighted element that's mounted but moved off-canvas (e.g. the
// mobile manuscript structure rail before it's opened, which sits at
// `transform: translateX(-101%)`) used to still produce a real-looking
// bounding box positioned almost entirely off the visible page.
async function stepThroughTour(page, viewport) {
  const dialog = page.getByRole('dialog', { name: /^Tour:/ })
  await expect(dialog).toBeVisible()
  let guard = 0
  while (await dialog.isVisible().catch(() => false) && guard < 12) {
    const spotlight = page.locator('.tour-spotlight')
    if (await spotlight.count() > 0) {
      const box = await spotlight.boundingBox()
      expect(box, 'spotlight should have a bounding box when rendered').toBeTruthy()
      const onScreen = box.x + box.width > 4 && box.y + box.height > 4
        && box.x < viewport.width - 4 && box.y < viewport.height - 4
      expect(onScreen, `spotlight box ${JSON.stringify(box)} must intersect the ${viewport.width}x${viewport.height} viewport`).toBe(true)
    }
    // No spotlight at all is fine — OnboardingTour falls back to a centered
    // tip (see placeTip in OnboardingTour.jsx) when a step's target can't be
    // found or isn't currently on-screen.
    const nextBtn = page.getByRole('button', { name: /^(Next|Done)$/ })
    await nextBtn.click()
    await page.waitForTimeout(350) // let scrollIntoView/smooth-scroll settle before the next read
    guard++
  }
  await expect(dialog).not.toBeVisible()
}

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  test(`onboarding tours stay on-screen at ${viewportName} (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await seedCleanStorageWithToursEnabled(page)
    await page.setViewportSize(viewport)
    await page.goto('/')
    await dismissLaunchPrompts(page)

    // Library tour (auto-opens ~500ms after first mount of the library page).
    await page.getByRole('dialog', { name: /^Tour:/ }).waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    await stepThroughTour(page, viewport)

    await skipTourIfOpen(page)
    await createProject(page, `Tour QA ${viewportName} ${Date.now()}`)

    // Dashboard tour (project overview).
    await stepThroughTour(page, viewport)

    // Outline tour — Outline lives inside the "Planning" room, which defaults
    // to its first section (outline) when opened.
    await skipTourIfOpen(page)
    await openRoom(page, viewport.width, 'Planning')
    await stepThroughTour(page, viewport)

    // Characters tour.
    await skipTourIfOpen(page)
    await openRoom(page, viewport.width, 'Characters')
    await stepThroughTour(page, viewport)

    // Manuscript tour — this is the one the mobile off-canvas rail bug lived
    // in: at ≤900px the structure rail (data-tour="manuscript-structure")
    // starts off-canvas until its sheet is explicitly opened.
    await skipTourIfOpen(page)
    await openWriting(page, viewport.width)
    await stepThroughTour(page, viewport)
  })
}

test.describe('Story Outline responsive editing and display', () => {
  test('long synopsis and word count are not clipped at mobile or desktop widths', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, `Outline QA ${Date.now()}`)

    await page.getByRole('button', { name: 'Open section menu' }).click()
    await page.getByRole('button', { name: 'Planning' }).click()

    await page.getByRole('button', { name: /^\+ Act/ }).first().click()
    await page.getByRole('button', { name: /^(Edit|View) act$/ }).first().click()

    const longSynopsis = 'This is a deliberately long synopsis meant to test whether the description '
      + 'text wraps and stays fully visible without being clipped by a fixed-height container or an '
      + 'ellipsis overflow rule, across both narrow mobile widths and much wider desktop layouts, '
      + 'including several sentences of filler content to really push the box.'
    await page.getByLabel('Synopsis').fill(longSynopsis)
    await page.getByRole('button', { name: 'Save changes' }).click()

    const synopsis = page.locator('.outline-act-card p.mt-2').first()
    await expect(synopsis).toHaveText(longSynopsis)
    // No clipping: the element's rendered box must be tall enough to contain
    // all of its own content (no overflow:hidden truncating it visually,
    // even though the full text is always present in the DOM either way).
    await expect.poll(async () => synopsis.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    await expect.poll(async () => {
      const ws = page.locator('.outline-workspace')
      return ws.evaluate(el => el.scrollWidth <= el.clientWidth + 1)
    }).toBe(true)

    // Widen to desktop — same act, same synopsis, must still render in full.
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(synopsis).toHaveText(longSynopsis)
    await expect.poll(async () => synopsis.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  })
})

test.describe('Insights info tips are keyboard and touch accessible', () => {
  test('a tip opens on Enter and toggles on click', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, `Insights A11y QA ${Date.now()}`)

    await page.getByRole('button', { name: 'Insights', exact: true }).click()

    const firstTip = page.locator('.insight-info-tip').first()
    const summary = firstTip.locator('summary')

    // Keyboard: <details>/<summary> is natively focusable and toggles on
    // Enter/Space without any bespoke JS — this asserts that native behavior
    // actually reaches the rendered element (a real regression could still
    // break it, e.g. tabindex="-1" or a click handler that stops propagation).
    await summary.focus()
    await expect(summary).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(firstTip).toHaveJSProperty('open', true)

    // Touch/click: toggles closed again the same way a tap would.
    await summary.click()
    await expect(firstTip).toHaveJSProperty('open', false)
  })
})

test.describe('Project Insights CTA', () => {
  test('reaches Insights without crashing for a brand-new, empty project', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, `Empty Insights QA ${Date.now()}`)

    // No manuscript content, no characters, no locations yet — the CTA must
    // still be reachable and the view must render a graceful zero-state
    // rather than crashing on missing stats.
    const insightsBtn = page.getByRole('button', { name: 'Insights', exact: true })
    await expect(insightsBtn).toBeVisible()
    await insightsBtn.click()

    await expect(page.getByText(/something went wrong/i)).toHaveCount(0)
    // A real insights panel rendered, not a blank/crashed pane.
    await expect(page.locator('.insight-info-tip').first()).toBeVisible()
  })
})

test.describe('Character chat CTA gates correctly on AI configuration', () => {
  async function openCharacterChatTab(page) {
    await page.getByRole('button', { name: /Characters/i }).first().click()
    await page.locator('[data-tour="characters-add"]').click()
    await page.getByLabel('Name').fill('Chat CTA QA Character')
    await page.getByRole('button', { name: 'Save Character' }).click()
    // Scoped to the character dossier's own <article> (StudioDetail): the
    // Characters room also renders an unrelated floating "Ask about your
    // cast…" AI launcher whose button is also accessibly named "Chat", and
    // an unscoped match can resolve to that one instead of the profile tab.
    await page.getByRole('article').getByRole('button', { name: 'Chat', exact: true }).click()
  }

  test('without AI configured: shows the config-required notice and disables Begin Interview', async ({ page }) => {
    await seedCleanStorage(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, `Chat CTA No-AI QA ${Date.now()}`)
    await openCharacterChatTab(page)

    // Scoped to the character dossier's own <article>: AI_CONFIG_REQUIRED_TEXT
    // is a shared notice also used by the AI Tools room, which Layout.jsx
    // keeps mounted (display:none) rather than unmounted when inactive, so an
    // unscoped match can resolve to that hidden copy instead of this one.
    await expect(page.getByRole('article').getByText(AI_CONFIG_REQUIRED_TEXT).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Begin Interview' })).toBeDisabled()
  })

  test('with a configured (fake, non-functional) AI key: reaches an autofill-safe composer', async ({ page }) => {
    await seedCleanStorage(page)
    await seedFakeAiConfig(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, `Chat CTA With-AI QA ${Date.now()}`)
    await openCharacterChatTab(page)

    await expect(page.getByRole('article').getByText(AI_CONFIG_REQUIRED_TEXT)).toHaveCount(0)
    const beginBtn = page.getByRole('button', { name: 'Begin Interview' })
    await expect(beginBtn).toBeEnabled()
    await beginBtn.click()

    // Reached the actual chat screen. Deliberately never click Send here —
    // this repo's offline/dev QA must not attempt a real AI provider call,
    // even a doomed one, with the fake key seeded above.
    const composer = page.locator('textarea[name="yow-character-chat-message"]')
    await expect(composer).toBeVisible()

    // Autofill-safe semantics: a distinct message-composer name (not
    // "username"/"password"/"email", which is what triggers browser password
    // managers) plus autocomplete="off". This is the mitigation available to
    // verify headless — actual Chrome/Safari/Firefox password-manager
    // behavior against it needs a manual cross-browser pass (see the top of
    // this file and the ROADMAP.md row's dated note).
    await expect(composer).toHaveAttribute('name', 'yow-character-chat-message')
    await expect(composer).toHaveAttribute('autocomplete', 'off')
    const name = await composer.getAttribute('name')
    expect(name.toLowerCase()).not.toMatch(/user|pass|email/)

    await composer.fill('hello there')
    await expect(page.getByRole('button', { name: /^Send$/ })).toBeEnabled()
  })
})
