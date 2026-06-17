# YOW Product Roadmap

This is the canonical planning source for Your Own World.

All feature planning, launch triage, blocker decisions, and roadmap changes should be made here first. Other planning artifacts must either link back to this file or be treated as historical/generated output.

## Agent Instructions

Codex, Claude, and any other project agent should use this file as the single planning document.

- For every meaningful project change, update this roadmap in the same turn when the change affects scope, status, blockers, bugs, next actions, ownership, or launch readiness.
- When QA is deferred, add the required checks to [docs/QA_PLAN.md](docs/QA_PLAN.md) in the same turn and keep building from this roadmap.
- When the work requires user action, user testing, a product decision, credentials, external setup, or any manual verification that cannot be completed by the agent, provide the user with clear step-by-step instructions at that point in the process.
- Do not create a separate roadmap, backlog, launch list, or planning document unless the user explicitly asks for an export or temporary working draft.
- Do not add new MVP launch features unless they replace an existing MVP item, fix a launch blocker, or are required for legal, payment, auth, data safety, or launch-critical expectation setting.
- Put non-blocking new ideas in Post-Launch or Icebox instead of silently expanding MVP.
- When a completed task closes or changes a roadmap item, update its status and next action before finishing.
- If no roadmap update is needed, briefly say why in the final response.

## Phase 0 Rules

### Master Roadmap

Status: Active

Acceptance criteria:

- One canonical roadmap exists with Active, MVP Required, Post-Launch, Icebox, and Bugs sections.
- Scattered planning notes are moved here or linked from here.
- Generated artifacts, public roadmap database seeds, and acceptance-matrix documents do not override this file.

Linked/historical sources:

- [YOW_MVP_Acceptance_Criteria_Matrix.docx](../YOW_MVP_Acceptance_Criteria_Matrix.docx) is the generated acceptance-matrix document.
- [scripts/create_yow_mvp_matrix.py](../scripts/create_yow_mvp_matrix.py) is the script that generated the initial matrix content.
- [supabase/migrations/20260521_roadmap.sql](../supabase/migrations/20260521_roadmap.sql) seeds the public-facing app roadmap. It is display data, not the product planning source of truth.

### Feature Intake Freeze

Status: Active

Product stage definition:

- Public beta is the build-and-test period. It may expose incomplete workflows if they are clearly labeled, data-safe, and not misleading.
- Final launch is the fully specced website. The intent is to implement the desired full product now, during beta, and avoid relying on continual post-launch development to finish core feature promises.
- "Launch blocker" still means the issue must be fixed before any public paid/final launch. During beta, the same blocker policy is used to decide whether a beta build is safe enough to keep using.

No new launch feature enters MVP/final-launch scope unless it satisfies one of these rules:

- It replaces an existing MVP item of equal or larger scope.
- It fixes a launch blocker.
- It is required by legal, payment, auth, data safety, or launch-critical expectation setting.

Parking-lot process:

- New ideas go to Icebox by default.
- Ideas that clearly improve the product but are not launch-critical go to Post-Launch.
- Any proposed MVP addition must name the MVP item it replaces or the launch blocker it resolves.
- If the replacement/blocker cannot be named, the item stays out of MVP.

Launch blocker definition:

Only data loss, broken auth, broken save, broken export, unusable editor, unusable responsive layout, or missing legal/payment essentials should block MVP launch.

## Launch Blocker Policy

Status: Adopted

A launch blocker is a defect or missing requirement that would make the paid/public launch unsafe, unusable, or materially misleading. Use this policy before every triage pass.

Blocker categories:

| Category | Blocks Launch When | Examples |
| --- | --- | --- |
| Data loss | User-created project, manuscript, or worldbuilding content can disappear, overwrite incorrectly, or fail to persist without a clear recovery path. | Autosave loses recent writing; switching scenes overwrites text; deleting a project removes unrelated records. |
| Broken auth | Users cannot reliably sign up, sign in, sign out, restore sessions, or recover from common auth errors. | Fresh account cannot access the app; returning user gets stuck; expired session breaks navigation. |
| Broken save | Core user actions appear successful but do not persist after refresh, navigation, logout/login, or project switching. | Character edits vanish; project settings reset; chapter order is not saved. |
| Broken export | Promised export paths fail, omit critical content, corrupt ordering, or produce unusable files. | Manuscript export misses scenes; project archive cannot be opened; export crashes on realistic projects. |
| Unusable editor | The writing/editor workflow cannot support normal drafting without severe instability or blocked controls. | Cannot type reliably; cursor jumps constantly; scene selection breaks; long scenes make the editor unusable. |
| Unusable responsive layout | Core launch workflows cannot be completed on required mobile/tablet/desktop widths. | Save/export buttons overlap or disappear; editor cannot be used on mobile; modals trap users off-screen. |
| Missing legal/payment essentials | Purchase, account, pricing, privacy, terms, cancellation, or launch promise language is absent, broken, or materially misleading. | Paid plan promises unsupported features; checkout cannot complete; legal pages missing from purchase flow. |

Non-blockers:

- Cosmetic polish that does not prevent core workflows.
- Nice-to-have features without a launch promise.
- Advanced workflow refinements that can be moved to Post-Launch.
- Edge cases that have a clear workaround and do not risk data, payment, access, or legal trust.
- New feature ideas that do not replace an MVP item or resolve a blocker.

Triage labels:

| Label | Meaning | Required Action |
| --- | --- | --- |
| Blocker | Fits one of the blocker categories above and prevents launch. | Fix before launch or change the launch promise/scope so it no longer blocks. |
| Conditional | Could block launch only if it is part of the paid/public promise or affects a required workflow. | Decide whether it is launch scope; otherwise move to Post-Launch. |
| Non-blocking MVP | Needed for a good MVP but not launch-stopping if rough. | Ship if feasible after blockers are under control. |
| Post-Launch | Valuable but not required for launch safety or honest launch promises. | Park in Post-Launch with a clear revisit point. |
| Icebox | Interesting, unvalidated, or not yet tied to a launch outcome. | Park until there is a stronger product reason. |

Triage rule:

Every bug or proposed MVP change must answer: does this create data loss, broken auth, broken save, broken export, unusable editor, unusable responsive layout, or missing legal/payment essentials? If not, it is not a launch blocker.

## Active

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Stop the Chaos | Master roadmap | One canonical roadmap exists with Active, MVP Required, Post-Launch, Icebox, and Bugs sections; all scattered notes are moved or linked. | Yes | Active | Keep this file as the only planning source. | Product |
| 0. Stop the Chaos | Feature intake freeze | No new launch features enter MVP unless they replace an existing item or fix a launch blocker. | Yes | Active | Enforce the decision rule and parking-lot process above. | Product |
| 1. Scope Freeze | Exact MVP list | The MVP feature list is locked, versioned, and mapped to acceptance criteria in this roadmap. | Yes | Active | Update only through explicit roadmap decisions. | Product |
| 1. Scope Freeze | Fully stacked launch scope | Public beta may expose beta/limited workflows, but final launch requires the fully specced project-type stack: all 6 active project types (Novel, Novella, Short Story, D&D Campaign, Tabletop Campaign, Comic/Graphic Novel) must have their promised discipline-specific workflows, safe persistence, and stable exports. Play, Screenplay, TV Series, and Video Game have been retired from active scope, removed from the UI, and removed from all roadmap scope. Their constants are preserved in RETIRED_PROJECT_TYPES as a code-level backup only. | Yes | In progress | Use beta labels while building, then complete discipline-specific workflow waves for the 6 active types before final launch. | Product/Engineering |
| 2. Define Good Enough | Launch blocker policy | A blocker is limited to data loss, broken auth, broken save, broken export, unusable editor, unusable mobile layout, or missing legal/payment essentials. | Yes | Adopted | Apply the blocker policy to every triage pass before changing MVP scope. | Product/QA |
| 2. Define Good Enough | QA automation baseline | A single local QA command runs the basic release-safety checks before deeper browser smoke tests. | Yes | Automated in CI | `npm run qa` runs lint, production build, and load check. `npm run qa:smoke` starts Vite in offline mode and now covers create/write/refresh/export/restore, DOCX/PDF export downloads, all configured project-type creation with starter structure/default sections, and mobile/tablet writing reachability. GitHub Actions runs static QA plus named smoke jobs on push, pull request, daily schedule, and manual dispatch, with Playwright annotations and artifacts uploaded on failure. Current Codex macOS sandbox blocks Chromium launch at Mach-port registration, so browser smoke is verified through a normal local terminal or CI runner. React compiler advisories remain as warnings. | Engineering/QA |
| 2. Define Good Enough | Manual QA checklist | A complete manual QA checklist exists covering all 28 test sections: auth, dashboard, manuscript editor (all 5 live project types), worldbuilding (characters, locations, lore, timeline), map, family tree, factions, ideas, schedule, character builder, exports (ZIP/DOCX/PDF/restore), AI tools, account settings (themes, storage, AI provider), pricing, URL persistence, modals, studio, novel reader, responsive layout (375px/768px/1280px+), public/marketing pages, large-project stress test, data safety edge cases, and legal/compliance. Each item has pass/fail/skip status, freeform notes, and export to Markdown, HTML report, JSON, or CSV. State persists in localStorage. | Yes | Complete | Open [docs/qa-checklist.html](docs/qa-checklist.html) directly in a browser as the manual test runner before each release. | QA |
| 2. Define Good Enough | Deferred QA plan | A single deferred QA plan accumulates every required QA item while development continues, so launch-readiness verification can happen together later without losing coverage. | Yes | Active | Add new required checks to [docs/QA_PLAN.md](docs/QA_PLAN.md) whenever implementation changes behavior. | Product/Engineering/QA |

## MVP Required

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Scope Freeze | Project-type access model | All 6 active project types are selectable in create/edit flows. Comic/Graphic Novel is marked beta/limited. Unknown imported types fall back safely to Novel. Retired types (Play, Screenplay, TV Series, Video Game) are not shown in the UI; their constants exist in RETIRED_PROJECT_TYPES as a code-level backup only and must never reappear in the UI or marketing copy. | Yes | Beta-live model implemented, scope reduced to 6 types | Automated smoke verified active project types, live/beta stages, structure labels, section defaults, and ZIP/DOCX/PDF blob generation. Browser smoke verified homepage beta-live expectation copy. Still needs authenticated/offline UI pass for create/open/export clicks. | Engineering/QA |
| 3. Core Polish | Save and close behavior | Closing editors, panels, and modals never drops unsaved manuscript or worldbuilding changes; prompts appear only when useful. | Yes | Implemented, needs QA | Manuscript editor flushes on blur/unmount; Edit modals (project, series) prompt "Discard changes?" when dirty; click-outside closes all modals. Run close/refresh/logout tests across manuscript, lore, characters, locations, and timeline. | Engineering/QA |
| 3. Core Polish | Dashboard consistency | Dashboard lets users create, open, rename, and delete projects without layout breaks or ambiguous states. | Yes | Implemented, needs QA | First-run empty account hero now uses a welcoming "Begin your first world" start state with New Project, Import with AI, and a three-step quick tour; single-project auto-activation; series dropdown on create; series filter on StatusQueue; tile click opens project; project cards show a hover/focus Select project cue; active project panel shows a hover/focus Open project cue and displays cover photos without blend filtering; star button toggles active focus; series-contained projects are selectable as active projects from the library even when no standalone projects exist; series project cards are grouped under their parent series and the library content width matches ActiveProjectHero; card hover stats trimmed (scenes removed); ActiveProjectHero layout (library snapshot top, project details bottom); all 3 card buttons unified to 30×30 circle; project dashboard now separates Overview basics from Insights analytics, with momentum, scene health, draft balance, longest-scene, worldbuilding coverage cards, responsive tile packing for large screens, and human-readable project status labels instead of raw status IDs; project status picker added to internal project settings panel; current word count added to Overview Basics ledger; word count/target/completion stats added to the overview hero header; project overview summary boxes (Project, Manuscript, Reference, Recent Draft) now display in a single four-column row. Test empty account first-run hero, one project, all-projects-in-series, multiple series, many projects, overview/insights switching across desktop/tablet/mobile widths, project status label display, status picker in internal settings, word count stats in hero, new project create → auto-navigate into project, and deleted-project recovery expectations. Project type is locked at creation (type picker removed from EditProjectModal; type preserved on save). | Engineering/QA |

Dashboard consistency implementation note (2026-06-14): Project overview now uses a cover-aware editorial hero with a dedicated manuscript progress feature card, warmer creative workspace cards, writer-facing section labels, and recent writing fallbacks/context. Browser-checked at desktop, tablet, and 390px mobile widths; still needs normal authenticated QA with real project cover images and existing user data.

Dashboard consistency follow-up note (2026-06-14): Insights view now shares the refreshed overview visual language with a warmer "Writing Rhythm" analytics panel, theme-aware analytics cards, and a progress-card sizing fix for larger word counts so current words, target, and completion do not overlap.
| 3. Core Polish | Responsive scaling | The core writing and dashboard flows are usable on mobile and tablet widths; no key controls overlap or disappear. | Yes | Mitigation added, needs QA | Mobile manuscript sidebar fixed to bottom tab bar (≤640px); panel opens as 58vh overlay; writing area gets full width. Project/reference boxes expand on wide screens (max-width 1800px). Series dashboard top bar now stays layered above its sticky tab bar so the user menu is not obscured. Public top navigation is standardised across React and static marketing pages. Added 375px fixes for homepage horizontal overflow, active project/series card layering, project top-nav crowding, manuscript toolbar wrapping, series title priority/tab fitting, schedule month width, and timeline header density. Run 375px viewport pass across homepage, library, series dashboard, manuscript, schedule, and timeline. | Design/QA |
| 4. Manuscript | Stable manuscript editor | Users can write, edit, split, and return to scenes without content loss, cursor-breaking errors, or major lag. | Yes | Implemented, needs QA | Perform long-scene, rapid typing, refresh, navigation, and split-scene tests. | Engineering/QA |
| 4. Manuscript | Chapter organization | Users can add, rename, delete, reorder, and move chapters; structure persists after refresh and login. | Yes | Implemented, needs QA | Acceptance-test chapter operations and deletion warnings. | Engineering/QA |
| 4. Manuscript | Scene organization | Users can add, rename, delete, reorder, move, and select scenes; status and notes persist. | Yes | Implemented, needs QA | Test drag/drop, empty chapters, split scenes, and scene notes. | Engineering/QA |
| 4. Manuscript | Autosave | Scene content saves within a predictable delay and survives refresh, tab close, logout/login, and network recovery where supported. | Yes | QA passed | Local scene drafts write local storage on every manuscript input event and mark the browser copy as fresh; refresh/import prefers fresher browser data over older account data and pushes it back up. User QA confirmed immediate refresh now preserves changes without waiting for the account debounce. | Engineering/QA |
| 4. Manuscript | Word count tracking | Project, chapter, and scene word counts update accurately enough for writing progress and do not slow typing. | Yes | Implemented, needs QA | Word count target field added to both the library project settings modal and the internal project settings panel; completion percentage is auto-calculated from words written ÷ target and replaces the manual progress % field when a target is set. Current word count, target, and completion % displayed in the project overview hero. Verify counts on paste, delete, scene moves, and large manuscripts; verify target/completion display and that manual progress field hides when target is set. | Engineering/QA |
| 5. Worldbuilding | Character system | Users can create, edit, delete, search, and relate characters to the active novel; data persists correctly. | Yes | Forward-series sync implemented, needs QA | Character create/edit/delete now writes local storage synchronously before React state scheduling; deleted characters are removed from character relationships, lore links, and timeline links. Series-synced characters resolve forward in reading order, later-project edits fork forward without changing earlier projects, and deletes ask whether to remove from all synced projects or only the current project. Test instant-refresh CRUD, relationship cleanup, empty state, many-character performance, project scoping, forward-series overrides, and scoped deletes. | Engineering/QA |
| 5. Worldbuilding | Locations | Users can create, edit, delete, search, and link locations to the active novel/world context. | Yes | Forward-series sync implemented, needs QA | Locations now use `saveSeriesSyncedItem`/`deleteSeriesSyncedItem`: later-project edits fork forward without changing earlier projects; scoped deletes propagate to lore `locationIds` and timeline `linkedLocations` across the full deleted-IDs set. Test instant-refresh CRUD, project scoping, forward-series overrides, scoped deletes, and link cleanup in timeline/lore. | Engineering/QA |
| 5. Worldbuilding | Lore encyclopedia | Users can create, edit, delete, categorize, search, and retrieve lore entries tied to the active project. | Yes | Forward-series sync implemented, needs QA | Lore create/edit/delete now writes local storage synchronously before React state scheduling. Series-synced lore, factions, locations, ideas, timeline, and world-history records resolve forward in reading order; later-project edits fork forward without changing earlier projects; dashboard counters include inherited series material. Test instant-refresh lifecycle, empty states, search/filtering, character/location links, deleted-link cleanup, forward-series overrides, scoped deletes, counters, and export inclusion. | Engineering/QA |
| 5. Worldbuilding | Timeline and history linking | Timeline events and world-history entries can be created, edited, linked/unlinked, and persist by project. | Yes | Forward-series sync implemented, needs QA | Timeline/history create/edit/delete/link/unlink now writes local storage synchronously before React state scheduling. WorldHistory groups timeline entries by era; Timeline shows them chronologically. Orphan worldHistory entries are migrated into timeline on importData. Series-synced timeline/history entries resolve forward in reading order and delete prompts support current-project-only versus all-synced removal. Test create/edit/delete round-trips across both sections, link/unlink behavior, instant-refresh persistence, era grouping, forward-series overrides, scoped deletes, and inherited dashboard counts. | Engineering/QA |
| 6. Exports & Safety | Project export | Users can export a complete project archive containing manuscript and worldbuilding data in a restorable format. | Yes | Implemented, needs QA | Test export contents for small, medium, and large projects. | Engineering/QA |
| 6. Exports & Safety | Manuscript export | Users can export manuscript content in a readable document format with chapters/scenes in the correct order. | Yes | Implemented, needs QA | Test .docx export for formatting, ordering, empty scenes, and large manuscripts. | Engineering/QA |
| 6. Exports & Safety | Backups | Backup = cloud sync (Firestore, active for logged-in users) + manual ZIP export. No scheduled backup required for MVP. Definition is final. | Yes | Implemented, needs QA | Test that logged-in users have their data in Firestore and that the ZIP export contains all project data. | Engineering/QA |
| 6. Exports & Safety | Restore flows | Users can restore a project from a YOW backup ZIP or import from a NovelCrafter export ZIP via the unified Import menu in the library top bar. Both flows are handled by the Import modal: YOW exports trigger the existing populateYowProject path (full ID remapping, all sections); NovelCrafter exports are auto-detected by folder structure (characters/, locations/, lore/, items/, other/, novel.docx), parsed with `tryReadNovelCrafterZip`, and populated via `populateNcProject` — manuscript chapters become scenes, items route to lore, other/snippets/notes become raw idea captures. The library top bar has a single Import ▾ dropdown (AI Import and Import ZIP) replacing the former separate buttons. A pre-import section-selection UI shows counts for each data type. | Yes | Implemented, needs QA | QA: (1) Export a YOW project, use Import ZIP to restore it, verify all content round-trips under a new project entry. (2) Drop a NovelCrafter full export ZIP, verify characters/locations/lore/manuscript/other entries all import correctly — manuscript chapters become scenes, other entries appear as raw captures on the Ideas board. | Engineering/QA |
| 7. Launch | Authentication | Sign up, sign in, sign out, session restore, and password/error states work reliably across refreshes. | Yes | Implemented, needs QA | Signup now shows a human-readable error ("An account with this email already exists. Try logging in instead.") instead of the raw Supabase message when a duplicate email is submitted. Run auth regression pass with fresh user, returning user, invalid credentials, duplicate email signup, expired session, direct `/login` and `/signup` URLs, and password reset returning to `/login`. | Engineering/QA |
| 7. Launch | Autosave reliability | Autosave has explicit test coverage or manual proof for refresh, navigation, rapid typing, and multi-scene work. | Yes | High-risk QA | Make this the first launch-readiness test pass. | Engineering/QA |
| 7. Launch | Large project performance | Dashboard, manuscript, search, and export remain usable on a realistic large novel project. | Yes | Needs QA | Create/load a stress project and measure obvious failures. | Engineering/QA |

## Project Type Launch Scope

The public beta must be honest about the project-type stack. Beta project types may be selectable before their full discipline-specific engine exists, but the UI and marketing copy must clearly say what is limited. Final launch, however, means the fully specced website: each project type needs its own structure, language, defaults, export expectations, QA scenarios, and promised discipline-specific workflow.

| Project Type | Unique Launch Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- |
| Novel | Long-form prose workflow supports acts, chapters, scenes, manuscript drafting, worldbuilding, timeline/history, character systems, project export, and manuscript export. | Yes | Active baseline | Continue QA against autosave, editor stability, exports, and large-project performance. | Product/Engineering/QA |
| Novella | Medium-length prose workflow. Structure: Part → Chapter → Scene. Lighter default sections (outline, characters, locations, lore, ideas, schedule, timeline). Type-specific story event indicators and a 30,000-word default target defined. Shares the manuscript editor with Novel. Enabled at launch. | Yes | Enabled, needs QA | QA: create a Novella project, verify Part/Chapter/Scene labels appear in structure sidebar, verify lighter default section set, verify default word target appears, verify export works. | Engineering/QA |
| Short Story | Short-form prose workflow. Structure: Part → Section → Scene. Compact default sections matching Novella set. Type-specific story event indicators and a 5,000-word default target defined. Shares the manuscript editor. Enabled at launch. | Yes | Enabled, needs QA | QA: create a Short Story project, verify Part/Section/Scene labels, verify default sections, verify default word target appears, verify export. | Engineering/QA |
| D&D Campaign | D&D tabletop campaign. Structure: Story Arc → Session → Encounter. Default sections include map, factions, worldhistory, and Character Builder. Type-specific DM story event indicators and D&D-flavoured positioning/prompt context defined. Shares editor. Enabled at launch. | Yes | Session engine + Character Builder implemented, needs QA | QA: create a D&D Campaign project, verify Arc/Session/Encounter labels, structured session prep/recap fields, all default sections including map, D&D-flavoured type description and AI prompt behavior, campaign export inclusion, and Character Builder Party room (wizard, sheet, dice roller). | Engineering/QA |
| TTRPG Campaign | System-neutral tabletop campaign. Structure: Story Arc → Session → Encounter. Same structural defaults as D&D but with system-neutral positioning, labels, indicators, and prompt context. Character Builder included in default sections. Enabled at launch; merge deferred because roadmap currently requires both launch types and migration would add launch risk. | Yes | Session engine + Character Builder implemented, needs QA | QA: create a TTRPG Campaign project, verify Arc/Session/Encounter labels, structured session prep/recap fields, system-neutral type description and AI prompt behavior, campaign export inclusion, and Character Builder Party room (wizard, sheet, dice roller). | Engineering/QA |
| Comic / Graphic Novel | Sequential art. Structure: Volume → Issue → Page → Panel. Comic Panel Engine implemented 2026-06-13. Final launch requires QA pass before Comic/Graphic Novel can be marketed as fully live. | Yes | Implemented, needs QA | QA per the QA Plan in the PRD below: CRUD, persistence (refresh/navigate/logout), export round-trip (ZIP/DOCX), responsive (375px/768px/desktop), data safety (delete chains, restore into existing account), performance. | Engineering/QA |

## PRD: Comic Panel Engine

### Product Summary

The Comic Panel Engine turns Comic/Graphic Novel projects from a renamed prose outline into a sequential-art planning workspace. It must let writers plan volumes, issues, pages, and panels; capture the writing and art-direction details needed by a solo creator or writer/artist team; and export a readable comic script and project backup without data loss.

This is final-launch scope for Comic/Graphic Novel. Until this engine is implemented and QA-passed, Comic/Graphic Novel remains beta/limited in product copy.

### Problem

The current Comic/Graphic Novel workflow supports comic-specific project type labels and templates, but page planning still depends on the shared manuscript scene model. That is not enough for comics because creators need to think in pages, panel counts, panel beats, visual composition, captions, speech balloons, sound effects, and page-turn reveals. Without a real page/panel model, YOW risks over-promising a format-specific workflow that cannot support normal comic scripting.

### Target Users

- Writer planning a comic issue or graphic novel script before handing it to an artist.
- Writer-artist thumbnailing page beats and visual direction before drafting final pages.
- Editor or collaborator reviewing whether a page has too many panels, unclear dialogue, missing art notes, or weak page turns.

### Goals

- Provide a comic-native structure: Volume → Issue → Page → Panel.
- Let users create, reorder, duplicate, edit, and delete pages and panels without losing linked content.
- Capture page-level intent: page title, summary, status, page type, page-turn intent, location/time, characters, visual notes, and production notes.
- Capture panel-level script detail: panel number, shot/framing, description, art direction, characters, dialogue, captions, SFX, lettering notes, continuity notes, and panel status.
- Give users a fast page-planning view that shows page count, panel count, dialogue density, status, and page-turn beats.
- Export comic projects in a readable script format and include panel data in ZIP backup/restore.
- Keep existing prose, campaign, and worldbuilding workflows unaffected.

### Non-Goals

- Finished comic page layout, drawing, image generation, lettering, or print prepress.
- Real-time collaboration or artist assignment workflows.
- Advanced thumbnail canvas editing.
- Branching versions of the same panel/page.
- Replacing existing character, location, lore, map, or timeline systems.

### Core User Stories

- As a comic writer, I can add pages inside an issue and panels inside each page so I can plan a complete issue.
- As a comic writer, I can enter dialogue, captions, SFX, and art notes per panel so my script is useful to an artist.
- As a writer-artist, I can set page-level visual direction and page-turn purpose so each page has a clear storytelling job.
- As an editor, I can scan pages for panel count, status, and dialogue load so I can spot pacing problems quickly.
- As a user, I can refresh, navigate away, export, restore, and log back in without losing page or panel work.

### Data Model Requirements

Reuse the existing project structure where practical: Volume maps to the existing first structural level and Issue maps to the second structural level. Add comic-specific records for pages and panels rather than overloading prose scene content.

Comic page record:

| Field | Requirement |
| --- | --- |
| `id` | Stable page ID for local state, cloud sync, export, and restore. |
| `novelId` | Project ID. Keep the existing naming convention unless the store is renamed globally. |
| `volumeId` | Parent Volume/act ID. |
| `issueId` | Parent Issue/chapter ID. |
| `order` | Numeric page order within the issue. |
| `title` | Optional page title or label. |
| `summary` | Page-level story beat. |
| `pageNumber` | Display page number, auto-derived by default and manually overrideable if needed. |
| `pageType` | Standard, splash, double-page spread, cover, backmatter, recap, credits, or custom. |
| `status` | Outline, Draft, Revised, Final. |
| `pageTurn` | None, reveal, cliffhanger, joke, emotional beat, action beat, or custom. |
| `locationIds` | Linked locations. |
| `characterIds` | Linked characters appearing on the page. |
| `timeOfDay` | Optional continuity field. |
| `visualDirection` | Page-level composition, mood, palette, reference, or style notes. |
| `productionNotes` | Editor/artist/letterer notes. |
| `createdAt` / `updatedAt` | Persistence and conflict visibility. |

Comic panel record:

| Field | Requirement |
| --- | --- |
| `id` | Stable panel ID. |
| `novelId` | Project ID. |
| `pageId` | Parent comic page ID. |
| `order` | Numeric panel order within the page. |
| `panelNumber` | Display number, auto-derived from order. |
| `layoutHint` | Full width, tall, wide, inset, borderless, close-up, establishing, action, reaction, or custom. |
| `shotType` | Establishing, wide, medium, close-up, extreme close-up, POV, over-shoulder, detail, or custom. |
| `description` | What the reader sees. |
| `artNotes` | Direction for composition, motion, expression, props, continuity, references. |
| `dialogue` | Ordered balloon lines with speaker, text, and optional emotion/lettering note. |
| `captions` | Ordered caption boxes with text and optional type: narration, location, time, thought, editorial. |
| `sfx` | Ordered sound effects with text and optional placement/style note. |
| `characterIds` | Characters visible or speaking in the panel. |
| `locationIds` | Optional panel-specific location override. |
| `continuityNotes` | Prop/costume/time continuity. |
| `status` | Outline, Draft, Revised, Final. |
| `createdAt` / `updatedAt` | Persistence and conflict visibility. |

### UX Requirements

- Comic projects show a Comic Planning workspace or comic-specific mode inside Manuscript.
- The left structure keeps Volume and Issue navigation.
- The main area shows a page list for the selected issue with compact status, panel count, page type, page-turn marker, and last updated time.
- Selecting a page opens a page editor with page-level fields and a sortable panel list.
- Panel editor supports fast creation of multiple panels, duplication, reordering, deletion, and collapse/expand.
- Dialogue, captions, and SFX are separate repeatable rows, not one undifferentiated text box.
- Page and panel records autosave with the same reliability expectations as manuscript scenes.
- Empty states are comic-specific: first page, first panel, and empty issue states should guide the user into page planning without marketing copy.
- Mobile/tablet layout must preserve page selection, panel editing, save state, and export access without overlapping controls.

### Export Requirements

ZIP backup/restore:

- Include comic pages and panels in project export JSON.
- Restore must remap page and panel IDs, preserve parent relationships, preserve linked characters/locations where possible, and avoid collisions with existing project IDs.
- Restore must not drop unknown future comic fields.

DOCX/PDF export:

- Comic projects export as a readable comic script organized by Volume, Issue, Page, and Panel.
- Each page includes page metadata, summary, page-turn intent, visual direction, and production notes when present.
- Each panel includes panel description, art notes, dialogue, captions, SFX, continuity notes, and linked character/location names where present.
- Export should include page and panel counts in issue summaries.
- Empty pages or panels should export with clear placeholders rather than failing.

### AI Requirements

- AI prompt context for Comic/Graphic Novel should include project type, issue/page/panel structure, current page summary, panel count, selected panel text, linked characters, and linked locations when available.
- AI actions may suggest panel beats, dialogue trims, page-turn ideas, or visual direction.
- AI must not overwrite page or panel content without explicit user action.

### Acceptance Criteria

- A user can create a Comic/Graphic Novel project, add at least one Volume, Issue, Page, and Panel, refresh immediately, and all content remains.
- A user can reorder pages within an issue and panels within a page; order persists after refresh and export/restore.
- A user can duplicate a page with all panels and then edit the duplicate without changing the original.
- Deleting a page deletes or safely detaches its panels with a clear confirmation.
- Deleting a linked character or location removes or labels broken comic links consistently with existing worldbuilding cleanup behavior.
- Comic page and panel data is included in local storage, cloud save, ZIP export, ZIP restore, DOCX export, and PDF export.
- Comic export remains readable when an issue has no pages, a page has no panels, or a panel has only notes and no dialogue.
- Existing Novel, Novella, Short Story, D&D Campaign, and TTRPG Campaign projects continue to create, edit, save, and export without comic fields appearing in their core workflows.

### QA Plan

**1. Structure CRUD**
- Create a Comic/Graphic Novel project; confirm Comic Planner opens instead of prose Manuscript.
- Add a Volume; confirm it appears in the sidebar.
- Add an Issue under the Volume; confirm it appears nested and is selectable.
- Double-click Volume and Issue titles to rename; confirm names save on blur/Enter.
- Delete an Issue that has pages; confirm pages are removed and sidebar updates.
- Delete a Volume that has issues; confirm all child issues and their pages are removed.

**2. Page CRUD**
- Select an Issue; add at least 3 pages; confirm they appear in the page list with ascending numbers.
- Edit page title, page type, status, page turn, summary, visual direction, production notes; refresh and confirm all fields persist.
- Duplicate a page; confirm the duplicate has the same fields and panels; edit the duplicate and confirm the original is unchanged.
- Delete a page that has panels; confirm the panels are removed and the list updates.

**3. Panel CRUD**
- Add 4 panels to a page; confirm they each expand and collapse independently.
- Fill in description, art notes, shot type, layout, status, continuity notes; add dialogue balloons (with speaker), captions (with type), and SFX rows; refresh and confirm all fields persist.
- Delete a panel; confirm it is removed and remaining panels are renumbered.
- Link and unlink characters from page and panel character chips; refresh and confirm the selection persists.

**4. Reference image upload (page and panel level)**
- Upload a PNG or JPG to a page reference; confirm it appears as a thumbnail; refresh and confirm the image persists.
- Upload a WebP or GIF; confirm it processes and saves correctly.
- Upload a PDF; confirm the iframe preview appears; confirm the "Session only — not saved on refresh" badge is visible; refresh and confirm the PDF preview is gone (session-only confirmed).
- Click Replace on an existing image and upload a different image; confirm the old image is gone.
- Click Remove; confirm the image is cleared and the drop zone returns.
- Repeat upload tests at the panel level.

**5. Persistence**
- Fill page and panel fields, add a page reference image, then immediately refresh; confirm all content and the image remain.
- Navigate to another project section (worldbuilding, etc.) and back to Manuscript; confirm the comic planner state is preserved.
- Sign out and sign back in; confirm all pages, panels, fields, and reference images are restored from cloud save.

**6. Export — ZIP round-trip**
- Export a comic project ZIP; open the ZIP and confirm `data/comic-pages.json` and `data/comic-panels.json` are present with correct content.
- Import the ZIP as a new project; confirm all volumes, issues, pages, panels, text fields, and reference images are restored under a new project entry.

**7. Export — DOCX**
- Export DOCX for a comic project; confirm a "Comic Script" section appears.
- Confirm Volume and Issue headings are present; confirm each page shows page number, metadata, summary, and visual direction.
- Confirm each panel shows description, art notes, dialogue balloons, captions, SFX, and continuity notes.
- Export a comic with an empty issue (no pages) and a page with no panels; confirm the export does not crash and renders clear placeholders.

**8. Non-comic project isolation**
- Open a Novel, Novella, Short Story, D&D Campaign, or TTRPG Campaign project; confirm the prose Manuscript opens normally with no comic fields visible.
- Export a non-comic project DOCX; confirm no comic script section appears.

**9. Responsive**
- Test at 375px: confirm sidebar, page list, and panel editor are accessible without overlapping controls; confirm the drop zone and image preview are usable.
- Test at 768px: confirm the three-panel layout adjusts correctly.
- Test at 1280px+: confirm the layout uses available space without clipping.

**10. Data safety**
- Delete a character that is linked to pages and panels; confirm the character is removed from `characterIds` on affected records or appears as a broken link consistently with existing worldbuilding cleanup behaviour.
- Restore a ZIP into an account that already has other projects; confirm existing projects are unaffected.
- Create a comic project, add pages and panels, then delete the entire project; confirm all comic page and panel records are removed from storage.

### Implementation Notes

- Prefer additive store fields such as `comicPages` and `comicPanels` over mutating the prose scene model into panel data.
- Keep comic page/panel records project-scoped and compatible with current local-first save and Supabase JSON persistence.
- Use existing project export/import ID-remapping utilities where possible.
- Gate comic-specific UI by `project.type === 'comic'`.
- Keep roadmap status as beta/limited until CRUD, persistence, export, restore, and responsive QA pass.

### Open Decisions

- Whether double-page spreads are modeled as one page record with `pageType: double-page spread` or as linked left/right page records.
- Whether page numbering should be per issue only or continuous across a graphic novel.
- Whether panel dialogue needs rich formatting in the first release or plain structured rows are sufficient.
- Whether visual reference images belong in this engine now or should remain in existing image/map/lore systems until post-launch.

## All Project Types Live Plan

Operating model: use beta to ship breadth safely, then deepen each discipline before final launch. A beta project type is allowed to be selectable if the UI labels it honestly, data persists safely, export does not crash, and missing workflow-specific features are not advertised as complete. Final launch requires the workflow waves below to be complete enough that the site can stand without planned continual development.

Current status: Wave 0 is implemented and partially smoke-tested. Wave 1 shared type foundation is implemented for type defaults, section defaults on new projects, starter outlines, dashboard language, type-specific workflow summaries, AI prompt context, workspace badges, project-settings type notes, and generic export labels; automated config/export smoke passed across all 6 active types. Wave 2 tabletop session engine adds structured session prep and recap fields to existing campaign session records and includes them in campaign exports; browser QA is still needed. Wave 3 comic panel engine implemented 2026-06-13 with Volume → Issue → Page → Panel structure, full page/panel field editors, reference image/PDF upload, DOCX script export, and ZIP round-trip; browser QA needed.

| Wave | Scope | Acceptance Criteria | QA Gate |
| --- | --- | --- | --- |
| 0. Beta access | All 6 active project types can be created and edited; beta types show limited-workflow notes. | Create/edit flow accepts all configured project type IDs; project header shows type badge; homepage avoids unsupported feature claims. | Smoke check every type: create, open, add one structure item, refresh, export ZIP. |
| 1. Shared type foundation | Project-type defaults, dashboard language, AI prompt context, export labels, section defaults, and workspace badges. | Each type has distinct structure labels, default sections, prompt guidance, and visible type identity. | Smoke check live/beta type language in dashboard, manuscript, AI tools, and export menu. |
| 2. Tabletop session engine | D&D/TTRPG get structured session planning and recap fields without replacing existing campaign bible data. | User can plan and recap a session with hooks, encounters, NPCs, rewards, and consequences. | Deep QA campaign planning, persistence, and export. |
| 3. Comic panel engine | Comic/Graphic Novel gets page/panel planning, visual direction fields, reference image/PDF upload, and comic script export. | User can outline pages, panels, captions/dialogue, art notes, and upload reference images; data round-trips through ZIP and DOCX export. | Deep QA per the QA Plan in the Comic Panel Engine PRD above. |

## Conditional MVP

These items can ship in MVP only if they are already stable, required by a launch promise, or needed to avoid a blocker.

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 3. Core Polish | Modals and overlays | All critical modals open, close, trap focus reasonably, preserve unsaved work, and use consistent spacing and button order. | Conditional | Implemented, needs QA | All modals now support Escape-to-close: shared StudioSheet handles it natively with dirty-state guard; EditSeriesModal, EditProjectModal, and inline new-project/new-series forms in NovelManager all have useEscapeKey(); ScheduleCalendar EventModal and SeriesDashboard AddProjectModal/ConfirmDialog also wired. QA: open each modal, press Escape with and without changes; verify dirty-state confirm prompt appears; verify backdrop click closes. | Engineering/Design |
| 4. Manuscript | AI suggestion mode | AI assistance can suggest prose or ideas without overwriting user text unless the user explicitly applies it. | Conditional | Implemented, needs QA | AI sidebar panel with 4 quick-action chips (Continue, What's next?, Improve, Add dialogue) + custom prompt textarea. Streams output; user explicitly clicks "Append to scene" or "Copy" to apply. Never auto-applies. AI button in toolbar + AI tab in sidebar. Requires user to configure an AI provider in AI Settings. QA: test with a configured provider — generate, append, copy, discard; verify no auto-overwrite; test with no provider configured (shows warning). | Engineering/QA |
| 5. Worldbuilding | Internal linking | Characters, locations, lore, timeline, and history can reference each other where the launch workflow requires it. | Conditional | Implemented, needs QA | Full cross-reference sweep complete: Timeline and WorldHistory detail views show linked characters/locations as clickable chips that navigate to the target entity. Characters Relationships tab shows "Referenced in" incoming refs (lore entries, timeline events). Locations detail shows "Referenced in" (lore entries with chip navigation, timeline events). Lore entries support lore-to-lore `loreIds` links via LinkPicker in the edit form; detail view shows "Related Lore" with both outgoing links and incoming reverse-refs (prefixed ←). All powered by pure utility functions in `src/utils/worldLinks.js`. QA: create linked entities across sections; verify chips appear and navigate correctly; verify reverse-refs appear on target entry. | Product/Engineering |
| 5. Worldbuilding | Search and filtering | Users can find major project records by name/category/status without scanning long lists manually. | Conditional | Implemented, needs QA | Characters: search by name, sort by name/role/faction, filter by family group and faction with active filter count and clear button, "No matches" message on empty results, "No characters yet" message on empty list. Locations: search by name, sort by name/category, "No matches" and "No locations yet" empty states. Lore: search by title, category filter, tag filter, sort — all with "No results" fallback. Timeline: search across title/description/date/tags. WorldHistory: search across title/era/description. Ideas: per-column empty states. QA: test search/filter on each worldbuilding section with empty and populated projects. | Engineering/QA |
| 6. Exports & Safety | Storage usage tracking | Users can see meaningful storage usage or limits before hitting failure states. | Conditional | Improved, needs QA | All "storage limit reached" warnings now present a consistent message regardless of trigger: the membership toast shows the exact used/quota bytes and a "Plan settings" button that opens the membership tab; the StorageCard exceeded message includes inline used/quota numbers; `storageExceededCheck()` in useStore passes `usedBytes` and `quotaBytes` through the `membership-read-only` event so the toast can render them. Test storage-exceeded toast from any create/save action, verify numbers appear in toast and StorageCard, and verify "Plan settings" button opens membership tab. | Engineering/QA |
| 7. Launch | Empty/loading/error states | Core screens give clear empty, loading, and error feedback without dead ends. | Conditional | Improved, needs QA | Dashboard first-run empty account state now has a specific welcome, project/import CTAs, and guided tour steps. Characters index: "No characters yet" + "No matches" on search/filter. Locations index: "No locations yet" + "No matches". Lore index: existing "No results" fallback. WorldHistory index: existing empty/no-match states. Ideas Kanban: per-column empty drop-target state. StudioEmpty used consistently for detail panes across all worldbuilding sections. QA: test each section with zero records, then with records but a no-match search. | Design/Engineering |
| 7. Launch | Landing page | Landing page explains the writing/worldbuilding value proposition and routes cleanly into signup/pricing without advertising beta/limited workflows as complete. | Conditional | Features and FAQ pages live; nav updated | `/features/` and `/faq/` are now real pages wired into the SPA router (`isFeaturesPath`/`isFAQPath` in App.jsx). `/features/` has: per-project-type feature matrix (Prose Fiction grouped as Novel/Novella/Short Story, Comic/Graphic Novel with Beta badge, Tabletop Campaign, D&D Campaign), unique-per-type callout cards, and a prose-format differences breakdown (word targets, structures, default rooms). `/faq/` has four accordion sections (Plans & Pricing, Features & AI, Data & Storage, Getting Started) updated to match current plan copy. Blog link removed from marketing nav. "Compare plans" on pricing changed from `href="#comparison"` to a `scrollIntoView` button to avoid hash-nav SPA conflicts. QA: hard-reload `/features/` and `/faq/`; test all nav links; FAQ accordion expand/collapse; confirm Blog absent; Compare plans scrolls correctly; back/forward nav between pages. Also QA homepage copy against beta-live scope. | Product/Design/Engineering |
| 7. Launch | SEO basics | Title, description, OG tags, Twitter card, JSON-LD (WebSite, Organization, SoftwareApplication with pricing), robots, canonical, and keywords are all present. Description updated to include tabletop/campaign audience. | Conditional | Complete | No further action required before launch. | Engineering |
| 7. Launch | Analytics | Google Analytics 4 (tag G-L1BT87PKXV) added to all 25 HTML files — React app root and all static marketing/blog pages. | Conditional | Complete | No further action required before launch. | Engineering |

## Onboarding System

Implemented 2026-06-15. Files: `src/components/onboarding/`.

| Component | Description | Status |
| --- | --- | --- |
| `useTourStore.js` | localStorage-backed state for wizard shown, checklist dismissed, tour completions, and export tracking. | Complete |
| `OnboardingTour.jsx` | Reusable spotlight tour engine. Accepts step definitions with `data-tour` targets, renders a dark backdrop with a cutout spotlight and floating tooltip. Supports next/back/skip/done, dot navigation, keyboard (arrow keys, Escape). | Complete |
| `WelcomeWizard.jsx` | 3-step modal shown once on first login when account has no projects. Step 1: project type picker with emoji cards. Step 2: title + word count target. Step 3: workspace highlights + create. Creates the project and navigates directly into it. | Complete |
| `GettingStartedChecklist.jsx` | Collapsible widget in the library. 5 milestones derived from real store data (create project, write scene, add character, build world, export). Dismissible. | Complete |
| `tourDefinitions.js` | Step arrays for Library, Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline tours. | Complete |

Integration:
- `App.jsx`: imports `useTourStore`, passes `tourStore` to `NovelManager` and project `Layout`, shows `WelcomeWizard` when `!wizardShown && novels.length === 0`.
- `NovelManager.jsx`: renders checklist, `?` tour button in top bar, `data-tour` attributes on key elements, library `OnboardingTour`.
- `Layout.jsx`: renders a section tour button for Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline when the current workspace has tour steps; completed tours are marked in `useTourStore`. The Map tour is hidden on the mobile placeholder because the editing UI is desktop/tablet-only there.

QA deferred: wizard create flow on a real fresh account; checklist milestone accuracy; library and section tour spotlight positioning at mobile/tablet/desktop widths; section tour completion persistence.

## Post-Launch

| Feature | Requirement / Acceptance Criteria | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Full-screen writing mode | A distraction-reduced writing view is available and exits cleanly without losing the active scene. | Unknown/needs check | Verify current behavior; ship only if already stable. | Product/Engineering |
| Scroll-to-centre writing mode | Active scene can be brought into comfortable focus without breaking navigation or layout. | Implemented partially | Keep as polish unless it is already stable. | Product |
| Novel finalized draft reader | Novel projects can copy the current manuscript into timestamped, uneditable finalized draft snapshots and view them in a separate reader layout optimized for novel-style reading, with scroll and page-flip style viewing modes. | Implemented, needs QA | QA: finalise a novel draft, verify the working manuscript remains editable, verify the finalized copy is selectable/read-only, verify scroll/pages switching and previous/next page controls, and verify non-novel project types do not show the Finalise action. | Product/Engineering/QA |
| Passage comments/notes | Users can attach notes to a scene or passage-level context without creating data loss or editor instability. | Partial | De-scope passage-level annotation if scene notes are enough for launch. | Product |
| Factions and family grouping | Grouping supports the novelist workflow without blocking core character/lore use. | Implemented/optional | Factions now have `saveFaction`/`deleteFaction` wired through `saveSeriesSyncedItem`/`deleteSeriesSyncedItem` (matching characters/locations); `factionsRef` tracks live state for sync; deleting a faction clears `factionId` on affected characters. Keep visible only if stable; otherwise move to post-launch polish. | Product/Engineering |
| EPUB-ready structure | Internal manuscript structure does not prevent future EPUB export; full EPUB generation is not required for MVP. | Preparation only | Move full EPUB export post-launch unless already complete. | Product/Engineering |
| Stylised encyclopedia export | Not required for MVP unless it is part of the paid launch promise. | Scope trap | Move to post-launch; keep basic project export as the launch requirement. | Product |
| Advanced map builder | Map features do not block core launch safety unless required by campaign or worldbuilding acceptance criteria. See PRD: Map Builder Rebuild below for full scope. Rebuild slices implemented: gentler bounded wheel zoom, visible undo/redo, transaction-style history for object edits, drag threshold to prevent accidental moves, Space/Alt temporary pan behavior, "Stamps" tool label, closed Rivers/Seas paths becoming filled water masses, hover highlights, clearer selection/point/rotate handles, mode-aware canvas cursor cues, active brush toggles back to Select when clicked again, a tabbed Object/Layers/Map inspector with real layer creation, active-layer placement, object reassignment, layer visibility/lock controls, an object stack, map type selected at creation and read-only afterward, removal of the weak Mountain line tool from creation UI in favour of the Mountains stamp, a reference-aligned 16-item fantasy stamp set using extracted source-image PNG icons, richer HTML/PDF map text plates that summarize layers, object counts, labels/places, regions, routes/water, stamps, and land/rooms from both legacy and object-map data, and generated object-map preview plates for HTML/PDF exports when no saved map image exists. | Phase 1 partial + Phase 2 partial + Phase 3 partial + Phase 4 partial + Phase 5 partial implementation, QA deferred | Required QA is tracked in [docs/QA_PLAN.md](docs/QA_PLAN.md). Continue with responsive safety and deeper export/restore verification. | Product/Design/Engineering |
| Analytics | Google Analytics 4 implemented 2026-06-13 (tag G-L1BT87PKXV, added to all 25 HTML pages). Replaces the Posthog/deferred plan. | Complete | No further action needed. | Engineering |
| Theme system v2 | New visual identity system with atmosphere token architecture, per-theme radius/shadow/glow personalities, and all studio vars auto-adapting via CSS var resolution. Theme editor now groups dark and light preset themes, uses compact selectors with a dedicated live preview, exposes configurable custom colours, corner roundness, and atmosphere strength, and now derives custom-theme atmosphere/paper/sidebar/accent-contrast tokens from the edited palette. Project/library screens now use explicit project surface roles for shell, standard panel, soft panel, raised panel, borders, hover, selected states, and tab/navigation icon contrast to reduce random-looking colour shifts. | Implemented, needs authenticated QA | QA AccountSettings theme editor while signed in: switch dark/light presets, edit each custom colour, adjust roundness and atmosphere strength, save to profile, refresh, sign out/in, and verify the live preview, library top bar, active project hero, overview cards, insight cards, manuscript action controls, primary buttons, studio/editor surfaces, tab/navigation icons, and saved profile theme remain in sync with legible text. | Design/Engineering |
| Collaboration | Multi-user editing and sharing are excluded from MVP. | Post-launch | Document as future roadmap only. | Product |
| Marketplace/community | Marketplace and public community systems are excluded from MVP. | Post-launch | Avoid launch copy that implies community availability. | Product |
| Mobile apps | Native mobile apps are excluded; responsive web usability is the MVP requirement. | Post-launch | Focus mobile effort on web responsiveness. | Product |
| Advanced AI agents | Agentic workflows are excluded; MVP AI stays bounded and user-directed. | Post-launch | Define one or two safe AI assistance actions for launch. | Product/AI |
| Project-type manuscript templates | The template picker in manuscript mode now filters templates by active project type. Novel/Novella: Three Act, Hero's Journey, Save the Cat, Romantasy, Mystery/Thriller, Episodic TV, Blank. Short Story adds: Freytag's Pyramid, Flash Fiction, In Medias Res. Comic: Multi-Issue Arc, Standalone Graphic Novel. D&D Campaign: Three-Arc Campaign, One-Shot. TTRPG: Three-Act Campaign, One-Shot/Convention, Horror Campaign. Blank/Custom is universal. `getTemplatesForProjectType()` handles filtering; `TemplateModal` receives `projectType` prop from `Manuscript`. Retired type templates (Screenplay, Play, TV Show, Video Game) are not shown. | Implemented 2026-06-13 | No further QA gate required; template picker adapts automatically when a project is opened. | Engineering |
| AI chat history — pin & category | All AI chat sessions are persisted per project in localStorage. Sessions can be pinned (appear first) and tagged with a free-text category; category filter chips appear in the session list when categories exist. | Implemented | No further action needed for launch. | Engineering |
| Ideas board card expand | Idea cards with body text over ~200 chars now show a 3-line collapsed preview with an always-visible inline Show more / Show less button, so long captures (e.g. imported NovelCrafter snippets) are readable without requiring hover or card selection. | Implemented | No further action needed for launch. | Engineering |
| Public sharing | Public project/profile sharing is excluded from MVP unless needed for launch marketing. | Post-launch | Keep private workspace promise clear. | Product |
| Founders directory | Public `/founders/` page listing all Founder-tier members, each with a dedicated profile page (`/founders/[slug]/`) showing bio, published works grid with covers and buy links, social/website links, and a YOW Founder badge. Index page links to individual profiles and includes a "Become a Founder" CTA. Footer link added to homepage React app. Vite dev middleware serves static HTML for marketing pages in dev. Vercel rewrites updated with explicit `/founders/` and `/founders/:slug/` rules above the catch-all. CSS variables corrected to match `marketing.css`. Founders callout added to `/about/` page. | Implemented, needs QA | QA: visit `/founders/` and a founder profile page; verify theme matches other marketing pages; verify nav, footer, and "Become a Founder" CTA link to `/pricing/`; verify Founders link in homepage footer. To add a real founder: duplicate `public/founders/example-founder/`, rename to their slug, fill in details, add a `.founder-card` to `public/founders/index.html`. | Engineering/Product |

## PRD: Map Builder Rebuild

### Product Summary

The Map Builder should become a reliable worldbuilding and campaign-planning canvas, not a novelty drawing panel. It should let writers and GMs quickly create readable world, region, local, and interior maps; link places back to Locations; export enough visual and metadata context to be useful; and feel stable under normal editing.

This remains Post-Launch unless campaign-map quality becomes part of a paid/final-launch promise. If the current version feels glitchy enough to undermine campaign/worldbuilding trust, it should be beta-labeled or hidden until the interaction-stability pass is complete.

### Current Baseline

The current implementation already supports multiple maps per project, map types (world, region, local, interior), object layers, land/region/river/road/border paths, stamps, labels, linked locations, JSON import/export, basic style presets, snap, lock/hide, grouping, duplication, and layer ordering.

The biggest issues are interaction quality and output quality: zoom is too sensitive, selection and drag behavior are not intuitive, drawing modes are easy to confuse, closed water shapes are not treated as filled water, the Mountain line tool does not produce convincing mountains, and project exports currently preserve map metadata better than rendered visual plates.

### Goals

- Make the map canvas predictable: no accidental moves, wild zoom jumps, or unclear selection state.
- Make drawing tools understandable: users can tell whether they are selecting, panning, drawing, placing, or editing points.
- Support the core fantasy/cartography primitives writers expect: land, water, regions, routes, borders, labels, settlements, landmarks, terrain stamps, mountains, and interiors.
- Preserve and export maps safely through project backup/restore, JSON import/export, and world bible exports.
- Keep map creation fast for non-artists: good defaults, stamp presets, natural variation, and enough styling without demanding design expertise.

### Non-Goals

- Professional GIS tooling, real geographic projection, or measured real-world cartography.
- Full image-editing software, raster painting, pressure-sensitive brush engines, or Photoshop-style layer effects.
- Real-time collaboration.
- Procedural world generation as the first rebuild milestone.
- Battle-map rules automation, fog of war, initiative tracking, or VTT replacement.

### Required Canvas Interaction

- Provide explicit Select, Pan, Draw, Place Stamp, Label, and Location modes with visible active-state labels.
- Wheel and trackpad zoom must be damped, bounded, and centered around the cursor; trackpad scroll should not launch the map from tiny to huge in one gesture.
- Add visible zoom controls: zoom in, zoom out, fit, reset to 100%, and current percentage.
- Space/Alt temporary pan should work reliably; cursor state should reflect pan, grab, drawing, dragging, resizing, and rotating.
- Selection must use hover highlights, selected outlines, clear handles, and predictable click behavior.
- Clicking empty canvas deselects unless a draw/place mode is active.
- Dragging an object should require a small movement threshold so normal clicks do not accidentally move it.
- Multi-select should support Shift/Cmd/Ctrl click, select all, clear selection, and layer-panel selection.
- Resize, rotate, and point-edit handles must be large enough at every zoom level and must not conflict with object selection.
- Undo/redo is required for create, move, resize, rotate, delete, duplicate, group, ungroup, style edits, point edits, map type changes, imports, and layer-order changes.
- Keyboard shortcuts should cover Delete, Escape, Enter-to-finish-path, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+A, Cmd/Ctrl+D, plus optional one-key mode shortcuts after focus safety is confirmed.

### Required Map Tools

- Land: polygon, rectangle, and ellipse/circle landmasses with organic shoreline option, fill/stroke/opacity, point editing, and base-layer behavior.
- Water: open Rivers/Seas lines continue to draw rivers/coastlines; when a water path closes, it becomes a filled water mass/lake/sea with editable shoreline, fill, stroke, opacity, and optional wave/shore texture.
- Regions: political or terrain areas with transparent fills, borders, labels, and editable polygon points.
- Roads/Paths: open lines with solid/dashed styles, thickness, color, and optional route labels.
- Borders/Walls: open or closed path support with dashed/solid styles and clear visual distinction from roads.
- Stamps: rename "Forests and Stamps" to "Stamps"; forests become a Terrain stamp category/preset, not a separate tool label.
- Stamp placement: click-to-place, drag-to-place, recent/favorite stamps, search, category filters, rotation, scale, opacity, duplicate, and random variation controls.
- Mountains: either replace the current Mountain tool with convincing mountain symbols/ranges (natural spacing, size jitter, rotation jitter, ridge direction, density, and group editing) or remove it and rely on mountain stamps until quality is good.
- Labels: readable text labels with font size, color, optional curved labels for regions/routes, and collision-aware defaults where feasible.
- Locations: place new or existing Locations on the map; linked markers should update display names when the Location name changes and should navigate back to the Location detail.
- Interiors: rooms, walls, doors, windows, furniture, and object stamps should remain available, but the interface should make clear that interior maps are a different map type from world/region maps.

### Data Model And Persistence

- Keep a versioned map schema with forward-compatible object records.
- Each object needs stable `id`, `type`, position, size, rotation, z/layer order, visibility, lock state, style metadata, points/faces where relevant, and linked entity IDs where relevant.
- Add explicit water-mass metadata rather than overloading river lines once a path is closed.
- Add mountain-range metadata only if the mountain tool is improved; otherwise remove the line-tool mode from available map types.
- Persist maps synchronously enough that refresh/navigation does not lose recent edits.
- Project ZIP export/restore must include all maps, object data, layers, linked location IDs, map type/style metadata, and any generated thumbnails.
- JSON map import/export must preserve unknown future fields and report invalid imports clearly.
- Deleting a linked Location should not crash the map; markers should become unlinked but keep their text unless the user chooses to remove them.

### Visual Output

- Canvas rendering should look intentionally cartographic at normal zoom: cleaner water, land, region, route, border, mountain/stamp, and label styling.
- Every map should maintain or generate a thumbnail/preview image for dashboard/export contexts.
- Project DOCX/PDF/world-bible exports should include map thumbnails or rendered plates where possible, not only metadata.
- Exports should list map labels, linked locations, regions, and notable stamps so a text-only export still contains useful context.

### UX Layout

- Rework the layout into three dependable zones: left tool palette, central canvas, right properties/layers inspector.
- Keep map selection, map type, style, export/import, undo/redo, and zoom controls in a stable top bar.
- The left palette should show only tools relevant to the current map type, with plain labels and tooltips.
- The Stamps panel should support search, category tabs/filter, favorites, recent stamps, and larger previews.
- The right inspector should separate Object Properties, Layers, and Map Settings with compact tabs or sections.
- Avoid hiding essential controls in advanced accordions when they are part of normal editing.
- Mobile/tablet can be view/edit-lite, but must not show a broken canvas. If full editing is desktop-first, the UI should say so clearly and provide safe viewing/export.

### QA Acceptance

- Create a world map with land, closed sea/lake, open river, regions, roads, borders, labels, settlements, stamps, and linked locations; refresh and verify everything persists.
- Create a region map with roads, towns, rivers, terrain stamps, and labels; verify selection, moving, resizing, rotating, point editing, grouping, and layer ordering.
- Create an interior map with rooms, walls, doors, windows, furniture, labels, and object stamps; verify map-type-specific tool filtering.
- Verify wheel and trackpad zoom are controlled at desktop and laptop settings; zoom never jumps beyond min/max unexpectedly.
- Verify undo/redo for every common edit path.
- Verify invalid JSON import shows an error and valid JSON import preserves object data.
- Export a project ZIP, restore it, and confirm maps, layers, thumbnails, linked markers, and metadata survive.
- Export DOCX/PDF/world bible and confirm maps appear as useful visual or text plates.
- Test at 1280px desktop, 768px tablet, and 375px mobile; full editing may be desktop-first, but the UI must not overlap or trap controls.

### Implementation Phases

| Phase | Scope | Acceptance Criteria |
| --- | --- | --- |
| 1. Interaction stabilization | Zoom damping/bounds, explicit modes, hover/selection state, drag threshold, undo/redo, handle clarity, keyboard safety. | Partial implementation: zoom damping/bounds, undo/redo, drag threshold, Space/Alt temporary pan, hover highlights, clearer handles, cursor cues, and active-brush click-to-deselect landed. QA is deferred in `docs/QA_PLAN.md`. Still needs broader keyboard polish and deeper browser verification later. |
| 2. Tool semantics | Closed water masses, renamed Stamps tool, stamp workflow improvements, mountain improve/remove decision, clearer land/region/road/border behavior. | Partial implementation: closed water masses and Stamps label landed; weak Mountain line creation removed from active toolsets and quick-add controls so users rely on the Mountains stamp while legacy mountain-line objects still render. Still needs stamp workflow polish and clearer land/region/road/border behavior. |
| 3. Inspector and layers | Rework properties/layers/map settings, improve multi-select, grouping, lock/hide, z-order, and linked-location editing. | Partial implementation: right inspector now uses Object/Layers/Map tabs; map type is chosen in New Map forms and displayed read-only after creation; object properties include object-layer assignment and clearer Order naming; Layers supports layer creation, rename-on-blur, active-layer placement, visibility, lock, delete with object fallback, object stack selection, and lock-aware edit disabling. Still needs deeper linked-location navigation/edit polish and browser verification later. |
| 4. Visual quality | Better cartographic styling, reference-aligned fantasy stamp visuals, thumbnails/previews, label readability, map-type-specific polish. | Partial implementation: the stamp library now includes the 16 reference-image fantasy icons as extracted transparent PNG assets, with matching sidebar previews and placed stamp rendering. Still needs visual QA and later thumbnail/preview work. |
| 5. Export and restore | ZIP restore coverage, JSON forward compatibility, DOCX/PDF/world-bible map plates. | Partial implementation: project backup already preserves map records; HTML/world-bible and PDF map sections now summarize rebuilt object-map data plus legacy labels/pins/regions as useful text plates. Generated object-map preview plates now render into HTML/PDF exports when no saved map image exists. Still needs deeper ZIP restore/browser verification later. |
| 6. Responsive safety | Desktop editing pass plus tablet/mobile view/edit-lite behavior. | The map builder is either usable or clearly constrained on each supported viewport, with no broken layout. |

## Icebox

New ideas start here unless they satisfy the Feature Intake Freeze rules.

| Feature | Why Parked | Decision Needed |
| --- | --- | --- |
| Voice dictation | Public roadmap exploration item; not novel-launch critical. | Revisit after MVP stability. |
| Publishing platform integrations | Public roadmap exploration item; expands surface area beyond launch. | Define target platforms after launch. |
| AI-assisted developmental editing feedback | Larger AI workflow than bounded MVP suggestions. | Revisit after MVP AI behavior is stable. |
| Native desktop app | Not required while responsive web is the MVP requirement. | Revisit after web launch. |
| Series management and cross-project references | Useful, but expands data model and project scoping. | Revisit after single-novel workflow is reliable. |
| Template library — extended marketplace / community-submitted templates | Further template content beyond the built-in per-type set is a product/community layer, not a launch blocker. Built-in project-type manuscript templates shipped 2026-06-13; extended/user-submitted library remains post-launch. | Revisit post-launch. |

## Security

| Item | Detail | Status | Remaining |
| --- | --- | --- | --- |
| Supabase security hardening | Migration `20260612_security_hardening.sql` applied. Fixes: `set_updated_at` mutable search_path (switched to `SET search_path = ''`); `delete_user` anon EXECUTE revoked (`REVOKE … FROM PUBLIC` + re-grant to `authenticated` only); `get_founder_slot_info` search_path hardened. | Applied 2026-06-13 | 5 linter warnings remain — all intentional or plan-limited: `feedback` INSERT always-true (anonymous feedback by design); `get_founder_slot_info` anon/authenticated callable (public slot counter); `delete_user` authenticated callable (account-deletion flow); leaked password protection (Pro plan feature). |
| Welcome email | Branded welcome email sent via Resend on every new signup. Edge Function `send-welcome-email` deployed to Supabase. Called directly from `AuthContext.signUp` after successful signup. Email matches ink-ember theme, lists all 6 live project types, links to yourownworld.co.uk. Supabase default confirmation email disabled (email confirmations off in Authentication → Sign In / Providers). `handle_new_user` trigger on `auth.users` auto-inserts `user_profiles` row on signup. `delete_user` RPC installed so account deletion removes the auth row cleanly. "Resend confirmation" button added to the "check your inbox" screen in LoginPage. RESEND_API_KEY set as Supabase secret. Exposed key rotated 2026-06-13. | Complete | No further action needed. |

## Bugs

Use this section for confirmed defects only. Suspected issues stay in the relevant roadmap row until reproduced.

| Bug | Impact | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Project deletion does not persist after logout | Data integrity — deleted projects reappear on next login. Root cause: `user_data.novels` is updated only via the 2-second debounced `saveAppData`; logging out within that window left the deleted project in `user_data` even though its `project_data` row was removed. Fixed: `deleteNovel` now captures the filtered novels list and calls `saveAppData` immediately alongside `deleteProjectData`. | Fixed | Verify: delete a project, immediately log out, log back in, confirm project is gone. | Engineering/QA |
| Newly created series never appeared in the library | UX — series creation appeared broken; series WAS saved but the library filtered to only series with ≥1 project assigned, so empty series were invisible. Fixed: library now renders all series including empty ones. | Fixed | No further action needed. | Engineering |
| Series dashboard uses book-specific language for all project types | UX mislead — series containing D&D Campaigns, Comic projects, etc. showed "books", "Add Book", "Books in Series", "Characters in Multiple Books", etc. Fixed: all book-specific copy replaced with "project/projects" in `SeriesDashboard` and the `SeriesCard` count badge; non-novel type label shown as secondary metadata in Projects tab and Overview table. | Fixed | No further action needed. | Engineering |
| Autosave reliability not proven across refresh/navigation/rapid typing | Potential data loss; launch blocker if reproduced. | QA passed | Immediate refresh after typed input and saved records now preserves fresher browser data instead of letting older account data overwrite it. Keep covered in launch regression tests. | Engineering/QA |
| Restore flow | YOW backup restore is now routed through the unified Import modal (Import ZIP option). Needs end-to-end QA to confirm all project data (scenes, characters, lore, timeline, chapters) round-trips correctly through export → Import ZIP → restore. | Implemented, needs QA | Export a project, use Import ▾ → Import ZIP to restore it, compare content against original. | Engineering/QA |
| Responsive layout not proven across MVP screens | Could make mobile/tablet launch path unusable. | Mitigation added, needs QA | Re-test dashboard tiles and Status Queue width, mobile index reset/collapse, Map Builder disabled state, manuscript, account/settings, and edit modals across mobile/tablet widths. | Design/QA |
| Write button hidden on compact layouts | Users may be unable to find or enter the manuscript workspace on mobile/tablet. | Mitigation added, needs QA | The existing Write button now has a compact top-bar placement instead of disappearing at narrow widths. Verify desktop and compact layouts both expose the same Write action. | Design/QA |
| Story outline edits can fail rapid refresh testing | Potential data loss if outline structure/synopsis edits refresh before background persistence runs. | QA passed | Act, chapter, scene add/update/delete/reorder operations write local storage synchronously before React state scheduling; refresh/import prefers fresher browser data over older account data. User QA confirmed rapid-refresh persistence. | Engineering/QA |
| Refresh can lose the current app page or settings panel | Users may return to the wrong workspace after refresh, making settings and project pages feel unsaved. | QA automated | `tests/e2e/url-persistence.spec.js` covers writing mode, project overview, worldbuilding section, direct URL navigation, and content preservation across URL reload. All 5 tests pass in CI. Account settings tab URL round-trip still needs manual QA (requires real auth). | Engineering/QA |
| Account switch can overwrite loaded project library with previous account's browser copy | Cross-account project data can appear under the wrong user and overwrite the populated account's project list; launch blocker for auth/data safety. | Guard implemented + automated; real-auth switch needs manual QA | `tests/e2e/account-isolation.spec.js` covers: (1) foreign-owner data not loaded, (2) own projects persist on correct-owner reload, (3) localStorage tamper cleared safely by guard. All 3 pass. Real two-account switch (A→B) still needs manual QA with live Supabase accounts. | Engineering/QA |
| New accounts can inherit a previous browser-local theme | A freshly verified account may appear with another account's local theme instead of the default, creating cross-account preference leakage on shared browsers. | Fixed, needs QA | Signed-in accounts now apply their profile-saved theme when present, or the default app theme when no profile theme exists. QA: choose a non-default theme in account A, sign out, verify a new account B, and confirm B lands on the default theme until it saves its own appearance. | Engineering/QA |
| Login error exposed internal Supabase message on bad credentials | Showing raw "Invalid login credentials" from Supabase is confusing and leaks implementation detail. | Fixed | LoginPage now intercepts credential-related Supabase errors and surfaces "Incorrect username or password." instead. Other auth errors still show their original message. | Engineering |
| No dedicated post-logout screen | After signing out, users landed directly on the marketing homepage with no confirmation or quick path back to login. | Fixed | New `SignedOutPage` renders after a confirmed sign-out transition (authenticated → unauthenticated). Shows "You've been signed out" with Log in again (returns to LoginPage) and Go to homepage (navigates to `/`) buttons. Include in auth regression pass. | Engineering/QA |
| Import and new project blocked for paid lifetime users | Paid `premium_plus_lifetime` / `premium_lifetime` users report "Could not import project. You may be on a free plan." and cannot create new projects despite correct `subscription_plan` in JWT and correct plan display in-app. Root cause was a local testing environment issue — not reproducible in production. | Closed — not reproducible | No further action needed. | Engineering |

## Change Control

When editing this roadmap:

- Keep MVP Required limited to blocker-level launch work.
- Move non-blocking polish to Post-Launch.
- Move unvalidated ideas to Icebox.
- Add bugs only after reproduction or a concrete QA finding.
- Update linked generated artifacts only after this roadmap changes, not the other way around.
