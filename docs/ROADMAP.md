# YOW Product Roadmap

This is the canonical planning source for Your Own World.

All feature planning, launch triage, blocker decisions, and roadmap changes should be made here first. Other planning artifacts must either link back to this file or be treated as historical/generated output.

## Agent Instructions

Codex, Claude, and any other project agent should use this file as the single planning document.

- For every meaningful project change, update this roadmap in the same turn when the change affects scope, status, blockers, bugs, next actions, ownership, or launch readiness.
- When QA is deferred, add the required checks to [docs/QA_PLAN.md](docs/QA_PLAN.md) in the same turn and keep building from this roadmap.
- When the work requires user action, user testing, a product decision, credentials, external setup, or any manual verification that cannot be completed by the agent, provide the user with clear step-by-step instructions at that point in the process.
- Do not create a separate roadmap, backlog, launch list, or planning document unless the user explicitly asks for an export or temporary working draft.
- YOW is not aiming for a minimal MVP. Final paid/public launch means the desired final product scope for the 6 active project types is complete enough to sell without relying on continual post-launch feature development.
- If the product decision is "we want this in YOW," treat it as launch scope unless it is explicitly excluded from the final product, belongs to a future business expansion, or is parked by a direct product decision.
- When a completed task closes or changes a roadmap item, update its status and next action before finishing.
- If no roadmap update is needed, briefly say why in the final response.

## Phase 0 Rules

### Master Roadmap

Status: Active

Acceptance criteria:

- One canonical roadmap exists with Active, Launch Required, Future/Excluded, Icebox, and Bugs sections.
- Scattered planning notes are moved here or linked from here.
- Generated artifacts, public roadmap database seeds, and acceptance-matrix documents do not override this file.

Linked/historical sources:

- [YOW_MVP_Acceptance_Criteria_Matrix.docx](../YOW_MVP_Acceptance_Criteria_Matrix.docx) is the generated acceptance-matrix document.
- [scripts/create_yow_mvp_matrix.py](../scripts/create_yow_mvp_matrix.py) is the script that generated the initial matrix content.
- [supabase/migrations/20260521_roadmap.sql](../supabase/migrations/20260521_roadmap.sql) seeds the public-facing app roadmap. It is display data, not the product planning source of truth.

### Final Product Scope Discipline

Status: Active

Product stage definition:

- Public beta is the build-and-test period. It may expose incomplete workflows if they are clearly labeled, data-safe, and not misleading.
- Final launch is the fully specced website. The intent is to implement the desired full product now, during beta, and avoid relying on continual post-launch development to finish core feature promises.
- "Launch blocker" still means the issue must be fixed before any public paid/final launch. During beta, the same blocker policy is used to decide whether a beta build is safe enough to keep using.
- Paid/final launch must not market any of the 6 active project types as beta, limited, or coming soon. If an active project type is not fully ready, launch waits or the product scope must be explicitly changed.
- Real paid checkout should remain disabled or treated as test-only until the Launch Readiness Gate below is passed.

Launch scope rule:

- YOW is being built as the final paid launch product, not a narrow MVP.
- Desired product capabilities are launch scope by default.
- Only move a desired capability out of launch scope when there is an explicit product decision that it is a future expansion, excluded business model, or not part of YOW's paid promise.
- Do not hide a desired launch capability in Future/Excluded just because it is complex.

Parking-lot process:

- New ideas still go to Icebox until the user makes a product decision.
- Once the user confirms "we want this," move it into launch scope with acceptance criteria unless they explicitly say it is future/excluded.
- Future/Excluded is for capabilities outside the final product promise, such as collaboration, marketplace/community, native mobile apps, or other future business lines.

Launch blocker definition:

Only data loss, broken auth, broken save, broken export, unusable editor, unusable responsive layout, or missing legal/payment essentials are technical blockers for beta safety. For final paid/public launch, incomplete desired product capabilities also block launch if they are part of the final product promise.

### Launch Readiness Gate

Status: Active

YOW is launch-ready only when every gate below is passed. This is the operating definition for "we can confidently take money."

| Gate | Required Outcome | Status |
| --- | --- | --- |
| Scope gate | All items in Launch Required and To Be Implemented are either complete and QA-passed, or explicitly moved to Future/Excluded by product decision. | Open |
| Project-type gate | Novel, Novella, Short Story, D&D Campaign, TTRPG Campaign, and Comic/Graphic Novel are all fully live for their promised workflows. No active launch type is marketed as beta/limited at final launch. | Open |
| Data safety gate | Auth, save, autosave, restore, export, account isolation, local/cloud transition, and storage-limit behavior are QA-passed with no known data-loss blocker. | Open |
| Export ownership gate | Users can export complete project data through ZIP/DOCX/PDF/World Bible where promised, including before cloud expiry or inactive-account cleanup. | Open |
| Payment gate | Stripe test-mode QA passes for Monthly, Lifetime, Founder, and £6 hosting renewal; live keys/prices/webhooks are reviewed before real checkout is enabled. | Open |
| Legal and promise gate | Pricing, FAQ, Terms, privacy, cancellation, storage caps, Local Mode, cloud expiry, Founder recognition, and export ownership copy match the roadmap decisions. | Open |
| Responsive gate | Core workflows work at mobile, tablet, and desktop widths without hidden critical controls or broken layouts. | Open |
| Performance gate | A realistic large project remains usable for dashboard, writing, search, worldbuilding, map builder, and exports. | Open |
| Marketing gate | Homepage, features, FAQ, pricing, SEO schema, and public pages do not imply excluded features such as collaboration, public sharing, read-only player views, fantasy calendar engines, mobile apps, marketplace/community, publishing integrations, or live VTT play. D&D/TTRPG copy is positioned for prep-focused solo GMs/private campaign planning. | Open |

Launch triage decision (2026-07-04): feature-freeze the Map Builder for new depth until the full QA checklist passes or specific defects require small corrective changes. Schedule polish is accepted into launch scope as a practical configurable story/campaign calendar, but still not marketed as a full invented-calendar engine. Local storage is accepted into launch scope only through the downloadable desktop app/local vault; browser accounts require Cloud Mode. Collaboration remains excluded.

## Competitive Positioning Risks

These are known places where YOW is behind more mature writing/worldbuilding and TTRPG tools. Treat them as launch-positioning constraints unless a direct product decision moves one into launch scope.

| Area | Competitive Gap | Product Decision / Launch Implication | Next Action |
| --- | --- | --- | --- |
| Collaboration and sharing | YOW has no collaboration, shared workspace, public project sharing, or read-only player view. LegendKeeper, Kanka, and World Anvil all offer at least some player/public viewing path, and many GM buyers expect this. | This is a deliberate exclusion from final launch. D&D/TTRPG marketing must target prep-focused solo GMs and private campaign planning, not group campaign portals, shared player bibles, or live table use. | Audit D&D/TTRPG marketing copy before paid launch for solo-GM/private-prep positioning. Treat a future read-only share link/player-view as the single highest-value item on the excluded/future list, but do not promise it at launch. |
| Fantasy calendars | YOW has eras, timelines, history, and Schedule, but no full fantasy calendar simulation engine. Kanka and World Anvil offer invented-calendar systems that some TTRPG users actively use. | Schedule polish is launch scope: configurable month/week lengths and labels. A full invented-calendar engine with leap rules, moons, conversions, and complex recurrence is not launch scope unless explicitly re-decided. | Keep marketing language to "Schedule" or "story/campaign calendar" rather than "fantasy calendar engine." |
| Maturity and trust | Competitors have years of hardening, user communities, reviews, tutorials, and social proof. YOW starts with little public trust. | Founder tier and beta-user seeding are the correct trust instruments; product copy should be honest about ownership, export, and focused scope rather than pretending to have incumbent scale. | Seed Founder/beta users before broader paid launch where possible; collect testimonials, screenshots, and real project examples for marketing after consent. |
| Map builder polish | YOW's map builder is ambitious and drawing-based, but it is also one of the highest-risk/stability subsystems. Dedicated tools and LegendKeeper-style map workflows may feel more polished. | Feature-freeze new depth until QA passes. The launch promise remains planning-grade maps with safe persistence/export, not a full dedicated cartography suite or VTT. | Prioritize authenticated QA, persistence/export, predictable selection/drawing, and responsive safety over adding more map features. |
| Web-only and local-first storage | Browser-based drafting will not satisfy every Scrivener-style user who wants native desktop files and no browser dependency. | Product decision 2026-07-04: the Lifetime tier becomes a downloadable desktop app with a local project vault (see PRD: Desktop Lifetime App and Local Vault), directly answering the Scrivener-style objection. Free/Monthly remain web-only. Do not advertise the desktop app publicly until it is real (Phase 6). | Execute the desktop phases; keep pricing/FAQ copy on the current web + Local Mode promise until Phase 6 updates it. |

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
- Advanced workflow refinements that are explicitly excluded from the final launch promise.
- Edge cases that have a clear workaround and do not risk data, payment, access, or legal trust.
- New feature ideas that have not yet been accepted into the final product promise.

Triage labels:

| Label | Meaning | Required Action |
| --- | --- | --- |
| Blocker | Fits one of the blocker categories above and prevents launch. | Fix before launch or change the launch promise/scope so it no longer blocks. |
| Conditional | Could block launch only if it is part of the paid/public promise or affects a required workflow. | Decide whether it is launch scope; otherwise mark Future/Excluded explicitly. |
| Launch Required | Required for the final paid launch product, even if beta can temporarily run without it. | Implement and QA before final paid/public launch. |
| Future/Excluded | Valuable but explicitly outside the final launch promise or a future business expansion. | Park with a clear product reason. |
| Icebox | Interesting, unvalidated, or not yet tied to a launch outcome. | Park until there is a stronger product reason. |

Triage rule:

Every bug or proposed launch change must answer both: does this create data loss, broken auth, broken save, broken export, unusable editor, unusable responsive layout, or missing legal/payment essentials; and is it part of the final product promise? Technical blockers decide beta safety, while final-product gaps decide final paid launch readiness.

## Active

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 0. Stop the Chaos | Master roadmap | One canonical roadmap exists with Active, Launch Required, Future/Excluded, Icebox, and Bugs sections; all scattered notes are moved or linked. | Yes | Active | Keep this file as the only planning source. | Product |
| 0. Stop the Chaos | Final product scope discipline | Final paid/public launch is the desired final product, not a minimal MVP. Desired capabilities are launch scope unless explicitly marked Future/Excluded or Icebox by product decision. | Yes | Active | Enforce the decision rule and parking-lot process above. | Product |
| 1. Scope Freeze | Exact launch product list | The final launch feature list is locked, versioned, and mapped to acceptance criteria in this roadmap. | Yes | Active | Update only through explicit roadmap decisions. | Product |
| 1. Scope Freeze | Fully stacked launch scope | Public beta may expose beta/limited workflows, but final launch requires the fully specced project-type stack: all 6 active project types (Novel, Novella, Short Story, D&D Campaign, Tabletop Campaign, Comic/Graphic Novel) must have their promised discipline-specific workflows, safe persistence, and stable exports. Shared projects, live collaboration, player portals, and online tabletop/campaign-room features are explicitly out of launch scope; YOW remains a private planning, drafting, worldbuilding, and export workspace rather than a virtual tabletop. Play, Screenplay, TV Series, and Video Game have been retired from active scope, removed from the UI, and removed from all roadmap scope. Their constants are preserved in RETIRED_PROJECT_TYPES as a code-level backup only. | Yes | In progress | Use beta labels while building, then complete discipline-specific workflow waves for the 6 active types before final launch. | Product/Engineering |
| 2. Define Good Enough | Launch blocker policy | A blocker is limited to data loss, broken auth, broken save, broken export, unusable editor, unusable mobile layout, or missing legal/payment essentials. | Yes | Adopted | Apply the blocker policy to every triage pass before changing launch scope or beta safety. | Product/QA |
| 2. Define Good Enough | QA automation baseline | A single local QA command runs the basic release-safety checks before deeper browser smoke tests. | Yes | Automated in CI | `npm run qa` runs lint, production build, and load check. `npm run qa:smoke` starts Vite in offline mode and now covers create/write/refresh/export/restore, DOCX/PDF export downloads, all configured project-type creation with starter structure/default sections, and mobile/tablet writing reachability. GitHub Actions runs static QA plus named smoke jobs on push, pull request, daily schedule, and manual dispatch, with Playwright annotations and artifacts uploaded on failure. Current Codex macOS sandbox blocks Chromium launch at Mach-port registration, so browser smoke is verified through a normal local terminal or CI runner. React compiler advisories remain as warnings. | Engineering/QA |
| 2. Define Good Enough | Manual QA checklist | A complete manual QA checklist exists covering all 28 test sections: auth, dashboard, manuscript editor (all 5 live project types), worldbuilding (characters, locations, lore, timeline), map, family tree, factions, ideas, schedule, character builder, exports (ZIP/DOCX/PDF/restore), AI tools, account settings (themes, storage, AI provider), pricing, URL persistence, modals, studio, novel reader, responsive layout (375px/768px/1280px+), public/marketing pages, large-project stress test, data safety edge cases, and legal/compliance. Each item has pass/fail/skip status, freeform notes, and export to Markdown, HTML report, JSON, or CSV. State persists in localStorage. | Yes | Complete | Open [docs/qa-checklist.html](docs/qa-checklist.html) directly in a browser as the manual test runner before each release. | QA |
| 2. Define Good Enough | Deferred QA plan | A single deferred QA plan accumulates every required QA item while development continues, so launch-readiness verification can happen together later without losing coverage. | Yes | Active | Add new required checks to [docs/QA_PLAN.md](docs/QA_PLAN.md) whenever implementation changes behavior. | Product/Engineering/QA |

## Launch Required

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Scope Freeze | Project-type access model | All 6 active project types are selectable in create/edit flows. Comic/Graphic Novel may be marked beta/limited during public beta only. Final paid launch requires all 6 active project types to be marketed as fully live or launch waits. Unknown imported types fall back safely to Novel. Retired types (Play, Screenplay, TV Series, Video Game) are not shown in the UI; their constants exist in RETIRED_PROJECT_TYPES as a code-level backup only and must never reappear in the UI or marketing copy. | Yes | Beta-live model implemented, scope reduced to 6 types | Automated smoke verified active project types, live/beta stages, structure labels, section defaults, and ZIP/DOCX/PDF blob generation. Browser smoke verified homepage beta-live expectation copy. Still needs authenticated/offline UI pass for create/open/export clicks and final-launch copy pass to remove beta/limited labels after QA passes. | Engineering/QA |
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
| 5. Worldbuilding | Timeline and history linking | Timeline events and world-history entries can be created, edited, linked/unlinked, and persist by project. | Yes | Era system + Timeline rework implemented 2026-06-26, timeline regression fix 2026-06-27, needs authenticated browser QA | **Era system:** Eras are a first-class data type stored in `nf_eras` per novel with CRUD in `useStore.js` (`addEra`, `updateEra`, `deleteEra`; deleting an era clears `eraId` on affected entries). `EraManager.jsx` provides modal CRUD (name, startYear, endYear) via the WorldHistory Eras button. `ChronicleEntryForm` uses a dropdown when eras exist; WorldHistory entries use `startYear` (required) + `endYear` (optional) numeric fields. **WorldHistory rework:** entries group by `eraId` sorted by `startYear`; era sections always render (including empty ones); legacy string-era entries group under "Other"; unassigned entries group under "Unassigned". **Timeline complete rework (2026-06-26):** left-spine single-column layout (`--spine: 120px`); era filter chip strip; per-section `tl2-era-band` headers including a muted "No era assigned" divider for unassigned events; slide-in 300px detail panel with character/location navigation chips; birthday events as compact axis markers; `tl2-*` CSS; alternating-left/right layout removed. **Regression fix (2026-06-27):** missing `tl2-*` layout styles restored; `nf_eras` now survives local snapshot/import/clear flows; `caniuse-lite` pinned to a PostCSS-compatible data patch so CSS builds load. Timeline/history create/edit/delete/link/unlink writes local storage synchronously. Series-synced entries resolve forward in reading order; delete prompts support current-project-only vs all-synced. QA: era CRUD, entries reassign to unassigned on era delete, WorldHistory startYear sort and era grouping, Timeline era sections and "No era assigned" divider, detail panel navigation, birthday markers, filter chip strip, instant-refresh persistence, forward-series overrides, scoped deletes, inherited dashboard counts, authenticated timeline visual pass at desktop/tablet/mobile. | Engineering/QA |
| 6. Exports & Safety | Project export | Users can export a complete project archive containing manuscript and worldbuilding data in a restorable format. | Yes | Implemented, needs QA | Test export contents for small, medium, and large projects. | Engineering/QA |
| 6. Exports & Safety | Manuscript export | Users can export manuscript content in a readable document format with chapters/scenes in the correct order. | Yes | Implemented, needs QA | Test .docx export for formatting, ordering, empty scenes, and large manuscripts. | Engineering/QA |
| 6. Exports & Safety | Backups | Backup = cloud sync (Firestore, active for logged-in users) + manual ZIP export. No scheduled backup is required for final launch unless a new product decision adds it to the paid promise. Definition is final. | Yes | Implemented, needs QA | Test that logged-in users have their data in Firestore and that the ZIP export contains all project data. | Engineering/QA |
| 6. Exports & Safety | Restore flows | Users can restore a project from a YOW backup ZIP or import a compatible structured project archive through Import ZIP in the library top bar. Both flows are handled by the Import modal: YOW exports trigger the existing `populateYowProject` path (full ID remapping, all sections); compatible archives are quietly auto-detected by their folder structure and populated through the structured-ZIP compatibility path — manuscript chapters become scenes, items route to lore, and other/snippets/notes become raw idea captures. The UI describes this only as ZIP/archive import and does not advertise a third-party-specific importer. The library top bar has a single Import ▾ dropdown (AI Import and Import ZIP), and a pre-import section-selection UI shows counts for each data type. Updated 2026-07-08: YOW restores keep the exported project type (previously forced to Novel), carry word target/enabled sections, and restore comic pages/panels and Character Builder party members; structured archives can be created as any of the 6 active types via the new Create-as selector. | Yes | Implemented, needs QA | QA: (1) Export a YOW project, use Import ZIP to restore it, and verify all content round-trips under a new project entry — include a comic project (pages/panels) and a campaign project (party characters), and verify the restored type matches. (2) Drop a compatible structured project ZIP and verify characters, locations, lore, manuscript, and other entries import correctly without third-party branding in the UI. | Engineering/QA |
| 7. Launch | Authentication | Sign up, sign in, sign out, session restore, and password/error states work reliably across refreshes. | Yes | Implemented, needs QA | Signup now shows a human-readable error ("An account with this email already exists. Try logging in instead.") instead of the raw Supabase message when a duplicate email is submitted. Google Sign-In added via Supabase OAuth (`signInWithGoogle` in `AuthContext`, "Continue with Google" button with Google logo in `LoginPage` shown on login and signup forms, hidden on reset-password form). Run auth regression pass with fresh user, returning user, invalid credentials, duplicate email signup, expired session, direct `/login` and `/signup` URLs, password reset returning to `/login`, and Google OAuth sign-in/sign-up flow. | Engineering/QA |
| 7. Launch | Autosave reliability | Autosave has explicit test coverage or manual proof for refresh, navigation, rapid typing, and multi-scene work. | Yes | High-risk QA | Make this the first launch-readiness test pass. | Engineering/QA |
| 7. Launch | Large project performance | Dashboard, manuscript, search, and export remain usable on a realistic large novel project. | Yes | Needs QA | Create/load a stress project and measure obvious failures. | Engineering/QA |

## Project Type Launch Scope

The public beta must be honest about the project-type stack. Beta project types may be selectable before their full discipline-specific engine exists, but the UI and marketing copy must clearly say what is limited. Final paid launch, however, means the fully specced website: each project type needs its own structure, language, defaults, export expectations, QA scenarios, and promised discipline-specific workflow. No active launch project type may remain publicly labeled beta/limited at final paid launch.

| Project Type | Unique Launch Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- |
| Novel | Long-form prose workflow supports acts, chapters, scenes, manuscript drafting, worldbuilding, timeline/history, character systems, project export, and manuscript export. | Yes | Active baseline | Continue QA against autosave, editor stability, exports, and large-project performance. | Product/Engineering/QA |
| Novella | Medium-length prose workflow. Structure: Part → Chapter → Scene. Lighter default sections (outline, characters, locations, lore, ideas, schedule, timeline). Type-specific story event indicators and a 30,000-word default target defined. Shares the manuscript editor with Novel. Enabled at launch. | Yes | Enabled, needs QA | QA: create a Novella project, verify Part/Chapter/Scene labels appear in structure sidebar, verify lighter default section set, verify default word target appears, verify export works. | Engineering/QA |
| Short Story | Short-form prose workflow. Structure: Part → Section → Scene. Compact default sections matching Novella set. Type-specific story event indicators and a 5,000-word default target defined. Shares the manuscript editor. Enabled at launch. | Yes | Enabled, needs QA | QA: create a Short Story project, verify Part/Section/Scene labels, verify default sections, verify default word target appears, verify export. | Engineering/QA |
| D&D Campaign | D&D tabletop campaign. Structure: Story Arc → Session → Encounter. Default sections include map, factions, worldhistory, and Character Builder. Type-specific DM story event indicators and D&D-flavoured positioning/prompt context defined. Shares editor. Launch promise is DM-side campaign planning, not online play, shared projects, live player access, or a virtual tabletop. Enabled at launch. | Yes | Session engine + Character Builder implemented, needs QA | QA: create a D&D Campaign project, verify Arc/Session/Encounter labels, structured session prep/recap fields, all default sections including map, D&D-flavoured type description and AI prompt behavior, campaign export inclusion, and Character Builder Party room (wizard, sheet, dice roller). Also verify public copy does not imply shared campaign rooms, live player portals, or virtual-tabletop play. | Engineering/QA |
| TTRPG Campaign | System-neutral tabletop campaign. Structure: Story Arc → Session → Encounter. Same structural defaults as D&D but with system-neutral positioning, labels, indicators, and prompt context. Character Builder included in default sections. Launch promise is GM-side campaign planning, not online play, shared projects, live player access, or a virtual tabletop. Enabled at launch; merge deferred because roadmap currently requires both launch types and migration would add launch risk. | Yes | Session engine + Character Builder implemented, needs QA | QA: create a TTRPG Campaign project, verify Arc/Session/Encounter labels, structured session prep/recap fields, system-neutral type description and AI prompt behavior, campaign export inclusion, and Character Builder Party room (wizard, sheet, dice roller). Also verify public copy does not imply shared campaign rooms, live player portals, or virtual-tabletop play. | Engineering/QA |
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
- Whether visual reference images belong in this engine now or should remain in existing image/map/lore systems until a future product decision.

## All Project Types Live Plan

Operating model: use beta to ship breadth safely, then deepen each discipline before final launch. A beta project type is allowed to be selectable if the UI labels it honestly, data persists safely, export does not crash, and missing workflow-specific features are not advertised as complete. Final launch requires the workflow waves below to be complete enough that the site can stand without planned continual development.

Current status: Wave 0 is implemented and partially smoke-tested. Wave 1 shared type foundation is implemented for type defaults, section defaults on new projects, starter outlines, dashboard language, type-specific workflow summaries, AI prompt context, workspace badges, project-settings type notes, and generic export labels; automated config/export smoke passed across all 6 active types. Wave 2 tabletop session engine adds structured session prep and recap fields to existing campaign session records and includes them in campaign exports; browser QA is still needed. Wave 3 comic panel engine implemented 2026-06-13 with Volume → Issue → Page → Panel structure, full page/panel field editors, reference image/PDF upload, DOCX script export, and ZIP round-trip; browser QA needed.

| Wave | Scope | Acceptance Criteria | QA Gate |
| --- | --- | --- | --- |
| 0. Beta access | All 6 active project types can be created and edited; beta types show limited-workflow notes. | Create/edit flow accepts all configured project type IDs; project header shows type badge; homepage avoids unsupported feature claims. | Smoke check every type: create, open, add one structure item, refresh, export ZIP. |
| 1. Shared type foundation | Project-type defaults, dashboard language, AI prompt context, export labels, section defaults, and workspace badges. | Each type has distinct structure labels, default sections, prompt guidance, and visible type identity. | Smoke check live/beta type language in dashboard, manuscript, AI tools, and export menu. |
| 2. Tabletop session engine | D&D/TTRPG get structured session planning and recap fields without replacing existing campaign bible data. | User can plan and recap a session with hooks, encounters, NPCs, rewards, and consequences. | Deep QA campaign planning, persistence, and export. |
| 3. Comic panel engine | Comic/Graphic Novel gets page/panel planning, visual direction fields, reference image/PDF upload, and comic script export. | User can outline pages, panels, captions/dialogue, art notes, and upload reference images; data round-trips through ZIP and DOCX export. | Deep QA per the QA Plan in the Comic Panel Engine PRD above. |

## Conditional Launch Scope

These items can ship in beta only if they are already stable, required by a launch promise, or needed to avoid a blocker. For final paid/public launch, any desired product capability must be complete or explicitly moved to Future/Excluded by product decision.

| Phase | Feature | Requirement / Acceptance Criteria | Blocker? | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 3. Core Polish | Modals and overlays | All critical modals open, close, trap focus reasonably, preserve unsaved work, and use consistent spacing and button order. | Conditional | Implemented, needs QA | All modals now support Escape-to-close: shared StudioSheet handles it natively with dirty-state guard; EditSeriesModal, EditProjectModal, and inline new-project/new-series forms in NovelManager all have useEscapeKey(); ScheduleCalendar EventModal and SeriesDashboard AddProjectModal/ConfirmDialog also wired. QA: open each modal, press Escape with and without changes; verify dirty-state confirm prompt appears; verify backdrop click closes. | Engineering/Design |
| 4. Manuscript | AI suggestion mode | AI assistance can suggest prose or ideas without overwriting user text unless the user explicitly applies it. | Conditional | Implemented, needs QA | AI sidebar panel with 4 quick-action chips (Continue, What's next?, Improve, Add dialogue) + custom prompt textarea. Streams output; user explicitly clicks "Append to scene" or "Copy" to apply. Never auto-applies. AI button in toolbar + AI tab in sidebar. Requires user to configure an AI provider in AI Settings. QA: test with a configured provider — generate, append, copy, discard; verify no auto-overwrite; test with no provider configured (shows warning). | Engineering/QA |
| 5. Worldbuilding | Internal linking | Characters, locations, lore, timeline, and history can reference each other where the launch workflow requires it. | Conditional | Implemented, needs QA | Full cross-reference sweep complete: Timeline and WorldHistory detail views show linked characters/locations as clickable chips that navigate to the target entity. Characters Relationships tab shows "Referenced in" incoming refs (lore entries, timeline events). Locations detail shows "Referenced in" (lore entries with chip navigation, timeline events). Lore entries support lore-to-lore `loreIds` links via LinkPicker in the edit form; detail view shows "Related Lore" with both outgoing links and incoming reverse-refs (prefixed ←). All powered by pure utility functions in `src/utils/worldLinks.js`. QA: create linked entities across sections; verify chips appear and navigate correctly; verify reverse-refs appear on target entry. | Product/Engineering |
| 5. Worldbuilding | Character relationship mapping | A dedicated Relationship Map keeps the selected character as the focal point and displays each direct non-family character once around them; users can change focus, add/remove social links, and open the focal profile. Focal changes use a short zoom-in transition, direct nodes adapt into one or two rings for dense casts, and each direct character's wider network is consolidated into a small `+N` badge rather than rendering cramped second-degree nodes. Genealogy remains a separate Family Tree using parent, child, spouse, family-group, and generation data. | Conditional | Implemented, needs QA | Verify pair uniqueness (including legacy reciprocal/duplicate data), focal zoom/reduced motion, adaptive dense-cast layout, `+N` wider-network counts/tooltips, incoming/outgoing links, add/remove persistence, family-link exclusion, empty states, profile navigation, and responsive layout. | Product/Engineering/QA |
| 5. Worldbuilding | Search and filtering | Users can find major project records by name/category/status without scanning long lists manually. | Conditional | Implemented, needs QA | Characters: search by name, sort by name/role/faction, filter by family group and faction with active filter count and clear button, "No matches" message on empty results, "No characters yet" message on empty list. Locations: search by name, sort by name/category, "No matches" and "No locations yet" empty states. Lore: search by title, category filter, tag filter, sort — all with "No results" fallback. Timeline: search across title/description/date/tags. WorldHistory: search across title/era/description; sort by era A→Z/Z→A, title A→Z/Z→A, or year ↑/↓ (year parsed from free-text date field; no parseable year sorts last; year sort flattens era grouping). Ideas: per-column empty states. QA: test search/filter on each worldbuilding section with empty and populated projects. | Engineering/QA |
| 6. Exports & Safety | Storage usage tracking | Users can see meaningful storage usage or limits before hitting failure states. | Conditional | Improved, needs QA | Cloud "storage limit reached" warnings present a consistent message: the toast shows exact used/quota bytes and a "Storage settings" button that opens the Storage tab; the StorageCard exceeded message includes inline used/quota numbers; `storageExceededCheck()` in useStore passes `usedBytes` and `quotaBytes` through the `membership-read-only` event so the toast can render them. Desktop local vault usage is shown separately without a YOW quota cap because it is limited by the user's disk/device storage, not by plan. Test cloud storage-exceeded toast from create/save actions, verify numbers appear in toast and StorageCard, verify "Storage settings" opens the Storage tab, and verify desktop local usage shows without a YOW cap. | Engineering/QA |
| 7. Launch | Empty/loading/error states | Core screens give clear empty, loading, and error feedback without dead ends. | Conditional | Improved, needs QA | Dashboard first-run empty account state now has a specific welcome, project/import CTAs, and guided tour steps. Characters index: "No characters yet" + "No matches" on search/filter. Locations index: "No locations yet" + "No matches". Lore index: existing "No results" fallback. WorldHistory index: existing empty/no-match states. Ideas Kanban: per-column empty drop-target state. StudioEmpty used consistently for detail panes across all worldbuilding sections. QA: test each section with zero records, then with records but a no-match search. | Design/Engineering |
| 7. Launch | Landing page | Landing page explains the writing/worldbuilding value proposition and routes cleanly into signup/pricing without advertising beta/limited workflows as complete. | Conditional | Public pages overhauled 2026-06-26; needs QA | `/features/` and `/faq/` are now real pages wired into the SPA router (`isFeaturesPath`/`isFAQPath` in App.jsx). `/founders/` added as a fourth SPA route (`isFoundersPath`/`showFounders` in `App.jsx`); all four routes excluded from `staticHtmlMiddleware` in `vite.config.mjs` so the React app handles them with the active theme. Shared `MarketingFooter` component created with Product/Use Cases/Tools columns, used on all React public pages. `MarketingNav` updated with Founders as fourth link. Blog removed from nav on all 16 non-blog static HTML pages; Founders added to all static pages. `/faq/` gained a Local Mode accordion section. Pricing CTA buttons moved to bottom of tiles. Homepage hero `min-height` removed. CTA h2 given `white-space: nowrap` and improved spacing. `FoundersPage` React component created and routed. `/features/` has: per-project-type feature matrix (Prose Fiction grouped as Novel/Novella/Short Story, Comic/Graphic Novel with Beta badge, Tabletop Campaign, D&D Campaign), unique-per-type callout cards, and a prose-format differences breakdown (word targets, structures, default rooms). `/faq/` has four accordion sections (Plans & Pricing, Features & AI, Data & Storage, Getting Started) updated to match current plan copy. Blog link removed from marketing nav. "Compare plans" on pricing changed from `href="#comparison"` to a `scrollIntoView` button to avoid hash-nav SPA conflicts. Homepage hero redesigned 2026-06-26: replaced fake-UI mockup with atmospheric illustration (public/homepage 1.png) as full-viewport-width background; hero section moved outside .yow-home-main for true full-bleed; image fades into dark teal via overlapping radial gradient CSS mask; dark teal scrim ::before for text readability; text-shadow on hero copy; headline and body centered across hero; nav gap fixed by removing padding-top from .yow-home; image opacity 0.68. QA: hard-reload /features/ and /faq/; test all nav links; FAQ accordion expand/collapse; confirm Blog absent; Compare plans scrolls; back/forward nav. QA homepage hero at 375px/768px/1280px: image loads, edge fade visible, copy readable, nav flush on load, CTAs reachable. Also QA homepage copy against beta-live scope. | Product/Design/Engineering |
| 7. Launch | Pricing recommendation | Four-plan launch structure: Free, Monthly, Lifetime, Founder. Prices are Free forever, Monthly at £12/month, Lifetime at £179 once, Founder at £399 once, and Lifetime cloud hosting renewal at £6/year after the included hosting period. Rationale: keep Free genuinely useful, make Monthly available but intentionally less compelling over time, make Lifetime the best-value serious-writer option, position Founder as a supporter/status tier rather than the best-value deal, and keep cloud renewal mentally simple at 50p/month. | Conditional | Implemented, needs highest-priority Stripe QA | Highest priority before real paid checkout: run [docs/QA_PLAN.md](docs/QA_PLAN.md) Priority 0 Stripe test-mode billing QA. Verify test-mode Stripe secrets, price IDs, webhook secret, webhook events, function deployment, Monthly/Lifetime/Founder/hosting renewal checkout, metadata updates, cancellation/failure behavior, and restore live Stripe values before accepting real payments. | Product/Engineering/QA |
| 7. Launch | Lifetime local mode and cloud hosting split | Lifetime access must mean permanent access to the YOW desktop app and local project tools, while Supabase cloud storage/sync/backups remain a separately entitled hosted service. Lifetime users whose included hosting has ended can continue in the downloaded desktop app Local Mode without ongoing Supabase project storage writes; Monthly and Founder users keep Cloud Mode while entitled. Fulfilment mechanism updated 2026-07-05: browser Local Mode is no longer a product path; web accounts require Cloud Mode/cloud access, and local project storage requires the downloaded desktop app + local vault (see PRD: Desktop Lifetime App and Local Vault). | Yes | Desktop re-architecture in progress | QA/legal checks are tracked in [docs/QA_PLAN.md](docs/QA_PLAN.md); verify desktop Local Mode editing, no cloud writes while Local-first/manual sync is active, renewal checkout, web cloud-required behavior, and entitlement metadata before selling Lifetime plans. Lifetime should not be sold on desktop copy until the desktop phases complete. | Product/Engineering/QA |
| 7. Launch | SEO basics | Title, description, OG tags, Twitter card, JSON-LD (WebSite, Organization, SoftwareApplication with pricing), robots, canonical, and keywords are all present. Description updated to include tabletop/campaign audience. | Conditional | Complete | No further action required before launch. | Engineering |
| 7. Launch | Analytics | Google Analytics 4 (tag G-L1BT87PKXV) added to all 25 HTML files — React app root and all static marketing/blog pages. | Conditional | Complete | No further action required before launch. | Engineering |

## PRD: Lifetime Local Mode and Cloud Hosting Split

> Scope update 2026-07-05: the Lifetime tier is being re-architected as a downloadable desktop app with a local project vault — see [PRD: Desktop Lifetime App and Local Vault](#prd-desktop-lifetime-app-and-local-vault). The entitlement rules, grace/archive policy, storage caps, and renewal billing below remain in force; what changes is the fulfilment mechanism: Lifetime local storage moves from browser Local Mode to the desktop vault. Browser Local Mode is no longer a product path; web accounts require active Cloud Mode/cloud access.

### Product Decision

Lifetime users should keep permanent access to the YOW app, local project editing, import, and export. They should not receive indefinite Supabase cloud storage, sync, hosted backups, or file hosting unless they are within the included hosting period, renew hosting, or hold Founder status.

YOW should be positioned as ownership-first software with optional hosted cloud services:

- App access: lifetime for Lifetime and Founder purchasers.
- Cloud Mode: Supabase-backed sync, hosted project data, storage, backups, and cross-device access.
- Local Mode: downloaded desktop app/local vault projects, import/export, and no automatic cloud sync/storage writes.

### Non-Negotiable User Promise

Users must never feel that their writing is held hostage. A lapsed hosting entitlement may disable cloud sync/storage, but it must preserve:

- app access,
- local project editing,
- full project export,
- backup import/restore,
- clear account status messaging,
- a paid path to restore cloud hosting.

### Entitlement Rules

| User State | App Access | Cloud Mode | Local Mode | Export |
| --- | --- | --- | --- | --- |
| Free | Yes | Limited to free plan rules | Yes | Yes |
| Monthly active | Yes | Yes while subscribed | Yes | Yes |
| Monthly cancelled/expired | Yes, per free/read-only rules | No paid cloud entitlement after billing period | Yes | Yes |
| Lifetime within included hosting | Yes | Yes until included hosting ends | Yes | Yes |
| Lifetime hosting lapsed | Yes | No project writes/uploads/sync after grace period | Yes | Yes |
| Lifetime hosting renewed | Yes | Yes until renewal expires | Yes | Yes |
| Founder | Yes | Yes, lifetime Cloud Mode with fair-use/storage cap | Yes | Yes |

### Implementation Phases

1. Entitlement model
   - Add explicit hosted-service status separate from app licence status.
   - Track `app_license_status`, `cloud_hosting_status`, `cloud_hosting_expires_at`, `cloud_grace_expires_at`, and plan key in account metadata or profile data.
   - Treat Founder as lifetime app + lifetime Cloud Mode, bounded by published storage/fair-use limits.

2. Local Mode foundation
   - Ensure the app can run from the static frontend with no Supabase project writes.
   - Store Local Mode projects in the desktop local vault. Do not rely on browser localStorage/IndexedDB for product local storage.
   - Keep create/edit/delete/import/export available for local projects.
   - Disable cloud-only features with clear inactive states rather than broken controls.

3. Cloud-to-local transition
   - Add a guided export/import flow for Lifetime users approaching hosting expiry.
   - Before expiry: show abundant in-app and email warnings and offer hosting renewal.
   - During the 90-day grace period: allow read/export of cloud projects and provide a one-click "Export all data" action.
   - Final warning email must include one clear "Export all data" button that downloads all available project data.
   - After grace period: stop cloud writes/uploads/sync; preserve app access and Local Mode. Paid/Lifetime/Founder cloud data should be archived rather than fully deleted if the user does not respond.

4. Storage and cost controls
   - Keep published storage caps per plan.
   - Free accounts have a 250MB cloud storage cap.
   - Monthly accounts have unlimited projects with a 10GB fair-use cloud storage cap.
   - Lifetime accounts use the 10GB fair-use cloud storage cap during the included 3-year hosting period and any renewed hosting period.
   - Founder accounts include lifetime Cloud Mode with a 25GB fair-use cloud storage cap.
   - Storage warnings appear at 80% usage.
   - At 100% usage, block new uploads and cloud-heavy file writes, but never block writing, deleting files, or exporting.
   - Cloud-stored project data, images, uploads, PDFs, backups, and imported files count toward storage. Local-only data does not count. Generated export files do not count unless stored permanently.
   - Prevent lapsed users from uploading new files to Supabase Storage.
   - Paid/Lifetime expired cloud data policy: 90-day grace with abundant warnings, then archive if no response is received. Do not fully delete paid/lifetime cloud data as the normal policy.
   - Free inactivity policy: Free accounts with more than 18 months of inactivity enter the same 90-day warning/grace flow; after that 90-day period, delete the account and all associated database/storage records fully if there is no response.
   - Add operational reporting for storage by plan/status so Lifetime and Founder liabilities are visible.

5. Billing and renewal
   - Keep Lifetime purchase separate from cloud hosting renewal.
   - Add a hosting-renewal checkout path for lapsed or soon-to-lapse Lifetime users.
   - On successful renewal, restore Cloud Mode immediately and set the next hosting expiry date.
   - Avoid language that says the lifetime app licence expired.

6. UX and copy
   - Name the non-hosted state "Local Mode."
   - Account settings should show separate statuses: App Licence and Cloud Hosting.
   - Pricing, FAQ, Terms, and checkout copy must clearly distinguish lifetime app access from hosted cloud services.
   - Copy should reassure users that their writing belongs to them and they will always be given an opportunity to export. Keep this clear but calm in legal/help copy so it does not make the product sound precarious.
   - Suggested message: "Your lifetime licence is active. Cloud hosting is inactive, so YOW is running in Local Mode. Your projects are stored on this device unless you export a backup or renew hosting."

7. QA and launch checks
   - Test active Lifetime, lapsed Lifetime, renewed Lifetime, Founder, active Monthly, cancelled Monthly, and Free.
   - Verify lapsed Lifetime users can open the app, create/edit local projects, import backups, export backups, and cannot write/upload/sync to Supabase.
   - Verify no data loss during cloud-to-local transition.
   - Verify pricing and legal pages do not imply indefinite free cloud hosting for Lifetime users.

### Open Product Decisions

- Hosting contribution price: decided at £6/year after the included hosting period because 50p/month is easy to understand and keeps the renewal feeling accessible.
- Grace period length: decided at 90 days for lapsed paid hosting and inactive Free account cleanup.
- Expired paid cloud data policy: after 90 days of warnings and export opportunity, archive paid/Lifetime data rather than fully deleting it by default.
- Inactive Free account policy: Free accounts inactive for more than 18 months receive the 90-day warning/export flow, then are fully deleted from database/storage if there is no response.
- Free cap: decided at 250MB cloud storage.
- Monthly cap: decided at 10GB fair-use cloud storage.
- Lifetime hosted cap: decided at 10GB fair-use cloud storage during included and renewed hosting periods.
- Founder cap: decided at 25GB fair-use cloud storage.
- Over-cap behavior: warn at 80%; at 100%, block new uploads/cloud-heavy file writes but never block writing, deleting files, or exporting.
- Storage accounting: cloud-stored project data, images, uploads, PDFs, backups, and imported files count; local-only data does not count; generated export files do not count unless stored permanently.
- Offline licence: cached signed-in access should allow Local Mode on a previously verified device. Brand-new login and entitlement refresh require internet access; export should not be blocked merely because verification is overdue.

### Acceptance Criteria

- Lifetime users can continue using YOW in Local Mode after hosted cloud entitlement expires.
- Lapsed Lifetime users generate no ongoing Supabase project storage writes or file uploads.
- Users can export all cloud projects before cloud access is removed.
- Paid/Lifetime users receive abundant warnings before cloud data removal, including a final email with an "Export all data" button.
- Paid/Lifetime expired cloud data is archived after the 90-day grace period rather than fully deleted by default.
- Free inactive accounts receive warnings after 18 months inactivity and are fully deleted after the 90-day warning period if there is no response.
- Account, pricing, FAQ, and legal copy clearly explain the app licence/cloud hosting split.
- Founder lifetime hosting is bounded by clear storage and fair-use limits.
- Manual QA confirms no writing/worldbuilding data is lost during entitlement transitions.

## PRD: Desktop Lifetime App and Local Vault

### Product Decision (2026-07-04)

Lifetime is re-architected as a downloadable desktop app with true on-device storage. Browser storage is not reliable enough for a lifetime ownership promise: browsers can evict origin data under storage pressure, "clear site data" silently destroys work, and per-origin quotas cap realistic project sizes. The Lifetime promise must never depend on browser localStorage/IndexedDB.

New product model:

| Tier | Delivery | Storage | Cloud |
| --- | --- | --- | --- |
| Free | Browser web app | Cloud (Supabase), account required | Limited free-plan cloud usage |
| Monthly | Browser web app | Cloud (Supabase) | Hosted storage + sync while subscribed |
| Lifetime | Downloadable desktop app (macOS + Windows) | Local project vault on the user's device | Optional Cloud Sync add-on (existing included-hosting-years + £6/year renewal rails) |
| Founder | Desktop app (everything in Lifetime) | Local project vault | Lifetime Cloud Sync included within fair-use cap |

This supersedes browser Local Mode as the Lifetime fulfilment mechanism. Browser Local-first is no longer a web-app product feature; web accounts require Cloud Mode, while local project storage requires the downloaded desktop app. The desktop app removes ongoing hosting cost for Lifetime users: local writing generates zero Supabase traffic when Local-first/manual sync is active.

Anti-piracy stance is reasonable, not hostile: licence activation tied to the account, account-tied updates/support/Cloud Sync, an offline grace period for licence re-verification, and no invasive DRM. Export is never blocked by licensing state.

### Architecture Audit (2026-07-04)

Where the relevant behavior lives today, and what the desktop architecture changes:

| Concern | Current location | Desktop change |
| --- | --- | --- |
| Project data (all entities) | `src/store/useStore.js` — React state persisted synchronously to localStorage (`nf_*` keys) via internal `load`/`save` helpers | Reads/writes go through the storage abstraction (`src/storage/`); desktop backend persists to the local vault (SQLite) instead of localStorage |
| Cloud sync | `src/utils/firestoreSync.js` (misnamed — it is Supabase) — per-entity table upserts, debounced from `useStore` effects; master switch is the `cloudSyncEnabled` option `App.jsx` passes into `useStore` | Required for browser accounts. On desktop it is enabled by default while entitled, keeps the local vault updated, and becomes manual when Local-first is toggled |
| Auth/session | `src/context/AuthContext.jsx` (Supabase auth, session cached in localStorage) | Desktop uses the same Supabase auth for activation/sync; adds cached licence state with offline grace |
| Licensing/membership | `src/utils/membership.js` derives plan/entitlements from Supabase user metadata; `src/utils/billingConfig.js` prices; `api/*` Stripe endpoints; UI in `AccountSettings.jsx`/`PricingPage.jsx` | Add `desktop_entitlement` (Lifetime/Founder) and licence-activation records; membership derivation gains a cached offline path |
| Local-first mode | `src/utils/storageMode.js` — per-user mode preference + snapshot helper | Desktop-only control. Browser/web ignores Local-first and requires Cloud Mode; desktop Local-first pauses automatic cloud sync and makes cloud sync manual |
| Map pixel data | `src/store/mapStorage.js` — IndexedDB | Desktop backend stores pixel blobs in the vault |
| Scene drafts / versions / AI settings / theme / tours | `manuscriptUtils.js`, `sceneVersions.js`, `aiSettings.js`, `theme.js`, `useTourStore.js` — localStorage | Migrate onto the storage abstraction incrementally; drafts and versions belong in the vault on desktop |
| Export/import | `src/utils/projectExport.js` — hand-rolled ZIP of JSON files (`data/*.json`), DOCX/PDF | Format unchanged; it is the interchange format between browser and desktop. Desktop adds native save/open dialogs |

Key existing seams that make this tractable: `useStore` already funnels every localStorage read/write through two helpers (`load`/`save`); `cloudSyncEnabled` already turns all cloud writes off cleanly; the ZIP export already round-trips complete projects; `OFFLINE_MODE` already proves the app runs without Supabase.

### Desktop Wrapper Decision: Tauri

Use Tauri 2.x unless a concrete blocker emerges during the Phase 2 proof of concept.

- Why Tauri: ~10 MB installers vs ~150 MB+ for Electron; far lower memory; Rust backend gives first-class SQLite (`tauri-plugin-sql`) and filesystem access with a capability-scoped security model; built-in updater with signed manifests; the frontend is the existing Vite/React build unchanged. YOW has no Node-runtime dependencies in the client (Supabase JS, fflate, docx all run in a webview), so Electron's main advantage (Node integration) buys nothing here.
- Electron comparison: more mature ecosystem and Chromium-everywhere consistency, but heavier downloads/updates, higher RAM, more CVE surface to track, and no benefit for this codebase. Fall back to Electron only if Phase 2 finds a webview blocker.
- Main Tauri caveat: it uses the OS webview — WKWebView on macOS, WebView2 on Windows — not Chromium. The map canvas, hand-rolled ZIP blobs, DOCX/PDF generation, and focused-writing caret measurement must be QA'd on both engines. This is the explicit Phase 2 acceptance test.
- Build/signing implications: macOS needs an Apple Developer ID ($99/year), codesigning + notarization (required for Gatekeeper), universal or per-arch (Intel/Apple Silicon) builds. Windows needs a code-signing certificate (OV works; unsigned builds trigger SmartScreen warnings that would kill trust in a paid product). Tauri's updater additionally needs a minisign keypair; the private key must be kept out of the repo and CI secrets-managed. Windows installs also pull WebView2 (preinstalled on Win 10/11; the installer can bootstrap it).

### Local Vault Storage Architecture

- Vault location: a user-visible folder, default `~/Documents/YOW/` (`Documents\YOW\` on Windows), user-relocatable in settings. Users must be able to see, copy, and back up their own data — that is the ownership promise.
- Canonical store: one SQLite database (`vault.db`) in the vault, WAL mode. Tables mirror the existing Supabase per-entity schema (`novels`, `scenes`, `characters`, … with `id` + JSON `data` columns). Mirroring the cloud schema keeps the optional sync bridge a straight row-for-row mapping and reuses the existing entity model unchanged. SQLite over loose JSON files because it gives atomic transactions, corruption resistance (WAL + fsync), fast partial writes for autosave, and one file to snapshot. Map pixel blobs live in the same DB or as sibling blob files keyed by map ID.
- Auto-save: the same debounced per-entity write pipeline `useStore` already uses, pointed at SQLite upserts instead of localStorage; synchronous in-memory mirror so reads stay synchronous for React; flush on window blur/close (Tauri close-requested hook) so quitting never loses the debounce window.
- Snapshots/backups: automatic rolling snapshots written to `YOW/Backups/` as standard YOW export ZIPs — e.g. after every N minutes of active editing, keep the last 10 plus one per day for 30 days. Because snapshots ARE export ZIPs, any snapshot restores through the existing Import ZIP flow, on desktop or web.
- Import/export compatibility: the existing ZIP format is unchanged and is the bridge in both directions (web → desktop migration for new Lifetime buyers, desktop → web for support/recovery). DOCX/PDF exports work identically.
- Interrupted-save recovery: SQLite WAL recovers automatically from crash/power-loss mid-write. On launch, run an integrity check; if `vault.db` fails it, offer restore from the newest snapshot ZIP plus the retained previous-generation `vault.db.bak` (rotated before schema migrations and daily).

### Access and Entitlement Model

| State | Desktop app | Local vault | Cloud Sync | Updates/support |
| --- | --- | --- | --- | --- |
| Lifetime, activated, online | Full | Full | If add-on entitled and enabled | Yes (account-tied) |
| Lifetime, offline within grace | Full | Full | Paused, queues nothing (vault is canonical) | Deferred until online |
| Lifetime, offline past grace | Full editing of existing vault continues; re-verification banner; export always works | Full | Paused | Deferred |
| Lifetime, Cloud Sync cancelled/lapsed | Full | Full | Off; last synced cloud copy follows the existing 90-day grace/archive policy | Yes |
| Cloud unreachable (outage) | Full | Full | Retries in background, never blocks writing | Deferred |
| Free/Monthly | No desktop entitlement — browser only | — | Browser cloud plans unchanged | — |

- What needs login: first activation of a device, enabling/using Cloud Sync, downloading updates through the account channel, and support entitlement checks.
- What works offline: everything else — creating/editing/deleting projects, all workspaces, autosave, snapshots, ZIP/DOCX/PDF export, import.
- Licence activation: on first run the user signs in once; the app stores a signed entitlement record locally (plan key, user ID, issued-at). Re-verification is opportunistic when online; the offline grace period (default 30 days, generous by design) only gates a nag banner, never editing or export. Device activations are recorded server-side with a soft cap and self-service deactivation.
- Cloud Sync cancelled or unavailable: the vault is always canonical on desktop; sync is a mirror, not a dependency. Cancelling Cloud Sync changes nothing locally. Cloud-side data follows the existing lapsed-hosting grace/archive policy from the Lifetime Local Mode PRD.

### Implementation Phases and Checklist

Status: Phase 4 licence activation/offline grace implemented 2026-07-06; native interactive QA pending.

**Phase 1 — Architecture prep and storage abstraction** (web repo, no desktop code)

- [x] Add `src/storage/` abstraction: a synchronous key-value backend contract (`getItem`/`setItem`/`removeItem`), a browser localStorage backend (current behavior, including the cover-photo-shedding quota fallback), an in-memory backend for tests/unsupported environments, and a `setStorageBackend()` seam for the future desktop vault backend.
- [x] Route all `useStore.js` project-data persistence (entity keys, local-owner/write markers, clear-on-signout) through the abstraction.
- [x] Route `storageMode.js` through the abstraction.
- [x] Unit tests for the backend contract: swap-ability, error tolerance, quota-fallback behavior, and existing `useStore` persistence/ownership tests staying green.
- [x] Migrate remaining project-content localStorage users onto the abstraction (2026-07-04): scene drafts (`manuscriptUtils.js`), scene versions (`sceneVersions.js` — direct delete in `SceneVersionHistory.jsx` folded into a new `deleteSceneVersion` helper), per-project local backups (`Layout.jsx`), legacy map pin cleanup (`Locations.jsx`), and the `nf_localOwner` cross-check read in `aiSettings.js`. Finding: `mapUtils.js` `loadJson`/`saveJson` hold only map UI preferences (favorite/recent stamps, inspector tab), so they stay on localStorage as device preferences.
- [x] Key classification recorded below (2026-07-04): which stored keys are vault data vs device preferences.

**Storage key classification** (governs what the Phase 3 desktop backend persists to `vault.db` vs what stays in webview localStorage):

| Class | Keys | Desktop home |
| --- | --- | --- |
| Vault data — project content | `nf_novels`, `nf_characters`, `nf_factions`, `nf_locations`, `nf_timeline`, `nf_worldHistory`, `nf_currentYear`, `nf_acts`, `nf_chapters`, `nf_scenes`, `nf_loreEntries`, `nf_ideaEntries`, `nf_maps`, `nf_activeMapByNovel`, `nf_whiteboards`, `nf_series`, `nf_storySchedule`, `nf_activeNovel`, `nf_rpg_characters`, `nf_comicPages`, `nf_comicPanels`, `nf_eras`, `nf_scene_versions`, `nf_project_backups_<projectId>`, legacy pin keys (`nf_maps_list`, `nf_markers_*`, `nf_regions_*`, `nf_icons_*`) | `vault.db` |
| Vault metadata | `nf_localWriteAt`, `nf_localOwner`, `nf_storageMode:<userId>`, `nf_localFirstSnapshot:<userId>` | `vault.db` on desktop; browser storage-mode values are ignored by the web app |
| Large binary project data | None — obsolete 2026-07-06. The vector map builder persists via `nf_maps`; the legacy IndexedDB `yow-maps` heightmap module (`mapStorage.js`) was unimported and deleted. | n/a (covered by `vault.db` via `nf_maps`) |
| Device preferences — never vault | `nf-theme`, `nf-custom-colors`, `nf-radius-unit`, `nf-visual-strength`, `nf-font`, `nf-format-settings`, `nf-daily-word-goal`, `nf-saved-presets`, `nf_aiSettings` + `nf_aiSettingsOwner` (API keys are device-level secrets by design), `nf_aiPanelFrame`, `nf_aiFullscreen`, `nf_focusedWriting:<userId>`, tour state, `nf_localModeNoticeDismissed:*`, beta/legal/cookie flags, `yow_map_fav_stamps`, `yow_map_recent_stamps`, `yow_map_inspector_tab`, `nf_linked_delete`, Supabase session cache (`sb-*`) | Webview localStorage |
| Review in Phase 3 | `nf_chats_*` (per-project AI chat history — currently device-local; decide whether it should live in the vault so it travels with the project) | TBD |

**Phase 2 — Desktop shell proof of concept**

- [x] `src-tauri/` scaffold wrapping the existing Vite build; app boots to the current UI on macOS. Windows boot check remains required on a Windows x64 runner/device.
- [ ] Webview QA spike: manuscript editor + caret comfort, map canvas (draw/undo/PNG export), ZIP/DOCX/PDF blob downloads via native save dialog, Supabase auth flow in the webview. 2026-07-04 macOS WKWebView proof: native project creation, manuscript editing, autosave word-count propagation, and map canvas opening were manually smoke-tested in the unsigned app. Remaining checks: focused-writing caret comfort, map draw/undo/PNG export, ZIP/DOCX/PDF save behavior (mechanism implemented 2026-07-06 — exports now use the native save dialog via `export_save_file`; needs verification in the built app per QA_PLAN Priority 3), Supabase auth, and Windows WebView2 parity. Current Codex sandbox cannot continue native-window QA because Launch Services returns `kLSNoExecutableErr` for YOW, Calculator, and Safari alike; continue this smoke pass in a normal macOS session or with a native computer-control tool.
- [x] Desktop app defaults to an app-specific zero-marketing auth surface on launch. The Tauri shell now builds the frontend in Vite `desktop` mode; unauthenticated desktop users go straight to the compact login form with no marketing homepage, cookie banner, beta banner, homepage back link, or marketing feature rail. Browser/web launch behavior is unchanged. Desktop app surfaces also suppress the cookie banner and cookie-preferences controls because cookie consent is web-only.
- [ ] Prove unsigned local builds for macOS (arm64) and Windows (x64); document the signing/notarization pipeline requirements. 2026-07-04 macOS arm64 app-only release artifact builds locally: `YOW.app` (~15 MB), with manual ad-hoc wrapper signing verified by `codesign`. Tauri's canonical Finder-styled DMG still fails in this Codex/macOS environment because `hdiutil create`/attach/resize return `Device not configured`; a local fallback `makehybrid` package command now produces `YOW_0.1.0_aarch64.local.dmg` for Phase 2 proof. 2026-07-06 rebuild verified the fallback local DMG path after stripping Finder/provenance extended attributes before ad-hoc signing (`scripts/package-macos-dmg-local.sh`). Final DMG mount/install verification still needs a normal macOS session or CI runner, and Windows x64 artifact still required.
- [x] Desktop app icon uses the YOW website logo on the website dark-teal brand background (`#0d282e`) across Tauri PNG, ICO, and ICNS assets. Regenerate with `python3 scripts/generate-tauri-icons.py`.
- [x] Go/no-go on Tauri vs Electron recorded here: provisional go for Tauri on macOS. No Electron blocker found in the initial WKWebView smoke test; final go remains conditional on the remaining export/auth checks and Windows WebView2 parity.

**Phase 3 — Local project vault and auto-save**

- [x] `desktopVaultBackend` implementing the Phase 1 contract: in-memory mirror hydrated from SQLite at startup, async write-behind to `vault.db` (WAL), flush on close. Phase 3 scaffold started 2026-07-04: `src/storage/desktopVaultBackend.js` provides the synchronous in-memory mirror/write-behind queue contract with unit coverage. Tauri SQLite bridge added 2026-07-04: `src-tauri/src/lib.rs` exposes `vault_read_all`, `vault_set_item`, and `vault_remove_item` against `vault.db` in the app data directory with WAL enabled; `src/storage/tauriVaultAdapter.js` hydrates the mirror before React renders in desktop mode, routes writes/removes through native commands, and installs pagehide/beforeunload/Tauri close flush hooks. Native quit/reopen and force-quit proof remains deferred to a normal macOS session because the current Codex sandbox cannot launch native windows.
- [x] Default vault folder creation and visibility. The desktop app creates the app-data vault folder automatically, exposes vault path/entry count/database size/WAL size in Account Settings → Storage, can reveal the vault in Finder, and can create an on-demand SQLite snapshot in the `Backups` folder.
- [x] Storage Configuration tab split. Storage settings moved out of Membership/Preferences into Account Settings → Storage. Web shows cloud usage only and no Local-first toggle; desktop shows uncapped local vault usage, desktop-only Local-first, vault tools, and cloud/local status. Desktop local writes are not capped by YOW plan storage; YOW caps apply to hosted cloud storage only.
- [x] Vault locate/relocate UI and explicit first-run vault setup. Implemented 2026-07-06: the vault location is configurable via `vault-location.json` in the fixed app-data dir; `vault_relocate` (Tauri command) opens a native folder picker, then either copies the current vault to the chosen folder ("moved", original left in place as a safety copy) or adopts an existing `vault.db` found there ("locate"); the Backups folder follows the vault. If a configured location becomes unreachable (e.g. unplugged drive), vault commands fall back to the default location and `vault_info.using_configured=false` drives an explicit warning in the Storage panel rather than silently opening an empty vault with no explanation. UI: "Move vault…" in Account Settings → Storage with an inline confirm (no `window.confirm` — unreliable in the webview) that also warns against Dropbox/iCloud-synced folders; app reloads after relocation. First-run setup: a one-time desktop toast ("Your writing is saved in a local vault on this device") linking to Storage settings, acknowledged via vault key `nf_vault_setup_ack`. Native interactive QA deferred to [docs/QA_PLAN.md](QA_PLAN.md) Priority 1.
- [x] Import ZIP into vault (web → desktop migration path) and export ZIP from vault. Implemented 2026-07-06: import already flowed through the native file input (webview-supported) and the Phase 1 storage abstraction into the vault. Export was broken on desktop — every export used anchor-click blob downloads, which the webview silently ignores. Added `export_save_file` Tauri command (native save dialog via `tauri-plugin-dialog`, then writes bytes) and made the shared `downloadBlob` helper desktop-aware; consolidated the duplicate download paths in Layout, NovelManager, YOWMapBuilder (map PNG), and FinalizedReader onto the helper, so ZIP/DOCX/PDF/PNG exports all route through the native dialog on desktop and unchanged anchors on web. Cancel returns null; failures log and dispatch `yow-export-save-error`. Native interactive QA deferred to [docs/QA_PLAN.md](QA_PLAN.md) Priority 3 (desktop native export saves).
- [x] Rolling snapshot writer to `YOW/Backups/` + snapshot restore flow. On-demand vault snapshot, automatic rolling SQLite snapshots, and manual restore are implemented: desktop startup requests an automatic `vault-auto-*.db` snapshot after vault hydration, throttled to at most once every 15 minutes, and retains the latest 10 automatic snapshots; the desktop Preferences vault panel lists automatic/manual/safety snapshots with readable labels, restores a selected snapshot only from YOW's `Backups` folder, creates a `vault-before-restore-*.db` safety copy first, replaces `vault.db`, removes stale WAL/SHM files, and reloads the app so React hydrates from the restored vault.
- [x] Startup integrity/recovery surface. The desktop vault panel can run SQLite `PRAGMA integrity_check`, shows a clear OK/problem status, and pairs any problem with the existing snapshot restore list. Automatic restore is deliberately not performed without user confirmation; `vault.db.bak` rotation before migrations remains future schema-migration work.
- [x] Map pixel data storage in the vault — resolved as obsolete 2026-07-06: the current map builder is vector-object based and persists everything through `updateActiveMapData` → `nf_maps` → projectStorage, which is already vault-backed on desktop (`updateActiveMapData` also strips the legacy `mapData`/`mapOverlay` pixel fields). The old IndexedDB heightmap module `src/store/mapStorage.js` had zero imports and was deleted; the `yow-maps` IndexedDB is never written by the current app, so no desktop blob storage is needed.

**Phase 4 — Licence activation and offline grace** (implemented 2026-07-06; live QA pending)

- [x] Activation flow: `api/desktop-devices.js` (POST activate/re-verify, GET list, DELETE self-service deactivate) against the new `desktop_devices` table (`supabase/migrations/20260706_desktop_devices.sql` — **user action: apply this migration in Supabase before desktop sign-ins hit the endpoint**). Issues an HMAC-signed entitlement record (`ENTITLEMENT_SIGNING_SECRET` Vercel env var; unsigned-but-functional when unset). Soft cap defaults to 3 active devices (`DESKTOP_DEVICE_CAP` env var), adopting the open-decision proposal; cap-exceeded returns 409 with the active device list. Desktop calls the production API absolutely (tauri:// origin has no relative /api) via `VITE_DESKTOP_API_BASE_URL` fallback to www.yourownworld.co.uk. Device list + Deactivate UI in Account Settings → Membership (desktop only).
- [x] Offline grace: `src/utils/desktopEntitlement.js` caches the record + verifiedAt on-device (localStorage — device secret, never vault/sync). Startup re-verification is opportunistic; network failure is treated as offline, not error. Staleness past 30 days (`DESKTOP_GRACE_DAYS`, adopting the open-decision proposal) or a hit device cap only show dismissible toasts — editing and export are never gated client-side. Unit-tested.
- [x] `membership.js` now returns `isDesktopEntitled` (= isLifetime); browser plan behavior untouched.
- [x] Free/Monthly/trial accounts in the desktop app get `DesktopUpgradeWall`: clear "comes with Lifetime" state with open-in-browser, view-plans (opens default browser via https-only `open_external_url` command), and sign-out. Live QA for all four items deferred to [docs/QA_PLAN.md](QA_PLAN.md) Priority 1 (desktop licence activation).

**Phase 5 — Optional Cloud Sync bridge** (sync status UI implemented 2026-07-13; native/live-account QA pending)

- [x] Reuse `firestoreSync.js` upsert/load against vault data; sync toggle per device; entitlement-gated. Already satisfied structurally by the Desktop Local-first slice: `useStore` reads/writes go through the same storage abstraction on desktop and web, so the existing debounced `upsertItems`/`saveUserSettings` push pipeline runs unchanged against vault-backed state; the Local-first checkbox in Account Settings → Storage is the per-device sync toggle; both automatic sync and manual sync are gated on `membership.canSyncCloud`.
- [x] Conflict rule: vault is canonical on desktop; cloud pull never overwrites newer local rows; explicit conflict prompt where timestamps disagree materially. Already satisfied: `useStore.importData()` compares `localWriteAt` against the cloud snapshot's `_savedAt` on every login/reconnect and prefers local when it is fresher (pushing the win back to cloud); the manual "Upload this device copy" / "Download cloud copy" flow in Account Settings → Storage shows an in-app before/after comparison panel (project/word/entry counts) before either side is replaced — this is the explicit conflict prompt.
- [x] Sync status UI (last synced, paused, error) and the lapsed-hosting behavior from the Lifetime Local Mode PRD. Implemented 2026-07-13: `firestoreSync.js`'s `upsertItems`/`saveUserSettings`/`saveSceneDoc` now throw on a Supabase-reported error (previously only logged), so failures are observable. `useStore.js` adds a `trackSync(promise)` helper and `syncStatus` state (`{state: 'idle'|'syncing'|'synced'|'error', lastSyncedAt, lastError}`), wired into the debounced per-entity push pipeline, the login-time freshness-win push, and reset to idle on account switch; both exposed on the store API. `App.jsx`'s manual sync handler (`handleManualCloudSync`) also routes through `store.trackSync` so manual push/pull updates the same status. A new `SyncStatusLine` in `AccountSettings.jsx` (desktop Storage panel, inside the existing Local-first card) renders Syncing…/Synced — last update Xm ago/Sync error — message/Automatic sync paused — Local-first mode/Cloud sync unavailable — hosting inactive, reusing `membership.isLocalMode`/`canSyncCloud` for the lapsed-hosting and entitlement states. Status derivation is a pure, unit-tested helper (`src/utils/syncStatusLine.js`) separate from the JSX; `src/utils/relativeTime.js` provides the "X minutes/hours/days ago" label. Unit-tested: `useStore.test.js` (idle/synced/error/disabled/reset-on-account-switch against the real debounced push pipeline), `syncStatusLine.test.js` (all tone/text branches), `relativeTime.test.js`. This UI is gated behind `window.__TAURI__` detection and cannot be exercised in a standard browser preview; offline browser regression confirmed the non-desktop Storage panel and general app boot are unaffected (no console errors). Native desktop QA remains required.
- [ ] Web ↔ desktop round-trip QA: edit on desktop, sync, open in browser Monthly-style session on the same account, and back. Needs a real desktop build and live Supabase account; out of reach of the current sandbox (same constraint as all other native desktop QA items — see [docs/QA_PLAN.md](QA_PLAN.md) Priority 1).

**Phase 6 — Installer, build, release QA**

- [ ] Signed + notarized macOS DMG; signed Windows installer (NSIS/MSI) with WebView2 bootstrap. Blocked on paid enrollment (see Open Product Decisions below) — not started.
- [x] Unsigned Windows installer build path, verified green (2026-07-19): `.github/workflows/desktop-build-windows.yml` (manual `workflow_dispatch`, GitHub's free `windows-latest` runner, no local Windows machine or paid cert needed) builds a working NSIS installer via `desktop:build:nsis`. `src-tauri/tauri.conf.json` sets `bundle.windows.webviewInstallMode: downloadBootstrapper`. `/download` page has matching first-launch SmartScreen instructions (More info → Run anyway) alongside the macOS ones. Two real bugs found only by actually running the first-ever Windows build of this codebase and fixed: (1) the vault's raw sqlite3 FFI (`src-tauri/src/lib.rs`) implicitly linked against a system-provided `sqlite3.lib`, which exists on macOS but not Windows — fixed by adding `libsqlite3-sys` with the `bundled` feature so SQLite compiles from source on every platform; (2) the resulting static archive then needed `#[link(name = "sqlite3", kind = "static")]` (was implicit/dylib) to avoid an MSVC unresolved-symbol linker error. Confirmed green end-to-end at run [29697672553](https://github.com/bishop7124-ctrl/StoryAtlas/actions/runs/29697672553). Published 2026-07-19: `YOW_0.1.0_x64-setup.exe` and a signed `latest.json` (via `scripts/generate-updater-manifest.mjs`) uploaded to the existing `v0.1.0` GitHub release alongside the macOS assets; release title/notes updated to cover both platforms; `https://github.com/bishop7124-ctrl/StoryAtlas/releases/latest/download/latest.json` verified to resolve (200). Remaining: set `DESKTOP_DOWNLOAD_URL_WINDOWS` in Vercel so `/download` serves it to entitled users (user action — needs Vercel dashboard access). macOS stays exactly as-is (unsigned zip, testers-only) until the Apple Developer Program is paid for.
- [x] Tauri updater wired to a free release channel, signing verified end-to-end (2026-07-19). Uses Tauri's own update-integrity signing (a project-owned minisign keypair) — unrelated to and free regardless of OS-level code signing/notarization; proves an update came from this project's release process, not that Apple/Microsoft vouch for the binary. Public key in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); endpoint `https://github.com/bishop7124-ctrl/StoryAtlas/releases/latest/download/latest.json` (GitHub Releases as free hosting — always resolves to the newest release's copy of that filename). Added `tauri-plugin-updater` + `tauri-plugin-process` (Rust) and `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process` (frontend); `updater:default` + `process:allow-restart` capability permissions. `src/utils/desktopUpdater.js` checks on desktop startup only (`isDesktopAppRuntime()` gated); `App.jsx` shows a dismissible "Update available" toast with a "Restart to update" action. CI signs the build when `TAURI_UPDATER_PRIVATE_KEY`/`_PASSWORD` repo secrets are set and uploads the `.sig`. `scripts/generate-updater-manifest.mjs` builds `latest.json` from a version, notes, and per-platform `url=sigPath` pairs. Two real bugs found only by actually exercising the signing step for the first time, both fixed: (1) `bundle.createUpdaterArtifacts: true` was missing from `tauri.conf.json` — without it Tauri silently skips signing even with valid keys/secrets present, so the first "signed" CI attempt produced no `.sig` at all; (2) the originally generated private key failed to decode when actually used ("Missing comment in secret key") — rather than debug a key that had never signed anything real, rotated to a freshly generated keypair, verified it locally end-to-end before touching CI, and updated the committed pubkey to match. The GitHub secrets were then set directly via `gh secret set < file` (not copy-paste) after two prior manual-paste attempts corrupted the value (`Invalid symbol 61` base64 errors) — confirmed clean signing with no key-mismatch warning at run [29697672553](https://github.com/bishop7124-ctrl/StoryAtlas/actions/runs/29697672553). Remaining: publish a release with `latest.json` attached and verify a real update round-trip once two Windows builds exist.
- [x] Download delivery from the website gated on Lifetime/Founder entitlement. Implemented 2026-07-06: `/download` page (`src/components/download/DownloadPage.jsx`, routed in `App.jsx`) shows sign-in prompt when logged out, upgrade CTA for non-lifetime users, and installer links for Lifetime/Founder members. Links are served only by `api/get-download-links.js`, which verifies the Supabase token and `subscription_plan` server-side and reads installer URLs from env vars (`DESKTOP_DOWNLOAD_URL_MACOS`, `DESKTOP_DOWNLOAD_URL_WINDOWS`, `DESKTOP_APP_VERSION`) so URLs never ship in the client bundle; entitled users see a "builds are being prepared" fallback until those env vars are set in Vercel. Handler entitlement tests in `api/get-download-links.test.js`. The page is intentionally not linked from public marketing nav until Phase 6 copy updates; instead, Account Settings → Membership shows a "Desktop app included" card linking to /download for Lifetime/Founder members on the web app (hidden in the desktop runtime). An unsigned macOS Apple Silicon beta DMG was published 2026-07-06 as GitHub release v0.1.0 (ad-hoc signed, not notarized — beta testing only, not customer-ready). Beta delivery switched to a .zip asset the same day (zips skip the Gatekeeper block on opening unsigned DMGs, leaving one Open Anyway step at app launch), and the download page now shows first-launch instructions for macOS. Remaining: set the env vars in Vercel (macOS URL available now), then replace with signed/notarized installers from the Phase 6 items above before selling on desktop copy.
- [ ] Full data-safety QA matrix on both OSes: crash-during-save, force-quit, disk-full, vault on external/cloud-synced folder (Dropbox/iCloud warning), import/export round-trips, offline grace expiry.
- [ ] Pricing/FAQ/Terms copy updated to the desktop Lifetime model (only at this phase — public copy must not advertise the desktop app before it is real). Both platforms remain unsigned/beta-only, so paid-launch copy is still blocked regardless of platform.

### Guardrails (all phases)

- Do not break the browser Free/Monthly flow; the web app remains the product for those tiers.
- Do not remove or degrade current cloud sync; Phase 1 must be behavior-neutral for existing users.
- Never rely on browser localStorage/IndexedDB to fulfil the Lifetime promise.
- Preserve the existing ZIP export/import format exactly; it is the migration bridge.
- Add tests around every storage boundary touched.

### Open Product Decisions

- Lifetime price/copy implications of "downloadable desktop app" positioning (update the Pricing recommendation row when copy changes in Phase 6).
- Code-signing costs and timing (2026-07-06 findings): unsigned macOS builds are Gatekeeper-blocked at both DMG-open and app-launch, often silently — not shippable to customers. Apple Developer Program (£79/yr, flat, not per-user) is required before the first desktop Lifetime sale; there is no free macOS path. Windows can launch unsigned (SmartScreen shows a visible "More info → Run anyway" bypass) with signing (~£100/yr EV or Azure Trusted Signing) deferred until revenue justifies it. No cost is incurred until desktop selling begins.
- Whether Lifetime also keeps browser access during its included cloud-hosting years (recommended: yes while Cloud Sync is entitled, since the data is hosted anyway) or becomes desktop-only at purchase.
- Offline grace length (default proposal: 30 days) and device activation soft cap (proposal: 3 active devices).
- Whether Founder desktop users get browser access for life (their Cloud Mode is lifetime, so recommended yes).

## Onboarding System

Implemented 2026-06-15. Files: `src/components/onboarding/`.

| Component | Description | Status |
| --- | --- | --- |
| `useTourStore.js` | localStorage-backed state for per-user welcome shown, wizard shown, checklist dismissed, guided-tour enablement, tour completions, and export tracking. | Complete |
| `OnboardingTour.jsx` | Reusable spotlight tour engine. Accepts step definitions with `data-tour` targets, renders a dark backdrop with a cutout spotlight and floating tooltip. Supports next/back/skip/done, dot navigation, keyboard (arrow keys, Escape), and an optional Turn off all tours action. | Complete |
| `WelcomeWizard.jsx` | 3-step modal shown once on first login when account has no projects. Step 1: project type picker with emoji cards. Step 2: title + word count target. Step 3: workspace highlights + create. Creates the project and navigates directly into it. | Complete |
| `GettingStartedChecklist.jsx` | Collapsible widget in the library. 5 milestones derived from real store data (create project, write scene, add character, build world, export). Dismissible. | Complete |
| `tourDefinitions.js` | Step arrays for Welcome, Library, Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline tours. | Complete |

Integration:
- `App.jsx`: imports `useTourStore`, passes `tourStore` to `NovelManager` and project `Layout`, shows a one-time signed-in welcome tour before automatic library tours, and shows `WelcomeWizard` when `!wizardShown && novels.length === 0`.
- `NovelManager.jsx`: renders checklist, `?` tour button in top bar, `data-tour` attributes on key elements, library `OnboardingTour`, and suppresses the automatic library tour while the welcome tour is open.
- `Layout.jsx`: renders a section tour button for Manuscript, Characters, Locations, Lore, Ideas, Map, AI Tools, and Timeline when the current workspace has tour steps; completed tours are marked in `useTourStore`. The Map tour is hidden on the mobile placeholder because the editing UI is desktop/tablet-only there.
- Account Settings → Preferences includes a persistent Guided tours switch. The welcome tour also includes Turn off all tours. Turning guided tours off suppresses automatic tours and hides manual tour buttons in the Library and project workspaces; the first-run project wizard and getting-started checklist remain separate.

QA deferred: signed-in first-login welcome tour, Turn off all tours persistence, wizard create flow on a real fresh account, checklist milestone accuracy, library and section tour spotlight positioning at mobile/tablet/desktop widths, section tour completion persistence.

## To Be Implemented

These items are now confirmed final-launch scope and must become either complete or explicitly re-decided before paid/public launch.

| Feature | Launch Requirement / Acceptance Criteria | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Character journey / arc tracking | Users can track a character's journey across the project with visible arc stages, turning points, emotional/internal change, external goal progress, linked scenes/events, and current state. For series projects, the tracker must make it clear whether the arc is project-local or series-spanning. | Implemented, needs QA | Character profiles now include a dedicated Journey tab with guided arc overview, project/series intent, Before & After comparison, ordered expandable journey beats, major-turning-point emphasis, links to timeline events/chapters/scenes/characters, validated CRUD/reordering, automatic deleted-link cleanup, forward-series character sync, and ZIP/DOCX/PDF export inclusion. Journey editing is intentionally excluded from the general Add/Edit Character modal. QA persistence, forward-series overrides, link cleanup/navigation expectations, export/restore, and mobile/tablet/desktop layout. | Product/Engineering/QA |
| Focused writing mode | Final launch includes a distraction-reduced editor state that is independent of browser fullscreen. Focused mode keeps the active manuscript, a minimal status bar, optional breadcrumb, and on-demand access to structure, notes, formatting, AI, and goals. It uses mirror-based textarea caret measurement and a calm 35–65% comfort zone rather than strict cursor centring. Autosave, drafts, spellcheck, selection, IME, accessibility, script/prose formatting, and mobile Safari usability must remain intact. | Implemented 2026-06-22; needs browser/device QA | Focused and fullscreen states are separate; the focused shell, temporary desktop drawers/mobile sheets, per-user local preference, mirror caret measurement, composition/selection guards, instant comfort scrolling, reduced-motion rules, and focused regression tests are implemented. Unit suite and production build pass. Run the deferred browser/device matrix below, especially long wrapped prose, real IME, mobile Safari keyboard resize, screen-reader operation, and combined native fullscreen. | Product/Engineering/QA |
| Reliable map builder | D&D/TTRPG and worldbuilding users can create reliable, readable maps for planning. The map builder must feel predictable, persist safely, export/restore correctly, and include a grid overlay for movement/planning. It remains a planning map tool, not a live virtual tabletop. | Feature-frozen 2026-07-04; needs authenticated browser QA | Current map builder has multi-map support, typed layers, paths, terrain ridges, stamps, labels, linked locations, JSON import/export, grouping, undo/redo, rendered export plates, high-resolution PNG export, command-bar selected-object deletion, and per-object layer-row deletion. New map-builder depth is frozen until the Priority 9 QA checklist passes or a defect requires a small corrective change. Fix stability, persistence/export, selection/drawing predictability, and responsive safety before adding more tools, styles, or map semantics. | Product/Design/Engineering |
| Series management and cross-project references | Series management is part of final launch. Users can organise projects into a series, keep project order clear, understand inherited/shared records, and safely reference continuity across projects without corrupting single-project data. | First continuity slice implemented, needs deeper implementation + QA | Series dashboard, project ordering, settings, and forward-series sync already exist for characters, locations, lore, factions, ideas, timeline, world history, and character journeys. First Series Continuity slice now replaces future-facing copy with Continuity sub-tabs, a read-only/searchable continuity index, Series-dashboard detail panels with project links, selectable horizontal character journey lanes, project-to-project continuity field editing, story-order timeline with shared Undated section, deterministic possible-match/death-status warnings with Reviewed state, and map preview cards. Remaining work: richer contradiction rules, true inherited-edit choice prompts, hidden-from-later scope controls, visual map rendering beyond placeholder previews, dedicated Series Bible export, export/restore coverage, and browser QA. | Product/Engineering/QA |
| Configurable Schedule calendar | Schedule remains the launch story/campaign calendar, but it should support custom month labels, configurable month count/lengths, configurable week length/day labels, and project-specific category labels. It must persist, export/restore, and remain honest as Schedule rather than a full invented-calendar engine. | Implemented 2026-07-13, needs authenticated QA | Per-project calendar config lives on `novel.scheduleCalendar` ({months: [{name, days}], weekLength, dayNames}); `src/utils/scheduleCalendar.js` normalizes on every read (1–24 months, 1–99 days each, 1–14-day weeks, label caps) with unit tests, so missing/invalid config falls back to the historical 12×30×7 default and existing schedules render unchanged (safe migration). New ⚙ Calendar settings modal in the Schedule header edits months (add/remove/rename/length), week length, and day labels, with reset-to-default; saves normalized values via `updateNovel`. Calendar math (cross-month spans, week rows, ribbons, event modal month/day clamps, list view) is config-driven; `.schedule-grid` uses a `--schedule-week` CSS variable. Events outside a shrunken calendar are never deleted and stay reachable in List view; category labels were already project-configurable via `categoryOptions.schedule`. Config rides on the project record through ZIP export; AI-Import YOW restore carries `scheduleCalendar` + `categoryOptions` onto the recreated project. Offline browser-verified: custom 3-month/5-day-week calendar rendering, cross-month event ribbons, refresh persistence, out-of-range legacy event visible in List view, 375px no-overflow. Leap rules, moons, date conversion, and complex recurrence remain excluded. QA per [docs/QA_PLAN.md](QA_PLAN.md) Priority 8. | Product/Engineering/QA |
| Desktop Lifetime app and local vault | Lifetime is fulfilled by a downloadable desktop app (macOS + Windows) storing projects in a local on-device vault, with optional account-based Cloud Sync, licence activation with offline grace, and no reliance on browser storage. Free/Monthly remain browser/cloud plans. Full spec in [PRD: Desktop Lifetime App and Local Vault](#prd-desktop-lifetime-app-and-local-vault). | Phase 4 implemented; Phase 5 sync status UI implemented 2026-07-13; native QA pending | Finish native/webview QA outside the current Codex sandbox or with native window-control access: focused-writing caret comfort, map draw/undo/PNG export, ZIP/DOCX/PDF save behavior, Supabase auth in WKWebView, desktop licence activation/device cap/offline grace, Windows WebView2 boot/build parity, sync status UI (last synced/paused/error), and final Tauri go/no-go. Storage and desktop licence regression QA tracked in [docs/QA_PLAN.md](QA_PLAN.md) Priority 1. | Product/Engineering |
| Desktop Local-first and manual cloud sync | Desktop users can choose Local-first writing even while their account has Cloud Sync entitlement. Cloud Sync is on by default and also keeps the local vault updated for offline access. Local-first makes the desktop vault the source of truth and turns cloud sync into a manual action; browser/web has no Local-first option and requires Cloud Mode. Any local/cloud overwrite must prompt with comparable summaries before replacing either side. | Manual sync slice implemented 2026-07-05; needs QA | Account Settings → Storage now exposes desktop-only Local-first, desktop local usage, vault controls, and Local-first manual cloud sync controls. Web shows cloud storage only. `App.jsx` ignores browser Local-first values, removes desktop local writes from YOW plan quota checks, and treats lapsed cloud-hosting web access as non-editable because local storage requires the downloaded app. The Local-first checkbox now reflects the user preference only, so lapsed Local Mode no longer traps the toggle checked; hosted sync still remains unavailable until Cloud Mode is renewed. Turning Local-first off uses an in-app confirmation panel, warns before automatic Cloud Sync resumes only when cloud entitlement is active, and no longer depends on webview/browser `window.confirm`. While Local-first remains enabled, Upload this device copy opens an in-app confirmation panel comparing this device against cloud before replacing app project/settings cloud rows, and leaves profile/billing/membership untouched; Download cloud copy uses the same in-app panel before replacing the local vault copy. Manual sync summaries and upload/download payloads now prune orphan rows that are not attached to a current project. Remaining work: richer export-both-before-overwrite affordance and full offline/account-switch/live Supabase QA. | Product/Engineering/QA |

Map builder performance follow-up note (2026-06-29): Canvas rendering now caches the static background/grid layer, culls off-screen objects during redraws, keeps stamp/location cursor previews out of React state, renders pan movement directly through the canvas view ref until release, and applies object drag/point/resize movement transiently on canvas before committing once on pointer-up. Add these paths to authenticated browser QA for the existing Reliable map builder item.

Map builder drawing follow-up note (2026-06-29): River, Road, and Border tools now share the Point/Freehand draw-mode control with polygon tools; freehand line tools create open paths on pointer-up. Placed stamp markers now render as symbols only without text labels, while the labelled left tool rail remains intact. The stamp picker uses the same canvas stamp renderer as placed map stamps so picker symbols match placed symbols/PNG art, and constrained sizing/flexible columns prevent stamp navigation from requiring side scrolling. Add these paths to authenticated browser QA for the existing Reliable map builder item.

Map builder stamp-art follow-up note (2026-06-29): Capital, City, Castle, and Camp stamp art has been revised: Capital is now a capitol/civic building rather than a crown, City and Castle no longer include centre flags, and Camp now has dedicated PNG tent art plus an improved canvas fallback. Add stamp picker, placed-stamp, and export rendering checks to authenticated browser QA for the existing Reliable map builder item.

Map builder stamp-resize follow-up note (2026-06-29): Selected stamp objects now expose canvas corner resize handles and a square Stamp size control in Object Properties. Capital, City, and Castle PNG art has been refreshed again as clean transparent civic/tower/keep symbols. Add stamp resize persistence, undo/redo, selection, and export checks to authenticated browser QA for the existing Reliable map builder item.

Map builder river/road rendering follow-up note (2026-06-30): River and road brushes reworked to a 3-layer rendering model where the innermost (topmost) layer is the dominant visual fill: outer dark border ring → thin stroke-colour ring → wide highlight fill centre. River defaults now use a darker muted blue palette (#2f5f78 stroke, #7faec0 fill), and older default-colour rivers render with the updated palette unless the user has chosen custom colours. Road fill (highlight) is recolorable per-object alongside the road body colour and border colour, with defaults #f0d8a0 (sandy fill), #8b6030 (brown body ring), #2c1a0a (dark border). Border widths now scale sub-linearly with thickness so thick rivers/roads do not produce oversized outer rings. Draft previews while drawing or resizing now render the full 3-layer appearance in the actual object colours instead of the generic blue dashed line. Road Object Properties panel exposes three colour pickers: Border, Colour, and Fill. Add river/road visual QA — thin and thick strokes, muted river default colour, road colour-picker changes, draft preview colour accuracy — to authenticated browser QA for the existing Reliable map builder item.

Map builder water/river split note (2026-06-30): River and Water are separate tools again. River creates simple open path strokes, but visible rivers now render as a grouped paint layer: all river outer strokes draw first, then body strokes, then innermost water colour, so intersecting river strokes visually merge like one brush mark with the border only around the outer combined bounds. Water creates clean filled lake/pond/sea polygons with organic edge, editable fill, outline, and optional wave texture; the previous coastline/shoreline decoration and physical water merging/attached branches were removed. Map object base paints now render opaque by default across the builder so overlapping land, terrain, territory, water, route, marker, and note layers do not reveal lower layers unless a dedicated transparent terrain/label setting is used. Add authenticated browser QA for separate River and Water placement, point/freehand modes, river intersection paint blending, clean lake rendering, solid overlapping object coverage, selection/resize/point editing, refresh persistence, and PNG/export rendering.

Map builder location marker follow-up note (2026-06-29): Location markers now store editable icon size, icon fill, icon outline, label text size, label colour, and label outline colour. Icon size and label size are independent from marker width/height so users can resize the visible symbol and location name separately from the marker footprint. Add placement, refresh persistence, hit-selection, and export rendering checks to authenticated browser QA for the existing Reliable map builder item.

Map builder interaction follow-up note (2026-07-02): Shift-drag now starts temporary canvas panning even when the cursor is over an existing map object, instead of selecting or dragging that object first. Add Shift-pan-over-object behavior to authenticated browser QA for the existing Reliable map builder item.

Map builder interaction follow-up note (2026-07-02): Dragging a selected political region's label-position dot now updates only the label offset instead of moving the whole region. The Terrain tool's type picker now keeps all terrain options reachable through a viewport-constrained internal scroll area that captures wheel gestures instead of zooming the map underneath. Add label-handle dragging and terrain-picker scrolling to authenticated browser QA for the existing Reliable map builder item.

Map builder layer-order follow-up note (2026-07-02): River objects now render in the same layer order as other map objects instead of always painting above every non-river object; adjacent river runs still merge visually, and PNG export uses the same order-preserving draw path. Object normalization also preserves `groupId` so layer-group membership survives helper-created objects. Add river above/below layer movement, group membership persistence, and PNG ordering checks to authenticated browser QA for the existing Reliable map builder item.

Map builder inspector follow-up note (2026-07-02): Political regions can now be linked or unlinked to existing Location entries from Object Properties after creation. Label font choices now distinguish Fantasy serif from Standard serif with a more decorative fantasy font stack. Outline/border controls now support a transparent None state for map outlines, road borders, border lines, location icon outlines, and label outlines, with draw paths skipping ghost strokes/shadows where needed. Add post-creation region linking, font distinction, transparent-border canvas rendering, persistence, and PNG export checks to authenticated browser QA for the existing Reliable map builder item.

Map builder layers follow-up note (2026-07-02): Layers panel now includes an "Only show selected type" filter that narrows the layer list to the currently selected object's type, keeps matching grouped objects under their group headers, and leaves canvas visibility unchanged. Add selected-type layer filtering and type-switch behavior to authenticated browser QA for the existing Reliable map builder item.

Map builder interior follow-up note (2026-07-03): Interior maps now use a distinct toolset instead of the shared world/region map palette: Wall uses point-to-point path drawing with a Wall-only Straight/Curved line toggle, Door / Window places opening objects only when clicked onto an existing wall, previews the projected placement on the wall before click, and visually cuts the wall segment with door artwork filling the cut gap and four door swing orientations that start from the wall-gap end, Region becomes a local Room indicator, and interior maps hide Location tool/linking/navigation so they do not open or create records in the Locations tab. Rooms no longer use the wavy political-region edge treatment and now support a Room-only Straight/Curved edge toggle when drawing and editing rooms. Interior stamp browsing now uses purpose-built Furniture, Fixtures, and Signifiers categories instead of world-map stamps, including bed, table, chair, desk, bookshelf, wardrobe, chest, barrel/crate, rug, fireplace, altar, pillar, statue, stairs, ladder, trap, secret, locked, hazard, loot, encounter, and objective symbols. Add authenticated browser QA for interior map creation, room creation, straight/curved room edges, straight/curved wall drawing, door/window wall-only placement previews, four-option door swing arcs, opening persistence/export, furniture/fixture/signifier stamp placement, and absence of Locations-tab links.

Map builder local follow-up note (2026-07-03): Local maps now use a more local-scale palette instead of the full world/region tool mix: Region is presented as Area in Local map UI, Wall is available as a point-to-point brush with grey brick material by default plus beige brick, white brick, black brick, red brick, wood, and plaster presets; Path is a distinct resizable local brush with a live brush-size preview, flatter ends, and a slimmer border rather than a world/region Road; and local stamp browsing now focuses on Local Structures, Local Features, Local Nature, Local Markers, and Signifiers with local-scale symbols such as buildings, cottages, shops, inns, wells, fountains, gates, fences, signposts, market stalls, wagons, docks, boats, trees, boulders, gardens, fields, campfires, lookouts, and ambush markers. Stamp picker previews across map types now use a soft light background and more preview/label room so symbols and names are not clipped. Add authenticated browser QA for local map tool filtering, Area wording, local wall material presets and persistence/export, path brush preview/size/editing, flat-ended path rendering, stamp picker preview legibility, and local stamp placement/export.

Map builder map-type identity follow-up note (2026-07-04): Product decision — finish the map builder rather than freeze it, and give each map type its own identity. The political-territory tool now uses a scale-matched noun per map type: World = Kingdom (♔), Region = Territory (▢), Local = Area (existing), Interior = Room (existing); nouns flow through the tool rail, naming modal (title, fields, placeholder, save button, create-location checkbox), Places panel filters/empty states/type labels, Layers selected-type filter label, and the worldbuilding Location category created from a territory. This is label-only — the underlying `territory` object type is unchanged and existing map data is unaffected. New Region and Local maps now default to a land-first canvas via a `baseLayer` metadata setting ('water'|'land'); World maps and all pre-existing maps keep the open-water default; a "Base layer" select in Map settings (hidden on interior maps) switches between "Open water — draw landmasses on top" and "Land — draw water on top", re-rendering canvas and PNG export backgrounds; each style preset has a land-tone gradient variant (parchment land matches the parchment landmass default fill). Grid scale labels now default per type (World "1 square = 100 miles", Region "1 square = 10 miles", Local "1 square = 100 ft"; interior unchanged); stored scale values take precedence. The Note tool was restored to World/Region toolsets (regression: it had been dropped from ALL_DRAWING_TOOLS despite the 2026-06-27 all-map-types note decision). Dead terrain/swamp/tundra helper functions removed from `mapDraw.js` (20 functions), fixing the 11 lint errors that had kept CI red since 2026-06-30. Browser-verified in offline preview: Kingdom/Territory/Area rails per map type, land canvas on new region map, base-layer toggle live re-render, scale default, no console errors. Add authenticated QA per [docs/QA_PLAN.md](QA_PLAN.md) Priority 9.

Map builder stamp styling follow-up note (2026-07-03): Selected placed stamps now expose Fill / tint, Outline, and Accent colour controls in Object Properties. Canvas fallback stamps apply all three colours, while PNG-backed stamp art accepts the fill/tint overlay so reference art can still be recoloured without losing its shape. Add authenticated browser QA for stamp recolouring, refresh persistence, and PNG/PDF/world-bible export rendering across world, region, local, and interior maps.

Series continuity UX follow-up note (2026-06-26): Overview now always exposes Series Settings, adds an inline Character selector plus a dedicated Characters sub-tab, adds a Series Summary sub-tab/card with compact edit action, gives Timeline a By Project vs chronological All Events mode, issue cards include detailed detection explanations, per-entry evidence, Review Entry links that open and scroll to the relevant Series Index detail, and Open Project links that target the affected project section/entry where supported while reviewed warnings minimize, same-name character records are treated as unified series character identities instead of project fragments, and Series Settings uses the full dashboard width before stacking.
| AI import — all project types | AI import supports all 6 active project types (product decision 2026-07-08 resolved the previous Novel-only review item). The AI suggests the best-fit type from the uploaded material and the preview shows a "Create as" selector to override it before the project is created; structured-archive (compatible ZIP) imports get the same selector. Structure labels follow the chosen type for generated fallback titles (Act/Part/Story Arc/Campaign Arc/Volume → Chapter/Section/Session/Issue → Scene/Encounter/Page) while real document headings are preserved. Comic imports create Volumes/Issues with real comic pages (imported text lands in the page summary) instead of prose scenes the Pages workspace cannot show. YOW ZIP/PDF restores now keep the exported project type (unknown/retired types still fall back safely to Novel), carry word target and enabled sections, and restore comic pages/panels and Character Builder party members with remapped issue/page/character links — these were previously dropped and every restore was forced to Novel. | Implemented 2026-07-08, needs QA | Unit tests (`src/components/AIImportModal.test.js`) cover populate/relabel/remap logic; offline browser check verified structured-archive → D&D Campaign import and a YOW comic ZIP restore end-to-end. Run the new [docs/QA_PLAN.md](QA_PLAN.md) Priority 3 "AI import all project types" checks, including live-AI type detection with a configured provider. | Product/AI/Engineering |

### Series Continuity Plan

Product decision: final launch should include practical series continuity management, not a future-promised AI continuity engine. The launch version should help writers see connections, character/world growth, and worldbuilding changes from project to project, while letting later projects build on earlier project data through the existing forward-sync model. It should primarily serve prose series, but D&D/TTRPG campaigns should use the same continuity system. It must not imply collaboration, public sharing, live play, or AI-required contradiction detection.

Current baseline:

- Series dashboard, series project ordering, series settings, and add/remove project flows exist.
- Forward-series sync exists for characters, locations, lore, factions, ideas, timeline, world history, and character journeys through the existing sync-category model.
- The Continuity tab already shows shared sync categories and detects same-named characters across projects.
- The remaining blocker is product polish and utility: the current tab still contains "Coming in Phase 2" copy and does not yet provide enough actionable continuity navigation for final launch.

Launch scope:

1. Replace future-facing copy with a launch-ready Continuity tab.
   - Remove "Coming in Phase 2", "after launch", and similar language from the Series dashboard.
   - Show a plain continuity overview that explains the current sharing model: earlier projects flow forward; later-project edits can fork forward; earlier projects are not mutated unless the user explicitly chooses a synced delete/update path.
   - Show empty states that guide the user to Settings when no sync categories are enabled and to Projects when the series has no projects. Empty-state copy: "To see your series journey, enable story linking here," with a direct link/button to Series Settings.
   - Use sub-tabs inside Continuity: Overview, Summary, Index, Characters, Timeline, Issues, and Export.

2. Add a series-wide continuity index.
   - Provide search across synced and project-local series records for characters, locations, lore, factions, timeline/world-history entries, maps, and character journeys.
   - Include filter chips for record type, project, synced/local scope, and "appears in multiple projects".
   - Each result must show record title/name, type, source project, whether it is inherited/shared or project-local, and a direct action to open the owning project/section when possible.
   - Clicking a continuity result should open the relevant detail page/panel inside the Series dashboard first. From that series detail view, users should also have links to navigate to the relevant entry in the relevant project workspace.
   - Single-project data must remain scoped; the index may read across projects in the selected series but must not change what an individual project can see unless the existing sync rules allow it.
   - Ideas are deliberately excluded from series continuity because they are rough captures rather than canonical worldbuilding records.

3. Surface recurring-entity continuity.
   - Treat same-name characters as possible matches for manual review, not as confirmed identical characters.
   - Keep same-name detection for characters, but make it more useful: group matches by normalized name, list all projects where the character appears, and show whether those records are synced lineage, local forks, or separate same-name records.
   - Add similar lightweight grouping for locations and lore titles.
   - Character continuity should treat same-name character records as one series identity for dashboard/search/journey purposes unless the user deliberately separates the names. This identity layer must be non-destructive and must not rewrite the underlying project records.

4. Surface character arc continuity.
   - Series-spanning journeys should appear in the Continuity tab with character name, arc type, before/current/after state, major beats, relationship changes, faction/allegiance changes, location movement, death/status changes, external goal progress, and projects touched by linked beats.
   - Project-local journeys should remain visible as local records when searching/filtering but should be labelled as project-local.
   - Users can choose which characters appear in the series journey overview. This visibility setting should live wherever it is simplest and least error-prone across series projects, has no selection limit, and defaults to no noisy assumptions beyond user choice.
   - The default character-journey layout should be a horizontal project-by-project journey lane, with an option to open each project entry for deeper profile detail.
   - Character arcs can be edited from the Series dashboard as well as from the character profile Journey tab, but Series dashboard editing should focus on project-to-project continuity fields rather than every full profile field. Series editing must reuse the same data model and save paths so it does not create a second competing arc system.

5. Add timeline continuity review.
   - Show a combined series timeline/world-history stream for story-order continuity, using series project order as the primary structure.
   - Dated entries can be shown within their project context, with a second "all events" option that lays timeline/history entries into chronological order by available event date regardless of project number.
   - Entries with no dates should group together in one shared "Undated" section across all projects.
   - Highlight missing dates, duplicate/similar event titles across projects, linked characters/locations, and story-order continuity warnings where data already exists.

6. Add deterministic contradiction warnings.
   - Contradiction warnings are launch scope, but AI is not required and should not be part of the launch promise for this feature.
   - Detect straightforward data conflicts using existing structured fields where possible: conflicting character age/status/death state, character appearing after a recorded death, relationship inconsistency, faction/allegiance mismatch, location detail mismatch, lore title/detail conflicts, timeline/story-order conflicts, duplicate/similar records, and map/location link inconsistencies.
   - Warnings should be explainable and reviewable. They should link to the relevant records and allow the user to move warnings to a Reviewed list rather than deleting them outright, so reviewed warnings can be revisited or disabled in future.
   - Avoid auto-correction, auto-merge, or destructive changes.

7. Series-wide record scope controls.
   - Users should be able to mark relevant records as series-wide, project-local, forked from an earlier project, or hidden from later projects where this can be implemented without destabilising the current forward-sync model.
   - Records hidden from later projects should also be hidden from series continuity.
   - When a later project edits inherited data, ask first. The prompt should offer: update shared series record, fork from this project forward, keep change project-local, or cancel.
   - Earlier-project safety remains the rule: later work must not mutate earlier projects without an explicit user choice.

8. Map continuity.
   - Maps should appear in continuity primarily through visual previews, with source project, map type, linked locations, and project navigation.
   - Map continuity should prioritise useful visual review over deep map editing inside the Series dashboard.
   - Contradiction warnings can flag map/location link inconsistencies where structured data is available.

9. Series Bible export.
   - Add a dedicated Series Bible export separate from the individual project World Bible export.
   - Include everything in the continuity surface: series overview, project order, characters, selected character journeys, locations, lore, history, timeline, factions, maps, contradiction/review notes, sync settings, and inherited/shared/local scope labels.
   - Export one big readable Series Bible document plus folders of project data.
   - Package separate projects into their own folders within the export.
   - Individual project exports should include inherited records so a user exporting a later project has the context it depends on.

10. Export and restore expectations.
   - Series export/restore must preserve series membership, project order, sync categories, include-later settings, and enough linked record IDs/remapped IDs for continuity review to remain coherent after restore.
   - Project-level exports should include inherited/shared records with clear scope labels.

Implementation slices:

1. Copy cleanup and dashboard summary: remove future copy, add continuity overview cards, empty states, and shared-model explanation.
2. Continuity sub-tabs and selectors: add Overview, Summary, Index, Characters, Timeline, Issues, and Export, plus search, record-type filter, project filter, and scope filter in `SeriesDashboard`.
3. Series continuity data builder: add pure helpers that derive searchable results from ordered projects and store arrays without mutating store state.
4. Recurring entities: group characters, locations, and lore titles as reviewable possible matches.
5. Character journeys: add configurable visible-character selection, editable horizontal project-by-project journey lanes, and navigation targets.
6. Timeline stream: add story-order timeline stream with one shared Undated section and duplicate/missing-data hints.
7. Deterministic issues engine: add structured contradiction warning helpers with active/reviewed state if low-risk.
8. Map previews: add series map preview cards with linked-location context.
9. Series Bible export: add one big readable document plus project folders and inherited context.
10. Export/restore QA: verify series metadata and linked continuity data survive a ZIP round trip.

Acceptance criteria:

- The Series dashboard Continuity tab contains no future/Phase 2 copy.
- A user can search across a series and find characters, locations, lore, factions, timeline/world-history entries, maps, and character journeys.
- Ideas are excluded from series continuity.
- Results clearly identify source project and inherited/shared/local scope.
- Clicking/opening a result takes the user to a Series dashboard detail view first, with links onward to the owning project entry/workspace.
- Series-spanning character journeys are visible as horizontal project-by-project lanes and project-to-project continuity fields are editable from the Series dashboard for user-selected visible characters.
- Recurring characters across projects are grouped into unified series character identities without mutating underlying project records.
- The combined timeline/history view follows story order in By Project mode, includes one shared Undated section in the project-grouped view, and offers one chronological all-events stream regardless of project number.
- Deterministic contradiction warnings work without AI, never auto-correct user data, and can move to a Reviewed list.
- Forward-sync behavior remains safe: later-project overrides do not mutate earlier projects without explicit user choice; inherited edits ask whether to update shared, fork forward, keep local, or cancel; synced deletes still use scoped-delete prompts.
- Users can mark records series-wide, project-local, forked, or hidden from later projects where the current sync model can support it safely; hidden-from-later records are also hidden from continuity.
- Maps appear through visual previews with linked-location context.
- Series Bible export preserves membership, order, sync categories, include-later settings, inherited records, maps, character journeys, review warnings, one big readable document, and per-project folders.
- Mobile/tablet/desktop layouts remain usable with long series names, many projects, and many continuity results.

### Focused Writing Mode Product Decision

Decision recorded 2026-06-22. Focused writing mode is an editor state, not a synonym for browser fullscreen. Users must be able to use focused mode in the browser window, focused mode and fullscreen together, or fullscreen without focused mode. Focused mode must not depend on the Fullscreen API.

Focused shell:

- Keep the active manuscript area and a minimal top bar containing the project title, saving state, word count, and an explicit exit control.
- Allow a small scene/chapter breadcrumb. Hide sidebars by default, but keep structure, notes, formatting, AI, and goals available through floating reveal controls.
- Open structure as a temporary left drawer; notes as a right drawer or bottom sheet; formatting as a compact floating toolbar; and AI as a temporary panel. On mobile, use bottom sheets above the tab bar.
- Escape closes the active temporary panel first. A subsequent Escape may exit focused mode on keyboard platforms, but mobile always needs a visible exit control.
- Reduce chrome, borders, shadows, and inactive-scene emphasis while preserving a readable manuscript width and generous writing space.

Caret-follow behaviour:

- Keep the caret within roughly 35–65% of the visible editor area. Do not continuously centre it.
- Centre a newly selected scene/editor predictably. During typing, scroll only as the caret approaches a comfort boundary.
- Use instant or very short adjustments; do not smooth-scroll during continuous typing. Respect `prefers-reduced-motion`.
- Measure a textarea caret with a hidden mirror element that copies rendered width, typography, line height, padding, border, letter spacing, whitespace/wrapping, and prose/script styles. Split at `selectionEnd`, insert a marker, and measure its rectangle only when needed.
- Schedule measurement after textarea auto-height settles. Cover input, keyup, click, mouseup, paste, textarea selection changes, and resize through `requestAnimationFrame` batching.
- Ignore updates during IME composition and while the user is actively selecting with mouse or touch. Caret following must never change autosave or local-draft write behaviour.

State and persistence:

- Own focused-mode state above `SceneEditor`, initially in `Manuscript` or the manuscript store, and expose caret measurement/following through dedicated hooks rather than embedding scroll policy in `SceneEditor`.
- Persist focused mode per user. Retain local focused settings such as `focusedMode.enabled`, `focusedMode.caretFollow`, and `focusedMode.uiDensity` for future extensibility.
- Re-open in focused mode only when the user explicitly left it enabled. Keep the MVP behaviour fixed to one calm-follow setting; user tuning is later polish, not part of the first slice.

Implementation stages:

1. Product shell: separate focused and fullscreen controls; add focused state, minimal toolbar, focused layout, hidden sidebars, and temporary reveal panels without changing caret following.
2. Caret measurement: remove the newline-estimate cursor-centering effect and add mirror-based measurement plus 35–65% comfort scrolling behind a feature flag.
3. Event coverage: support typing, deletion, paste, key navigation, pointer caret movement/selection, composition lifecycle, selection changes, and resize.
4. Mobile polish: use dynamic viewport units where available, account for keyboard resize and safe areas, keep the toolbar compact/sticky, use bottom sheets, and prioritize visibility above the keyboard over perfect centring on mobile Safari.
5. Preferences: persist the per-user enabled state and local focused settings without exposing premature configuration UI.
6. QA hardening: prove autosave safety, scene switching, script/prose measurement, reduced-motion behaviour, accessibility, zoom, and mobile Safari fallback before marking complete.

Implementation note (2026-06-22): stages 1–5 are implemented in the manuscript workspace. The previous newline-count estimate and continuous smooth centring were removed from `SceneEditor`; dedicated hooks now auto-size before paint, mirror the rendered textarea, batch covered caret events into animation frames, and adjust only outside the 35–65% comfort zone. Focused mode uses a minimal status shell plus floating reveal controls, desktop temporary drawers, and mobile bottom sheets while retaining the existing `WritingSidebar` content and all autosave/draft calls. Normal, focused, and fullscreen writing toolbars include a persisted 80–150% manuscript-page zoom that scales the complete document canvas—text, headings, spacing, and scene chrome—while passing the same scale into mirror-based caret measurement. Automated comfort-boundary tests pass; browser/device QA remains required before final completion.

## QA Needed

These items are in launch scope and currently need verification rather than new product scoping.

| Feature | Launch Requirement / Acceptance Criteria | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Novel finalized draft reader | Novel projects can snapshot the current manuscript into timestamped, read-only finalized drafts and view them in a reader layout without changing the working manuscript. | Implemented, needs QA | QA finalise/read/select behavior, scroll/page controls, and non-novel visibility rules. | Product/Engineering/QA |
| Factions and family grouping | Factions, family groups, and character grouping are visible final-launch worldbuilding tools if QA confirms they persist, sync, delete, and export safely. Faction logos can be made with the heraldry builder or supplied as an uploaded, storage-optimised image. | Implemented, needs QA | QA faction CRUD; build/upload/replace/remove logo flows and persistence; character cleanup on delete; series sync; filters; and export inclusion. | Product/Engineering/QA |
| Stylised encyclopedia / World Bible export | Current PDF/HTML export is the launch World Bible/encyclopedia path. It should be reviewed and QA'd rather than expanded into a separate new export feature. | Implemented, needs QA | Review generated output for realistic projects; QA cover, TOC, character dossiers, relationship atlas, factions, locations, lore, timelines, map plates, notes, theme styling, and embedded project JSON. | Product/Design/QA |
| Theme system v2 | Theme customisation remains in launch as an existing quality feature, not a primary marketing promise. | Implemented, needs QA | Authenticated QA for theme saving, preview, refresh, sign-out/sign-in, contrast, and main workspace surfaces. | Design/Engineering/QA |
| Founders directory | Keep the public Founders directory because Founder pricing includes recognition/status. | Implemented as React page 2026-06-26; needs QA | `FoundersPage` React component (`src/components/founders/FoundersPage.jsx`) replaces the static HTML page. Routed via `isFoundersPath`/`showFounders` in `App.jsx`. Uses `MarketingNav`, `MarketingFooter`, and app CSS variables — theme and logo now match the rest of the site. Morgan Bishop added as the first Founder card. Founders directory now has real founder data (Morgan Bishop, first Founder entry). Individual profile pages (`/founders/:slug/`) are implemented — `FounderProfilePage.jsx` handles per-founder bio, genre, location, current work, and CTA; `App.jsx` routes `/founders/:slug/` via `getFounderProfileSlug()` and `founderProfileSlug` state so card clicks no longer fall back to the homepage. Photo placeholder in place (emoji); swap in `avatar` field when photo is ready. QA `/founders/`, `/founders/morgan-bishop/`, card link routing, back navigation, pricing CTA, homepage/footer links, and visual match with marketing pages. | Product/Engineering/QA |

## Completed Supporting Scope

| Feature | Requirement / Acceptance Criteria | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Analytics | Google Analytics 4 implemented 2026-06-13 (tag G-L1BT87PKXV, added to all 25 HTML pages). Replaces the Posthog/deferred plan. | Complete | No further action needed. | Engineering |
| Project-type manuscript templates | The template picker in manuscript mode now filters templates by active project type. Novel/Novella: Three Act, Hero's Journey, Save the Cat, Romantasy, Mystery/Thriller, Episodic TV, Blank. Short Story adds: Freytag's Pyramid, Flash Fiction, In Medias Res. Comic: Multi-Issue Arc, Standalone Graphic Novel. D&D Campaign: Three-Arc Campaign, One-Shot. TTRPG: Three-Act Campaign, One-Shot/Convention, Horror Campaign. Blank/Custom is universal. `getTemplatesForProjectType()` handles filtering; `TemplateModal` receives `projectType` prop from `Manuscript`. Retired type templates (Screenplay, Play, TV Show, Video Game) are not shown. | Implemented 2026-06-13 | No further QA gate required; template picker adapts automatically when a project is opened. | Engineering |
| AI chat history — pin & category | All AI chat sessions are persisted per project in localStorage. Sessions can be pinned (appear first) and tagged with a free-text category; category filter chips appear in the session list when categories exist. | Implemented | No further action needed for launch. | Engineering |
| AI-assisted developmental editing feedback | Current AI architecture already provides bounded, user-directed developmental support through Plot Hole Detector, Lore Conflict Checker, Style Analysis, contextual AI Chat, and manuscript quick suggestions. This is sufficient for launch without adding autonomous/agentic workflows. | Complete for launch architecture; AI chat UX improved 2026-06-28 | Floating AI Chat now has remembered position/size, drag-to-move header, bottom-corner resize grip, mobile-safe bounds, softer panel styling, more readable message/composer treatment, compact active-chat top bars, and per-response actions to save assistant answers as Ideas or Lore entries. QA existing AI tools through the launch QA plan; do not expand into advanced agents unless a separate product decision is made. | Product/AI/QA |
| Ideas board card preview and edit modal | Idea cards show a 4-line collapsed body preview (WebkitLineClamp: 4) with no Show more/Show less toggle — clicking the card opens the edit modal instead. Clicking an empty Kanban column opens a lightweight "New idea" modal with a single title input that creates the entry directly in that column's status. Clicking any existing idea card opens a full-screen centered edit modal (78vw × 82vh) with a document-style serif title field, a large auto-sizing body textarea, and a right-side sidebar for status picker, tags, linked entities, and archive/restore. All changes save on blur. | Implemented 2026-06-26 | No further action needed for launch. | Engineering |
| Marketing copy — finished product messaging | All public-facing pages and React marketing components assert YOW is a complete, finished product. Removed: "ongoing project, not a finished product", "community shapes what it becomes", public roadmap claim, "Feature Request tab" references from About and FAQ pages, "Structured imports (e.g. from DOCX) are on the roadmap" from FAQPage.jsx, "Beta — core features available; full QA in progress" label from HomePage.jsx project cards, "collaboration is on the roadmap" from best-worldbuilding-tools blog post, Beta Status section from llms.txt. FAQ DOCX import answer updated to confirm the feature exists. Beta Disclaimer footer links removed from all public pages. | Complete 2026-06-26 | No further action needed. | Product/Engineering |
| Marketing theme — ink-ember on static pages | All static HTML marketing pages now use the ink-ember colour palette: background #0d282e, nav #133840, accent #e8724e (orange), text #e2f0ee, borders #1e4a50. All old-palette hardcoded rgba values replaced. Beta watermark badge removed from marketing.css. btn-primary text colour updated to white. | Complete 2026-06-26 | No further action needed. | Design/Engineering |
| Marketing logos — PNG across static pages | All static marketing HTML pages use yow-logo.png (height 34px, width auto) instead of yow-logo.svg forced to 28×28, matching the React marketing nav. marketing.css .m-nav-logo updated accordingly. | Complete 2026-06-26 | No further action needed. | Engineering |
| Character linking UI consistency | All character/location linking sections now use the same pill-toggle pattern as the lore entry adder: a `panel-soft` scrollable container with `rounded-full` chip buttons that show a ✓ and turn accent-coloured when active. `ChronicleEntryForm` (Timeline and WorldHistory add/edit forms) replaced checkbox lists; `ScheduleCalendar` event form replaced inline-styled pill buttons with matching Tailwind classes. | Complete 2026-06-26 | No further action needed. | Engineering |

## Future/Excluded

The following are explicitly outside the final launch product after product review. Do not re-add them as launch requirements without a direct product decision.

| Feature | Decision | Reason |
| --- | --- | --- |
| Marketplace / public community | Removed from product scope. | YOW is a private creative workspace, not a public community platform. |
| Collaboration / multi-user editing | Removed from product scope. | Shared editing, permissions, presence, conflict resolution, and collaboration support would create a different product. |
| Native mobile apps | Removed from product scope. | Responsive web usability remains the launch requirement. |
| Public project/profile sharing | Removed from product scope. | Launch promise should stay focused on private writing, planning, ownership, and export. |
| Read-only share links / player view | Future only; highest-value collaboration-adjacent addition if TTRPG demand justifies it. | A read-only player/GM handout view would address the biggest TTRPG competitive gap without full collaboration, but it still creates permissions, privacy, sharing, and support obligations that are outside final launch scope. |
| Custom/fantasy calendar engine | Future only unless TTRPG positioning changes. | YOW has eras, timelines, and history, but not an invented-calendar simulation engine. Kanka and World Anvil use this as a TTRPG differentiator; YOW should not imply calendar-engine support at launch. |
| Advanced AI agents | Removed from product scope. | Current AI architecture is intentionally bounded and user-directed; autonomous workflows are not necessary for launch. |
| EPUB export | Excluded unless publishing-output positioning changes. | Current DOCX/PDF/ZIP/export ownership path is more important. EPUB adds validation, formatting, reader-compatibility, and publishing-support expectations that are not worth launch scope unless YOW promises direct publication output. |
| Voice dictation | Excluded unless accessibility requirements change. | Browser dictation support is inconsistent and microphone/privacy expectations add QA burden. It is useful, but not necessary for the current product promise. |
| Publishing platform integrations | Removed from product scope. | Direct publishing integrations would add external API support, account linking, and platform-specific maintenance outside the private workspace model. |
| Native desktop app for Free/Monthly | Free and Monthly remain browser-only cloud plans. | Product decision 2026-07-04 moved the Lifetime tier to a downloadable desktop app (see PRD: Desktop Lifetime App and Local Vault). Desktop access is a Lifetime/Founder entitlement only; no desktop promise for Free or Monthly. |
| Extended template marketplace / community-submitted templates | Removed from product scope. | Built-in project-type templates are enough; user/community template distribution would recreate marketplace/community obligations. |
| Passage-level comments/annotations | Removed from launch scope. | Scene notes are sufficient for launch; true passage annotation would add editor complexity and data-loss risk without being central to YOW's private planning/export promise. |

## PRD: Map Builder Rebuild

### Product Summary

The Map Builder is final-launch scope. It should become a reliable worldbuilding and campaign-planning canvas, not a novelty drawing panel. It should let writers and GMs quickly create readable world, region, local, and interior maps; link places back to Locations; use grid overlays for movement/planning; export enough visual and metadata context to be useful; and feel stable under normal editing.

Map quality is required because D&D/TTRPG users will reasonably expect usable campaign-map support. The launch promise is planning-grade map creation and export, not live play, live player access, fog of war, initiative automation, or VTT replacement.

### Current Baseline

The current implementation already supports multiple maps per project, map types (world, region, local, interior), object layers, land/region/river/road/border paths, stamps, labels, linked locations, JSON import/export, basic style presets, snap, lock/hide, grouping, duplication, and layer ordering.

The biggest issues are interaction quality and output quality: zoom is too sensitive, selection and drag behavior are not intuitive, drawing modes are easy to confuse, closed water shapes are not treated as filled water, the Mountain line tool does not produce convincing mountains, and project exports currently preserve map metadata better than rendered visual plates.

### Goals

- Make the map canvas predictable: no accidental moves, wild zoom jumps, or unclear selection state.
- Make drawing tools understandable: users can tell whether they are selecting, panning, drawing, placing, or editing points.
- Support the core fantasy/cartography primitives writers expect: land, water, regions, routes, borders, labels, settlements, landmarks, terrain stamps, mountains, and interiors.
- Support optional grid overlays for movement and planning: square grid at minimum, clear sizing controls, opacity/color controls, snap-to-grid where useful, and map-scale labels that help a GM understand distance without turning YOW into a live tabletop.
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
- Add visible grid controls: show/hide grid, grid size, grid opacity, grid colour, snap-to-grid, and a plain movement scale label such as "1 square = 5 ft" or a custom unit.
- Space/Alt temporary pan should work reliably; cursor state should reflect pan, grab, drawing, dragging, resizing, and rotating.
- Selection must use hover highlights, selected outlines, clear handles, and predictable click behavior.
- Clicking empty canvas deselects unless a draw/place mode is active.
- Dragging an object should require a small movement threshold so normal clicks do not accidentally move it.
- Multi-select should support Shift/Cmd/Ctrl click, select all, clear selection, and layer-panel selection.
- Resize, rotate, and point-edit handles must be large enough at every zoom level and must not conflict with object selection.
- Undo/redo is required for create, move, resize, rotate, delete, duplicate, group, ungroup, style edits, point edits, map type changes, imports, and layer-order changes.
- Keyboard shortcuts should cover Delete, Escape, Enter-to-finish-path, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+A, Cmd/Ctrl+D, plus optional one-key mode shortcuts after focus safety is confirmed.

### Required Map Tools

- Land: polygon, rectangle, and ellipse/circle landmasses with organic shoreline option, solid fill/stroke, point editing, and base-layer behavior.
- Water: filled lake/pond/sea polygons with clean solid water fill, editable edge, fill, stroke, organic edge, and optional wave texture. River remains a separate open-path tool for rivers/coastlines and visually blends intersecting river strokes like a paint brush.
- Regions: political or terrain areas with solid fills by default, borders, labels, and editable polygon points; terrain can still be deliberately set to a transparent background.
- Roads/Paths: open lines with solid/dashed styles, thickness, color, and optional route labels.
- Borders/Walls: open or closed path support with dashed/solid styles and clear visual distinction from roads.
- Stamps: rename "Forests and Stamps" to "Stamps"; forests become a Terrain stamp category/preset, not a separate tool label.
- Stamp placement: click-to-place, drag-to-place, recent/favorite stamps, search, category filters, rotation, scale, opacity, duplicate, and random variation controls.
- Mountains: either replace the current Mountain tool with convincing mountain symbols/ranges (natural spacing, size jitter, rotation jitter, ridge direction, density, and group editing) or remove it and rely on mountain stamps until quality is good.
- Labels: readable text labels with font size, color, optional curved labels for regions/routes, and collision-aware defaults where feasible.
- Locations: place new or existing Locations on the map; linked markers should update display names when the Location name changes and should navigate back to the Location detail.
- Interiors: interior maps are spatial-layout tools, not world/region maps indoors. They need distinct room/corridor/wall semantics, doors, furniture/object stamps, snap-to-grid defaults, and neutral terminology for prose/comic projects. D&D/TTRPG projects additionally use dungeon terminology, traps, secret doors, 5 ft movement language, and a grid-first dungeon-planning presentation.
- Grid overlays: square grid is required for launch; hex grid is optional only if it can be implemented cleanly without destabilising the map builder. Grid overlays must export visually and persist in map data.

### Data Model And Persistence

- Keep a versioned map schema with forward-compatible object records.
- Each object needs stable `id`, `type`, position, size, rotation, z/layer order, visibility, lock state, style metadata, points/faces where relevant, and linked entity IDs where relevant.
- Each map needs grid settings: enabled, grid type, size, opacity, colour, snap setting, and movement scale/unit metadata.
- Add explicit water-mass metadata rather than overloading river lines once a path is closed.
- Add mountain-range metadata only if the mountain tool is improved; otherwise remove the line-tool mode from available map types.
- Persist maps synchronously enough that refresh/navigation does not lose recent edits.
- Project ZIP export/restore must include all maps, object data, layers, linked location IDs, map type/style metadata, and any generated thumbnails.
- JSON map import/export must preserve unknown future fields and report invalid imports clearly.
- Deleting a linked Location should not crash the map; markers should become unlinked but keep their text unless the user chooses to remove them.

### Visual Output

- Canvas rendering should look intentionally cartographic at normal zoom: cleaner water, land, region, route, border, mountain/stamp, and label styling.
- Every map should maintain or generate a thumbnail/preview image for dashboard/export contexts.
- Grid overlays should be legible but not overpower map content, and should appear in exported visual plates when enabled.
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
- Enable a square grid, set movement scale, change size/opacity/colour, use snap-to-grid, refresh, export, restore, and confirm the grid and movement metadata persist and render in visual exports.
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
| 7. Grid and movement planning | Optional grid overlay, movement scale, snap-to-grid, persisted grid settings, and visual/export support. | Required for final launch because tabletop GMs need movement/planning guidance. Square grid is required; hex grid is optional if low-risk. |

## Icebox

New ideas start here unless they are accepted into final launch scope through the Final Product Scope Discipline rules.

| Feature | Why Parked | Decision Needed |
| --- | --- | --- |
| No active unreviewed ideas | Previous Icebox items have been moved to To Be Implemented, QA Needed, Completed Supporting Scope, or Future/Excluded by product decision. | Add only genuinely new, unvalidated ideas here. |

## Security

| Item | Detail | Status | Remaining |
| --- | --- | --- | --- |
| Supabase security hardening | Migration `20260612_security_hardening.sql` applied. Fixes: `set_updated_at` mutable search_path (switched to `SET search_path = ''`); `delete_user` anon EXECUTE revoked (`REVOKE … FROM PUBLIC` + re-grant to `authenticated` only); `get_founder_slot_info` search_path hardened. | Applied 2026-06-13 | 5 linter warnings remain — all intentional or plan-limited: `feedback` INSERT always-true (anonymous feedback by design); `get_founder_slot_info` anon/authenticated callable (public slot counter); `delete_user` authenticated callable (account-deletion flow); leaked password protection (Pro plan feature). |
| Welcome email | Branded welcome email sent via Resend on every new signup. Edge Function `send-welcome-email` deployed to Supabase. Called directly from `AuthContext.signUp` after successful signup. Email matches ink-ember theme, lists all 6 live project types, links to yourownworld.co.uk. Supabase default confirmation email disabled (email confirmations off in Authentication → Sign In / Providers). `handle_new_user` trigger on `auth.users` auto-inserts `user_profiles` row on signup. `delete_user` RPC installed so account deletion removes the auth row cleanly. "Resend confirmation" button added to the "check your inbox" screen in LoginPage. RESEND_API_KEY set as Supabase secret. Exposed key rotated 2026-06-13. | Complete | No further action needed. |
| Feedback endpoint hardening | `/api/submit-feedback` was unauthenticated with no rate limiting or input length caps, so it could be scripted to flood the owner inbox; `nodemailer` ≤9.0.0 also carried advisory GHSA-p6gq-j5cr-w38f (found in the 2026-07-04 status review). Hardened 2026-07-13: field length caps (title 200, message 8000, category 100, email 254, name 120 — over-length returns 400), per-IP sliding-window rate limit (5/hour → 429; in-memory, best-effort per warm serverless instance by design — no storage dependency added), and nodemailer upgraded to ^9.0.3 (`npm audit` reports 0 vulnerabilities). Validation and rate-limit helpers unit-tested in `api/submit-feedback.test.js`. CORS restriction judged unnecessary: the route sets no permissive CORS headers, so cross-origin reads are already browser-blocked. | Hardened 2026-07-13 | Live-check one real feedback submission after the next deploy (tracked in QA plan Priority 11). |
| Password reset email | Supabase's built-in reset mailer was flagging as dangerous in email clients and sometimes omitting the link. Fixed: new Edge Function `send-reset-email` generates a recovery link via `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })` and sends a branded email through Resend matching the welcome email style (ink-ember palette, `hello@yourownworld.co.uk` sender). `AuthContext.resetPassword()` now calls this Edge Function directly instead of `supabase.auth.resetPasswordForEmail`. Deployed 2026-06-26. | Complete | QA: request a reset, confirm email arrives from hello@yourownworld.co.uk with no spam flags, confirm link works and lands on the new-password screen. Include in auth regression pass. |

## Bugs

Use this section for confirmed defects only. Suspected issues stay in the relevant roadmap row until reproduced.

| Bug | Impact | Status | Next Action | Owner/Notes |
| --- | --- | --- | --- | --- |
| Project picker/dashboard word counts could be inflated by raw markup | Project/project-picker stats could show impossible manuscript totals, such as ~147k words for a one-word draft, when stored scene content included markup or storage-like attributes. | Fixed, unit-tested | Verify the affected account/project picker now shows the visible manuscript word count. | `projectStats` now uses the cleaned manuscript word counter shared with exports instead of splitting raw scene content. `src/utils/projectStats.test.js` covers noisy HTML/storage attributes counting as one visible word. |
| QA CI red since 2026-06-30 — lint errors committed to main | The GitHub Actions QA workflow failed on every push and scheduled run since 2026-06-30 because 11 `no-unused-vars` lint errors (dead terrain/swamp/tundra helpers in `src/components/Map/mapDraw.js`) blocked `npm run qa` at the lint step, so tests/build/load-check were not being exercised in CI. | Closed 2026-07-04 — fix pushed in `fa98899`; CI runs 28719099926 and 28719361409 fully green (Static QA + all 13 smoke jobs). Note: focused-writing spec is not in the CI smoke matrix, so the separate focused-writing bug below still needs a local re-run. | No further action needed. | Engineering |
| Focused-writing browser smoke tests failing locally | 2 of 68 Playwright smoke tests fail in a local 2026-07-04 run: "focused mode is independent, keeps tools available, and Escape closes in layers" and "long wrapped prose keeps the caret inside the calm comfort zone" (`tests/e2e/focused-writing.spec.js`; caret bottom measured outside the 35–72% band). 62 passed, 4 skipped. Could be a real focused-mode regression or a flaky comfort-zone assertion; CI has not exercised these since 2026-06-30 because of the lint failure above. | Confirmed locally, needs triage | Re-run the spec after CI is green; if reproducible, debug the focused shell Escape layering and caret comfort scrolling against the Focused Writing Mode product decision. | Engineering/QA |
| Character age-at-death calculation used current year as the age anchor | Deceased characters could show impossible ages when a user entered an age and death year; example: age 1062 with death year 812 displayed as 1874 at death. Fixed: character age math now uses death year as the anchor when death date is present, and keeps current year for living characters. | Fixed, unit-tested, needs UI QA | In Characters, create/edit a character with Age 1062 and Death Date `Year 812`; confirm detail and header show `1062 at death` and the edit form reopens with Age 1062. | Engineering/QA |
| Pricing page made Lifetime look permanently selected and called it Creator in comparison copy | Pricing was visually misleading and used inconsistent plan naming. Fixed: all plan cards and comparison columns now use neutral presentation, Lifetime is named consistently, and only the signup/upgrade CTA buttons initiate plan actions. | Fixed, needs QA | Verify `/pricing/` at desktop and mobile widths: no card or comparison column appears selected, Lifetime is never labelled Creator, and only plan CTA buttons begin signup/checkout. | Engineering/QA |
| Map page fails with `MAP_TYPE_OPTIONS` error | Map Builder could fail to load when map normalization runs. Fixed: `mapUtils.js` now imports `MAP_TYPE_OPTIONS` before using it in `normalizeMapType`. | Fixed | Verify Map Builder opens on an existing and newly created map during the next browser QA pass. | Engineering/QA |
| Project deletion does not persist after logout | Data integrity — deleted projects reappear on next login. Root cause: `user_data.novels` is updated only via the 2-second debounced `saveAppData`; logging out within that window left the deleted project in `user_data` even though its `project_data` row was removed. Fixed: `deleteNovel` now captures the filtered novels list and calls `saveAppData` immediately alongside `deleteProjectData`. | Fixed | Verify: delete a project, immediately log out, log back in, confirm project is gone. | Engineering/QA |
| Newly created series never appeared in the library | UX — series creation appeared broken; series WAS saved but the library filtered to only series with ≥1 project assigned, so empty series were invisible. Fixed: library now renders all series including empty ones. | Fixed | No further action needed. | Engineering |
| Series dashboard uses book-specific language for all project types | UX mislead — series containing D&D Campaigns, Comic projects, etc. showed "books", "Add Book", "Books in Series", "Characters in Multiple Books", etc. Fixed: all book-specific copy replaced with "project/projects" in `SeriesDashboard` and the `SeriesCard` count badge; non-novel type label shown as secondary metadata in Projects tab and Overview table. | Fixed | No further action needed. | Engineering |
| Autosave reliability not proven across refresh/navigation/rapid typing | Potential data loss; launch blocker if reproduced. | QA passed | Immediate refresh after typed input and saved records now preserves fresher browser data instead of letting older account data overwrite it. Keep covered in launch regression tests. | Engineering/QA |
| Restore flow | YOW backup restore is now routed through the unified Import modal (Import ZIP option). Needs end-to-end QA to confirm all project data (scenes, characters, lore, timeline, chapters) round-trips correctly through export → Import ZIP → restore. | Implemented, needs QA | Export a project, use Import ▾ → Import ZIP to restore it, compare content against original. | Engineering/QA |
| Responsive layout not proven across launch screens | Could make mobile/tablet launch path unusable. | Mitigation added, needs QA | Project overview Characters tile text overflow fixed by allowing quick-link cards and count text to wrap within the card grid. Re-test dashboard tiles and Status Queue width, mobile index reset/collapse, Map Builder disabled state, manuscript, account/settings, and edit modals across mobile/tablet widths. | Design/QA |
| Write button hidden on compact layouts | Users may be unable to find or enter the manuscript workspace on mobile/tablet. | Mitigation added, needs QA | The existing Write button now has a compact top-bar placement instead of disappearing at narrow widths. Verify desktop and compact layouts both expose the same Write action. | Design/QA |
| AI context selector omitted History | Users could not include World History entries as selected context for AI chat, so history-aware prompts had to rely on manual custom instructions. Fixed: AI chat context selection now includes a History section, selected history entries are counted in chat metadata, and selected entries are added to the system prompt with era/date/content details. | Fixed, needs QA | In a project with World History entries, start a new AI chat, select History entries, confirm the selected count updates, save the chat, and verify history-aware answers can use the selected entries. | Engineering/QA |
| History era headers show text overlap while sticky | Visual readability issue in WorldHistory: entries could show through the sticky era band while scrolling because the header used a translucent background. | Fixed, needs QA | Sticky era headers now use an opaque navigation background with a raised stacking layer. Verify by scrolling a populated History page with multiple era groups. | Design/QA |
| Story outline edits can fail rapid refresh testing | Potential data loss if outline structure/synopsis edits refresh before background persistence runs. | QA passed | Act, chapter, scene add/update/delete/reorder operations write local storage synchronously before React state scheduling; refresh/import prefers fresher browser data over older account data. User QA confirmed rapid-refresh persistence. | Engineering/QA |
| Homepage/public pages inherit user's custom theme | A logged-in user with a non-default theme saw that theme applied on public/marketing pages (homepage, pricing, features, FAQ, founders, login), making the landing experience brand-inconsistent. | Fixed, needs QA | `AppInner` detects `isPublicPage` (any public/marketing route or unauthenticated state) and forces `DEFAULT_THEME` (ink-ember); user's theme is restored when they navigate back into the app. QA: set a non-default theme, navigate to `/pricing`, `/features/`, `/faq/`, founders pages, and the homepage — confirm all show ink-ember; navigate back to `/dashboard` and confirm the custom theme is restored. | Engineering/QA |
| Dashboard had no dedicated URL — shared `/` with the marketing homepage | Authenticated dashboard and the unauthenticated landing page had identical URLs, making it impossible to link directly to the dashboard and conflating two distinct destinations. | Fixed, needs QA | `buildRoute` now returns `/dashboard` for `viewMode === 'manager'`; the URL sync effect does a `history.replaceState` to `/dashboard` on first render when the user is logged in at bare `/`; back/forward navigation falls through to `viewMode('manager')` for `/dashboard`. Unauthenticated homepage stays on `/`. QA: log in → URL becomes `/dashboard`; navigate into a project and back → `/dashboard`; bookmark `/dashboard` and reload; unauthenticated users at `/` still see the landing page. | Engineering/QA |
| Refresh can lose the current app page or settings panel | Users may return to the wrong workspace after refresh, making settings and project pages feel unsaved. | QA automated | `tests/e2e/url-persistence.spec.js` covers writing mode, project overview, worldbuilding section, direct URL navigation, and content preservation across URL reload. All 5 tests pass in CI. Account settings tab URL round-trip still needs manual QA (requires real auth). | Engineering/QA |
| Account switch can overwrite loaded project library with previous account's browser copy | Cross-account project data can appear under the wrong user and overwrite the populated account's project list; launch blocker for auth/data safety. | Guard implemented + automated; real-auth switch needs manual QA | `tests/e2e/account-isolation.spec.js` covers: (1) foreign-owner data not loaded, (2) own projects persist on correct-owner reload, (3) localStorage tamper cleared safely by guard. All 3 pass. Real two-account switch (A→B) still needs manual QA with live Supabase accounts. | Engineering/QA |
| New accounts can inherit a previous browser-local theme | A freshly verified account may appear with another account's local theme instead of the default, creating cross-account preference leakage on shared browsers. | Fixed, needs QA | Signed-in accounts now apply their profile-saved theme when present, or the default app theme when no profile theme exists. QA: choose a non-default theme in account A, sign out, verify a new account B, and confirm B lands on the default theme until it saves its own appearance. | Engineering/QA |
| New accounts can inherit a previous browser-local AI key | Cross-account credential leakage: AI provider keys stored in browser-local settings could appear in a newly created account on the same browser. Fixed: AI settings now carry an owner marker, all AI features load keys through the same owner-aware helper, legacy ownerless keys only migrate when the browser project-data owner matches the signed-in user, and the AI panel no longer seeds an environment OpenRouter key into account settings. | Fixed, needs QA | Automated unit coverage verifies same-owner load, different-account isolation, ownerless legacy isolation, matching-owner legacy migration, and legacy-key cleanup on save. Manual QA: save an AI key in account A, sign out, create/sign into account B in the same browser, confirm AI Settings and all AI actions show no configured key; sign back into A and confirm A still sees its key. | Engineering/QA |
| Login error exposed internal Supabase message on bad credentials | Showing raw "Invalid login credentials" from Supabase is confusing and leaks implementation detail. | Fixed | LoginPage now intercepts credential-related Supabase errors and surfaces "Incorrect username or password." instead. Other auth errors still show their original message. | Engineering |
| No dedicated post-logout screen | After signing out, users landed directly on the marketing homepage with no confirmation or quick path back to login. | Fixed | New `SignedOutPage` renders after a confirmed sign-out transition (authenticated → unauthenticated). Shows "You've been signed out" with Log in again (returns to LoginPage) and Go to homepage (navigates to `/`) buttons. Include in auth regression pass. | Engineering/QA |
| Import and new project blocked for paid lifetime users | Paid `premium_plus_lifetime` / `premium_lifetime` users report "Could not import project. You may be on a free plan." and cannot create new projects despite correct `subscription_plan` in JWT and correct plan display in-app. Root cause was a local testing environment issue — not reproducible in production. | Closed — not reproducible | No further action needed. | Engineering |
| Password recovery link logs user in instead of showing reset screen | Clicking a reset link opened the logged-in dashboard instead of the new-password form. Root cause: Supabase fires `SIGNED_IN` immediately after `PASSWORD_RECOVERY` in `onAuthStateChange`; the previous `else` branch cleared `recoveryMode` to `false` before the UI could react. Fixed: `onAuthStateChange` now only clears `recoveryMode` on `SIGNED_OUT`; all other events update `user` without touching recovery state. Fixed 2026-06-26. | Fixed, needs QA | Click a real reset link from the new branded email, confirm the new-password screen appears rather than the app dashboard. Include in auth regression pass. | Engineering/QA |

## Change Control

When editing this roadmap:

- Keep Launch Required aligned to the final paid product promise.
- Move only explicitly excluded or future-business work to Future/Excluded.
- Move unvalidated ideas to Icebox.
- Add bugs only after reproduction or a concrete QA finding.
- Update linked generated artifacts only after this roadmap changes, not the other way around.
