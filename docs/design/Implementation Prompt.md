# Prompt — implement the manuscript editor redesign

Paste this into Claude Code with the repo open. It assumes `Manuscript Editor Handoff Spec.md` and `Manuscript Editor Redesign v3.html` are both in the repo (copy them in first, e.g. to `docs/design/`).

---

Implement the manuscript editor redesign described in `docs/design/Manuscript Editor Handoff Spec.md`. The interactive reference is `docs/design/Manuscript Editor Redesign v3.html` — open it and use it as the source of truth for layout, spacing, type scale, token values and interaction behaviour. Where the spec and the prototype disagree, the prototype wins for visuals and the spec wins for architecture.

**Before writing any code**, read these and tell me your implementation plan plus anything in the spec that conflicts with how the code actually works:

- `src/index.css` (both `:root` blocks and all seven `[data-theme]` blocks)
- `src/components/Manuscript/Manuscript.jsx`
- `src/components/Manuscript/ManuscriptToolbar.jsx`
- `src/components/Manuscript/WritingSidebar.jsx`
- `src/components/Manuscript/StructureSidebar.jsx`
- `src/components/Manuscript/SceneEditor.jsx`
- the hooks the editor depends on: `useSceneWindow`, `useCaretComfortScroll`, `focusedWriting`
- `docs/QA_CHECKLIST.md`

Then work through §7 of the spec in order — tokens, rail, inspector, top bar, surface, scene editor, toasts, responsive, delete dead code — plus §8 (three modes: Write / Edit / Finalised, with the book view). This ships as one change, but commit after each numbered step so it's bisectable.

Hard constraints:

- Do not change the store, autosave, `useSceneWindow` virtualization, `SceneSlot` stability, `estimateSceneHeight`, `persistSceneDraftToLocalStorage`, `recordLocalWrite`, or the `ms-scene-${id}` / `ms-chap-${id}` id scheme. The rail, breadcrumb and mode switching all navigate by those ids.
- No synchronous layout reads in scene render paths.
- Every "Scene / Chapter / Act" string in new chrome comes from `projectTypeConfig.structure`, never hard-coded — this must still read correctly for campaign and comic projects.
- All colour, spacing and radius values come from CSS variables. If you need a value the token set doesn't have, add a token to all seven themes rather than hard-coding it.
- Keep the existing component file layout and code style; no new dependencies, no CSS-in-JS, no state library.

Behaviour that is easy to get wrong — copy it from the prototype rather than reinventing:

- Book paging uses `translateX` on the column flow, never `scrollLeft`, and recomputes the spread count on every navigation and from a `ResizeObserver`.
- Destructive actions never confirm first: they apply immediately and post one undo toast that restores order and parentage.
- The side surface overlays the inspector and reopens whatever was last open; it never pushes the prose column.
- The note gutter drops out via a container query on the writing column, not a viewport media query.

When you're done, verify against §9 of the spec, run the typing-latency case in `docs/QA_CHECKLIST.md` against a large manuscript, load the editor in all seven themes, and check each of the three modes at 1440px, 1100px and 380px. Report what you changed per file, what you deleted, and anything you deliberately left for a follow-up.
