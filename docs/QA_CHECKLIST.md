# YOW Manual Beta Sign-Off Checklist

Use this checklist after automated QA has passed.

HTML tracker: [manual-beta-signoff.html](manual-beta-signoff.html)

Automated QA already covers the repeatable baseline: build/load checks, create-write-refresh, ZIP export/restore, DOCX/PDF download smoke, all configured project-type creation, and mobile/tablet writing reachability.

Manual QA should focus only on what automation does not prove well: real auth, cloud persistence, visual/layout quality, export content quality, realistic project scale, and deeper workflow behavior.

Report every failure with:

- Browser/device and viewport size.
- Account state: signed out, fresh user, returning user, or offline/local.
- Project type.
- Exact steps to reproduce.
- Whether the issue risks data loss, broken auth, broken save, broken export, unusable editor, unusable responsive layout, or legal/payment confusion.

---

## 0. Automated Gate

- [ ] `npm run qa` passed.
- [ ] `npm run qa:smoke` passed locally in a normal terminal or in CI.
- [ ] No failed GitHub Actions smoke job is unresolved.

**Gate:** Do not start manual sign-off while automated QA is red, unless you are manually reproducing a failed automated case.

---

## 1. Auth and Cloud Persistence

### Fresh account

- [ ] Open a private/incognito browser window.
- [ ] Sign up with a new account.
- [ ] Confirm the app opens with an empty library.
- [ ] Create a project and write one sentence in the first scene.
- [ ] Log out, then log back in.
- [ ] Confirm the project and sentence are still present.

### Returning account

- [ ] Sign in with an existing account that already has projects.
- [ ] Confirm existing projects load.
- [ ] Open one project, make a small scene edit, then refresh.
- [ ] Confirm the edit remains.

### Session and auth errors

- [ ] Close the browser completely while signed in, reopen it, and confirm the session restores.
- [ ] Attempt sign-in with an incorrect password.
- [ ] Confirm a clear error appears and the app does not crash or enter a broken state.
- [ ] Sign out from the user menu and confirm the logged-out state is clean.

**Pass:** Sign up, sign in, sign out, session restore, and cloud round-trip all work.

---

## 2. Autosave and Editor Safety

### Immediate save behavior

- [ ] Open a project and type several paragraphs in a scene.
- [ ] Hard-refresh immediately without waiting.
- [ ] Confirm all typed content remains.

### Scene and navigation behavior

- [ ] Type in Scene A, switch to Scene B, then return to Scene A.
- [ ] Confirm Scene A is unchanged.
- [ ] Type in a scene, immediately navigate to Characters or Lore, then return.
- [ ] Confirm the scene content remains.

### Long scene behavior

- [ ] Paste or write 5,000+ words into one scene.
- [ ] Continue typing at the end for at least 30 seconds.
- [ ] Confirm typing remains responsive and the cursor does not jump.
- [ ] Refresh and confirm the long scene remains intact.

### Structure operations

- [ ] Add, rename, move, and delete a chapter.
- [ ] Add, rename, move, and delete a scene.
- [ ] Refresh and confirm the structure changes persisted.
- [ ] Check that deletion warnings are clear enough before destructive actions.

**Pass:** Normal writing, rapid refresh, navigation, long scenes, and structure edits do not lose content or make the editor unusable.

---

## 3. Export and Restore Quality

Use one realistic project with scenes, chapters, characters, locations, lore, and timeline entries.

### Backup ZIP

- [ ] Export the project as a Backup ZIP.
- [ ] Open the ZIP and confirm it contains project data plus manuscript and worldbuilding data files.
- [ ] Restore the ZIP from the library.
- [ ] Confirm the restored project appears as a separate project.
- [ ] Open the restored project and compare chapters, scenes, characters, locations, lore, and timeline entries against the original.
- [ ] Edit the restored project and confirm the original project is unchanged.

### DOCX

- [ ] Export the manuscript as a Word document.
- [ ] Open it in Word, Pages, or Google Docs.
- [ ] Confirm chapter/scene order is correct and text is readable.
- [ ] Confirm empty scenes and long scenes do not break the document.

### PDF

- [ ] Export a Visual PDF using at least one theme.
- [ ] Open the PDF.
- [ ] Confirm content order, readability, and nonblank pages.
- [ ] Spot-check one additional theme if visual styling looks suspicious.

**Pass:** Exported files open, contain the expected content, preserve order, and restore without linking the copy back to the original.

---

## 4. Responsive Visual Pass

Check the app at mobile, tablet, desktop, and wide desktop widths.

Suggested widths:

- 375px mobile.
- 768px tablet.
- 1280px desktop.
- 1440px+ wide desktop.

### Required screens

- [ ] Landing/public navigation.
- [ ] Dashboard/library.
- [ ] New Project modal.
- [ ] Project settings/edit modal.
- [ ] Manuscript editor.
- [ ] Characters.
- [ ] Locations.
- [ ] Lore.
- [ ] Timeline or World History.
- [ ] Account settings.

### Required checks

- [ ] Key buttons are visible and tappable/clickable.
- [ ] No important controls overlap or disappear.
- [ ] Modals fit on screen and can be dismissed.
- [ ] The manuscript Write action is visible on compact layouts.
- [ ] The mobile manuscript bottom tab bar works.
- [ ] No screen requires awkward horizontal scrolling for core actions.

**Pass:** Core launch workflows are usable on mobile/tablet/desktop without hidden controls, broken modals, or unreadable layouts.

---

## 5. Dashboard and Project Library

- [ ] Fresh empty account shows a useful empty state.
- [ ] Create a project from the dashboard and open it from the project card.
- [ ] Rename a project and confirm the new title appears on the dashboard.
- [ ] Delete a project and confirm it disappears without affecting other projects.
- [ ] Test an account with several projects and at least one series.
- [ ] Confirm project cards, active project state, series grouping/filtering, Overview, and Insights remain readable and usable.

**Pass:** The library supports create/open/rename/delete and common multi-project states without ambiguous or broken UI.

---

## 6. Worldbuilding Persistence

Use immediate refresh after at least one create/edit/delete action in each section.

- [ ] Characters: create, edit, search, relate/link, delete, and confirm relationship cleanup.
- [ ] Locations: create, edit, search, link, delete, and confirm link cleanup.
- [ ] Lore: create, edit, categorize, search/filter, link to character/location, delete.
- [ ] Timeline/World History: create, edit, link/unlink, group by era where relevant, delete.

**Pass:** Worldbuilding records persist by project, survive immediate refresh, and deleted records do not leave broken visible links.

---

## 7. Project-Type Spot Checks

Automation creates every configured type. Manual QA should spot-check whether the UI feels honest and type-specific.

### Live/beta expectation copy

- [ ] Homepage and project creation copy clearly distinguish launch-ready prose/tabletop types from beta/limited types.
- [ ] Beta types do not look advertised as fully complete.
- [ ] Project settings show the selected type and any relevant limitation note.

### Prose types

- [ ] Novel uses Act / Chapter / Scene.
- [ ] Novella uses Part / Chapter / Scene and its lighter default sections.
- [ ] Short Story uses Part / Section / Scene and its compact default sections.
- [ ] Default word targets look appropriate where shown.

### Campaign types

- [ ] D&D Campaign uses Story Arc / Session / Encounter.
- [ ] TTRPG Campaign uses Story Arc / Session / Encounter.
- [ ] Structured session prep/recap fields are present and persist.
- [ ] Character Builder Party room, wizard, sheet, and dice roller are reachable.
- [ ] Campaign export includes campaign/session material.

### Script beta types

- [ ] Play, Screenplay, and TV Series are clearly marked limited/beta.
- [ ] Script element controls are reachable.
- [ ] Basic script typing flow works.
- [ ] Readable script DOCX export works.

**Pass:** Project-type behavior matches the roadmap promise and beta limitations are visible.

---

## 8. Large Project Performance

Use or create a project with at least:

- 50+ scenes.
- 10+ characters.
- 10+ locations or lore entries.
- 10+ timeline/history entries.
- One 5,000+ word scene.

Check:

- [ ] Dashboard opens in roughly 3 seconds.
- [ ] Manuscript scene list and editor remain responsive.
- [ ] Character/lore/location search returns results quickly.
- [ ] Word counts update without obvious typing lag.
- [ ] ZIP export completes.
- [ ] DOCX export completes.
- [ ] PDF export completes or fails with a clear recoverable message.

**Pass:** A realistic project remains usable and exports do not hang or crash.

---

## 9. Optional Conditional Checks

Run these only if the feature is part of the current beta promise or you intend to keep it visible.

### AI suggestion mode

- [ ] With no provider configured, AI shows a clear setup warning.
- [ ] With a provider configured, generate a suggestion.
- [ ] Confirm generated text is not automatically inserted.
- [ ] Append to scene only after explicit user action.
- [ ] Copy and discard behavior works.

### Theme editor

- [ ] Switch dark/light presets.
- [ ] Adjust custom colors, corner roundness, and visual strength.
- [ ] Save, refresh, and confirm the app shell and preview remain in sync.

### Finalized draft reader

- [ ] Finalize a novel draft.
- [ ] Confirm the working manuscript remains editable.
- [ ] Confirm the finalized draft is read-only.
- [ ] Switch scroll/page modes and use previous/next page controls.
- [ ] Confirm non-novel project types do not show the Finalise action.

---

## Sign-Off

| Area | Tester | Date | Result | Blocking Issue? |
| --- | --- | --- | --- | --- |
| Automated gate | | | | |
| Auth and cloud persistence | | | | |
| Autosave and editor safety | | | | |
| Export and restore quality | | | | |
| Responsive visual pass | | | | |
| Dashboard and project library | | | | |
| Worldbuilding persistence | | | | |
| Project-type spot checks | | | | |
| Large project performance | | | | |
| Optional conditional checks | | | | |

**Beta sign-off gate:** Automated QA plus sections 1-8 must pass, or failures must be triaged against the Launch Blocker Policy in `docs/ROADMAP.md`.

Only these categories should block beta/final launch: data loss, broken auth, broken save, broken export, unusable editor, unusable responsive layout, or missing/misleading legal/payment essentials.
