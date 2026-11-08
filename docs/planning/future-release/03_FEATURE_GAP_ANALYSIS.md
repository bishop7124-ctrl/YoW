# 03 — Feature Gap Analysis

Date: 2026-11-08. Each proposed capability is compared with verified code (see doc 01). Verdicts: **Exists**, **Partial**, **Missing**, **Don't build**.

## Summary table

| Proposed | Verdict | What exists | Real gap | Recommended home |
| --- | --- | --- | --- | --- |
| Native continuity engine | **Missing** (data mostly present) | Ages, years, eras, family ids, event links | No validator; scenes lack structured links | Unified "Story Check" panel (doc 06) |
| Plot Planner | **Partial** | Acts/chapters/scenes, `storyEvent` tag, journey beats, pacing chart | Threads, structure templates, beat purpose/tension/setup-payoff | **Extend Outline** with Structure and Threads views (not a new module) |
| Trope Bible | **Missing** | Lore categories/tags, Ideas | Catalogue, status, links | Lore-backed "Tropes" category first; catalogue later inside Plot Planner |
| Research workspace | **Missing** | Ideas (text, tags, entity links, convert), images only in storage | URL/source fields, attachments | Lightweight "Reference" type beside Lore; no file uploads in v1 |
| Goals & progress | **Mostly exists** | Daily goal+history+streak, heatmap, momentum, project/series word goals | Weekly/monthly, deadline/ETA, sprints, project-level UI | Extend Inspector Progress + Insights |
| Character knowledge | **Missing** | Journey beats (link scene/event) | Fact/knows/learned-when model | Later; new document table linked to scenes/events |
| Interactive manuscript references | **Partial** | `entityMap`, "In this scene" chips, reference panel | Aliases beyond characters, explicit links, hover | Extend editor with explicit links; keep auto-detect passive |
| Canon Explorer | **Partial** (E) | `worldLinks.js` backlinks, lore related index, reference panel | No unified connections view | A "Connections" panel on each entity, not a module |
| Scene version history | **Partial** (important gap) | 50 snapshots/scene, restore, pre-replace snapshot | Device-local only; no named snapshots; no diff | Improve existing |
| Manuscript import | **Exists** | DOCX/TXT/MD, structure detection, review step, archive limits | Import preview diff vs existing, rollback story | Polish; verify rollback |
| Cross-project/global search | **Missing** | Per-module search | Global search / quick switcher | Add (high value, native) |
| Corkboard | **Mostly exists** | Outline drag/reorder, Ideas kanban | Index-card scene view | Low priority view |
| Readability stats | **Exists** | Flesch + grade in Insights | — | — |
| EPUB export | **Missing** | DOCX/PDF | EPUB writer | Low; DOCX→EPUB conversion by users is common |
| Beta reader management | **Missing** | — | — | **Don't build** |
| Writing challenges | **Missing** | Streak | — | **Don't build** (goals suffice) |
| Custom templates | **Partial** | `TemplateModal`, `manuscriptTemplates.js`, project-type starter outlines | User-defined | Later |
| Onboarding / samples | **Exists** | Wizard, checklist, tour, sample project | Native-first messaging | Polish |

## Answers to the brief's direct questions

### Q1. How much already exists?
Roughly: **Goals ~70%**, **Import ~90%**, **Scene history ~60% (local only)**, **Readability 100%**, **Manuscript references ~50%**, **Canon Explorer data ~60% (UI missing)**, **Plot Planner ~25%**, **Continuity 0% native**, **Tropes 0%**, **Research ~10%**, **Knowledge 0%**. The percentages are judgement, not measurements. Genuine gaps: native continuity, threads/structure, tropes, research, knowledge, global search. Mere exposure/improvement: goals, canon connections, references, history, import.

### Q3. Is a dedicated Plot Planner justified?

Current precise capability: `storyEvent` is **one label per act/chapter/scene** drawn from a per-project-type list (`projectTypes.js`), plus synopsis and character-journey beats linked to scene/chapter/event. No purpose, no tension, no thread membership, no setup→payoff dependency, no structure template (except the per-type starter outline).

| Option | Pros | Cons |
| --- | --- | --- |
| A. New top-level module | Clear brand, room to grow | Second place to see the story; duplicate-outline risk; nav bloat (already 12+ sections) |
| B. **Extension of Outline (Structure + Threads views over the same acts/chapters/scenes)** | One data model; no duplicate outline; fits "Planning" group; lowest migration risk | Outline screen gets denser; needs good view switching |
| C. New view inside manuscript workspace | Close to writing | Planning is used before writing; discoverability worse for planners |
| D. Broader restructure of story planning | Cleanest eventually | High risk to live users; not justified by evidence |

**Recommendation: B.** Add (1) `structureTemplateId` + beat slots mapped onto existing acts/chapters/scenes, (2) `plotThreads` (small document table or field on the novel) and per-scene/per-chapter `threadIds` plus `threadRole` (setup/development/payoff), (3) optional `tension` 1-10 and `purpose` text on scene/chapter. Views: Structure (template slots vs coverage), Threads (swimlanes: thread × chapter), Tension line. "Unresolved threads" and "long gaps" are *native computed* from thread membership, no AI. Compatibility: all additive optional fields; existing projects unaffected until used.

### Q4. Where should Trope Bible, Research, Goals live?
- **Goals → existing Progress (Inspector) + Insights.** Not a module.
- **Tropes → Lore-backed.** A `Trope` lore category with `status` (intended/established/subverted/avoided) and links already supported by Lore (`characterIds`, `locationIds`, `loreIds`). A built-in starter list can be offered as "add from library". If the Plot Planner ships, a trope can additionally attach to a thread/scene. Not a standalone module (nav bloat; no evidence of demand).
- **Research → "Reference" beside Lore, conceptually distinct.** Same editor pattern as Lore with `sourceUrl`, `sourceNote`, `status`; link to entities; *convert to Lore* via the existing Ideas `ConvertModal` pattern. Real-world vs in-world is kept by type and visual badge. **No file/PDF upload in v1** (see §Research below).

### Q8. What to deliberately avoid
Beta-reader management, writing challenges/social gamification, a 500-trope scraped catalogue, a second outline, keyword-based "native prose contradiction" detection, automatic AI runs, native stylometry pretending to replace Style Consistency, public sharing/collaboration (not in scope; large security surface), and any EPUB/publishing workflow before core gaps are closed.

## Feature detail

### Goals and writing progress (accuracy analysis)
How history is stored: each scene carries `wordHistory` = list of `{date, words, timestamp}` where `words` is the scene's *total* at that moment (`manuscriptUtils.js:196-206`, `useStore.js:396-402`). Daily words = for each scene, `max(0, today's last total − previous day's last total)` summed (`manuscriptUtils.js:402-431`; the dashboard has a second, slightly different implementation at `ProjectDashboard.jsx:122-146` — **duplicate logic that can disagree**).

Known inaccuracies (document, don't hide):
1. **Net, not gross.** Writing 500 words and deleting 500 the same day shows 0.
2. **Imports count as writing.** A DOCX import creates scenes with large totals; first history entry has `previous = 0` so the whole import lands on the import day unless excluded. *Verify in code before building weekly/monthly goals; fix by marking import-created history entries.*
3. **Scene deletion removes its history**, lowering past days only if recomputed from remaining scenes (history is derived from live scenes, not an append-only ledger). Past totals can silently change.
4. **Moving/merging scenes** is not tracked.
5. `wordHistory` is in `IGNORED_FIELDS` for conflict detection (`cloudSyncReconcile.js:23`), so multi-device merges may drop history entries. Medium confidence.

Recommendation: derive weekly/monthly from the same daily series (no new storage), **unify the two daily-word implementations** into one tested util, exclude import day, and label as "net words". Only introduce an append-only `writing_days` ledger if the owner wants gross-word accuracy; that is a new table with its own migration and should be a separate decision. Never back-fill history from current totals.

New, lightweight additions: weekly/monthly goal, project deadline + projected finish date (simple linear from trailing 14-day average, shown as an estimate with its basis), client-only sprint timer (store sprint results only if the owner wants history; otherwise local). No push notifications; at most an in-app, dismissible nudge.

### Research workspace: storage economics
Existing upload path is **image-only** (`uploadUserMedia.js` handles webp/png/jpeg through `optimizeImage`, quota-checked via `storageQuota.js`, private bucket with signed URLs, RLS in `20260727_user_media_storage.sql`). There is no validated document pipeline. PDFs/DOCX would need MIME + magic-number validation, size caps, virus-scan decision, quota accounting and export inclusion (`embedProjectMediaForBackup`). Free quota is 250 MB, paid 8 GB. Recommendation: v1 = URL + citation + notes + images (reuse existing path). Document attachments = separate, later decision with a per-file cap (e.g. 10 MB, to be approved) and paid-only, flagged as a **business decision**.

### Trope Bible: content and licensing
Do not copy TV Tropes (its text is licensed under a non-commercial licence — confirm with counsel before any reuse; do not assume). Author an original starter set (suggest 60–100 tropes, one-sentence original definitions, genre tags, "subversion ideas"), shipped as a static JSON in the app bundle with a version number so it can be corrected without migration; user copies create Lore entries that the user owns. Quality over count. AI trope analysis is optional and uses the BYOK path.

### Character knowledge
Model: `knowledge` document = `{id, novelId, characterId, fact (text or loreId), learnedAtSceneId?, learnedAtEventId?, via, confidence: believed|verified|false-belief, supersedes?}`. Native validation possible *only* on explicit data: "character references X in scene S but learns X in later scene T" is checkable if the writer records both. Not inferable from prose. Defer to Release C; depends on structured scene↔character links.

### Interactive manuscript references
`entityMap` (`Manuscript.jsx:482-505`) is built from names/keywords; only characters have `keywords`; later entries silently overwrite earlier ones on identical keys (ambiguity is invisible). Safe path: (1) add `aliases` to all entity types, (2) show collisions as a warning in the entity editor, (3) allow **explicit** links (`[[Name]]`-style or selection→"Link to…") stored as scene-level `entityRefs` with ids so renames don't break, (4) hover preview using existing `preview` strings. Keep auto-detection passive (chips only), never underline-highlight the whole manuscript by default (performance and noise on 120k-char scenes: `LARGE_SCENE_CHAR_THRESHOLD`).

### Scene version history
Gaps: local-only; 50-version cap; throttled; no names; no diff; no cross-device restore. Options: (1) a `scene_versions` document table with retention (e.g., last 20 + daily for 30 days) written on the existing cloud-save path — storage cost estimate needed (prose ≈ 6 KB/1,000 words; 20 versions × 100k words ≈ 12 MB per project worst case, before compression); (2) include history in ZIP backup. Distinguish from technical DB backups (unknown from repo — document as an owner question). Priority: high because it protects the product's most precious data and helps retention.

### Manuscript import
Largely complete. Remaining: (a) confirm that a failed import cannot leave a half-imported project (`projectImportDepthRef`/`projectImportSceneIdsRef` in `useStore.js` suggest a staged approach — verify), (b) preview of structure before commit exists in the discovery modal; ensure parity in DOCX modal, (c) duplicate detection when re-importing the same file.

### Cross-entity search
Missing and cheap: build an in-memory index over characters, locations, lore, factions, timeline, history, ideas, scenes (title/summary/content) with a Cmd/Ctrl-K palette that navigates through existing section routing. No schema change, no AI. High daily-use value; also the natural home for "recent items".

## Consolidation opportunities
- Timeline vs History (already mirrored 1:1): present as one "Chronicle" with two lenses (doc 07).
- Two daily-word implementations → one util.
- Two import entry points (DOCX modal, Discovery modal, AI import) → single "Import" flow with an optional AI step.
- Schedule vs Timeline chronologies → bridge: allow a schedule event/scene to carry a Timeline year (optional field).
