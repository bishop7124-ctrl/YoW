# YOW Product Roadmap

This is the canonical planning source for Your Own World.

All feature planning, launch triage, blocker decisions, and roadmap changes should be made here first. Other planning artifacts must either link back to this file or be treated as historical/generated output.

## Agent Instructions

Codex, Claude, and any other project agent should use this file as the single planning document.

- For every meaningful project change, update this roadmap in the same turn when the change affects scope, status, blockers, bugs, next actions, ownership, or launch readiness.
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
| 1. Scope Freeze | Fully stacked launch scope | Public beta may expose beta/limited workflows, but final launch requires the fully specced project-type stack: all 10 project types must have their promised discipline-specific workflows, safe persistence, and stable exports. | Yes | In progress | Use beta labels while building, then complete discipline-specific workflow waves before final launch. | Product/Engineering |
| 2. Define Good Enough | Launch blocker policy | A blocker is limited to data loss, broken auth, broken save, broken export, unusable editor, unusable mobile layout, or missing legal/payment essentials. | Yes | Adopted | Apply the blocker policy to every triage pass before changing MVP scope. | Product/QA |
| 2. Define Good Enough | QA automation baseline | A single local QA command runs the basic release-safety checks before deeper browser smoke tests. | Yes | Automated in CI | `npm run qa` runs lint, production build, and load check. `npm run qa:smoke` starts Vite in offline mode and now covers create/write/refresh/export/restore, DOCX/PDF export downloads, all configured project-type creation with starter structure/default sections, and mobile/tablet writing reachability. GitHub Actions runs static QA plus named smoke jobs on push, pull request, daily schedule, and manual dispatch, with Playwright annotations and artifacts uploaded on failure. Current Codex macOS sandbox blocks Chromium launch at Mach-port registration, so browser smoke is verified through a normal local terminal or CI runner. React compiler advisories remain as warnings. | Engineering/QA |

## MVP Required

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Scope Freeze | Project-type access model | All project types are selectable in create/edit flows. Mature types are marked live; immature types are marked beta/limited with clear notes about missing discipline-specific workflows. Unknown imported types still fall back safely to Novel. | Yes | Beta-live model implemented, smoke partially passed | Automated smoke verified all 10 configured project types, live/beta stages, structure labels, section defaults, and ZIP/DOCX/PDF blob generation. Browser smoke verified homepage beta-live expectation copy. Still needs authenticated/offline UI pass for create/open/export clicks because the local offline-mode dev restart was blocked by port binding in this run. | Engineering/QA |
| 3. Core Polish | Save and close behavior | Closing editors, panels, and modals never drops unsaved manuscript or worldbuilding changes; prompts appear only when useful. | Yes | Implemented, needs QA | Manuscript editor flushes on blur/unmount; Edit modals (project, series) prompt "Discard changes?" when dirty; click-outside closes all modals. Run close/refresh/logout tests across manuscript, lore, characters, locations, and timeline. | Engineering/QA |
| 3. Core Polish | Dashboard consistency | Dashboard lets users create, open, rename, and delete projects without layout breaks or ambiguous states. | Yes | Implemented, needs QA | Empty state hero; single-project auto-activation; series dropdown on create; series filter on StatusQueue; tile click opens project; project cards show a hover/focus Select project cue; active project panel shows a hover/focus Open project cue and displays cover photos without blend filtering; star button toggles active focus; series-contained projects are selectable as active projects from the library even when no standalone projects exist; series project cards are grouped under their parent series and the library content width matches ActiveProjectHero; card hover stats trimmed (scenes removed); ActiveProjectHero layout (library snapshot top, project details bottom); all 3 card buttons unified to 30×30 circle; project dashboard now separates Overview basics from Insights analytics, with momentum, scene health, draft balance, longest-scene, worldbuilding coverage cards, and responsive tile packing for large screens. Test empty account, one project, all-projects-in-series, multiple series, many projects, overview/insights switching across desktop/tablet/mobile widths, and deleted-project recovery expectations. | Engineering/QA |
| 3. Core Polish | Responsive scaling | The core writing and dashboard flows are usable on mobile and tablet widths; no key controls overlap or disappear. | Yes | Mitigation added, needs QA | Mobile manuscript sidebar fixed to bottom tab bar (≤640px); panel opens as 58vh overlay; writing area gets full width. Project/reference boxes expand on wide screens (max-width 1800px). Series dashboard top bar now stays layered above its sticky tab bar so the user menu is not obscured. Public top navigation is standardised across React and static marketing pages. Added 375px fixes for homepage horizontal overflow, active project/series card layering, project top-nav crowding, manuscript toolbar wrapping, series title priority/tab fitting, schedule month width, and timeline header density. Run 375px viewport pass across homepage, library, series dashboard, manuscript, schedule, and timeline. | Design/QA |
| 4. Manuscript | Stable manuscript editor | Users can write, edit, split, and return to scenes without content loss, cursor-breaking errors, or major lag. | Yes | Implemented, needs QA | Perform long-scene, rapid typing, refresh, navigation, and split-scene tests. | Engineering/QA |
| 4. Manuscript | Chapter organization | Users can add, rename, delete, reorder, and move chapters; structure persists after refresh and login. | Yes | Implemented, needs QA | Acceptance-test chapter operations and deletion warnings. | Engineering/QA |
| 4. Manuscript | Scene organization | Users can add, rename, delete, reorder, move, and select scenes; status and notes persist. | Yes | Implemented, needs QA | Test drag/drop, empty chapters, split scenes, and scene notes. | Engineering/QA |
| 4. Manuscript | Autosave | Scene content saves within a predictable delay and survives refresh, tab close, logout/login, and network recovery where supported. | Yes | QA passed | Local scene drafts write local storage on every manuscript input event and mark the browser copy as fresh; refresh/import prefers fresher browser data over older account data and pushes it back up. User QA confirmed immediate refresh now preserves changes without waiting for the account debounce. | Engineering/QA |
| 4. Manuscript | Word count tracking | Project, chapter, and scene word counts update accurately enough for writing progress and do not slow typing. | Yes | Implemented, needs QA | Verify counts on paste, delete, scene moves, and large manuscripts. | Engineering/QA |
| 5. Worldbuilding | Character system | Users can create, edit, delete, search, and relate characters to the active novel; data persists correctly. | Yes | Immediate-save mitigation added, needs QA | Character create/edit/delete now writes local storage synchronously before React state scheduling; deleted characters are removed from character relationships, lore links, and timeline links. Test instant-refresh CRUD, relationship cleanup, empty state, many-character performance, and project scoping. | Engineering/QA |
| 5. Worldbuilding | Locations | Users can create, edit, delete, search, and link locations to the active novel/world context. | Yes | Immediate-save mitigation added, needs QA | Location create/edit/delete now writes local storage synchronously before React state scheduling; deleted locations are removed from lore links and timeline links. Test instant-refresh CRUD, project scoping, map cleanup, and links from timeline/lore. | Engineering/QA |
| 5. Worldbuilding | Lore encyclopedia | Users can create, edit, delete, categorize, search, and retrieve lore entries tied to the active project. | Yes | Immediate-save mitigation added, needs QA | Lore create/edit/delete now writes local storage synchronously before React state scheduling. Test instant-refresh lifecycle, empty states, search/filtering, character/location links, deleted-link cleanup, and export inclusion. | Engineering/QA |
| 5. Worldbuilding | Timeline and history linking | Timeline events and world-history entries can be created, edited, linked/unlinked, and persist by project. | Yes | Immediate-save mitigation added, needs QA | Timeline/history create/edit/delete/link/unlink now writes local storage synchronously before React state scheduling. WorldHistory groups timeline entries by era; Timeline shows them chronologically. Orphan worldHistory entries are migrated into timeline on importData. Test create/edit/delete round-trips across both sections, link/unlink behavior, instant-refresh persistence, and era grouping. | Engineering/QA |
| 6. Exports & Safety | Project export | Users can export a complete project archive containing manuscript and worldbuilding data in a restorable format. | Yes | Implemented, needs QA | Test export contents for small, medium, and large projects. | Engineering/QA |
| 6. Exports & Safety | Manuscript export | Users can export manuscript content in a readable document format with chapters/scenes in the correct order. | Yes | Implemented, needs QA | Test .docx export for formatting, ordering, empty scenes, and large manuscripts. | Engineering/QA |
| 6. Exports & Safety | Backups | Backup = cloud sync (Firestore, active for logged-in users) + manual ZIP export. No scheduled backup required for MVP. Definition is final. | Yes | Implemented, needs QA | Test that logged-in users have their data in Firestore and that the ZIP export contains all project data. | Engineering/QA |
| 6. Exports & Safety | Restore flows | Users can restore a project from a YOW backup ZIP using the Restore button in the library top bar. The ZIP is read client-side via fflate; project-data.json is parsed and the project is added to the library with a new ID to avoid collisions. | Yes | Implemented, needs QA | QA: export a project, use Restore button to import it, verify all content (characters, scenes, lore, timeline, chapters) appears correctly in the library under a new project entry. | Engineering/QA |
| 7. Launch | Authentication | Sign up, sign in, sign out, session restore, and password/error states work reliably across refreshes. | Yes | Implemented, needs QA | Run auth regression pass with fresh user, returning user, invalid credentials, and expired session. | Engineering/QA |
| 7. Launch | Autosave reliability | Autosave has explicit test coverage or manual proof for refresh, navigation, rapid typing, and multi-scene work. | Yes | High-risk QA | Make this the first launch-readiness test pass. | Engineering/QA |
| 7. Launch | Large project performance | Dashboard, manuscript, search, and export remain usable on a realistic large novel project. | Yes | Needs QA | Create/load a stress project and measure obvious failures. | Engineering/QA |

## Project Type Launch Scope

The public beta must be honest about the project-type stack. Beta project types may be selectable before their full discipline-specific engine exists, but the UI and marketing copy must clearly say what is limited. Final launch, however, means the fully specced website: each project type needs its own structure, language, defaults, export expectations, QA scenarios, and promised discipline-specific workflow.

| Project Type | Unique Launch Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- |
| Novel | Long-form prose workflow supports acts, chapters, scenes, manuscript drafting, worldbuilding, timeline/history, character systems, project export, and manuscript export. | Yes | Active baseline | Continue QA against autosave, editor stability, exports, and large-project performance. | Product/Engineering/QA |
| Novella | Medium-length prose workflow. Structure: Part → Chapter → Scene. Lighter default sections (outline, characters, locations, lore, ideas, schedule, timeline). Type-specific story event indicators and a 30,000-word default target defined. Shares the manuscript editor with Novel. Enabled at launch. | Yes | Enabled, needs QA | QA: create a Novella project, verify Part/Chapter/Scene labels appear in structure sidebar, verify lighter default section set, verify default word target appears, verify export works. | Engineering/QA |
| Short Story | Short-form prose workflow. Structure: Part → Section → Scene. Compact default sections matching Novella set. Type-specific story event indicators and a 5,000-word default target defined. Shares the manuscript editor. Enabled at launch. | Yes | Enabled, needs QA | QA: create a Short Story project, verify Part/Section/Scene labels, verify default sections, verify default word target appears, verify export. | Engineering/QA |
| Play | Stage play. Structure: Act → Scene → Beat. Selectable as beta/limited. Final launch needs script formatting, stage direction/dialogue styles, and script-aware export before it can be marketed as fully live. | Yes | Beta selectable, final engine required | Complete shared script formatting foundation with Play-specific labels and export expectations. | Product/Engineering |
| Screenplay | Feature film script. Structure: Act → Sequence → Scene. Selectable as beta/limited. Final launch needs screenplay formatting and script-aware export before it can be marketed as fully live. | Yes | Beta selectable, final engine required | Complete shared script formatting foundation; decide FDX vs correctly formatted PDF first. | Product/Engineering |
| TV Series | Multi-episode TV. Structure: Season → Episode → Act. Selectable as beta/limited. Final launch needs episode metadata, series bible fields, and mapping against existing Series feature before it can be marketed as fully live. | Yes | Beta selectable, final episode engine required | Define and build TV episode metadata and avoid duplication with book-series management. | Product/Engineering |
| D&D Campaign | D&D tabletop campaign. Structure: Story Arc → Session → Encounter. Default sections include map, factions, worldhistory, and Character Builder. Type-specific DM story event indicators and D&D-flavoured positioning/prompt context defined. Shares editor. Enabled at launch. | Yes | Session engine + Character Builder implemented, needs QA | QA: create a D&D Campaign project, verify Arc/Session/Encounter labels, structured session prep/recap fields, all default sections including map, D&D-flavoured type description and AI prompt behavior, campaign export inclusion, and Character Builder Party room (wizard, sheet, dice roller). | Engineering/QA |
| TTRPG Campaign | System-neutral tabletop campaign. Structure: Story Arc → Session → Encounter. Same structural defaults as D&D but with system-neutral positioning, labels, indicators, and prompt context. Character Builder included in default sections. Enabled at launch; merge deferred because roadmap currently requires both launch types and migration would add launch risk. | Yes | Session engine + Character Builder implemented, needs QA | QA: create a TTRPG Campaign project, verify Arc/Session/Encounter labels, structured session prep/recap fields, system-neutral type description and AI prompt behavior, campaign export inclusion, and Character Builder Party room (wizard, sheet, dice roller). | Engineering/QA |
| Comic / Graphic Novel | Sequential art. Structure: Volume → Issue → Page. Selectable as beta/limited. Final launch needs panel planning, visual direction fields, and export expectations before it can be marketed as fully live. | Yes | Beta selectable, final panel workflow required | Define and build page/panel planning model and confirm export format. | Product/Engineering |
| Video Game | Interactive narrative. Temporary structure: Act → Chapter → Scene. Selectable as beta/limited. Final launch needs narrative-bible vs branching-support scope decision before it can be marketed as fully live. | Yes | Beta selectable, final narrative system required | Decide and build narrative bible first vs quests/dialogue trees/branching paths. | Product/Engineering |

## All Project Types Live Plan

Operating model: use beta to ship breadth safely, then deepen each discipline before final launch. A beta project type is allowed to be selectable if the UI labels it honestly, data persists safely, export does not crash, and missing workflow-specific features are not advertised as complete. Final launch requires the workflow waves below to be complete enough that the site can stand without planned continual development.

Current status: Wave 0 is implemented and partially smoke-tested. Wave 1 shared type foundation is implemented for type defaults, section defaults on new projects, starter outlines, dashboard language, type-specific workflow summaries, AI prompt context, workspace badges, project-settings type notes, and generic export labels; automated config/export smoke passed across all 10 types. Wave 2 script foundation has started with paragraph-level script element controls, Tab / Shift+Tab element cycling, Ctrl/Cmd+1-6 element shortcuts, Enter-based script paragraph flow, script-styled preview, persisted script block metadata, script metadata on new Play/Screenplay/TV starter scenes, readable script DOCX output, and toolbar/export beta labeling for script beta projects. Wave 4 tabletop session engine now adds structured session prep and recap fields to existing campaign session records and includes them in campaign exports; browser QA is still needed.

| Wave | Scope | Acceptance Criteria | QA Gate |
| --- | --- | --- | --- |
| 0. Beta access | All 10 project types can be created and edited; beta types show limited-workflow notes. | Create/edit flow accepts all configured project type IDs; project header shows type badge; homepage avoids unsupported feature claims. | Smoke check every type: create, open, add one structure item, refresh, export ZIP. |
| 1. Shared type foundation | Project-type defaults, dashboard language, AI prompt context, export labels, section defaults, and workspace badges. | Each type has distinct structure labels, default sections, prompt guidance, and visible type identity. | Smoke check live/beta type language in dashboard, manuscript, AI tools, and export menu. |
| 2. Script engine | Play, Screenplay, and TV share script element types, formatting controls, and script-aware export. | User can write dialogue/action/stage or screen directions and export a readable script document. | Deep QA for script editing, keyboard flow, export, and mobile layout. |
| 3. Episode engine | TV Series gets episode metadata, series bible fields, and season/episode dashboard affordances. | User can plan a season, track episode loglines/status/runtime, and distinguish TV Series from book Series. | Deep QA TV create/edit/dashboard/export. |
| 4. Tabletop session engine | D&D/TTRPG get structured session planning and recap fields without replacing existing campaign bible data. | User can plan and recap a session with hooks, encounters, NPCs, rewards, and consequences. | Deep QA campaign planning, persistence, and export. |
| 5. Comic panel engine | Comic/Graphic Novel gets page/panel planning and visual direction fields. | User can outline pages, panels, captions/dialogue, and art notes. | Deep QA page/panel CRUD and export. |
| 6. Game narrative engine | Video Game gets narrative-bible fields first; branching/quest/dialogue trees follow behind flags. | User can define quests/missions/dialogue notes or a scoped narrative bible without breaking prose workflows. | Deep QA game project CRUD, navigation, and export. |

## Conditional MVP

These items can ship in MVP only if they are already stable, required by a launch promise, or needed to avoid a blocker.

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 3. Core Polish | Modals and overlays | All critical modals open, close, trap focus reasonably, preserve unsaved work, and use consistent spacing and button order. | Conditional | Partial | Audit shared modal plus high-use feature modals. | Engineering/Design |
| 4. Manuscript | AI suggestion mode | AI assistance can suggest prose or ideas without overwriting user text unless the user explicitly applies it. | Conditional | Implemented, needs QA | AI sidebar panel with 4 quick-action chips (Continue, What's next?, Improve, Add dialogue) + custom prompt textarea. Streams output; user explicitly clicks "Append to scene" or "Copy" to apply. Never auto-applies. AI button in toolbar + AI tab in sidebar. Requires user to configure an AI provider in AI Settings. QA: test with a configured provider — generate, append, copy, discard; verify no auto-overwrite; test with no provider configured (shows warning). | Engineering/QA |
| 5. Worldbuilding | Internal linking | Characters, locations, lore, timeline, and history can reference each other where the launch workflow requires it. | Conditional | Partial | Define must-have links and postpone broad wiki-style linking. | Product/Engineering |
| 5. Worldbuilding | Search and filtering | Users can find major project records by name/category/status without scanning long lists manually. | Conditional | Partial | Audit search/filter coverage for characters, locations, lore, timeline, and ideas. | Engineering/QA |
| 6. Exports & Safety | PDF export | PDF visual encyclopaedia export is implemented (`downloadProjectPdf`) and available in the project export menu alongside ZIP and DOCX. Confirmed in scope. PDF theme options now derive from the current built-in app themes. | Conditional | Implemented, needs QA | Test PDF export on small, medium, and large projects; verify content ordering and visual output for each current built-in theme. | Engineering/QA |
| 6. Exports & Safety | Storage usage tracking | Users can see meaningful storage usage or limits before hitting failure states. | Conditional | Implemented, needs QA | Test account storage card against realistic manuscript/worldbuilding sizes. | Engineering/QA |
| 7. Launch | Empty/loading/error states | Core screens give clear empty, loading, and error feedback without dead ends. | Conditional | Partial | Audit top-level routes and each MVP module. | Design/Engineering |
| 7. Launch | Landing page | Landing page explains the writing/worldbuilding value proposition and routes cleanly into signup/pricing without advertising beta/limited workflows as complete. | Conditional | Expectation-setting copy updated, needs QA | QA homepage copy against beta-live scope; verify screenplay/TV claims mention beta limitations instead of completed script/episode engines. | Product/Design |
| 7. Launch | SEO basics | Title, description, OG tags, Twitter card, JSON-LD (WebSite, Organization, SoftwareApplication with pricing), robots, canonical, and keywords are all present. Description updated to include tabletop/campaign audience. | Conditional | Complete | No further action required before launch. | Engineering |
| 7. Launch | Analytics | Decision: skip for MVP. Add post-launch once product is stable. | Conditional | Deferred to post-launch | Move to Post-Launch. | Product |

## Post-Launch

| Feature | Requirement / Acceptance Criteria | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Full-screen writing mode | A distraction-reduced writing view is available and exits cleanly without losing the active scene. | Unknown/needs check | Verify current behavior; ship only if already stable. | Product/Engineering |
| Scroll-to-centre writing mode | Active scene can be brought into comfortable focus without breaking navigation or layout. | Implemented partially | Keep as polish unless it is already stable. | Product |
| Novel finalized draft reader | Novel projects can copy the current manuscript into timestamped, uneditable finalized draft snapshots and view them in a separate reader layout optimized for novel-style reading, with scroll and page-flip style viewing modes. | Implemented, needs QA | QA: finalise a novel draft, verify the working manuscript remains editable, verify the finalized copy is selectable/read-only, verify scroll/pages switching and previous/next page controls, and verify non-novel project types do not show the Finalise action. | Product/Engineering/QA |
| Passage comments/notes | Users can attach notes to a scene or passage-level context without creating data loss or editor instability. | Partial | De-scope passage-level annotation if scene notes are enough for launch. | Product |
| Factions and family grouping | Grouping supports the novelist workflow without blocking core character/lore use. | Implemented/optional | Keep visible only if stable; otherwise move to post-launch polish. | Product |
| EPUB-ready structure | Internal manuscript structure does not prevent future EPUB export; full EPUB generation is not required for MVP. | Preparation only | Move full EPUB export post-launch unless already complete. | Product/Engineering |
| Stylised encyclopedia export | Not required for MVP unless it is part of the paid launch promise. | Scope trap | Move to post-launch; keep basic project export as the launch requirement. | Product |
| Advanced map builder | Map features do not block core launch safety unless required by campaign or worldbuilding acceptance criteria. | Implemented/optional | Keep if stable; do not polish at the expense of data safety. | Product |
| Analytics | Privacy-conscious analytics (Posthog or equivalent) deferred to post-launch. Decision made 2026-05-24. | Post-launch | Add after launch once product is stable. | Product |
| Theme system v2 | New visual identity system with atmosphere token architecture, per-theme radius/shadow/glow personalities, and all studio vars auto-adapting via CSS var resolution. Theme editor now groups dark and light preset themes, uses compact selectors with a dedicated live preview, and exposes configurable custom colours, corner roundness, and colour/shadow strength. | Implemented, needs QA | QA AccountSettings theme editor: switch dark/light presets, edit custom colours, adjust roundness and visual strength, save to profile, refresh, and verify the live preview and app shell remain in sync. | Design/Engineering |
| Collaboration | Multi-user editing and sharing are excluded from MVP. | Post-launch | Document as future roadmap only. | Product |
| Marketplace/community | Marketplace and public community systems are excluded from MVP. | Post-launch | Avoid launch copy that implies community availability. | Product |
| Mobile apps | Native mobile apps are excluded; responsive web usability is the MVP requirement. | Post-launch | Focus mobile effort on web responsiveness. | Product |
| Advanced AI agents | Agentic workflows are excluded; MVP AI stays bounded and user-directed. | Post-launch | Define one or two safe AI assistance actions for launch. | Product/AI |
| AI chat history — pin & category | All AI chat sessions are persisted per project in localStorage. Sessions can be pinned (appear first) and tagged with a free-text category; category filter chips appear in the session list when categories exist. | Implemented | No further action needed for launch. | Engineering |
| Public sharing | Public project/profile sharing is excluded from MVP unless needed for launch marketing. | Post-launch | Keep private workspace promise clear. | Product |

## Icebox

New ideas start here unless they satisfy the Feature Intake Freeze rules.

| Feature | Why Parked | Decision Needed |
| --- | --- | --- |
| Voice dictation | Public roadmap exploration item; not novel-launch critical. | Revisit after MVP stability. |
| Publishing platform integrations | Public roadmap exploration item; expands surface area beyond launch. | Define target platforms after launch. |
| AI-assisted developmental editing feedback | Larger AI workflow than bounded MVP suggestions. | Revisit after MVP AI behavior is stable. |
| Native desktop app | Not required while responsive web is the MVP requirement. | Revisit after web launch. |
| Series management and cross-project references | Useful, but expands data model and project scoping. | Revisit after single-novel workflow is reliable. |
| Template library | Useful content/product layer, not a blocker. | Revisit after core writing flow passes QA. |

## Bugs

Use this section for confirmed defects only. Suspected issues stay in the relevant roadmap row until reproduced.

| Bug | Impact | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Autosave reliability not proven across refresh/navigation/rapid typing | Potential data loss; launch blocker if reproduced. | QA passed | Immediate refresh after typed input and saved records now preserves fresher browser data instead of letting older account data overwrite it. Keep covered in launch regression tests. | Engineering/QA |
| Restore flow | Restore from backup ZIP is now implemented. Needs end-to-end QA to confirm all project data (scenes, characters, lore, timeline, chapters) round-trips correctly through export → restore. | Implemented, needs QA | Export a project, restore it via the Restore button, compare content against original. | Engineering/QA |
| Responsive layout not proven across MVP screens | Could make mobile/tablet launch path unusable. | Mitigation added, needs QA | Re-test dashboard tiles and Status Queue width, mobile index reset/collapse, Map Builder disabled state, manuscript, account/settings, and edit modals across mobile/tablet widths. | Design/QA |
| Write button hidden on compact layouts | Users may be unable to find or enter the manuscript workspace on mobile/tablet. | Mitigation added, needs QA | The existing Write button now has a compact top-bar placement instead of disappearing at narrow widths. Verify desktop and compact layouts both expose the same Write action. | Design/QA |
| Story outline edits can fail rapid refresh testing | Potential data loss if outline structure/synopsis edits refresh before background persistence runs. | QA passed | Act, chapter, scene add/update/delete/reorder operations write local storage synchronously before React state scheduling; refresh/import prefers fresher browser data over older account data. User QA confirmed rapid-refresh persistence. | Engineering/QA |
| Refresh can lose the current app page or settings panel | Users may return to the wrong workspace after refresh, making settings and project pages feel unsaved. | Implemented, needs QA | Top-level project sections, writing mode, account settings tabs, and project settings now round-trip through the browser URL. QA: open a project section, writing mode, project settings, and each account settings tab; refresh each URL and verify the same view returns. | Engineering/QA |
| Account switch can overwrite loaded project library with previous account's browser copy | Cross-account project data can appear under the wrong user and overwrite the populated account's project list; launch blocker for auth/data safety. | Mitigation added, recovery artifact created, needs QA | Browser recovery metadata is now account-owned, stale project localStorage is cleared on sign-out, and local-over-remote recovery only runs when the browser copy belongs to the current user. Local exports were found and merged into `recovery/Aurethos-Recovered.zip` for user restore. QA: create/edit in account A, sign out, sign into populated account B, verify B's projects remain; repeat immediate-refresh autosave in the same account to confirm local recovery still works. | Engineering/QA |
| New accounts can inherit a previous browser-local theme | A freshly verified account may appear with another account's local theme instead of the default, creating cross-account preference leakage on shared browsers. | Fixed, needs QA | Signed-in accounts now apply their profile-saved theme when present, or the default app theme when no profile theme exists. QA: choose a non-default theme in account A, sign out, verify a new account B, and confirm B lands on the default theme until it saves its own appearance. | Engineering/QA |
| Log in again after sign-out opens homepage | Logout redirect adds an extra step by returning users to the marketing homepage instead of the login form. | Fixed | The signed-out interstitial now opens the login form directly when users choose Log in again; Go to homepage remains unchanged. Include in auth regression pass. | Engineering/QA |

## Change Control

When editing this roadmap:

- Keep MVP Required limited to blocker-level launch work.
- Move non-blocking polish to Post-Launch.
- Move unvalidated ideas to Icebox.
- Add bugs only after reproduction or a concrete QA finding.
- Update linked generated artifacts only after this roadmap changes, not the other way around.
