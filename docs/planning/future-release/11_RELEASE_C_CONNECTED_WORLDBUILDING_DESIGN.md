# Release C: Connected Worldbuilding — design and plan

Status: **started 2026-11-11. C1a (the shared name-and-alias resolver) is built; everything else is planned.** Tracked in [docs/ROADMAP.md](../../ROADMAP.md). Builds on [05_FUTURE_RELEASE_ROADMAP.md](05_FUTURE_RELEASE_ROADMAP.md) Release C, [03_FEATURE_GAP_ANALYSIS.md](03_FEATURE_GAP_ANALYSIS.md) and [04_PRODUCT_ARCHITECTURE_RECOMMENDATIONS.md](04_PRODUCT_ARCHITECTURE_RECOMMENDATIONS.md). Release A (Story Check, history, scene links, goals) and Release B (plot threads) are built.

## 1. What a writer gets

YOW already knows a character, a place and a piece of lore. What it does not do well is **connect them to the prose and to each other**. Release C makes the manuscript and the world one thing:

- **Names that mean something.** A writer can give any character, place, lore entry or history entry alternative names ("Lady M", "the Harbour"), and the manuscript recognises them. If two records answer to the same name, YOW says so instead of silently picking one.
- **Hover to remember.** Pointing at a recognised name shows that record's summary without leaving the page.
- **Explicit references.** A writer can state "this scene is about X" and have it survive renames and imports, rather than relying on guessing from text.
- **Research that lives with the book.** Real-world sources (a URL, a citation, notes) kept beside the lore, clearly marked as not in-world.
- **Who knows what, when** (optional power feature). Record when a character learns a fact; get a native warning if a scene has them act on it earlier.
- **See the web.** A Canon Explorer view over links that already exist, only if usage justifies it.

Everything stays native and AI-optional (D1 to D11). Each part sits behind its own fail-closed flag.

## 2. What already exists (verified in code, 2026-11-11)

| Area | State | Source |
| --- | --- | --- |
| Name highlighting in prose | Exists. A map of lowercase text to record for characters (name plus `keywords`), locations, lore and history/timeline titles. A name shared by two records is resolved by whichever was added last, with no warning. Only characters have alternative names. | `Manuscript.jsx` (was inline `entityMap`), `SceneEditor.jsx` `parseSegments` |
| Chips under "In this scene" | Exist (A4): suggested from the same map, confirmed by the writer into `scene.characterIds` etc. | `ManuscriptInspector.jsx`, `src/utils/sceneLinks.js` |
| Hover preview | Does not exist. The map already carries a `preview` string for every record, so this is mostly UI. | n/a |
| Aliases on locations, lore, history | Do not exist. | n/a |
| Explicit manuscript references (`entityRefs`) | Do not exist. | n/a |
| Research / references | Do not exist. Ideas hold text and links but are a different thing. | n/a |
| Character knowledge | Does not exist. Character journey beats link a scene or event but model no facts. | `CharacterJourney.jsx` |
| Connections / backlinks data | Exists (`worldLinks.js`), no unified view. | `src/utils/worldLinks.js` |

## 3. Build order

| Step | Contents | Schema | Flag | Effort |
| --- | --- | --- | --- | --- |
| **C1a** | One shared resolver module: aliases on every record type, collision list, exact legacy behaviour. Editor switched to it. | none | none (behaviour-preserving) | S, **built** |
| C1b | Alias fields in the character, location, lore and history editors; collision warning under the field and in Story Check as an info note | none (additive `aliases[]`) | `connected_refs` | S–M |
| C1c | Hover preview on recognised names in the editor and the read view. Must not slow large scenes (see risks). | none | `connected_refs` | M |
| C1d | Explicit references: "Link to…" on a selection or from the Inspector, stored as `scene.entityRefs`; remapped on import and merge; cleared on delete | none | `connected_refs` | M |
| C2 | References as Lore entries with `kind: 'reference'`; URL, source and citation fields; "convert to Lore" | none | `references` | S–M |
| C3 | `character_knowledge` table, a small panel on a character, rules R17–R18 | one new table (owner-applied) | `character_knowledge` | L |
| C4 | Canon Explorer over existing links | none | `canon_explorer` | M, only if justified |
| C5 | Document attachments, paid plans only | storage and scanning decisions | flagged, paid only | L |

C1a to C1d, C2 and C4 need no migration. C3 needs one table, written exactly like `plot_threads` (owner-only access, size cap, project-delete cleanup trigger, applied by the owner).

## 4. Data model

**Aliases.** `aliases: string[]` on characters (alongside the existing `keywords`, which keep working and are treated as aliases), locations, lore entries, world-history entries, timeline events and factions. Each 2 to 80 characters, at most 20 per record, trimmed, case-insensitive duplicates and the record's own name dropped. Stored plainly on the record, so sync, export, import and merge carry them with no work. Parsing and limits live in `src/utils/entityResolver.js` (`recordAliases`, `parseAliasText`).

**Resolver.** `buildEntityIndex(data)` returns `{ map, collisions }`. `map` is identical to the editor's previous map (later record wins a shared key, same entity shape). `collisions` lists every text shared by two or more different records, so the UI can warn. `collisionsForRecord` answers "what else answers to this name?" for an editor.

**Explicit references (C1d).** `scene.entityRefs: [{ type, id }]` on the scene, meaning "this scene is about this record". It is a list on the scene, **not markers inside the prose**: the manuscript text is never changed by linking (see D18). Renames cannot break it (it holds ids); delete clears it; import and merge remap it through the same generic id remap the scene links already use.

**References (C2).** Lore entries with `kind: 'reference'` (default `lore` for every existing entry), plus `sourceUrl`, `citation`. No new table, so it shares editor, search, export and sync. Shown under its own label and badge, and **excluded from in-world views and exports by default** so real-world notes never leak into the world.

**Knowledge (C3).** `character_knowledge` rows `{ id, novelId, characterId, fact, learnedAtSceneId, learnedAtEventId, via, confidence }`. Native rules fire only on facts the writer recorded: acting on a fact in a scene earlier than the scene where it is learned. Never inferred from prose.

## 5. Decisions

| # | Decision | Status |
| --- | --- | --- |
| D17 | Aliases on which record types | **Agreed 2026-11-12:** characters, locations, lore, history, timeline events and **factions**. Ideas later, if asked. The resolver already supports factions; the editor passes them in once alias support is switched on (C1b), so nothing changes before then. |
| D18 | How explicit references are stored | **Agreed 2026-11-12: Option A.** A list on the scene (`entityRefs`), shown in the Inspector as "This scene is about" chips with "Link a record" and suggestions. The manuscript text is never touched. |
| D19 | Where research lives | **Agreed 2026-11-12:** its own **References** area, and reachable from anywhere. Built as a room of its own plus a slide-over References drawer openable from any room (topbar button and shortcut), so a writer can look something up without leaving the manuscript. Stored as Lore entries with `kind: 'reference'` (shares editor, sync, export and search) but shown only in References, never in the Lore room or in-world exports by default. |
| D20 | Character knowledge | **Agreed 2026-11-12: build it** (C3), optional, behind its own flag, after C1 and C2. One new table. Cut it if the earlier steps show little use. |
| D21 | Document attachments (C5) | **Agreed 2026-11-12: paid plans only, 10 MB per file, and uploads are scanned.** Still to settle when it is built: allowed types (proposed PDF, DOCX, plain text, images), counting toward the storage allowance, and inclusion in backups. Free accounts keep links, citations and notes. **C5 is blocked on the upload scanning pipeline** (ROADMAP Security row "Upload scanning and validation" and owner queue row 14), which also covers every existing upload area. **Owner decision 2026-11-12: no antivirus for now (no new running costs before there are paid users), so C5 stays on hold** until antivirus is affordable; a real-file-type check already protects image uploads. |

## 6. Risks and how they are handled

- **Editor performance.** `SceneEditor` is large and scenes can be very long. C1c adds hover only to names the editor already highlights, with no new scan; a scene over the large-scene threshold keeps passive highlighting off as today. Add tests before touching the editor.
- **Silent behaviour change.** C1a keeps the old map byte-for-byte (a test pins it). Aliases only add keys where a writer has typed some.
- **Ambiguity noise.** Collisions are a quiet note, never a blocker, and a writer can mark one intentional.
- **Data model creep.** Knowledge can become data entry. It stays optional and flagged, and is the first thing cut if the earlier steps are not used.
- **Research mixing with lore.** Separate label, badge and export default (D19).
- **Rollback.** C1 to C2 add only plain fields; turning the flag off hides the UI and leaves the data harmless. C3's table follows the `plot_threads` rollback.

## 7. C1a as built

`src/utils/entityResolver.js` and its tests (9). `Manuscript.jsx` now builds its name map through `buildEntityIndex`. A test pins the old map for a representative project, so a behaviour difference would fail loudly. No UI change; nothing for the owner to do.

## 8. C1b as built (2026-11-11)

Behind the new `connected_refs` flag (off for everyone). An **Other names** field in the location, lore, faction, timeline and history editors (`src/components/shared/AliasesField.jsx`), and a quiet clash warning under any name or alias already used by another record. Characters keep their existing Alias / Keywords field (it already worked as aliases) and gain the warning only (`AliasClashNotes`). Decisions made while building:

- A history entry and the timeline event linked to it are one chronicle record shown in two places, so they never count as a clash with each other, and `aliases` is one of the fields mirrored between them.
- Saving a record the writer gave no other names to adds no `aliases` field to it (`withAliasField`), so nothing changes for anyone while the flag is off.
- Factions are recognised in the manuscript text only while the flag is on; every other change is invisible without aliases.
- The warning never blocks saving. It says the manuscript can link that name to only one of the records.

Browser-checked in a scratch copy: field renders, chips add on Enter and comma, the clash warning shows, and the aliases survive save and reopen.

## 9. Next

C1c: hover preview on recognised names in the editor and read view.
