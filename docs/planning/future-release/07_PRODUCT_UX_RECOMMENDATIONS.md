# 07 — Product UX & Cohesion Recommendations

Date: 2026-11-08. Based on code reading of navigation, inspector, dashboard and gating. I did not run the app visually in this audit; usability judgements below are from structure and copy, flagged where unverified. Accessibility/responsive results are taken from the ROADMAP QA record, not re-tested.

## 1. Does YOW feel like one product?

**Strengths (verified in code):** consistent section registry (`Layout.jsx:112-145`) with per-project-type section sets and renamed labels (`projectTypes.js` `planningTab/writingTab/workspaceLabel`); a shared reference panel inside the manuscript; cross-links in Lore, Ideas, Timeline, Journey beats; typed relationship vocabulary; strong data-safety UX (conflict review, sync status line).

**Cohesion gaps:**

| # | Gap | Evidence | Recommendation |
| --- | --- | --- | --- |
| 1 | Scenes are islands: POV/location are strings, no characters/event links | `ManuscriptInspector.jsx:121-161` | Structured, suggest-and-confirm scene links (doc 04 §2.1); "In this scene" chips become editable |
| 2 | Timeline and History are two lists mirrored 1:1 | `chronicleLinks.js`, `addEvent` creates both (`useStore.js:3289-3330`) | Present as one "Chronicle" with Timeline/History lenses; no data change |
| 3 | Schedule dates vs Timeline years are separate chronologies | `scheduleCalendar.js` vs `timelineYear.js` | Optional bridge field; explain the difference in empty states |
| 4 | Backlinks exist as helpers but no surfaced "Connections" | `worldLinks.js` | Connections panel on every entity (characters, locations, lore, events, factions) listing scenes, events, lore, relationships |
| 5 | No global search | per-module search only | Cmd/Ctrl-K palette |
| 6 | Analytics hide in the Overview dashboard (1,270-line file); the Progress tab in the Inspector shows only the daily goal | `ProjectDashboard.jsx`, `ManuscriptInspector.jsx` | Name the Overview analytics "Insights", add a persistent compact progress chip in the manuscript top bar linking to it (check existing Insights CTA at `ProjectDashboard.jsx:811`: only a one-time localStorage-driven CTA) |
| 7 | Three import entry points (DOCX modal, Discovery modal, AI import) | `Manuscript/*Import*`, `AIImportModal` | One "Import" flow: choose file → structure preview → candidate records → optional "Improve with AI" |
| 8 | Pacing chart is word-count only but named "pacing" | `PacingChart.jsx` | Rename to "Length by scene/chapter" until tension data exists; reuse the surface for the Tension view later |
| 9 | Two daily-word calculators | `manuscriptUtils.js:402`, `ProjectDashboard.jsx:122` | Single util; otherwise Overview and Inspector numbers can disagree |
| 10 | AI Tools nav item visible to Free users leads to an upgrade wall | `AITools.jsx:80` | Show the item with a lock and a "What works without AI" link; surface Story Check first |

## 2. Discoverability of existing features (class E)

- **Version history** — exists, device-local; make entry points visible in scene menu and add "Saved on this device only" copy until cloud history ships (honesty over surprise).
- **Reference panel** — keyboard/menu entry should be advertised in Write mode empty states.
- **Character Journey** — lives inside the character editor; surface a "Arc" summary on the character card and in the Outline (beats linked to scenes already exist).
- **Manuscript Discovery** — strong deterministic importer; describe it as "no AI needed" on the entry card.
- **Idea → entity conversion** — already supports 6 target types; promote it from Quick Capture.
- **Pacing/Readability/Heatmap** — all exist; link to them from the Progress tab.

## 3. Consolidation instead of new nav items

| Proposed module | Recommended home | Rationale |
| --- | --- | --- |
| Plot Planner | Outline view switcher (Outline / Structure / Threads / Tension) | Same objects, one place to plan |
| Goals | Inspector Progress + Insights | Already there; add weekly/monthly/deadline |
| Trope Bible | Lore category "Tropes" + starter library | Avoids another nav entry |
| Research | Lore "References" kind (separate label, badge) | Real vs fictional kept visible but one editor |
| Canon Explorer | Connections panel + search | Navigation problem, not a module |
| Native + AI continuity | One "Story Check" panel with two clearly labelled sections | Brief requirement |

Net navigation change proposed: **zero new top-level sections.** Nav currently has up to seven groups and a dozen sections; adding more would hurt learnability, especially for Free users who see a single project.

## 4. Native-first messaging for no-AI users

- Empty AI states should say what to use instead (Story Check, Insights, Discovery import).
- Settings → AI should say "Optional. YOW works fully without it." (Check current copy before editing; not verified here.)
- Onboarding checklist (`GettingStartedChecklist.jsx`): ensure no step requires configuring AI (not verified — check list items during implementation).
- Pricing/Features pages are owner-editable via `/site-editor`; coordinate marketing copy with the owner, keeping `marketing-promises.spec.js` truthful.

## 5. Empty states and onboarding

Existing wizard + tour + checklist + sample project (`theLastEmberDemoProject.json`). Recommended: when Story Check ships, seed a deliberate, clearly-marked example finding in the sample project so users see what a finding looks like; when threads ship, add a tour step in Outline. Measure checklist completion before redesigning (no data in repo).

## 6. Mobile, tablet, accessibility

Per ROADMAP, manuscript workspace passed 375/768 px QA (2026-08-27) and there are accessibility and responsive e2e specs. New views must follow the "responsive gate": threads swimlane and tension graph need a vertical list fallback below ~768 px; the Cmd/Ctrl-K palette needs a touch entry point (search button in the top bar) and focus trap via `useDialogFocus`. Findings lists must be reachable by keyboard and not colour-only (kind icons + text).

## 7. Performance considerations to watch

- Entity-name regex built per render over all scene text in Insights (`buildCoverageInsights`, `buildCharacterFocus`) — fine at current sizes; cache by content hash if projects grow.
- Large scenes: editor already has a large-scene threshold (`LARGE_SCENE_CHAR_THRESHOLD = 120000`); do not add whole-document decorations for entity highlighting.
- Story Check and search should run in `requestIdleCallback`/worker-free memoised functions; no scene content scanning for Story Check.

## 8. Terminology

Align: "Idea Board" vs "Ideas"; "Lore" vs "Codex" (marketing uses Codex per `membership.js` feature list); "Atlas" group contains Locations + Map; "Planning" contains Outline/Ideas/Schedule. Pick one name per concept before adding Tropes/References. Suggest standardising on the nav labels in `Layout.jsx` and updating marketing copy.

## 9. Quick wins (no new data)

1. Honest "saved on this device" label on scene history.
2. Progress chip in the manuscript top bar.
3. Rename Pacing → Length (or add tension data later).
4. Lock-icon AI Tools entry with native alternatives.
5. Unify import entry.
6. Show collisions when two entities share a name/keyword (today the last wins silently).
