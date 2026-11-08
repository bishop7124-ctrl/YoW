# 05 — Future Release Roadmap

Date: 2026-11-08. Planning only. Nothing here is approved scope; items marked **[Decision]** need the product owner (see doc 08). Per `docs/ROADMAP.md`, approved items should be copied into that file's tables; this document is the supporting analysis.

## 1. Scoring framework (transparent)

Each candidate is scored 1–5 on nine criteria; for Effort, Risk, Cost and Maintenance **5 = best (low effort / safe / cheap / easy)**. Weighted total max = 85.

| Criterion | Weight | Basis |
| --- | --- | --- |
| User value | 3 | Judgement from code gaps; no usage data exists |
| Strategic differentiation (interconnected worldbuilding) | 2 | Judgement |
| Native accessibility (works with no AI) | 2 | Verifiable |
| Retention potential | 2 | **Hypothesis only** — no analytics in repo support it |
| Architectural fit | 2 | Verified against code |
| Effort (5 = small) | 2 | Rough, relative |
| Production risk (5 = safe) | 2 | Verified surfaces touched |
| Operating cost (5 = none) | 1 | |
| Maintenance burden (5 = light) | 1 | |

Scores are an aid to discussion, not a verdict. They do not capture *protective* value (data safety) or hard dependencies, which the sequencing in §3 handles explicitly.

| # | Candidate | V | Dif | Nat | Ret | Fit | Eff | Risk | Cost | Mnt | **Total /85** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Global search / quick switcher | 5 | 2 | 5 | 4 | 5 | 4 | 5 | 5 | 4 | **74** |
| 2 | Entity "Connections" panel (Canon Explorer-lite) | 3 | 5 | 5 | 3 | 5 | 4 | 5 | 5 | 4 | **72** |
| 3 | Native Story Check MVP | 5 | 5 | 5 | 3 | 4 | 3 | 4 | 5 | 3 | **71** |
| 4 | Goals extension (weekly/monthly, deadline, ETA, sprint) | 3 | 1 | 5 | 4 | 5 | 4 | 5 | 5 | 4 | **66** |
| 4 | Structured scene links | 4 | 5 | 5 | 3 | 4 | 3 | 3 | 5 | 3 | **66** |
| 6 | Native-first UX / empty states / AI-optional messaging | 3 | 1 | 5 | 2 | 5 | 5 | 5 | 5 | 5 | **65** |
| 7 | Plot Planner as Outline extension | 4 | 4 | 5 | 3 | 4 | 2 | 3 | 5 | 2 | **61** |
| 7 | Cloud scene version history | 5 | 2 | 5 | 3 | 4 | 3 | 3 | 3 | 3 | **61** |
| 7 | References (research) without uploads | 3 | 3 | 5 | 2 | 4 | 4 | 4 | 5 | 3 | **61** |
| 7 | Explicit manuscript links + aliases + hover | 4 | 5 | 5 | 3 | 3 | 2 | 3 | 5 | 2 | **61** |
| 11 | Trope library (Lore-backed) | 2 | 2 | 5 | 2 | 5 | 4 | 5 | 5 | 3 | **60** |
| 12 | Chronicle presentation merge (Timeline+History) | 2 | 2 | 5 | 2 | 4 | 3 | 4 | 5 | 4 | **55** |
| 13 | Corkboard view | 2 | 1 | 5 | 2 | 4 | 3 | 4 | 5 | 3 | **52** |
| 14 | Character knowledge tracking | 3 | 5 | 4 | 2 | 2 | 1 | 3 | 5 | 2 | **50** |
| 15 | Feed native findings into AI prompts | 2 | 3 | 1 | 1 | 4 | 4 | 4 | 5 | 4 | **49** |
| 16 | EPUB export | 2 | 1 | 5 | 1 | 2 | 2 | 4 | 5 | 2 | **43** |

## 2. Release plan

The brief's A/B/C grouping is supported by the audit with two adjustments: (1) **data-safety and plumbing items move into A** (cloud history, daily-words consolidation, feature-flag service), and (2) scene links move to A because both B and C depend on them.

### Release A — Native Foundations (several small deployments, A1→A4)

**Objectives:** a no-AI user gets a real consistency checker, can find anything instantly, sees progress over time, and cannot lose scene history by switching device.

| Step | Contents | Effort | Depends on |
| --- | --- | --- | --- |
| A0 | Feature-flag service; one tested daily-words util; entity resolver (collision-aware) | S | — |
| A1 | **Story Check MVP** (rules R1–R8, doc 06) on existing data, inside Overview/Insights; mute/dismiss with fingerprints; no new tables beyond optional dismissals | M | A0 |
| A2 | **Cloud scene history** (`scene_versions`, retention) + named snapshots + export inclusion | M | A0; storage cost sign-off **[Decision]** |
| A3 | **Global search** + Connections panel on entities | M | A0 resolver |
| A4 | **Structured scene links** (suggest-and-confirm in Inspector) + Story Check rules R9–R12 that need them | M | A1 |
| A5 | **Goals extension** (weekly/monthly, deadline, projection, sprint timer), native-first empty states and "what works without AI" copy | S–M | A0 |

- **Migrations:** `scene_versions` (new, additive), `feature_flags` (new, additive), optional `finding_dismissals` (or dismissals inside existing `ai_findings` documents). No existing-table alteration.
- **Compatibility:** all new scene fields optional; ZIP export schema stays v1 with optional keys, importer ignores unknown keys (verify `projectImportValidation.js` accepts additive fields); older exports remain importable.
- **Risks:** false positives (A1), storage growth (A2), field plumbing omissions (A4).
- **Testing:** unit tests per rule with fixtures incl. malformed/free-text dates; round-trip export/import test for new fields; migration test applying SQL to a scratch Supabase project only (owner-run — not against production); e2e for search and Story Check; performance test on the largest sample project (target < 200 ms for rule run on 5k-record project; to be measured).
- **Rollout:** flags `story_check`, `global_search`, `cloud_scene_history`, `scene_links`. Owner + volunteers → 10% → 100%. Story Check initially labelled "Beta".
- **Rollback:** turn flag off; data written remains valid and invisible. Scene history: stop writing; local history unaffected. Dropping tables unnecessary.
- **Acceptance:** see §4.

### Release B — Story Planning (after A4)

**Objectives:** planning depth in the existing Outline, not a second outline.

| Step | Contents | Effort | Depends on |
| --- | --- | --- | --- |
| B1 | Structure templates (Three-Act, Save the Cat, Hero's Journey, Seven-Point, Story Circle, Freytag, Five-Act, custom) mapped onto existing acts/chapters/scenes; Structure view with slot coverage | M | A0 |
| B2 | Plot threads (`plot_threads`), thread membership + setup/development/payoff roles; Threads swimlane view | L | A4 |
| B3 | Scene/chapter `tension` and `purpose`; tension line; native "unresolved thread", "long gap", "payoff before setup" checks added to Story Check | M | B2 |
| B4 | Trope library (Lore-backed, original starter content, status) and trope↔thread/scene links | S–M | B2 optional |
| B5 | Optional AI: "analyse structure/trope usage" using BYOK, explicit action | S | B1–B3 |

- **Migrations:** `plot_threads` (new). Everything else additive fields.
- **Risks:** Outline UI density; thread data conflicts. Mitigate with per-record table.
- **Testing:** structure-mapping unit tests, thread delete cascade, import/export/merge remap, e2e drag between views, mobile layout check (responsive gate).
- **Rollout:** `plot_threads` flag; Structure and Threads can ship separately.
- **Rollback:** flag off; outline unaffected because base fields untouched.

### Release C — Connected Worldbuilding (after A4, B2)

| Step | Contents | Effort |
| --- | --- | --- |
| C1 | Explicit manuscript links (`entityRefs`), aliases for all entities, hover previews, collision warnings | M |
| C2 | References (research as Lore `kind`), URL/source fields, convert-to-Lore | S–M |
| C3 | Character knowledge (`character_knowledge`) + rules R13–R14 | L |
| C4 | Canon Explorer view (graph/matrix over existing links) if Connections panel usage supports it | M |
| C5 | Document attachments **[Decision]** | L, gated on cost approval |

Risks: editor performance (SceneEditor 2.5k lines — change minimally, add tests first); knowledge model usability (could become data-entry burden; ship as optional power feature).

## 3. Sequencing and "what first" (Q10)

1. **A0 + A1 (Story Check MVP)** — the brief's stated strategic priority, zero schema change, proves the native-first philosophy, immediately useful on existing projects with no migration. It uses only data that already exists (character years/status, timeline years, eras, family ids, relationship targets).
2. **A2 (cloud scene history)** in parallel by a second contributor: highest protective value, independent of A1, but needs the owner's storage-cost decision.
3. **A3 global search** — highest score, tiny risk, daily use.
4. **A4 scene links** — unlocks the second half of continuity and all of Release B/C.

If only one thing: A1.

## 4. Acceptance criteria (Release A)

- Story Check runs with AI disabled and no network; verified by running with network blocked.
- Every finding shows kind (Confirmed/Possible/Missing info/Info), rule id, the exact records involved and a link to each; none shows prose-derived claims.
- On the sample project (`theLastEmberDemoProject.json`) the confirmed-class false-positive rate is zero by fixture assertion; Possible-class is reviewed manually on three real beta projects with owner consent (no production DB access by agents).
- Dismissals persist across reload and re-run.
- Rule run time on the largest available fixture is measured and recorded.
- Scene history restores a version created on another browser/device.
- Global search opens any entity/scene within two keystrokes after the palette opens and respects the active project.
- Export → import round-trip preserves all new fields; older exports import unchanged.
- No new network calls from native modules (asserted by test as in `manuscriptDiscovery/index.js`).
- Responsive gate and accessibility specs pass (focus management for the palette via `useDialogFocus`).

## 5. What to measure (no analytics exist for this today)

`src/utils/analytics.js` exists (GA, stripped from desktop). Candidate events, all aggregate and privacy-light: Story Check opened/run, findings dismissed vs opened, rule hit counts (per rule id), search opened/selected, goal set, sprint completed, scene-history restore. Per the project's "security over analytics" rule, track counts only, never content, and respect cookie consent. Retention claims in this document are hypotheses until these exist.

## 6. Cost notes

- Native features: no recurring cost.
- Cloud scene history: Supabase storage/DB growth; owner to approve retention and estimate (see doc 03).
- AI features: cost sits with the user (BYOK) except the managed `ai-proxy` path — unchanged.
- Document attachments: only paid cost item; deferred.
