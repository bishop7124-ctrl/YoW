# 01 — Existing Feature Audit

Audit date: 2026-11-08. Branch: `main`. Method: static code reading plus targeted searches. No code was changed, no tests were run, no database was contacted.

> Directory choice: no prior `docs/planning/` structure existed (`docs/` is flat with `ROADMAP.md` as the single planning source). `docs/planning/future-release/` was created as requested. `docs/ROADMAP.md` carries a pointer to it so the single-planning-doc rule still holds.

## 0. Coverage and limitations (read first)

This is a large codebase (~82k lines of non-test source in `src/`, 156 unit/component test files, `tests/api`, `tests/e2e`, 44 Supabase migrations). I traced the execution paths that matter for this audit (store shape, outline, manuscript, inspector, dashboard/Insights, AI tools, import/export, version history, membership gating). I did **not** read every file.

| Area | Depth | Note |
| --- | --- | --- |
| Store (`src/store/useStore.js`, 4,647 lines) | Partial — add/update paths for acts/chapters/scenes/events, sync-root logic | Field whitelists for scene updates not fully traced |
| Manuscript editor (`SceneEditor.jsx` 2,546 lines, `Manuscript.jsx` 1,781) | Partial — entity map, inspector, version save call sites | Editor internals (selection, tracked changes) not audited |
| Dashboard / Insights (`ProjectDashboard.jsx`, 1,270 lines) | Good — analytics builders read | |
| AI (`aiToolPrompts.js`, `aitools/*`, `ai-proxy.js`, membership gate) | Good for tools; chat/agents skimmed | |
| Map Builder / Atlas, Comic planner, TTRPG Character Builder, Faction logos | Names and file layout only | Classified G (unverified) where relevant |
| Accessibility, responsive design | Not independently tested; relies on ROADMAP QA claims | Treated as G |
| Billing/Stripe | Only the entitlement surface relevant to gating | Out of scope |
| Test results | Not executed | Test inventory counted, not run |

Where this document says "verified", I read the code path. Where it says "per ROADMAP" the claim comes from documentation and is not proof.

## 1. Architecture summary (verified)

- **Client:** React SPA (Vite), single large custom store (`src/store/useStore.js`) with refs + `commitLocal` writes to local project storage (`src/storage/*`: IndexedDB in browser, vault backend on the Tauri desktop app) and debounced cloud sync (`src/utils/firestoreSync.js`, despite the name it talks to Supabase).
- **Cloud:** Supabase Postgres + Auth + Storage. Entity tables are **document-style**: `(id, user_id, novel_id, data JSONB)` — e.g. `scenes` (`supabase/migrations/20260627_add_user_id_indexes.sql:35`). Tables: `novels, acts, chapters, scenes, characters, factions, locations, timeline_events, world_history, lore_entries, idea_entries, maps_data, whiteboards_data, story_schedule, rpg_characters, comic_pages, comic_panels, eras, series_items, ai_findings, character_interviews, synced_ai_settings, user_settings, user_profiles`, plus billing/lifecycle/site-editor tables.
- **Consequence for planning:** new *optional fields* on existing entities need **no SQL migration**. New *concepts* (e.g. plot threads) can follow the same document-table pattern. The real cost of any new field is app-side: whitelists (`outlinePatch` in `src/utils/outlineDisplay.js`), export/import (`projectExport*.js`, `projectImportValidation.js`, `YOW_EXPORT_SCHEMA_VERSION = 1`), merge-project, series sync (`syncRootId`/`syncSourceId`), cloud reconcile (`cloudSyncReconcile.js`) and ID-remap on import.
- **API:** Vercel functions in `api/` — Stripe checkout/portal/webhook, `ai-proxy.js` (managed provider proxy with per-user rate limits), account lifecycle, feedback, email.
- **Desktop:** Tauri (`src-tauri/`), local vault, entitlement checks in `desktopEntitlement.js`.
- **Navigation (`src/components/Layout.jsx:112-145`):** Overview · Planning (Outline, Idea Board, Schedule) · Characters (Characters, Relationship Map, Family Tree, Factions) · Atlas (Locations, Map) · Lore (Lore, Timeline, History) · Party (TTRPG only) · AI Tools. Manuscript is a separate top-level workspace. Section visibility is per project type (`defaultSections` in `src/constants/projectTypes.js`).
- **Project types:** `PROJECT_TYPES` defines novel, novella, short story, D&D campaign, TTRPG campaign, comic plus further types (TV series, video game, etc.); six are marked `live` in `PROJECT_TYPE_STAGE`.
- **Feature flags:** none found. No runtime flag system exists (see doc 04 for how to add one). `app_config` (key/value, used for founder slots) and `site_editors` (owner allow-list for `/site-editor`) are the closest existing patterns.

## 2. Classification key

A native · B native + optional AI · C AI-dependent · D partial · E exists but poorly exposed · F missing · G unverified. Confidence H/M/L.

## 3. Inventory

### 3.1 Worldbuilding

| Feature | Module | Class | Native | AI | Status & source | DB | UX concerns | Action | Conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Characters + profiles | `characters/Characters.jsx` | B | Full CRUD, portrait, role, species, pronouns, traits, `status` alive/dead, `birthDate`/`deathDate` (free-text years), `keywords`, relationships, family ids | AI character simulation lives elsewhere | Implemented (`Characters.jsx:499,613-726`; `utils/characterAge.js`) | `characters` | Dates are free text parsed to one integer year (`utils/timelineYear.js`); no month/day | Keep; extend with aliases | H |
| Character journey / arcs | `characters/CharacterJourney*.jsx`, `utils/characterJourney.js` | A | Arc type, core wound/lie/truth/want/need, beats linked to `timelineEventId`, `chapterId`, `sceneId`, `linkedCharacterId` | — | Implemented; link cleanup on delete (`useStore.js:3107`) | in `characters.data.journey` | Likely hidden inside character editor | Keep; **foundation for Plot Planner arc threads** | H |
| Relationships / Relationship Map | `relationships/RelationshipMap.jsx`, `utils/relationshipMap*.js` | A | Typed edges (`constants/relationshipTypes.js`), force layout | — | Implemented, tested | in `characters.data.relationships` (`targetId`) | — | Keep | H |
| Family Tree | `familytree/FamilyTree.jsx`, `utils/familyRelationships.js`, `familyTreeLayout.js` | A | `parentIds/childIds/spouseIds`, layout | — | Implemented, tested | `characters.data` | Parent/child chronology not validated | Keep; **add native checks** | H |
| Factions | `Factions/*` | A | CRUD + logo builder | — | Implemented | `factions` | — | Keep | M |
| Locations | `Locations/Locations.jsx` | A | CRUD, map markers link by `locationId` | — | Implemented | `locations` | No location *history* (ownership/ruler by era) | Keep | M |
| Lore | `lore/Lore.jsx`, `utils/loreEntries.js` | A | Category, tags, `characterIds/locationIds/loreIds` links, incoming/outgoing "related" index | — | Implemented | `lore_entries` | Single content text; no status/canon-level | Keep; candidate host for Tropes/Research | H |
| Timeline | `timeline/Timeline.jsx`, `utils/timelineYear.js`, `timelineEntries.js` | A | Events with `startYear/endYear/date/eraId`, `linkedCharacters`, `linkedLocations`, era filter | — | Implemented | `timeline_events` | Event ↔ scene link absent (scenes don't reference events) | Keep; extend | H |
| World History / Eras | `worldhistory/*`, `utils/chronicleLinks.js` | A | History entries mirrored 1:1 with timeline events (`worldHistoryEntryId`/`timelineEventId`), eras with year ranges, `findEraForYear` | — | Implemented | `world_history`, `eras` | **Timeline vs History duplication** is a conceptual overlap users must learn | Keep; clarify in UX (doc 07) | H |
| Calendars + Schedule | `schedule/*`, `utils/scheduleCalendar.js` | A | Per-project custom calendar (months, week length), events with year/month/day/duration | — | Implemented | `story_schedule` | Schedule dates are **not connected** to Timeline years or scenes — two parallel chronologies | Keep; bridge later | H |
| Map Builder / Atlas | `Map/*` | G | Atlas canvas, symbols, markers | — | Present, extensive, not audited | `maps_data` | — | Keep | L |
| Connections between entities | `utils/worldLinks.js` | D | Back-reference helpers (lore→entity, timeline→entity, character→character) | — | Pure helpers exist; no unified UI found | n/a | **Backlinks not presented as a "Connections" panel** (E) | Expose | M |
| Series-shared canon | `series/SeriesDashboard.jsx`, `syncRootId/syncSourceId/syncHiddenInIds` in `useStore.js:2246-2300` | D/G | Shared records fork per project; series dashboard with word goal | — | Fork/hide semantics exist | `series_items` | Not explored end-to-end | Verify before building cross-project canon | L |
| TTRPG tools | `characterbuilder/*` | G | Character builder, dice, spells | — | Present, not audited | `rpg_characters` | Out of scope | — | L |

### 3.2 Writing

| Feature | Module | Class | Native | AI | Status & source | UX / notes | Action | Conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Manuscript editor | `Manuscript/*` | B | Write/Edit/Finalised modes, book view, focus, notes gutter, format, tracked changes, autosave with cloud confirmation | Rewrite suggestions (`AISuggestionPanel.jsx`) | Implemented, heavily QA'd per ROADMAP | Very large files = maintenance risk | Keep | H |
| Acts/Chapters/Scenes + Outline | `outline/StoryOutline.jsx`, `OutlineItemEditor.jsx`, store `addAct/addChapter/addScene` | A | Hierarchical drag/reorder, `title`, `synopsis`, `storyEvent` (one tag) | — | Implemented (`OutlineItemEditor.jsx:38`) | Labels vary by project type | Keep; extend | H |
| "Beats" | **No generic beats entity** | D | `storyEvent` indicators per type (e.g. "Inciting incident", "Boss encounter", `projectTypes.js:225-262`); character-journey beats | — | One tag per act/chapter/scene; no purpose, tension, setup/payoff, dependency fields | The prompt's "Beats" ≈ `storyEvent` + journey beats | Extend (see doc 03) | H |
| Scene metadata | `ManuscriptInspector.jsx:103-185` | D | `status`, `pov` (free text), `locationTag` (free text), `summary`; "In this scene" chips | — | POV/location are **strings**, not entity ids; "In this scene" is computed by name matching (`Manuscript.jsx:482-505`) | Structured links missing | Extend | H |
| Entity detection in text | `Manuscript.jsx` `entityMap` | D | Case-insensitive exact name/keyword map across characters, locations, lore, history/timeline; used for chips & reference panel | — | Works only for exact names/keywords; no aliases on non-characters; later entries overwrite earlier on key collision | See doc 04 | Extend | H |
| Reference panel | `ManuscriptReferencePanel.jsx` | A | Browse/search all entity types while writing | — | Implemented; e2e spec exists | Good | Keep, expose more | M |
| Ideas board | `ideas/*`, `utils/ideaEntries.js` | A | Kanban (raw/developing/inStory/archived), tags, favourites, `linkedEntities`, convert-to-entity (`ConvertModal`) | AI expand flag | Implemented | Strong base for Research/Trope capture | Keep | H |
| Word counts / goals / streak | Inspector Progress tab, `utils/writingStreak.js`, `manuscriptUtils.js:402-455` | A | Daily goal + goal history + streak; per-scene cumulative `wordHistory` → net words per day | — | **Implemented** (`ManuscriptInspector.jsx:268-320`) | Daily only; see doc 03 §Goals | Extend | H |
| Pacing chart | `Manuscript/PacingChart.jsx` | A | Words per scene/chapter bars, click to open | — | Implemented (opened via menu `'pacing'`, `Manuscript.jsx:1200`) | Word count ≠ pacing/tension; label honestly | Keep | M |
| Version history | `SceneVersionHistory.jsx`, `utils/sceneVersions.js` | D/E | Up to 50 snapshots/scene, throttled auto-snapshot, restore | — | Implemented but **stored only in local project storage** (`nf_scene_versions:<id>`); no cloud table; not on other devices | Data-safety gap, see doc 03 §Scene history | Improve | H |
| Import | `Manuscript/DocxImportModal.jsx`, `ManuscriptDiscoveryModal.jsx`, `utils/docxImport.js`, `plainTextImport.js`, `importStructure.js`, `utils/manuscriptDiscovery/*` | A | DOCX/TXT/Markdown → acts/chapters/scenes; **deterministic** candidate extraction of characters/places with evidence and review step ("imports no AI or network client") | `AIImportModal.jsx` is a separate AI import | Implemented with archive-limit hardening tests | Two import entry points | Keep | H |
| Export | `utils/projectExport*.js` | A | Per-project ZIP backup, DOCX, PDF (themes), comic script, export-all; schema v1 | — | Implemented, extensive tests | PDF is Latin-only per audit notes | Keep | H |
| Manuscript search/replace | `ManuscriptSearch.jsx` | A | Manuscript find/replace with version snapshot before replace | — | Implemented | **No global cross-entity search found** in Layout/App | Add (doc 03) | M |

### 3.3 Intelligence and analysis

| Feature | Module | Class | Native | AI | Status | Notes | Action | Conf |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Plot Hole Detector | `aitools/PlotHoleDetector.jsx`, `aiToolPrompts.js:384-466` | C | None | Whole-project prompt; model told to use cautious language; returns JSON findings w/ severity, location, suggestion | Implemented; findings persisted to `ai_findings` (`aiFindings.js`) | Includes "timeline issues" which are partly deterministic | Add native sibling | H |
| Lore Conflict Checker | `aitools/LoreConflictChecker.jsx` | C | None | Same pattern | Implemented | Mostly prose-contradiction; some structured conflicts | Add native sibling | H |
| Style Consistency | `aitools/StyleConsistency.jsx` | C | None | Voice drift across scenes | Implemented | Inherently AI | Keep | H |
| Character Simulation | `aitools/CharacterInterview.jsx` | C | None | Roleplay chat; `character_interviews` table | Implemented | Inherently AI | Keep | H |
| AI chat / agents / scene rewrite / AI import | `ai/AIPanel.jsx`, `AIAssistant.jsx`, `utils/aiAgents.js`, `AISuggestionPanel.jsx`, `AIImportModal.jsx` | C | None | BYOK (Google, Anthropic, OpenRouter, OpenAI-compatible) via direct call or `api/ai-proxy.js` | Implemented | Context modes in `aiContext.js` | Keep unchanged | H |
| Project Insights | `dashboard/ProjectDashboard.jsx` | A | Structure insights, scene insights, coverage (regex mentions), momentum, 35-day heatmap, Flesch readability, character focus (name regex) | — | **Implemented**: `buildStructureInsights` :236, `buildSceneInsights` :279, `buildCoverageInsights` :313, `buildWritingAnalytics` :122, `buildReadability` :183 | A strong native analysis base already exists | Extend | H |
| Character age | `utils/characterAge.js` | A | Age from birth year and death/current year | — | Used in UI only; **not used for validation** | Reusable in continuity | Reuse | H |

### 3.4 Platform

| Feature | Module | Class | Notes | Conf |
| --- | --- | --- | --- | --- |
| Project dashboard / Overview | `dashboard/ProjectDashboard.jsx` | A | Stats, analytics, insights | H |
| Series management | `series/SeriesDashboard.jsx` | A/G | Series word goal; project goals | M |
| Onboarding | `onboarding/WelcomeWizard`, `GettingStartedChecklist`, `OnboardingTour`, `tourDefinitions.js` | A | Present; effectiveness unmeasured | M |
| Sample project | `data/theLastEmberDemoProject.json` (+map) | A | Present; also used for marketing kit | H |
| Search | Per-module only (Lore, Timeline, Characters, Ideas, History, Locations, Series, Manuscript) | D | No cross-entity search | M |
| Storage | `user-media` bucket, image-only upload (`uploadUserMedia.js`: webp/png/jpeg), quota in `membership.js` (Free 250 MB; paid 8 GB; beta 15 GB) | A | No document/PDF upload infrastructure exists | H |
| Subscription/entitlements | `utils/membership.js`, `desktopEntitlement.js` | A | **AI Tools/AI panel/AI suggestions show an upgrade wall when `membership.isFree`** (`AITools.jsx:80`, `AIPanel.jsx:1380`, `AIAssistant.jsx:397`, `AISuggestionPanel.jsx:207`) | H |
| Accessibility / responsive | e2e `accessibility.spec.js`; ROADMAP QA | G | Not independently verified here | L |
| Tests | 156 unit/component, `tests/api` (32), `tests/e2e` (many specs) | — | Strong coverage culture; not run in this audit | M |

## 4. Headline findings

1. **No native continuity/validation exists.** Every consistency tool is AI-only (`aitools/*`). All the data needed for a first deterministic tier exists but is not used for validation (`characterAge.js`, `timelineYear.js`, `findEraForYear`, family ids, `linkedCharacters`).
2. **Goals/progress are further along than the brief assumes.** Daily goal, goal history, streak, 35-day heatmap, momentum, readability, project/series word goals all exist.
3. **Version history exists but is device-local.** Highest data-safety gap among the "existing" features.
4. **Free users get no AI at all**, even with their own key (upgrade wall), so "users who never configure a key" and "Free tier" are different populations. Business decision, see doc 08.
5. **There is no beats model, no plot threads, no tropes, no research/attachments, no cross-entity search.**
6. **Scenes are only weakly linked to the world:** POV and location are free-text strings; there is no scene→characters/timeline-event/in-story-date link. This is the single biggest limiter for continuity, knowledge tracking and Canon Explorer.
7. **Two parallel chronologies** (Timeline/History years vs Schedule calendar dates) and **duplicated Timeline/History entries** are conceptual overlaps.
