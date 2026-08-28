import { expect, test } from '@playwright/test'
import { createProject, dismissLaunchPrompts, seedCleanStorage } from './helpers.js'

// Post-`manuscript-editor-redesign` selector notes (2026-08-28). This spec was
// written against the pre-redesign toolbar and had rotted into a 4/4 timeout —
// it was also never in `.github/workflows/qa.yml`'s matrix, so nothing caught
// that. The three things that moved:
//
//  1. Entering focus mode is a plain "Focus" text button in the topbar's tools
//     zone (`.ms-topbar-btn-primary`), not an icon button with an
//     `aria-label="Enter focused writing mode"`. Only the *exit* control kept
//     an aria-label ("Exit focused writing mode", on `.ms-focus-exit`).
//     Deliberately not "fixed" in the app by adding a matching aria-label back:
//     the button's visible text is "Focus", and an accessible name of
//     "Enter focused writing mode" would no longer contain it (WCAG 2.5.3
//     Label in Name). The test moves instead.
//  2. At or below 900px (`BREAKPOINT_MS_OVERLAY` in src/utils/useMediaQuery.js;
//     `.ms-topbar-zone-tools > *:not(.ms-topbar-menu-wrap) { display: none }`
//     in src/index.css) that button is CSS-hidden and focus mode is reached
//     through the topbar overflow menu (More → View → Focus) — see
//     `buildOverflowSections`' `hasFocus` flag in ManuscriptTopbar.jsx. Note
//     that component's own comment says "~1024px", which is wrong; the rule is
//     900px. The mobile test exercises the real overflow path.
//  3. Focus mode's tool panel is `ManuscriptInspector` (`.ms-insp`); the old
//     `.ms-writing-sidebar` element no longer exists anywhere in `src/`. Its
//     control bar is also Notes/Format/AI/Status — "Structure" was dropped on
//     purpose (that panel became the rail, which has no presence in focus
//     mode), so the layered-Escape test drives Notes instead.
//
// The *behaviour* each test asserts is unchanged; only the handles moved.

const enterFocusFromTopbar = async (page) => {
  await page.getByRole('button', { name: 'Focus', exact: true }).click()
}

// At <=900px the topbar's tools zone (Focus included) is hidden, so focus mode
// is only reachable via the overflow menu. Exercising this path is the point of
// the mobile test — it is the one that regressed to unreachable once already
// (2026-08-27 QA pass).
const enterFocusFromOverflowMenu = async (page) => {
  await page.locator('.ms-topbar-menu-wrap .ms-topbar-iconbtn').click()
  await page.locator('.ms-topbar-menu').getByRole('button', { name: 'Focus', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
  await createProject(page, { title: 'Focused Writing Test' })
  await page.getByRole('button', { name: 'Write' }).click()
})

test('focused mode is independent, keeps tools available, and Escape closes in layers', async ({ page }) => {
  await expect(page.getByRole('group', { name: 'Manuscript page zoom' })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom manuscript page in' }).click()
  await expect(page.locator('.manuscript-document')).toHaveCSS('zoom', '1.1')

  await enterFocusFromTopbar(page)

  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)
  // The studio nav banner's <h1> also shows the project title and stays
  // visible in focused mode (by design — "keeps tools available"), so this
  // must target the focused-mode topbar's own title specifically.
  await expect(page.locator('.ms-focus-project-title')).toHaveText('Focused Writing Test')
  await expect(page.getByRole('button', { name: 'Exit focused writing mode' })).toBeVisible()

  // Zoom carries across the mode switch and stays adjustable inside it.
  await expect(page.getByText('110%', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Zoom manuscript page in' }).click()
  await expect(page.locator('.manuscript-document')).toHaveCSS('zoom', '1.2')

  await page.locator('.ms-focus-controls').getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page.locator('.ms-insp')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.ms-insp')).toHaveCount(0)
  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)

  await page.keyboard.press('Escape')
  await expect(page.locator('.manuscript-processor')).not.toHaveClass(/is-focused-writing/)
})

test('focused preference survives reload only while explicitly left enabled', async ({ page }) => {
  await enterFocusFromTopbar(page)
  // Confirm the mode actually engaged before reloading. Without this the
  // reload can outrun the effect that persists the preference, and — worse —
  // any future selector rot here would surface as "the preference didn't
  // survive a reload" rather than "the click never landed".
  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)
  await page.reload()
  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)

  await page.getByRole('button', { name: 'Exit focused writing mode' }).click()
  await page.reload()
  await expect(page.locator('.manuscript-processor')).not.toHaveClass(/is-focused-writing/)
})

// ─── Caret comfort ──────────────────────────────────────────────────────────
//
// These tests read the bottom of the caret's own line box and check it against
// the visible scroll container's edges. Two things about that measurement are
// load-bearing enough to state outright, because getting either wrong makes it
// silently measure something else rather than fail loudly:
//
//  1. It uses the textarea's *content*-box bottom (border-box bottom minus
//     `padding-bottom`). The original assertion used the border-box bottom
//     directly, which is 36px of `.ms-textarea` padding below the text it was
//     standing in for — on its own enough to push a correctly-positioned caret
//     past the old ceiling and fail the test.
//  2. The content-box bottom only equals the caret's line bottom while the
//     textarea is *precisely* sized and the caret is at the end of the content.
//     Above `RESIZE_PRECISE_THRESHOLD` (20000 chars in SceneEditor.jsx) the
//     editor switches to a cheap resize path for large scenes: it adds
//     `RESIZE_GROWTH_BUFFER_PX` (600px) once per typing burst and only corrects
//     to the true height on a 200ms debounce after typing stops. So a scene over
//     that threshold carries up to 600px of empty space below the text mid-burst
//     and the measurement is wrong by exactly that much. The fixture this spec
//     originally used (40 paragraphs x 40 words) landed at 20,038 chars — just
//     over the line. The fixtures below stay well under it, and
//     `readCaretGeometry` asserts that rather than trusting it.
//
// Deliberately expressed as pixel margins from the container edges, not as a
// fraction of container height: the settled fraction is neither viewport- nor
// zoom-independent (measured 0.40 at 1080px tall, 0.68 at 720px, and 0.74 at
// 1.5x page zoom), so a fraction band tight enough to mean anything is also
// tight enough to go spuriously red on a viewport or zoom change.
const RESIZE_PRECISE_THRESHOLD = 20000

// How much clear space must sit below the caret's line for it to count as
// "comfortably on screen" rather than jammed against the bottom edge. Settled
// measurements are 176-213px across viewports and zoom levels, so this has real
// headroom while still rejecting the failure it exists to catch.
const COMFORT_MARGIN_PX = 100

// Throws — rather than returning a falsy value — when its preconditions break,
// so a broken measurement reports itself instead of masquerading as a caret
// that drifted. A `selectionStart` no longer at the end is exactly the pass-6/7
// regression signature docs/ROADMAP.md says to watch for (the editor losing its
// active-editing state mid-burst), so surfacing it by name is the point here,
// not an inconvenience.
const readCaretGeometry = async (page) => {
  const geometry = await page.evaluate((threshold) => {
    const textareas = document.querySelectorAll('.ms-textarea')
    const container = document.querySelector('.ms-scroll-container')
    if (!container) return { error: 'no .ms-scroll-container on the page' }
    if (textareas.length !== 1) {
      return { error: `expected exactly 1 .ms-textarea, found ${textareas.length} — the measurement assumes a single-block scene` }
    }
    const textarea = textareas[0]
    if (textarea.selectionStart !== textarea.value.length) {
      return { error: `caret is not at the end of the content (selectionStart=${textarea.selectionStart}, length=${textarea.value.length}) — the measurement assumes it is` }
    }
    if (textarea.value.length >= threshold) {
      return { error: `scene is ${textarea.value.length} chars, at or over SceneEditor's ${threshold}-char precise-resize threshold — the textarea may carry a 600px growth buffer, making this measurement wrong by that much` }
    }
    const style = getComputedStyle(textarea)
    const lineHeight = Number.parseFloat(style.lineHeight) || 0
    const lineBottom = textarea.getBoundingClientRect().bottom - (Number.parseFloat(style.paddingBottom) || 0)
    const containerRect = container.getBoundingClientRect()
    return {
      lineHeight,
      marginBelow: (containerRect.top + container.clientHeight) - lineBottom,
      marginAbove: lineBottom - lineHeight - containerRect.top,
    }
  }, RESIZE_PRECISE_THRESHOLD)
  if (geometry.error) throw new Error(`caret measurement precondition failed: ${geometry.error}`)
  return geometry
}

const waitForCaretSettled = async (page) => {
  await expect.poll(async () => page.evaluate(({ threshold, margin }) => {
    const textareas = document.querySelectorAll('.ms-textarea')
    const container = document.querySelector('.ms-scroll-container')
    if (!container || textareas.length !== 1) return false
    const textarea = textareas[0]
    if (textarea.value.length >= threshold) return false
    const style = getComputedStyle(textarea)
    const lineBottom = textarea.getBoundingClientRect().bottom - (Number.parseFloat(style.paddingBottom) || 0)
    const containerRect = container.getBoundingClientRect()
    return (containerRect.top + container.clientHeight) - lineBottom >= margin
  }, { threshold: RESIZE_PRECISE_THRESHOLD, margin: COMFORT_MARGIN_PX })).toBe(true)
}

// Verified to have teeth rather than merely being loose enough to pass: the
// identical measurement in the *regular* (non-focused) editor, where the
// comfort hook is gated off, yields a marginBelow of -8 to -167px after a
// typing burst — the caret's line ending up *below* the container's visible
// bottom edge. That is the still-open "typing brings the cursor to the bottom
// of the page" bug (see docs/ROADMAP.md); it fails this check outright.
const expectCaretComfortablyOnScreen = (geometry) => {
  expect(geometry.marginBelow,
    'clear space below the caret line (negative means it is off the bottom of the viewport)')
    .toBeGreaterThanOrEqual(COMFORT_MARGIN_PX)
  expect(geometry.marginAbove,
    'clear space above the caret line (negative means it is scrolled off the top)')
    .toBeGreaterThanOrEqual(0)
}

test('long wrapped prose keeps the caret inside the calm comfort zone', async ({ page }) => {
  await enterFocusFromTopbar(page)
  await page.getByText('Begin writing here…').click()
  const editor = page.getByPlaceholder('Begin writing here…')
  const longParagraph = Array.from({ length: 260 }, (_, index) => `wrapped${index}`).join(' ')
  await editor.fill(longParagraph)
  await editor.press('End')

  await waitForCaretSettled(page)
  expectCaretComfortablyOnScreen(await readCaretGeometry(page))
})

test('the caret returns to its comfort position after a typing burst', async ({ page }) => {
  await enterFocusFromTopbar(page)
  await page.getByText('Begin writing here…').click()
  const editor = page.getByPlaceholder('Begin writing here…')
  // 20 paragraphs is enough for the document to genuinely overflow its
  // container (so there is real scrolling for the correction to get wrong)
  // while staying far below RESIZE_PRECISE_THRESHOLD — see the note above.
  await editor.fill(Array.from({ length: 20 }, (_, p) =>
    Array.from({ length: 20 }, (_, w) => `para${p}word${w}`).join(' ')).join('\n\n'))
  await editor.press('End')

  await waitForCaretSettled(page)
  const before = await readCaretGeometry(page)
  expectCaretComfortablyOnScreen(before)

  // Typed in chunks so `readCaretGeometry` runs *between* them: its
  // preconditions are the robust part of the mid-burst check, catching the
  // pass-6/7 signature (the editor losing its active-editing state, selection
  // resetting) in the act rather than after everything settles back.
  //
  // What this deliberately does NOT assert is a margin mid-burst. Measured
  // live, focus mode's topbar auto-hides while typing, which shifts the scroll
  // container ~85px and momentarily leaves only ~4px of clearance below the
  // caret before the post-burst correction restores ~213px. That near-miss is
  // real and is recorded in docs/ROADMAP.md's caret row as evidence — but
  // asserting on a 4px margin would be a coin-flip in CI, and asserting the
  // comfortable margin mid-burst would encode current behaviour as a failure.
  for (const chunk of ['alpha beta ', 'gamma delta ', 'epsilon zeta ']) {
    await editor.pressSequentially(chunk, { delay: 25 })
    await readCaretGeometry(page)
  }

  // The correction must bring the caret back to the same comfort position it
  // started from — not merely somewhere on screen. This is what catches a
  // correction that stops running, or that comes to rest somewhere new.
  await waitForCaretSettled(page)
  const after = await readCaretGeometry(page)
  expectCaretComfortablyOnScreen(after)
  expect(Math.abs(after.marginBelow - before.marginBelow),
    'caret resting position drifted by more than one line across a typing burst')
    .toBeLessThanOrEqual(before.lineHeight)
})

test('mobile focused tools open as a bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 })
  await enterFocusFromOverflowMenu(page)
  await expect(page.locator('.manuscript-processor')).toHaveClass(/is-focused-writing/)

  await page.locator('.ms-focus-controls').getByRole('button', { name: 'Notes', exact: true }).click()

  const sheet = page.locator('.ms-insp')
  await expect(sheet).toBeVisible()
  const box = await sheet.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(370)
  expect(box?.y).toBeGreaterThan(150)
})
