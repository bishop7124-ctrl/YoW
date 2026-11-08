# 04 — Product Architecture Recommendations

Date: 2026-11-08. Principle: **extend, don't parallel.** Reuse acts/chapters/scenes, `worldLinks`, `ai_findings`, the reference panel, the Ideas `ConvertModal` pattern and the document-table storage model.

## 1. Constraints discovered in the code

1. **Document-style tables** (`data JSONB`) → additive fields need no migration; new concepts = new document tables with the standard RLS (copy the pattern from `20260627_add_user_id_indexes.sql` / `20260629_rls_initplan_fix.sql`).
2. **Field plumbing cost.** A new field must be threaded through: store whitelists (`outlinePatch`, scene update path), cloud sync + reconcile, `projectExport*` (schema v1), `projectImportValidation`, ID remapping on import/merge (see journey remap `useStore.js:4214-4222`), series fork semantics (`syncRootId`), delete-cascade cleanup (`clearJourneyLinks` precedent), and tests. Budget this explicitly per feature; it dominates effort more than UI.
3. **Monolith files**: `useStore.js` 4.6k, `SceneEditor.jsx` 2.5k, `Manuscript.jsx` 1.8k, `Layout.jsx` 1.3k, `App.jsx` 1.8k. New logic must go into **pure util modules with tests** (the existing convention, e.g. `characterAge.js`) and thin components; do not grow the monoliths.
4. **No feature-flag system.** Required for staged rollout (see §6).
5. **Multi-tab data-loss history** (`project_scene_content_store_split`, 2026-08-02, 08-25 incidents in memory): new writes must follow existing commit/dirty-record patterns, never invent a parallel persistence path.
6. **Local-first + cloud-confirmed saves** with `syncStatus`: any new store slice needs offline behaviour and conflict handling (`RecordConflictReview`).

## 2. Shared data model proposals

### 2.1 Scene links (foundation — build first)
Optional additive fields on the scene document:

```
scene.characterIds: string[]        // who appears (explicit, user-confirmed)
scene.povCharacterId: string|null   // keeps legacy scene.pov string untouched
scene.locationIds: string[]         // keeps legacy scene.locationTag untouched
scene.timelineEventIds: string[]    // events depicted
scene.storyYear: number|null        // in-story year when scene happens (optional)
scene.entityRefs: {type,id}[]       // explicit manuscript references
scene.threadIds / threadRole / tension / purpose   // plot planner (Release B)
```
Rules: never rewrite legacy `pov`/`locationTag`; a **suggest-and-confirm** helper pre-fills ids by matching strings to entities (same matching as `entityMap`) and the user confirms in the Inspector ("In this scene" chips become editable). On entity delete, clear ids (precedent: `clearJourneyLinks`). Import/merge must remap ids. **Why this is the keystone:** continuity, knowledge, Canon Explorer, appearance stats and Plot Planner all need it; today they'd have to guess from prose.

### 2.2 Findings (native + AI)
Reuse `ai_findings` / `rowToFinding` documents with additive `source: 'native'|'ai'`, `kind`, `ruleId`, `fingerprint`, `refs[]`. Native results should be computed on demand (cheap) and only **dismissals** persisted (keyed by fingerprint) to avoid storing derived data that goes stale. Confirm the `ai_findings` column layout before implementing (not read in this audit).

### 2.3 Plot threads
`plot_threads` document table `(id, user_id, novel_id, data{name, kind, color, status, description, characterIds})` — or an array on the novel document if the owner prefers zero new tables (simpler sync, but conflict-prone for large casts; table recommended). Scenes/chapters reference by `threadIds`. Structure template: static JSON in the app (`structures/threeAct.json` etc.) + `novel.structureTemplateId`; slots map to existing act/chapter/scene ids by user placement, stored as `novel.structureMap`.

### 2.4 Knowledge
`character_knowledge` document table, see doc 03. Release C.

### 2.5 Reference (research)
Either lore entries with `kind: 'reference'` (zero new table, reuses editor, search, export, links) or a `references` table. **Recommend `lore_entries` with a `kind` discriminator** to avoid a third parallel list; filter the Lore view by kind. Risk: conflating in-world and real-world content; mitigate with distinct badge and a separate nav label ("References").

### 2.6 Writing ledger (only if approved)
`writing_days (user_id, novel_id, day, words_added, words_removed)` — append-only per-day counters updated on save. Not needed for v1 goals (see doc 03).

### 2.7 Scene versions
`scene_versions` document table with retention policy, written on the existing scene cloud-save path. Keep local store as cache. Include in ZIP export optionally.

## 3. Reusable services (new pure modules)

| Module | Purpose | Reuses |
| --- | --- | --- |
| `src/utils/continuity/` (`rules/*.js`, `runChecks.js`, `fingerprint.js`) | Deterministic checks → findings | `timelineYear`, `characterAge`, `familyRelationships`, `findEraForYear` |
| `src/utils/search/index.js` | Global in-memory search | `loreEntries`, `ideaEntries` normalisers |
| `src/utils/writingProgress.js` | One daily/weekly/monthly words implementation | replaces duplicate logic in `manuscriptUtils` + `ProjectDashboard` |
| `src/utils/entityResolver.js` | Name/alias → entity, collision reporting, shared by chips, search, suggest-links, discovery | `Manuscript.jsx` `entityMap` |
| `src/utils/structures/*` | Story structure templates | `projectTypes` indicators |
| `src/utils/featureFlags.js` | Flag reads (see §6) | `app_config` pattern |

## 4. Module boundaries and navigation

Keep the current seven nav groups. Additions are **views/tabs, not sections**:
- Planning → Outline gets view switch **Outline | Structure | Threads** (+ Tension).
- Overview/Insights hosts **Story Check** (native + AI), Goals; Inspector keeps the daily Progress tab.
- Lore gains **Tropes** and **References** as filtered categories/kinds.
- Entities gain a **Connections** panel (backlinks via `worldLinks.js` + scene appearances).
- A global **Cmd/Ctrl-K** search.
The AI Tools group stays; "Plot Holes" and "Lore Conflicts" cards get a banner "Run the free Story Check first".

## 5. Technical debt that blocks or taxes this work

| Debt | Effect | Suggested handling |
| --- | --- | --- |
| Duplicate daily-word logic (two implementations) | Goals can disagree | Consolidate first (small) |
| `entityMap` collision overwrite | Silent wrong links | Resolver with collision list |
| Scene history local-only | Data safety / retention | Cloud history (Release A) |
| Timeline/History mirroring | Double entry, sync complexity | Presentation-level merge only; **do not** change the data model |
| Monolith files | Merge conflicts, regressions | New code in utils; add tests before touching |
| `wordHistory` ignored in reconcile | Multi-device stat loss | Investigate before weekly/monthly goals |
| Free-text dates | Limits continuity precision | Keep year-level rules; add optional month/day only if requested |
| No feature flags | No staged rollout | Add minimal flag service |

## 6. Feature flags and staged rollout (design)

Minimal, consistent with existing patterns:
- Table `feature_flags (key text pk, enabled boolean, allow_user_ids text[] , rollout_percent int)` readable by authenticated users, writable only via service role/SQL (RLS, like `site_editors`).
- `useFeatureFlag(key)` hook with 5-minute cache and **fail-closed** default (flag off on error, never block app load — respect the "no silent empty state" rule by not hiding existing data behind a flag).
- Flags: `story_check`, `plot_threads`, `scene_links`, `global_search`, `cloud_scene_history`, `tropes`, `references`.
- Allow-list first (owner + volunteers), then percentage, then general availability. Flags only gate *UI entry points*; stored data written while a flag was on stays valid when it is turned off (rollback-safe).

## 7. Security and entitlements

- All new tables: RLS `user_id = auth.uid()`; no cross-user reads; add to account-deletion lifecycle (`api/_accountLifecycle.js`) and export/import.
- Any text rendered from user content (references, URLs) must use `utils/externalLinks.js` safe-link handling; never fetch URLs server-side in v1 (no SSRF surface, no link previews).
- Native checkers are client-side, no network, no entitlement cost → recommend available to **all tiers** (business decision).
- File uploads (documents) deferred; if ever added: MIME + magic bytes, size cap, quota check before upload, storage in `user-media` with per-user prefix, include in deletion journal.

## 8. Simplification opportunities
Present Timeline + History as one Chronicle; one Import flow; one daily-words util; single "Connections" pattern instead of many ad-hoc "linked X" lists; hide `AI Tools` nav item behind setup state with a clear "what works without AI" empty state.

## 9. Architectural risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Field plumbing forgotten in export/import/merge → data loss on restore | Medium | High | Per-feature checklist + round-trip test (pattern: `projectBackupRoundTrip.test.js`) |
| Native checker false positives erode trust | High | Medium | Confidence classes, mute per rule, conservative MVP |
| Scene-link suggestions mis-assign | Medium | Medium | Suggest-and-confirm only; never auto-write |
| Cloud scene history storage growth | Medium | Medium | Retention + compression + cap; cost estimate before release |
| Plot thread conflicts across tabs/devices | Low-Med | Medium | Table per thread (record-level merge) rather than array on novel |
| Store monolith regression | Medium | High | New logic in utils; add selectors, not new store branches |
