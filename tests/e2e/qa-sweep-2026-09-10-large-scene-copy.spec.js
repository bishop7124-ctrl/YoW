import { expect, test } from '@playwright/test'
import { LARGE_SCENE_CHAR_THRESHOLD } from '../../src/components/Manuscript/manuscriptUtils.js'
import { createProject, dismissLaunchPrompts, seedCleanStorage, writeInDefaultScene } from './helpers.js'

// QA_PLAN.md Priority 2's "very-large-scene 'Copy scene' action" deferred
// item (docs/ROADMAP.md 2026-08-08 Bugs row, Phase 4(a) accepted decision):
// manuscriptUtils.test.js unit-tests the standalone copyTextToClipboard(text)
// utility against literal strings, but nothing in the repo exercises the
// real SceneEditor.jsx button (its click handler, its "Copied!" feedback
// state, or a real OS clipboard) — this is that confirmation, for the
// plain-desktop-Chromium case this sandbox can actually reach. Safari/iOS
// (the case the original investigation found the highest native-textarea
// cost on) and the desktop app webview still need their own pass, per this
// same QA_PLAN item's remaining scope.
//
// Note on scope drift found while writing this: the QA_PLAN item also asks
// to confirm the button "does not appear for an ordinary-sized scene" — that
// gating no longer exists in SceneEditor.jsx. LARGE_SCENE_CHAR_THRESHOLD
// (imported above) has no other importers anywhere in the repo, test or
// otherwise — it's fully dead code today; the button renders unconditionally
// ("harmless... for ordinary scenes" per its own code comment). This test
// reflects the current, simpler behavior rather than asserting a visibility
// rule the app no longer implements, and imports the real constant (rather
// than a hardcoded number) so this test's own threshold assumption breaks
// loudly if that value ever changes.
//
// Content is repeated realistic-length prose rather than the exact user
// fixture used in the original typing-lag investigation — this test checks
// clipboard *fidelity* (does the button put the scene's real content on the
// clipboard, byte for byte), not typing performance, so the actual words
// don't matter, only that the content clears LARGE_SCENE_CHAR_THRESHOLD and
// that what's copied matches exactly.
const PARAGRAPH = 'The lantern swayed on its hook as the ship crested another slow, grey wave, and Mira pressed her palm flat against the cold porthole glass, watching the horizon tilt and settle, tilt and settle, like something enormous breathing just beneath the water. '
const LARGE_SCENE_CONTENT = PARAGRAPH.repeat(Math.ceil((LARGE_SCENE_CHAR_THRESHOLD + 10000) / PARAGRAPH.length))

test.describe('Large-scene "Copy scene" clipboard round-trip (real browser clipboard)', () => {
  test('copies the full, exact scene content to the clipboard for a scene over the large-scene threshold', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'Large Scene Copy Test' })
    expect(LARGE_SCENE_CONTENT.length).toBeGreaterThan(LARGE_SCENE_CHAR_THRESHOLD)
    await writeInDefaultScene(page, LARGE_SCENE_CONTENT)

    const copyButton = page.getByRole('button', { name: 'Copy scene' })
    await expect(copyButton).toBeVisible()
    await copyButton.click()
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText.length).toBe(LARGE_SCENE_CONTENT.length)
    expect(clipboardText).toBe(LARGE_SCENE_CONTENT)

    // Feedback reverts to the idle label instead of getting stuck on "Copied!".
    await expect(page.getByRole('button', { name: 'Copy scene' })).toBeVisible({ timeout: 3000 })
  })

  test('also copies exact content for an ordinary-sized scene (the button is unconditional, not large-scene-gated)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await seedCleanStorage(page)
    await page.goto('/')
    await dismissLaunchPrompts(page)
    await createProject(page, { title: 'Ordinary Scene Copy Test' })
    const ordinaryContent = 'A short scene, well under the large-scene threshold.'
    await writeInDefaultScene(page, ordinaryContent)

    const copyButton = page.getByRole('button', { name: 'Copy scene' })
    await expect(copyButton).toBeVisible()
    await copyButton.click()
    // handleCopyWholeScene is async (awaits navigator.clipboard.writeText
    // before flipping to "Copied!") — click() only waits for the click event
    // to be dispatched, not for that promise to settle, so reading the
    // clipboard without this gate can race the write under CI load.
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toBe(ordinaryContent)
  })
})
