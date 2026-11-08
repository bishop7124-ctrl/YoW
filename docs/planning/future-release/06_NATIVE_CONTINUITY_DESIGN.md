# 06 — Native Continuity ("Story Check") Design

Date: 2026-11-08. Status: proposal. Feasibility: **High for structured data, none for prose** — and that boundary is a feature.

## 1. Existing implementation analysis

- No deterministic continuity code exists. The only continuity tools are `PlotHoleDetector.jsx` and `LoreConflictChecker.jsx`, both full-project LLM prompts (`utils/aiToolPrompts.js:384-528`) returning JSON findings stored in `ai_findings`.
- Reusable validated building blocks:
  - `utils/timelineYear.js`: `parseTimelineYear` (extracts a year integer from free text, handles BC/BCE, "Year 98"), `getTimelineYear(entry)`, `findEraForYear` (returns null on overlapping eras — deliberate ambiguity handling), `sortTimelineEntries`.
  - `utils/characterAge.js`: age at death/current year.
  - `utils/familyRelationships.js`: normalises `parentIds/childIds/spouseIds` and relationship records (tested).
  - `utils/worldLinks.js`: back-references.
  - `utils/chronicleLinks.js`: timeline↔history mirror.
  - `utils/aiFindings.js` + `aiFindingNav.js`: persistence and jump-to-source.
  - `manuscriptDiscovery/index.js`: the pattern for a pure, network-free analysis module with evidence objects.
- Data shape facts that constrain rules (verified): dates are **free text** reduced to a single integer year; characters have `status` (`alive`/`dead`), `birthDate`, `deathDate`; timeline events have `startYear/endYear/date/dateRange/year`, `eraId`, `linkedCharacters`, `linkedLocations`; eras have `startYear/endYear`; scenes have `pov` and `locationTag` as free-text strings, `status`, `summary`, `storyEvent`; **scenes have no character list, no timeline-event link, no story-year**.

## 2. Principles

1. Only assert what structured data proves. If a date does not parse, report **Missing information**, never guess.
2. Four result kinds, always labelled, never merged: **Confirmed**, **Possible**, **Missing info**, **Info**. AI results appear in a separate section titled "AI suggestions (unverified)".
3. No keyword scanning of prose to infer events. The only prose-derived signal permitted is *exact-name presence* using the same resolver as the editor chips, and only for **Info**/**Possible** classes where a human confirms.
4. Deterministic, idempotent, side-effect-free, no network, no AI import (enforced by test).
5. Every finding has a stable fingerprint `ruleId + sorted(recordIds) + relevant values` so dismissals survive edits that don't change the facts.
6. Explicit user action to run (or cheap auto-run on opening the panel — all computation is local); never auto-invoke AI.

## 3. Rules

### Tier 1 — buildable today, no schema change (MVP)

| Rule | Check | Data required | Class | False-positive notes |
| --- | --- | --- | --- | --- |
| R1 Death before birth | `deathYear < birthYear` | `birthDate`, `deathDate` parse | Confirmed | Different calendars/eras in one project: only if both parse to ints; skip when either has text like "Age of…" without digits |
| R2 Dead but alive-status inconsistent | `status='alive'` with a `deathDate`, or `status='dead'` without death year | `status`, `deathDate` | Confirmed (alive+date) / Missing info (dead, no date) | UI already clears `deathDate` when alive, so hits are legacy/imported data |
| R3 Event involving a character after their death | event year (`startYear`/`getTimelineYear`) > death year, with character in `linkedCharacters` | event year, `linkedCharacters`, `deathDate` | **Possible** (not Confirmed): ghosts, memorial events, "funeral of X" legitimately link the dead | Offer per-event "intentional" dismiss; skip events whose `type`/`category` matches commemoration-like user categories only if user marks them |
| R4 Event before a character's birth | event end year < birth year with character linked | same | Possible | Prophecies/ancestral history link characters before birth |
| R5 Parent younger than / too close in age to child | parent `birthYear` ≥ child `birthYear`, or gap < configurable minimum (default 12) | `parentIds`, birth years | Confirmed (≥) / Possible (small gap) | Species with different lifespans: the gap threshold is a per-project setting; never guess from the `species` field |
| R6 Child born after parent's death | child birth > parent death + 1 year | birth/death years | Confirmed if > death +1, Possible otherwise | Posthumous birth within ~1 year is valid |
| R7 Event outside its Era | event year not in era `[startYear,endYear]` of `eraId` | `eraId`, era years, event year | Possible | Overlapping/open-ended eras: skip when era bounds missing (→ Missing info) |
| R8 Dangling references | links to deleted entities (ids not found) in `linkedCharacters`, `linkedLocations`, lore ids, journey beat links, relationship `targetId` | all link arrays | Confirmed | Mid-sync states: run only when sync status is idle |

### Tier 2 — needs structured scene links (Release A4)

| Rule | Check | New data | Class |
| --- | --- | --- | --- |
| R9 Character in scene after death | scene `storyYear` (or the year of linked `timelineEventIds`) > death year, character in `scene.characterIds` | `characterIds`, `storyYear`/`timelineEventIds` | Possible (flashback/ghost flag per scene to suppress) |
| R10 Scene order vs. story chronology | scenes marked `chronological` (default) whose `storyYear` goes backwards without a `flashback` flag | `storyYear`, scene `timeShift: 'flashback'|'flashforward'|null` | Possible |
| R11 Character in two places | two scenes at the same `storyYear`+schedule day with the same character in different `locationIds` | story date granularity beyond year; requires Schedule bridging | Possible; **deferred** unless month/day exist |
| R12 Age in scene | age at scene year vs. stated age fields (e.g., user-entered "age in this scene" or text-less comparison) | explicit age field | Confirmed only for explicit numeric data |

### Tier 3 — Release B/C

R13 setup without payoff / payoff without setup (needs threads, doc 03); R14 character acts on knowledge they have not yet acquired (needs `character_knowledge`); R15 unresolved thread at end; R16 long gap since a thread last appeared; R17 structure template slots empty. All rely on **explicit user data**, never inference.

### Info-class observations (low risk, useful)
Characters never linked to any scene/event; locations never referenced; lore entries with no links; events with no year; eras with gaps/overlaps; scenes with empty POV. Existing Insights coverage already approximates some via regex; Story Check should reuse one resolver so both agree.

## 4. Result model

```
Finding { id, source:'native', ruleId, kind:'confirmed'|'possible'|'missing'|'info',
          title, explanation, evidence:[{label, recordType, recordId, value}],
          fingerprint, suggestedFix? , createdAt }
```
UI: one panel, grouped by kind with counts; each finding: plain-language sentence naming the data ("Mira dies in Year 98 but is linked to 'Siege of Orrin' in Year 104"), evidence rows that deep-link (`aiFindingNav` pattern), actions: *Open*, *Mark intentional* (dismiss with note), *Mute rule for this project*. A footer button "Run AI review (uses your API key)" opens the existing AI tools; Free users see the existing upgrade wall there but still get the native panel.

## 5. Integration with AI

- Same panel, separate section; AI findings keep their cautious wording and are tagged "AI — unverified".
- Optional later enhancement: append "Known structural findings" to the Plot Hole prompt (explicit action only).
- Shared persistence: reuse `ai_findings` documents with `source`, `kind`, fingerprint (confirm table columns first), or keep native dismissals in `user_settings`/project document.
- Existing AI tools remain unchanged.

## 6. Performance

All rules are O(n) or O(n log n) over records (characters, events, scenes). Memoise on a cheap version key (collection lengths + max `updatedAt`/`lastModified`); recompute in an idle callback; large projects (thousands of scenes) never scan scene *content*. Incremental analysis is unnecessary at this scale; if profiling disagrees, index by entity id and re-run only rules touching changed collections. Measure and record in the acceptance run.

## 7. False-positive prevention checklist

- Unparseable → Missing info, never a guess.
- No cross-era comparisons when era/calendar differ; compare only within parseable integers.
- Possible vs Confirmed split as above; "intentional" dismissals tied to fingerprints.
- Per-project rule toggles and thresholds (R5 minimum parent age).
- Respect species/immortality by **not** hard-coding ages; defaults only on user-adjustable thresholds.
- Skip drafts? No — but allow "ignore ideas/archived" via existing statuses.
- Fixture tests for: BC dates, negative years, "c. 1200", ranges, empty strings, `status` aliases, mirrored timeline/history duplicates (avoid double-reporting the same event from both lists: dedupe via `worldHistoryEntryId`).

## 8. Suggested MVP (Release A1)

R1, R2, R3, R4, R5, R6, R7, R8 + Info observations, in a panel under Overview → "Story Check", Free-tier available, behind `story_check` flag, with: fingerprinted dismissals, per-rule mute, jump-to-record, and the AI hand-off button. No schema change except dismissals. Estimated size: ~8 pure rule modules + 1 runner + 1 panel + tests; no store changes.

## 9. Future expansion

Scene links (R9–R12) → threads (R13, R15–R17) → knowledge (R14) → optional month/day precision via Schedule calendar bridging → series-level checks across shared records (`syncRootId`) → export of the report to the DOCX bundle.

## 10. Open questions

- Confirm `ai_findings` column layout and whether `kind`/`source` fit without migration.
- Confirm that `startYear` is populated for events created through all paths (some only have `date` text) — parse fallbacks exist (`getTimelineYear`), but coverage on real projects is unknown.
- How common are `deathDate` values with non-year text in production? Unknown; query only via owner-run, read-only analysis on exported data.
