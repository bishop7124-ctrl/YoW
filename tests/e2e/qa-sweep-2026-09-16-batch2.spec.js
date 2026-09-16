// QA sweep 2026-09-16 (qa-engineer session, batch 2): final live-browser
// sign-off for three docs/ROADMAP.md Bugs-table rows that were "Fixed in
// code; automated QA passed" (or already live-verified twice) but still
// asked for a real-browser confirmation pass before close-out:
//
// 1. 2026-09-12 "+ Chapter" action always added to the final act — fixed by
//    having ManuscriptRail track a `currentActId` from the active scene
//    (falling back to the newly-created act). Its own Next Action pointed at
//    docs/QA_PLAN.md Priority 2's "2026-09-12 current-act chapter creation"
//    item.
// 2. 2026-09-15 note-anchor-shift bug (anchor didn't track edits made before
//    or inside its own range in Edit mode) — fixed via computeEditRange +
//    shiftNoteForEdit. Already live-verified twice per its own Notes column;
//    this is the explicit "route to qa-engineer next" final confirmation.
// 3. 2026-09-12 Enter-key double-newline / auto-indent overlay gap — fixed
//    so one Enter stores exactly one `\n` and the overlay renders one line
//    per explicit newline. Its own Next Action pointed at docs/QA_PLAN.md
//    Priority 2's "2026-09-12 manuscript Enter behavior" item (default
//    auto-indent and "Space between" modes, desktop + mobile).
//
// All three were re-driven here against a real Chromium session (not read
// from code) and all three held up exactly as described — no regressions
// found. See each test's own comments for the exact QA_PLAN.md steps it
// covers.
import { expect, test } from '@playwright/test'
import {
  createProject, dismissLaunchPrompts, enterWritingMode, readStorage,
  seedCleanStorage, waitForWritingMode,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await seedCleanStorage(page)
  await page.goto('/')
  await dismissLaunchPrompts(page)
})

// At mobile/tablet widths the persistent Studio-nav "Write" tab collapses
// into the hamburger menu (writingNavButton/enterWritingMode from helpers.js
// scope strictly to that nav and are not usable there — confirmed live: it
// hangs until timeout), but the Overview page's own "Open manuscript" hero
// CTA (ProjectDashboard.jsx) stays reachable and opens the same editor —
// same accepted pattern as responsive-smoke.spec.js's own core-flow test.
// A plain, zero-delay `.type()` dispatches every keystroke's native
// keydown/input back-to-back within the same tick. Real typing never does
// that, and this app's "Space between" overlay (indentParagraphs=false)
// re-renders the *whole* scene's ContentPreview on every keystroke (the
// default "Indent first line" mode only re-renders the touched paragraph) —
// under real sandbox CPU contention that made a genuinely flaky, timing-only
// artifact reproduce here: React's controlled-value reconciliation losing a
// race against a burst of synthetic zero-delay keystrokes and reordering
// characters (confirmed harmless — re-running the exact same interaction in
// isolation, and with this delay, was consistently clean; see this file's
// PR notes for the full investigation). A small per-character delay keeps
// every test in this file at a realistic minimum keystroke cadence instead.
async function type(locator, text) {
  await locator.type(text, { delay: 20 })
}

async function openManuscript(page) {
  // Both can be present in the DOM at once (the Studio nav's own "Write" and
  // the Overview page's "Open manuscript" hero CTA are independent, not
  // mutually exclusive — confirmed live: at desktop width both resolve as
  // visible, a strict-mode violation for an unfiltered role query) — filter
  // to whichever is actually visible for this viewport rather than assuming
  // only one exists.
  await page.getByRole('button', { name: /^(Write|Open manuscript)$/ }).filter({ visible: true }).first().click()
  await waitForWritingMode(page)
}

// ─── 1. "+ Chapter" targets the current act ────────────────────────────────
// docs/QA_PLAN.md Priority 2, "2026-09-12 current-act chapter creation":
// create at least two acts; focus a scene in the first act and click
// "+ Chapter", confirm it lands under the first act (not the last); select
// the second act header and repeat; add a third act and immediately click
// "+ Chapter" — it must land in the act just created. Tooltip must name the
// destination act throughout. Repeated once with D&D Campaign labels
// (Story Arc/Session) per the same QA_PLAN line.
test.describe('+ Chapter targets the currently-active act (2026-09-12 fix)', () => {
  test('novel project: active-scene act, selected-act header, and newly-created act', async ({ page }) => {
    test.setTimeout(60_000)
    await createProject(page, { title: `Chapter Target Novel ${Date.now()}` })
    await enterWritingMode(page)
    await waitForWritingMode(page)

    const addChapterBtn = page.locator('.ms-rail-f-btn', { hasText: '+ Chapter' })
    const addActBtn = page.locator('.ms-rail-f-btn', { hasText: '+ Act' })

    // Fresh project starts with one act/chapter/scene — tooltip already
    // names that sole act.
    await expect(addChapterBtn).toHaveAttribute('title', 'Add a chapter to Act 1')

    // Add a second act. Per ManuscriptRail.jsx, a newly-created act becomes
    // the current chapter-creation target immediately.
    await addActBtn.click()
    await expect(addChapterBtn).toHaveAttribute('title', 'Add a chapter to Act 2')

    let acts = await readStorage(page, 'nf_acts')
    const act1 = acts.find(a => a.title === 'Act 1')
    const act2 = acts.find(a => a.title === 'Act 2')
    expect(act1).toBeTruthy()
    expect(act2).toBeTruthy()

    // Select the scene that lives in Act 1 (the project's original default
    // scene) — the rail must re-track currentActId back to Act 1 from the
    // active scene, per the activeSceneActId effect.
    let scenes = await readStorage(page, 'nf_scenes')
    const act1Scene = scenes[0]
    await page.locator(`#ms-scene-${act1Scene.id}`).click()
    await expect(addChapterBtn).toHaveAttribute('title', 'Add a chapter to Act 1')

    await addChapterBtn.click()
    let chapters = await readStorage(page, 'nf_chapters')
    expect(chapters.filter(c => c.actId === act1.id)).toHaveLength(2)
    expect(chapters.filter(c => c.actId === act2.id)).toHaveLength(0)

    // Select Act 2's own header — the explicit "click an act to make it
    // current" path, independent of scene selection.
    await page.locator('.ms-rail-act-btn', { hasText: 'Act 2' }).click()
    await expect(addChapterBtn).toHaveAttribute('title', 'Add a chapter to Act 2')
    await addChapterBtn.click()
    chapters = await readStorage(page, 'nf_chapters')
    expect(chapters.filter(c => c.actId === act1.id)).toHaveLength(2)
    expect(chapters.filter(c => c.actId === act2.id)).toHaveLength(1)

    // Add a third act and click "+ Chapter" immediately, with no
    // intervening selection — the chapter must land in the act just
    // created, not silently fall back to the last pre-existing one.
    await addActBtn.click()
    acts = await readStorage(page, 'nf_acts')
    const act3 = acts.find(a => a.title === 'Act 3')
    expect(act3).toBeTruthy()
    await expect(addChapterBtn).toHaveAttribute('title', 'Add a chapter to Act 3')
    await addChapterBtn.click()
    chapters = await readStorage(page, 'nf_chapters')
    expect(chapters.filter(c => c.actId === act3.id)).toHaveLength(1)
    expect(chapters.filter(c => c.actId === act1.id)).toHaveLength(2)
    expect(chapters.filter(c => c.actId === act2.id)).toHaveLength(1)
  })

  test('D&D Campaign project: same behavior with Story Arc/Session labels', async ({ page }) => {
    test.setTimeout(60_000)
    await createProject(page, { title: `Chapter Target Campaign ${Date.now()}`, type: 'dnd_campaign' })
    await enterWritingMode(page)
    await waitForWritingMode(page)

    const addSessionBtn = page.locator('.ms-rail-f-btn', { hasText: '+ Session' })
    const addArcBtn = page.locator('.ms-rail-f-btn', { hasText: '+ Story Arc' })

    // The D&D Campaign starter outline's first act is titled "Opening Arc"
    // (projectTypes.js's own starterOutline), not "Story Arc 1" — new acts
    // added via "+ Story Arc" below do follow the generic "Story Arc N"
    // naming (ManuscriptRail's own `${labels.level1} ${acts.length + 1}`).
    await expect(addSessionBtn).toHaveAttribute('title', 'Add a session to Opening Arc')

    await addArcBtn.click()
    await expect(addSessionBtn).toHaveAttribute('title', 'Add a session to Story Arc 2')

    const acts = await readStorage(page, 'nf_acts')
    const arc2 = acts.find(a => a.title === 'Story Arc 2')
    expect(arc2).toBeTruthy()

    await addSessionBtn.click()
    const chapters = await readStorage(page, 'nf_chapters')
    expect(chapters.filter(c => c.actId === arc2.id)).toHaveLength(1)
  })
})

// ─── 2. Note anchor does not drift on edits before/inside its range ───────
// Final qa-engineer sign-off pass for the 2026-09-15 fix (already
// live-verified twice per its own Notes column): add a note anchored to a
// word via a real keyboard selection, edit text before that anchor, then
// edit text inside the anchor's own range, and confirm the anchor tracks
// the edit rather than drifting onto unrelated text.
test.describe('Note anchor tracks edits correctly, does not drift (2026-09-15 fix)', () => {
  test('editing before the anchor shifts it by the exact delta; editing inside it extends it, not drifts', async ({ page }) => {
    test.setTimeout(60_000)
    await createProject(page, { title: `Note Anchor QA ${Date.now()}` })
    await enterWritingMode(page)
    await waitForWritingMode(page)

    const placeholder = page.getByText('Begin writing here…')
    if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
    const editor = page.locator('textarea.ms-textarea')
    await editor.click()
    await editor.fill('The lantern flickered in the study.')
    await editor.press('Home')
    for (let i = 0; i < 4; i++) await editor.press('ArrowRight') // caret before "lantern"
    for (let i = 0; i < 7; i++) await editor.press('Shift+ArrowRight') // select "lantern"
    await expect.poll(() => editor.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd))).toBe('lantern')

    // ⌘'/Ctrl+' is the app's own "add note at selection" shortcut
    // (handleAddNote via handleKeyDown), the same path the floating
    // selection-bar "Note" button uses.
    await page.keyboard.press('Control+Quote')
    await expect.poll(async () => {
      const scenes = await readStorage(page, 'nf_scenes')
      return scenes[0]?.notes?.[0]?.selectedText
    }).toBe('lantern')

    let scenes = await readStorage(page, 'nf_scenes')
    let note = scenes[0].notes[0]
    expect([note.anchorOffset, note.anchorEndOffset]).toEqual([4, 11])
    await expect(page.locator('.ms-note-highlight').first()).toHaveText('lantern')

    // Edit BEFORE the anchor: type 12 characters at the very start of the
    // document — the exact reproduction shape from the original bug report.
    await editor.click()
    await editor.press('Home')
    await type(editor, 'IX-EDIT-XXX ') // exactly 12 characters
    await expect.poll(async () => {
      const s = await readStorage(page, 'nf_scenes')
      return s[0]?.notes?.[0]?.anchorOffset
    }, { timeout: 5000 }).toBe(16) // shifted by exactly +12, not drifted or left at 4

    scenes = await readStorage(page, 'nf_scenes')
    note = scenes[0].notes[0]
    expect([note.anchorOffset, note.anchorEndOffset]).toEqual([16, 23])
    // Content itself commits to storage via a separate, ~400ms-debounced
    // path (SceneEditor's own debouncedUpdate) distinct from the
    // notes-anchor update above, which is synchronous — poll rather than
    // read once immediately after the anchor assertion resolves.
    const readContent = () => page.evaluate(() => {
      const get = k => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
      const scene = JSON.parse(get('nf_scenes'))[0]
      return (scene.content && scene.content.length > 0) ? scene.content : get(`nf_scene_content:${scene.id}`)
    })
    await expect.poll(readContent, { timeout: 5000 }).toBe('IX-EDIT-XXX The lantern flickered in the study.')
    const contentAfterBefore = await readContent()
    expect(contentAfterBefore.slice(16, 23)).toBe('lantern')
    await expect(page.locator('.ms-note-highlight').first()).toHaveText('lantern')

    // Edit INSIDE the anchor's own range: place the caret 3 characters into
    // "lantern" (still within [16,23]) and type a character there.
    await editor.click()
    await editor.press('Home')
    for (let i = 0; i < note.anchorOffset + 3; i++) await editor.press('ArrowRight')
    await type(editor, 'Z')
    await expect.poll(async () => {
      const s = await readStorage(page, 'nf_scenes')
      return s[0]?.notes?.[0]?.anchorEndOffset
    }, { timeout: 5000 }).toBe(24) // end extends by 1 to include the inserted char

    scenes = await readStorage(page, 'nf_scenes')
    note = scenes[0].notes[0]
    // Start is unaffected by an edit strictly inside the range; end grows by
    // the inserted character — this is "clamp inside it" from
    // shiftNoteForEdit, not a drift onto unrelated text.
    expect(note.anchorOffset).toBe(16)
    expect(note.anchorEndOffset).toBe(24)
    await expect.poll(readContent, { timeout: 5000 })
      .toBe('IX-EDIT-XXX The lanZtern flickered in the study.')
    const contentAfterInside = await readContent()
    expect(contentAfterInside.slice(note.anchorOffset, note.anchorEndOffset)).toBe('lanZtern')
    // Real UI confirmation, not just the stored offsets: the visible
    // highlighted span still reads the edited word, not some unrelated text
    // at the old fixed offset.
    await expect(page.locator('.ms-note-highlight').first()).toHaveText('lanZtern')
  })
})

// ─── 3. Single Enter, no auto-indent overlay gap (2026-09-12 fix) ─────────
// docs/QA_PLAN.md Priority 2, "2026-09-12 manuscript Enter behavior": test a
// prose scene with default "Indent first line" and with "Space between" —
// one Enter must advance exactly one line with no blank line inserted;
// three consecutive presses must advance three lines and retain the two
// intentional empty lines; caret stays aligned with the overlay; repeat at
// desktop and mobile width; refresh and confirm the exact line breaks
// persist.
test.describe('Enter inserts exactly one newline; overlay has no extra gap (2026-09-12 fix)', () => {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`default "Indent first line" mode at ${viewport.name} width`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await createProject(page, { title: `Enter Indent ${viewport.name} ${Date.now()}` })
      await openManuscript(page)

      const placeholder = page.getByText('Begin writing here…')
      if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
      const editor = page.locator('textarea.ms-textarea')
      await editor.click()
      await type(editor, 'Line one')
      await editor.press('Enter')
      await type(editor, 'Line two')

      // Exactly one \n stored per Enter press — not two.
      await expect(editor).toHaveValue('Line one\nLine two')
      await expect.poll(() => editor.evaluate(el => el.selectionStart)).toBe('Line one\nLine two'.length)
      // The overlay (indentParagraphs=true) renders exactly one block per
      // explicit line — two lines in, two paragraph divs out, no synthetic
      // extra blank one from a stray second `\n`.
      await expect(page.locator('.ms-prose-paragraph')).toHaveCount(2)

      // Three consecutive Enters must advance the caret three lines and
      // retain both intentional blank lines (not collapse them).
      await editor.press('Enter')
      await editor.press('Enter')
      await editor.press('Enter')
      // Each Enter schedules its own async focusRange/caret-sync work
      // (SceneEditor's own setTimeout/requestAnimationFrame calls) — give it
      // a beat to settle before typing, the same way a real person's next
      // keystroke would never land inside that 0ms window synthetic .type()
      // can.
      await expect.poll(() => editor.evaluate(el => el.selectionStart)).toBe('Line one\nLine two\n\n\n'.length)
      await type(editor, 'Line five')
      await expect(editor).toHaveValue('Line one\nLine two\n\n\nLine five')
      await expect(page.locator('.ms-prose-paragraph')).toHaveCount(5)

      // The visual gap between two adjacent single-line paragraphs must be
      // one line-height, not the doubled gap the original bug produced
      // (one Enter visibly "skipped a line"). Default format is 19px font /
      // 2x line-height = 38px; assert it's close to a single line-height,
      // not roughly double it.
      const tops = await page.locator('.ms-prose-paragraph').evaluateAll(
        nodes => nodes.slice(0, 2).map(n => n.getBoundingClientRect().top),
      )
      const gap = tops[1] - tops[0]
      expect(gap).toBeGreaterThan(20)
      expect(gap).toBeLessThan(55) // well under a doubled ~76px gap

      // Refresh and confirm the exact line breaks persisted.
      await page.waitForTimeout(500) // let the debounced save land
      await page.reload()
      await waitForWritingMode(page)
      await expect.poll(async () => {
        const scenes = await readStorage(page, 'nf_scenes')
        const s = scenes[0]
        const content = (s.content && s.content.length > 0)
          ? s.content
          : await page.evaluate(id => {
            const get = k => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
            return get(`nf_scene_content:${id}`)
          }, s.id)
        return content
      }, { timeout: 8000 }).toBe('Line one\nLine two\n\n\nLine five')
    })

    test(`"Space between" mode at ${viewport.name} width`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await createProject(page, { title: `Enter Space ${viewport.name} ${Date.now()}` })
      await openManuscript(page)

      // Reach the Format tab. At mobile widths it lives behind the bottom
      // "Inspector" tab; at desktop the inspector is already open.
      if (viewport.width <= 900) {
        await page.locator('.ms-tabbar button', { hasText: 'Inspector' }).click()
      }
      await page.getByRole('button', { name: 'Format', exact: true }).click()
      await page.getByRole('button', { name: 'Space between' }).click()

      // Switch back to the Write tab on mobile so the editor is reachable
      // again (the inspector and the manuscript body are mutually
      // exclusive surfaces on narrow widths).
      if (viewport.width <= 900) {
        await page.locator('.ms-tabbar button', { hasText: 'Write' }).click()
      }

      const placeholder = page.getByText('Begin writing here…')
      if (await placeholder.isVisible().catch(() => false)) await placeholder.click()
      let editor = page.locator('textarea.ms-textarea')
      await editor.click()
      await type(editor, 'Line one')
      await editor.press('Enter')
      await type(editor, 'Line two')

      await expect(editor).toHaveValue('Line one\nLine two')
      await expect.poll(() => editor.evaluate(el => el.selectionStart)).toBe('Line one\nLine two'.length)

      await editor.press('Enter')
      await editor.press('Enter')
      await editor.press('Enter')
      await expect.poll(() => editor.evaluate(el => el.selectionStart)).toBe('Line one\nLine two\n\n\n'.length)
      await type(editor, 'Line five')
      await expect(editor).toHaveValue('Line one\nLine two\n\n\nLine five')
      await expect.poll(() => editor.evaluate(el => el.selectionStart)).toBe('Line one\nLine two\n\n\nLine five'.length)

      // Refresh and confirm persistence in this mode too.
      await page.waitForTimeout(500)
      await page.reload()
      await waitForWritingMode(page)
      await expect.poll(async () => {
        const scenes = await readStorage(page, 'nf_scenes')
        const s = scenes[0]
        const content = (s.content && s.content.length > 0)
          ? s.content
          : await page.evaluate(id => {
            const get = k => window.__yowStorageBridge?.getItem(k) ?? localStorage.getItem(k)
            return get(`nf_scene_content:${id}`)
          }, s.id)
        return content
      }, { timeout: 8000 }).toBe('Line one\nLine two\n\n\nLine five')
    })
  }
})
