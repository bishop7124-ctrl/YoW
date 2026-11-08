# 08 — Executive Summary (for the product owner)

Date: 2026-11-08. Planning only; no application code, schema or configuration was changed. Details and file references are in documents 01–07 in this folder. Limits of the audit are in doc 01 §0 (not every file read; nothing run; Map/Comic/TTRPG modules and accessibility not independently verified).

## 1. Current state

YOW is a mature, heavily tested local-first React + Supabase app (≈82k lines, 156 unit/component test files, 44 migrations, desktop build) with six live project types. Entity data lives in simple document-style tables, so **additive features need little or no SQL migration**; the real cost of any new field is plumbing it through sync, export/import, merge and series-sharing.

## 2. Major strengths

Strong worldbuilding model (characters with arcs, relationship map, family tree, lore with links, timeline + eras + history, custom story calendar, atlas). Solid manuscript workspace with data-safety engineering. **A surprising amount of native intelligence already exists:** Insights (coverage, readability, heatmap, structure checks), daily goals and streaks, a deterministic manuscript-discovery importer, a reference panel, pacing/length chart.

## 3. Major weaknesses

1. **No native consistency checking at all** — both consistency tools are LLM-only.
2. **Scenes are not structurally linked to the world** (POV/location are text strings; no characters or events per scene), which caps what any checker or "canon" view can do.
3. **Scene version history is device-local** (not in the cloud, not on other devices).
4. No global search; no beats/threads/structure model; no tropes; no research.
5. Free users see an upgrade wall on all AI features, even with their own key.
6. Two daily-word calculators that can disagree; Timeline/History mirrored lists; Timeline vs Schedule as parallel chronologies.
7. No feature-flag system for staged rollout.

## 4. Underutilised existing features

Insights/analytics, daily goals, version history (undersold and silently local), Manuscript Discovery import (deterministic, no AI), reference panel, character journey arcs (could feed outline), idea→entity conversion, relationship/family back-links (`worldLinks.js` has no UI).

## 5. AI-dependent features that should gain native alternatives

Only **Plot Hole Detector** and **Lore Conflict Checker** — and as one shared native "Story Check" (rules in doc 06). Style Analysis, Character Simulation, chat, rewrite and AI import should stay AI (AI import already has a native counterpart).

## 6. Most valuable missing features

Native Story Check · structured scene links · global search · cloud scene history · plot threads/structure views (as an Outline extension) · explicit manuscript links with aliases.

## 7. What should not be built

Beta-reader management · writing challenges/social gamification · a hundreds-strong scraped trope catalogue · a second outline system · keyword/NLP "native prose contradiction" detection · automatic AI runs · unrestricted file uploads · EPUB/publishing workflows (until core gaps close) · a standalone Trope, Research or Canon Explorer top-level module.

## 8. Top ten priorities (justification in doc 05)

1. Native **Story Check MVP** on existing data (Release A1)
2. **Cloud scene version history** + named snapshots (A2) — protective
3. **Global search** / quick switcher (A3)
4. **Structured scene links**, suggest-and-confirm (A4)
5. **Goals extension**: weekly/monthly, deadline, projection, sprint timer; unify daily-words code (A5)
6. **Connections panel** on entities (Canon Explorer-lite)
7. **Native-first UX pass**: AI-optional messaging, lock-icon AI Tools, single Import flow
8. **Plot Planner as Outline views**: Structure, Threads, Tension (B1–B3)
9. **Explicit manuscript links + aliases + hover** (C1)
10. **Tropes (Lore-backed) and References (no uploads)** (B4, C2)

*Answer to "what first":* Story Check MVP, with cloud scene history in parallel if the storage-cost decision is made.

## 9. Proposed release structure

- **A — Native Foundations** (A0 flag service/util consolidation → A1 Story Check → A2 cloud history → A3 search/connections → A4 scene links → A5 goals/UX). Each step ships separately behind a flag.
- **B — Story Planning** (structures → threads → tension → tropes → optional AI analysis).
- **C — Connected Worldbuilding** (manuscript links, references, knowledge tracking, Canon Explorer view, attachments only if approved).
All additive, flag-gated, rollback = flag off; no destructive migrations.

## 10. Decisions requiring your approval

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Should the native Story Check (and search/goals) be available on the **Free** tier? (Costs nothing to run.) | Yes |
| D2 | Should Free + BYOK be allowed to use AI features? Today the AI wall applies regardless of key. This is a pricing/entitlement change. | Leave as is unless you want it; flagged only |
| D3 | Cloud scene history: retention (e.g. last 20 versions + daily for 30 days) and storage-cost ceiling; plan restrictions? | Approve retention; no plan restriction at first |
| D4 | Adopt a minimal feature-flag service (table + hook, fail-closed)? | Yes |
| D5 | Plot Planner as an Outline extension rather than a new module? | Yes |
| D6 | Trope library: authored originals (60–100) vs none; confirm no third-party trope content is used | Original starter set, or defer |
| D7 | Research: URL/notes/images only in v1; document uploads deferred and paid-only if ever built (storage cost and security work) | Agree |
| D8 | Gross-word writing ledger (new table) for accurate daily stats vs net-words derived stats | Net words, clearly labelled |
| D9 | Month/day precision for character dates (currently year only) | Defer unless users ask |
| D10 | Analytics events listed in doc 05 §5 (aggregate counts only) to validate retention hypotheses | Approve, subject to cookie-consent rules |
| D11 | Ask the owner to confirm what database backups exist (point-in-time, retention) so user-facing history can be positioned correctly | Owner question |

## 10a. Owner decisions (recorded 2026-11-08)

The owner accepted all recommendations in the table above and the follow-up recommendations on the "unexpected findings".

| # | Decision | Status |
| --- | --- | --- |
| D1 | Native Story Check, search and goals available on Free | **Accepted** |
| D2 | Free + BYOK AI gate left unchanged | **Accepted** (no entitlement change; revisit only if the owner raises it) |
| D3 | Cloud scene history: last 20 versions + daily for 30 days; no plan restriction at first; review real storage growth after ~1 month | **Accepted** |
| D4 | Minimal fail-closed feature-flag service | **Accepted** |
| D5 | Plot Planner as Outline views, not a new module | **Accepted** |
| D6 | Trope library: original starter set or defer; no third-party trope content | **Accepted** |
| D7 | Research: URL/notes/images only in v1; uploads deferred and paid-only if ever built | **Accepted** |
| D8 | Net-word daily stats, clearly labelled; no gross-word ledger yet | **Accepted** |
| D9 | Month/day character-date precision deferred until users ask | **Accepted** |
| D10 | Aggregate-count analytics events (doc 05 §5), subject to cookie consent | **Accepted** |
| D11 | Owner to confirm database backup / point-in-time recovery status | **Answered:** daily backups, no point-in-time recovery. Worst case a restore loses up to ~24 h, so cloud scene history (A2) is the only fine-grained recovery path. Do not promise point-in-time restore to users. |

Also accepted: label scene history "Saved on this device only" now; consolidate the two daily-word calculators in A0; present Timeline/History as one "Chronicle" without a data change; explain Schedule vs Timeline in empty states; Story Check is not blocked on scene links.

**Still planning only.** Acceptance of these decisions does not authorise implementation. Each build item needs to be copied into `docs/ROADMAP.md` tables and started as its own task. Build order: A0 (flags + word-count util) → A1 Story Check, with A2 cloud history in parallel → A3 search/Connections → A4 scene links → A5 goals/UX.

## Honest caveats

Retention benefits stated in these documents are hypotheses; no usage data exists in the repo. Percent-complete figures in doc 03 are judgement. The roadmap's effort sizes (S/M/L) are relative. Before building any item, re-verify the specific code paths named in the relevant document — some were intentionally marked "verify".
