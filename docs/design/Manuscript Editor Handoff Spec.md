# Manuscript editor redesign — implementation spec

Source of truth for the design: `Manuscript Editor Redesign v2.html` (theme toggle at the bottom; "What changed" lists the thirteen decisions).
Target: `yow/src/components/Manuscript/*` and `yow/src/index.css`.
Agreed rollout: **one change, whole editor at once.** The steps in §7 are a work order inside that single change, not separate releases.

---

## 1. Scope

Three layers, in dependency order:

1. **Tokens** — "Dark refined" replaces the current default dark theme; all seven themes gain five new tokens, hand-tuned.
2. **Layout** — the left rail leaves `WritingSidebar`, the toolbar splits into three zones, the icon-rail-plus-panel becomes one four-tab inspector, and four modals become one shared side surface.
3. **Scene surface** — scene metadata moves out of the prose into the inspector; the prose column narrows and gains a note gutter.

Out of scope: the store, autosave, `useSceneWindow` virtualization, `useCaretComfortScroll`, comic planner, campaign session workflow (it keeps its current `<details>` block, restyled by tokens only).

---

## 2. Token layer

### 2.1 Prototype → app variable names

| Prototype | App variable | Notes |
| --- | --- | --- |
| `--bg` | `--bg-main` | exists |
| `--surface` | `--bg-nav` | exists — rails, toolbar, inspector |
| `--raise` | `--bg-raise` | **new** — menus, side surface, toasts, dialogs |
| `--text` | `--text-main` | exists |
| `--muted` | `--text-muted` | exists |
| `--faint` | `--text-faint` | **new** — counts, timestamps, axis labels |
| `--line` | `--border` | exists |
| `--line-strong` | `--border-strong` | **new** — panel edges, status squares, dashed affordances |
| `--accent` | `--accent` | exists |
| `--accent-soft` | `--accent-fade` | exists |
| `--accent-text` | `--accent-text` | **new** — accent-coloured *text* at body size (contrast) |
| `--accent-2` | `--accent-2` | **new** — status "done", sparkline positives |
| `--prose-c` | `--prose-text` | **new** — manuscript body text only |

`--bg-hover` and `--accent-contrast` stay as they are. `--pill` is not needed: the app is a single-radius system, keep `8px` on controls.

### 2.2 New default (replaces the current `#0d282e` set)

Edit **both** `:root` blocks — `index.css:6` and the duplicate at `index.css:3144` — or they will disagree.

```css
:root {
  --bg-main:      #0e1a18;
  --bg-nav:       #132220;
  --bg-raise:     #1a2b28;
  --bg-hover:     rgba(236, 230, 218, 0.06);
  --text-main:    #ece6da;
  --text-muted:   #8ea19b;
  --text-faint:   #5c706b;
  --border:       rgba(255, 255, 255, 0.09);
  --border-strong:rgba(255, 255, 255, 0.16);
  --accent:       #e07a4f;
  --accent-fade:  rgba(224, 122, 79, 0.14);
  --accent-text:  #f0a180;
  --accent-2:     #9db07a;
  --accent-contrast: #1a1210;
  --prose-text:   #f2ece0;
}
```

### 2.3 The other six themes — five tokens each

Hand-tuned as agreed. Base tokens in each theme stay untouched.

| Theme | `--bg-raise` | `--text-faint` | `--border-strong` | `--accent-text` | `--accent-2` | `--prose-text` |
| --- | --- | --- | --- | --- | --- | --- |
| `tropical` | `#1a4550` | `#4d8480` | `#2a636b` | `#f39a7c` | `#6fc0a8` | `#e8f4f2` |
| `sage-modern` | `#ffffff` | `#83968a` | `#b4c2b6` | `#2f6448` | `#a8763c` | `#1a241d` |
| `industrial-loft` | `#242935` | `#5d6472` | `#3a4050` | `#e5a648` | `#7f93b8` | `#e4e8f0` |
| `caramel-latte` | `#fffdf8` | `#9a8a66` | `#cfae7e` | `#8a5418` | `#6f7f56` | `#241c0a` |
| `ocean-depth` | `#143040` | `#3d6d85` | `#1d5065` | `#4dc2d6` | `#7fb08a` | `#d9f0f8` |
| `pearl-minimal` | `#ffffff` | `#8b939b` | `#cbd1d6` | `#4f5f73` | `#8c9c86` | `#16191d` |

Rule the table follows, for any theme added later: `--bg-raise` is one step *away* from the page (lighter on dark, white on light); `--text-faint` sits between muted and border; `--accent-text` is the accent lightened on dark grounds and darkened on light ones until it clears 4.5:1 against `--bg-nav`; `--accent-2` is a hue-shifted sibling at the accent's chroma; `--prose-text` is `--text-main` pulled a touch further from the page than UI text.

### 2.4 Existing CSS to retire

In `index.css`, the `.ms-*` block: `.ms-writing-tab-strip`, `.ms-writing-tab-btn`, `.ms-writing-tab-label`, `.ms-panel-topbar` (folded into the inspector header), `.ms-format-chip` (becomes the shared `.ms-opt`), `.ms-scene-meta` row styling. Replace hard-coded `rgba(...)` hairlines in that block with `var(--border)`.

---

## 3. Layout

```
┌ ms-topbar ──────────────────────────────────────────────────────────┐
│ [rail] Title · Act·Ch·Scene │ saved · words · today │ AI  Inspector │ Focus ⋯ │
├──────────┬──────────────────────────────────────────┬──────────────┤
│ ms-rail  │ ms-sheet                                  │ ms-inspector │
│ acts     │  ┌ 620px prose ─────┐ ┌ 188px gutter ┐    │ Scene        │
│ chapters │  │ scene head       │ │ note markers │    │ Notes        │
│ scenes   │  │ prose            │ │              │    │ Format       │
│ + Scene  │  └──────────────────┘ └──────────────┘    │ Progress     │
│ + Chapter│                                           │              │
└──────────┴───────────────────────────────────────────┴──────────────┘
                                    ms-surface (AI · Search · History · Finalise)
                                    overlays the inspector, fixed width
```

Breakpoints:

| Width | Rail | Inspector | Surface |
| --- | --- | --- | --- |
| ≥ 1251px | expanded, 268px | in flow, 320px | overlays inspector, 520px |
| 901–1250px | auto-collapsed to 44px spine | in flow, 320px | overlays, 520px |
| ≤ 900px | off-canvas sheet | bottom sheet, 62vh | full width |

Under 900px the top bar's centre status and secondary buttons hide; a four-item bottom bar (Outline / Write / Inspector / AI) drives all four surfaces.

---

## 4. Per-file work

### `Manuscript.jsx`
- Split the current single toolbar `<div>` into `<ManuscriptTopbar>` with three zones. Left: rail toggle + breadcrumb button. Centre: `<SaveIndicator>` + word counts. Right: AI, Inspector, Focus, overflow.
- The overflow menu holds: Search & replace (⌘F), Go to scene (⌘K), Pacing chart, Apply a template, Import a document, Version history, Finalise draft, Export (⌘E), Retired drafts. All ten current toolbar buttons except AI/Inspector/Focus move here.
- Breadcrumb text comes from the active scene: derive `act.title · chapter.title · Scene {n}` from `orderedContent` + `activeSceneId`. **Reuse the existing `scenesInView` IntersectionObserver from `useSceneWindow`** for "where am I" — do not add a second observer.
- Replace the four modal renders (`ManuscriptSearch`, `SceneVersionHistory`, `ManuscriptCatalogue` + finalise, `AISuggestionPanel`) with one `<ManuscriptSurface active={surfaceId}>`. Keep `PacingChart`, `TemplateModal`, `DocxImportModal`, `SceneConflictReview` as modals.
- State: `surfaceId` (`'ai' | 'search' | 'history' | 'finalise' | null`) plus `lastSurfaceId` persisted per project in localStorage; `inspectorTab`; `railCollapsed`.
- Keep `SceneSlot`, `estimateSceneHeight`, `mount` logic and the `ms-scene-${id}` ids exactly as they are.

### `ManuscriptRail.jsx` (new — lifted from `StructureSidebar.jsx`)
- Same tree, same `move*`/`add*`/`delete*` props; now a sibling of `<main>` rather than a panel inside the right sidebar.
- Per row: status square (`--border-strong` / `--accent` draft / `--accent-2` done), title, word count. Chapters collapsible.
- Hover reveals an inline `+ scene` between rows; the footer keeps three explicit buttons (`+ Scene`, `+ Chapter`, `+ Act`). No modal for adding structure.
- Collapsed (44px): the spine — one tick per scene, active tick in `--accent`. Drag-reorder stays available in the expanded state only.
- Delete is immediate + undo toast (§5.2), replacing the current confirm.

### `WritingSidebar.jsx` → `ManuscriptInspector.jsx`
- Delete `TABS`/`ms-writing-tab-strip` and the `structure` and `reference` panels. Structure goes to the rail; reference moves behind the breadcrumb's ⌘K palette and entity clicks.
- Four tabs in one strip at the top: **Scene**, **Notes** (count badge), **Format**, **Progress**. `activePanelId` becomes `inspectorTab`; the `'goals' | 'progress' → 'status'` alias in `visiblePanelId` can go.
- **Scene** tab is new: title, status segmented control, POV, location, summary, entity chips — all the fields `SceneEditor` currently renders inline.
- **Progress** tab replaces the three-stat grid + act/chapter accordions with: one goal bar (words today / target), streak and average as small text, one seven-day sparkline, three target rows.
- Hidden while a surface is open; restored on close.

### `ManuscriptSurface.jsx` (new)
- One full-height right panel, fixed 520px, `--bg-raise`, one at a time, remembers `lastSurfaceId` (⌘J reopens). Header: title + context chip + close. Footer input only for AI.
- Wraps the existing bodies with their modal chrome removed: `AISuggestionPanel`, `ManuscriptSearch`, `SceneVersionHistory`, and a finalise pane combining `buildFinalizedDraft` + `ManuscriptCatalogue` + export actions.
- Finalise pane's "Open reader" mounts `FinalizedReader` as a **full-screen reading mode** over the editor (Esc exits); the existing `activeFinalizedDraft` branch in `Manuscript.jsx` that swaps the body becomes that reader.

### `SceneEditor.jsx`
- Scene header collapses to one line above a hairline: `Scene n` · title · status chip · (right, on hover/active) word count, POV chip, "Details" → opens the inspector Scene tab. Remove the metadata input row.
- Prose column: `max-width: 620px`, left-set inside the sheet, with a sibling 188px gutter column (`grid-template-columns: minmax(0,620px) 188px`).
- Notes: superscript mark in the text (as today) **plus** a gutter card beside its line; both select the note in the inspector. Note creation moves to a selection bar (§5.3).
- Do not touch the textarea/ContentPreview swap, `onPersistDraft`, `onLiveContentChange`, or the caret-follow props.

### `ManuscriptToolbar.jsx`
- `FormatContent` keeps its sections but renders as `.ms-opt` pill rows (no sliders); it becomes the inspector's Format tab.
- `NotesPanel` gains "note has a gutter marker" state and note-selection sync.
- `SaveIndicator` moves into the top bar's centre zone, with word counts beside it.

### `Toast.jsx` (new)
- One host at app level. `toast(message, { undo })`; single line, one Undo, 5s. Used by replace-all, snapshot restore, and every delete.

---

## 5. Behaviour

**5.1 Surfaces.** One at a time; opening another replaces it; closing remembers. Surface overlays the inspector, never pushes the prose column. ⌘J toggles the last surface, ⌘F opens Search, Esc closes.

**5.2 Destructive actions.** No confirm dialogs. Delete scene/chapter/act, replace-all, and restore-snapshot apply immediately and post one undo toast. Undo must restore order and parentage, so keep the removed record and its index in the toast closure.

**5.3 Notes from selection.** Selecting prose shows a small floating bar above the selection: **Note** (⌘'), **Ask AI**, bold, italic. Note creates the note anchored to the selection, adds the gutter card, opens the inspector Notes tab, and posts an undoable toast.

**5.4 Focus mode.** Unchanged entry (`focusedWriting.setEnabled`), but the top bar thins to word count + "Exit focus · Esc", the rail, inspector and gutter hide, and the prose column centres at 620px.

**5.5 Keyboard.** ⌘\ rail · ⌘K go to scene · ⌘F search · ⌘J last surface · ⌘' note · ⌘E export · Esc closes reader → focus → surface → menu, in that order.

---

## 6. Do not break

- `useSceneWindow` virtualization, `SceneSlot` wrapper stability, `ms-scene-${id}` / `ms-chap-${id}` ids (rail and breadcrumb both scroll by them).
- No synchronous layout reads in scene render paths — the reason virtualization exists.
- `persistSceneDraftToLocalStorage` / `recordLocalWrite` call sites.
- Project-type labels: every "Scene / Chapter / Act" string in the new chrome must come from `projectTypeConfig.structure`, not be hard-coded.

---

## 7. Work order (single change)

1. Tokens: default block ×2, six theme blocks, retire the dead `.ms-*` rules.
2. `ManuscriptRail.jsx` extracted from `StructureSidebar`, mounted left, with collapse + spine.
3. `ManuscriptInspector.jsx`: four tabs, new Scene and Progress panes.
4. `ManuscriptTopbar`: three zones + overflow menu + breadcrumb.
5. `ManuscriptSurface.jsx`: move the four bodies in, delete their modal shells.
6. `SceneEditor`: header line, 620px measure, note gutter, selection bar.
7. `Toast.jsx` + swap every confirm for immediate-plus-undo.
8. Responsive: the three bands in §3, then the mobile bottom bar.
9. Delete the old code paths (tab strip, `activeSidebarTab` aliases, modal wrappers).

## 8. Three modes (supersedes parts of §3–§5)

The editor has one mode selector, a segmented control immediately right of the breadcrumb: **Write · Edit · Finalised**. State: `mode`, persisted per project. Esc from Finalised returns to Edit.

| | Write | Edit | Finalised |
| --- | --- | --- | --- |
| Rail | collapsed to spine (expandable) | expanded | hidden |
| Inspector | hidden | four tabs | hidden |
| Note marks + gutter | hidden | shown | hidden |
| Scene header | scene name only, muted, no hairline | full line (status, count, POV, Details) | — |
| Selection bar | formatting only | Note · Ask AI · formatting | none |
| Surface (AI/Search/History) | closed; AI + Inspector buttons hidden | available | hidden |
| Prose column | centred, 684px | 620px + 188px gutter | 620px flow, or book spread |

- **Write** is the bare surface. Focus mode still nests inside it (further thinning the top bar).
- **Edit** owns the whole apparatus, including notes — notes are an editing tool and do not exist in Write.
- **Finalised** is read-only, rendered from a frozen copy, written scenes only (empty scenes and empty chapters are skipped). Its own header carries a second segmented control:
  - **Manuscript** — continuous flow, chapter headings, 620px.
  - **Book** — two-page spread on a raised sheet with a centre gutter rule, `column-count:2`, paged by `translateX` on the flow (never `scrollLeft`: the padded `overflow:hidden` box can't reach an aligned final spread). Spread count = `ceil(flow.scrollWidth / (flow.clientWidth + columnGap))`, recomputed on every navigation and from a `ResizeObserver` on the flow — do not cache it across a resize. Running "Pages n–n+1 of N", arrow navigation. Single column under 900px.
  - Export sits beside the view switch.

Top bar right zone, in order: AI · Inspector · | · Project (returns to the project dashboard) · Focus · overflow ⋯ · user avatar.

## 9. Acceptance

- Breadcrumb always names the scene under the caret, including after a rail jump.
- Rail collapsed at 1200px on load; prose never sits under the inspector or surface at any width.
- Every destructive action is undoable from its toast; nothing asks first.
- Notes appear in the gutter and the inspector from a single selection action.
- All seven themes render the editor with no unresolved `var(--*)`.
- Focus mode and Esc still work through reader → focus → surface → menu.
- Typing latency in a 90k-word manuscript unchanged from today (spot-check the `docs/QA_CHECKLIST.md` typing case).
