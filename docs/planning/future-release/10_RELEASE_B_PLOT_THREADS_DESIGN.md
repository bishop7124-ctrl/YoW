# Release B: Story Planning (plot threads first) — design and plan

Status: **planning only, 2026-11-10. Nothing here is built.** Tracked in [docs/ROADMAP.md](../../ROADMAP.md) (Release B rows and the Owner Action Queue). Builds on [05_FUTURE_RELEASE_ROADMAP.md](05_FUTURE_RELEASE_ROADMAP.md) Release B and [06_NATIVE_CONTINUITY_DESIGN.md](06_NATIVE_CONTINUITY_DESIGN.md) Tier 3. Native-first, AI-optional (decision D1–D11 still hold): every step below works with no API key.

## 1. What a writer gets

Today a writer can say who is in a scene and where (A4), but not **which storyline a scene advances**. Release B adds plot threads: named storylines (the main plot, a subplot, a romance, a mystery, a character arc) that scenes are attached to, with a role in each (set up, develop, pay off). From that YOW can show:

- a **Threads view**: one row per thread, one column per chapter or scene, so a writer sees at a glance where each storyline lives and where it goes quiet;
- **native checks** (no AI): a payoff with no setup, a thread that never pays off, a thread that vanishes for a long stretch;
- optionally, **tension** and **purpose** per scene, with a tension line.

## 2. What already exists (verified in code, 2026-11-10)

| Area | State | Source |
| --- | --- | --- |
| Plot threads, tension, purpose, structure maps | **Do not exist.** No `thread`, `plot_thread`, `tension` or `structureTemplate` anywhere in `src` or `supabase`. | grep, whole repo |
| Scene links (who, where, when) | Built (A4), behind `scene_links`: `characterIds`, `povCharacterId`, `locationIds`, `timelineEventIds`, `storyYear`, `timeShift`. Threads reuse the same Inspector section pattern and the same suggest-and-confirm, delete-clears-links and import-remap helpers. | `src/utils/sceneLinks.js`, `SceneLinksPanel.jsx` |
| Story structure templates | **Partly exist.** About 30 manuscript templates (Three Act, Save the Cat, Romantasy, Mystery/Thriller, Two-Act Play, Multi-Issue Arc, campaign arcs and so on) create acts and chapters when a project starts or when applied. | `src/components/Manuscript/manuscriptTemplates.js`, `TemplateModal.jsx` |
| What is missing in structure | No "coverage" view that maps an existing manuscript onto structure beats, no Hero's Journey / Seven-Point / Story Circle / Freytag / Five-Act templates. | n/a |
| Outline | Acts, chapters, scenes with drag reorder, synopsis, word counts. One view only. | `src/components/outline/StoryOutline.jsx` (334 lines) |
| Story Check engine | Pure rules R1–R10 plus info rules, fingerprint-keyed dismissals. New rules slot in beside them. | `src/utils/storyCheck/` |
| Character journey beats | A per-character beat list exists; unrelated to plot threads, and stays separate. | `CharacterJourney.jsx` |

Consequence: the original plan's **B1 (structure templates)** is smaller than written, because templates exist. The real gap is the coverage view and a few missing templates. **B2 (threads) is the large, new piece**, and is where the plan below starts.

## 3. The one big design choice: where thread records live

Every entity in YOW (factions, lore, ideas, scenes) is a JSONB document table with its own plumbing. The factions precedent shows what a **new table** costs: about 25 non-UI touch points (browser storage key and loader, store state and refs, cloud-sync debounced save and snapshot, `TABLE_CONFIG` reconcile and conflict labels, ZIP export and import validation, project merge and ID remap, pending-deletes, storage quota, sync summary, project replacement, global search, series sharing), plus one SQL migration.

| Option | Cost | Sync and conflicts | Other effects | Verdict |
| --- | --- | --- | --- | --- |
| **A. New `plot_threads` table** (matches doc 04 §2.3) | High, but a well-trodden path with a checklist | Per-record merge: two tabs editing different threads never collide | One owner-applied migration; export, import, merge, search and series work like any other entity | **Recommended** |
| B. Array of threads on the novel record | Low | One record: edits from two tabs to different threads collide (conflict copy of the whole project record) | No migration | Rejected: this is the exact multi-tab data-loss class the project has been hit by before |
| C. Reuse Lore entries with `kind: 'thread'` | Lowest | Per-record | Threads would show in the Lore room, World Bible export, AI context and search as if they were world lore; needs filtering everywhere | Rejected for threads (the same trick is still the right call for Release C "References") |

Everything else in Release B is **additive optional fields on existing scenes and chapters, with no migration**.

## 4. Data model

**Thread record** (`plot_threads`, one row per thread, standard `(id, user_id, data jsonb)` shape like the other entity tables):

```
{ id, novelId, name, kind, color, status, description, characterIds[], order }
kind:   'main' | 'subplot' | 'romance' | 'mystery' | 'character-arc' | 'custom'   (+ optional customLabel)
status: 'open' | 'resolved' | 'dropped'
```

**Scene link to a thread**: `scene.threadLinks: [{ threadId, role }]`, `role: 'setup' | 'development' | 'payoff' | 'mention'`.
This deliberately differs from doc 04's `threadIds` plus a single `threadRole`: one scene can serve several threads in different roles (it pays off the mystery while setting up the romance), and a single role field cannot say that. Chapters get no thread fields; the Threads view rolls scene links up to the chapter column.

**Optional, B4:** `scene.tension` (1–5 or empty) and `scene.purpose` (a short fixed list plus free text).

**Rules for all of it** (same discipline as A4): fields are optional and never required; deleting a thread clears its links from every scene (precedent `clearSceneLinksFor`); import and merge remap thread ids (precedent `remapSceneLinks`); older exports without the fields still import; export schema stays v1 with optional keys.

## 5. Steps, in build order

Each step is independently shippable behind the one flag `plot_threads` (fail-closed like the others) and has its own tests, review and owner QA row.

| Step | What | Size | Needs migration? |
| --- | --- | --- | --- |
| **B0 Foundation** | Flag, `plot_threads` table and RLS (owner applies), store state, local and cloud sync, `TABLE_CONFIG`, export/import/merge/remap, pending-deletes, quota, search, series sharing, delete-clears-links. **No UI.** Includes a round-trip test (export, import, merge) and a cross-account isolation test. | L | Yes (one) |
| **B1 Threads panel and scene linking** | A Threads list (create, rename, colour, kind, status, notes) in the Outline room. In the Inspector Scene tab, a "Plot threads" section: attach a thread with a role, suggest threads from the scene's characters when a thread lists those characters (suggest-and-confirm, never automatic). | M | No |
| **B2 Threads view** | New "Threads" view next to the Outline: rows are threads, columns are chapters (toggle to scenes), cells are coloured by role, click opens the scene. Narrow screens (≤900px) show a per-thread list instead of the grid. | M | No |
| **B3 Native checks R13–R16** | Added to Story Check as ordinary rules (section 6). | M | No |
| **B4 Tension and purpose** | Optional per-scene fields in the Inspector, a tension line in the existing Pacing chart, and an empty-tension info note (never an error). | S–M | No |
| **B5 Structure coverage** | Add the missing templates (Hero's Journey, Seven-Point, Story Circle, Freytag, Five-Act) to the existing template list, and a coverage view that maps existing chapters to a template's beats and shows empty beats. User places the mapping; nothing is inferred from prose. | M | No (`novel.structureMap` is a field) |
| B6 Optional AI | "Analyse thread pacing" using the user's own key, explicit action, results labelled as suggestions. Only after B1–B3 have been used. | S | No |

Parked, pending your call (section 8): the trope library (original B4).

## 6. Native checks (all deterministic, all on explicit user data)

Thresholds are named constants, easy to tune after real use. A dismissed finding stays dismissed (existing fingerprint mechanism).

| Rule | Fires when | Severity |
| --- | --- | --- |
| R13a Payoff without setup | A scene has role `payoff` for a thread and no scene earlier in manuscript order has `setup` or `development` for it | Possible problem |
| R13b Setup without payoff | A thread is marked `resolved` but no scene has `payoff` for it | Possible problem |
| R14 Open thread at the end | Manuscript has scenes, the thread is `open`, and its last linked scene is not within the final 10% of the manuscript (or last three chapters, whichever is more) | Info |
| R15 Long gap | A thread's linked scenes have a gap of more than N scenes (default 12) between two consecutive appearances | Info |
| R16 Thread with no scenes | A thread exists and no scene links to it | Info |

Order is manuscript order (act, chapter, scene order). Nothing is inferred from prose, and nothing here is ever presented as a confirmed error (same wording rules as A1).

## 7. Risks, testing, rollout, rollback

**Risks**
- *Outline density.* The Outline is a single 334-line component. The Threads view is its own component, selected by a toggle, so the existing Outline is not edited beyond the toggle.
- *Data entry burden.* Linking every scene to threads by hand is work. Mitigations: suggestions from characters, bulk "add this thread to the selected scenes", and everything optional; the view is useful with only the main threads linked.
- *Plumbing omissions* (the A4 lesson: a missed place that handles scenes loses the field). A written touch-point checklist, a test that round-trips thread links through export, import and merge, and a guard test like `wordCountSingleSource` that fails if a place which copies scene link fields forgets the thread ones.
- *Mobile.* Grid cannot fit a phone; the list fallback in B2 is part of its definition of done, and the responsive gate is checked.

**Testing**: unit tests per rule (including malformed and empty data), thread delete clears links, import and merge remap, flag off hides everything, owner-only SQL checks in a scratch Postgres (PGlite, as for A2) for the new table's RLS and grants, e2e drag and click through the view, phone width check.

**Rollout**: B0 ships dark (nothing visible). B1 to B5 behind `plot_threads`, owner first, then volunteers, then 10% then 100%, same as the other flags. Structure coverage (B5) can ship under its own flag if wanted.

**Rollback**: switch the flag off. Thread records and scene fields stay in place and are ignored; nothing about scenes, chapters or the Outline depends on them. The table never needs dropping.

## 8. Decisions needed from the owner

| # | Decision | Recommendation |
| --- | --- | --- |
| D12 | Where thread records live (section 3) | New `plot_threads` table (A). It is the larger build but the only option that is safe for multi-tab editing. Needs you to apply one SQL migration, as with A2. |
| D13 | Which project types get threads | Novel, Novella, Short Story and Comic first. Campaign types (D&D, TTRPG) later, possibly worded as "plot hooks". |
| D14 | Tension scale | Optional 1–5 per scene, display only, no scoring or advice. |
| D15 | Trope library (original B4) | Park it. It adds a second thing to maintain before anyone has used threads. Revisit after B2 has real use. |
| D16 | Order of B5 (structure coverage) | After B3, because it needs no new data and can wait for evidence that writers want it. |

## 9. Effort and order

B0 (large) then B1, B2 (medium each), B3 (medium), B4, B5 (small-medium each). Releasable in that order; B0 to B2 is the first useful release, B3 the first intelligent one. Nothing here blocks on a decision except D12, which gates B0. D13 to D16 only shape later steps.

## 10. Acceptance (Release B, threads part)

1. With the flag off, nothing changes anywhere (verified at the UI and the data level).
2. A writer with no API key can create threads, attach scenes, see the Threads view and get R13 to R16 findings.
3. Export, import, project merge, series sharing and cloud sync preserve threads and scene thread links; an old export without them still imports.
4. Deleting a thread removes its links from scenes; deleting a scene never breaks the Threads view.
5. Two tabs editing different threads never produce a conflict copy.
6. The Threads view and the Inspector section work at phone width.
7. Cross-account isolation test passes for the new table.

## 11. B0 as built (2026-11-11)

Built and tested, **dark** (no UI), behind the `plot_threads` flag. It differs from section 3 and section 5 in three deliberate ways, all to keep every other account's data out of harm's way:

1. **No shared server function is rewritten.** The plan said the table must be added to the project-delete, replace-all and record-merge functions (each holds its own hard-coded table list). Rewriting those would change behaviour for every account the moment the migration is applied, flag or no flag. Instead the migration adds one trigger on `public.novels`: when a project row is deleted (which both `delete_project_data_atomic` and `replace_user_data_atomic` do), that project's threads are deleted in the same transaction. Account deletion cascades through the user id. `merge_records` is not used for threads.
2. **Threads are not part of the main cloud load.** The main load treats any failing table as "this account did not load" and shows the retry screen. Threads have their own optional read (`fetchPlotThreads`), called only while the flag is on and only after the main load has finished. A missing table or a failed request leaves local threads as they are and blocks nothing. A thread present on both sides keeps the newer copy; nothing is removed by a read.
3. **Writes wait for the first successful read.** Threads sync through the normal per-record save path, but only after the first cloud read has succeeded in that session, so an older local copy can never overwrite a newer cloud copy.

What exists now: migration `supabase/migrations/20261111120000_plot_threads.sql` (owner applies) with 20 scratch-Postgres checks in `supabase/tests/plot_threads.pglite.mjs`; pure helpers in `src/utils/plotThreads.js`; store state, persistence, add/update/delete (delete also clears scene links), project export, import with id remap (scene `threadLinks` remap through the same generic path as scene character links), restore, project delete, and clear on account switch; ZIP export writes `data/plot-threads.json` only when a project has threads. The AI-import path drops thread links rather than leaving them dangling. Not done in B0: any UI (B1), threads in the storage-quota estimate (the data is tiny), cloud deletion of threads removed by a restore-from-snapshot (they come back on the next read, as for other collections).

**Known limits of B0 (from the 2026-11-11 review; fixed items listed in the commit):**
- Conflict resolution between devices is last-write-wins per thread, by each device's own `updatedAt` clock. Two devices editing different fields of one thread keep only one set of edits. Fine while threads are rarely edited; add `plot_threads` to the field-level merge allow-list when B1 makes them user-editable.
- The project-delete cleanup is a trigger on `public.novels`. It also fires for any future code that deletes and re-creates a project row, and it is the only thing that clears threads on a replace-all restore. A restore of a backup taken before threads existed therefore removes the account's threads (locally and in the cloud), because the backup has none.
- A thread push that races a project delete can leave a cloud row for a project that no longer exists; the cloud read ignores threads whose project this device does not have.
