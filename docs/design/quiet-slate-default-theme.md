# "Quiet Slate" as the site-wide default theme — applied

Applied 2026-08-19 as a whole-site default-theme change, superseding the 2026-08-17
Dark Refined overhaul (see [dark-refined-default-theme.md](dark-refined-default-theme.md)).
A rollback copy of the previous `src/index.css` is preserved at
`docs/design/backups/index.css.pre-quiet-slate-default.2026-08-19.css`.

## Source

Implemented from the design handoff bundle `Color and type pairings.zip`
(`design_handoff_light_theme/README.md` + `Theme Exploration.dc.html`), working name
"Quiet Slate". High-fidelity handoff — hex values used as-is.

## What changed

`quiet-slate` is a new light theme — warm-neutral stone surfaces, teal primary accent,
terracotta secondary accent — added as an 8th entry in the `[data-theme="…"]` system in
`src/index.css`, following the exact pattern of the other built-in themes (core palette +
atmosphere/material tokens + elevation/shadow + geometry). It is now the app default in
both default-token locations: the plain `:root` fallback near the top of `src/index.css`
and the `:root:not([data-theme])` block further down. It is also `BUILT_IN_THEMES[0]` in
`src/utils/theme.js`, which drives `DEFAULT_THEME`, `DEFAULT_CUSTOM_COLORS`, and
`DEFAULT_THEME_TUNING`.

`dark-refined` remains available as a standard theme option (no longer labeled default in
code comments); `light-refined`, `tropical`, and the other five built-in themes are
unchanged. `index.html`'s pre-paint FOUC script and its `theme-color` meta/inline
safe-area fallback colors were updated to Quiet Slate. Static marketing CSS
(`public/marketing.css`, used by the static SEO pages under `public/*/index.html`) was
re-themed from dark to light to match: background/text/border variables plus every
hardcoded accent-tinted `rgba(156, 73, 53, …)` (old coral) and dark-surface hover overlay
(`rgba(255,255,255,…)`) were converted to Quiet Slate equivalents.

```css
[data-theme="quiet-slate"] {
  --bg-main: #f2f1ed;
  --bg-nav: #e6e3da;
  --bg-raise: #ffffff;
  --bg-hover: rgba(28, 26, 22, 0.05);
  --text-main: #1c1a16;
  --text-muted: #5f5b52;
  --text-faint: #8d8878;
  --accent: #1f6f6b;          /* teal — primary actions, active nav tab */
  --accent-fade: rgba(31, 111, 107, 0.12);
  --accent-text: #175450;
  --accent-2: #c1602f;        /* terracotta — secondary accent, tags */
  --accent-contrast: #f4fffd;
  --border: rgba(28, 26, 22, 0.15);
  --border-strong: rgba(28, 26, 22, 0.28);
  --prose-text: #1a1815;
  --radius-unit: 7px;
}
```

Extended tag/status palette (per the handoff, one-off hex values passed at the `Badge`
call site via its `color` prop, not new CSS variables — same pattern already used for
status pills):
- Teal `#1f6f6b` — primary accent (`--accent`)
- Terracotta `#c1602f` — secondary accent (`--accent-2`)
- Plum `#7c4a7c` — tertiary tag color (e.g. genre tags)
- Gold `#b8902a` — quaternary tag color (e.g. POV/character tags)

## Atmosphere/studio tokens (not specified in the handoff)

The handoff was explicitly color-only ("Typography and spacing are unchanged... this is
a color-only theme addition") and didn't specify the atmosphere/material/shadow/glow
tokens this codebase's theme system also requires (see the memory note on Theme System
v2 and `docs/design/dark-refined-default-theme.md`). Those were derived to match the
"warm-neutral stone surfaces" identity, following the structural pattern of the existing
`light-refined` block: warm stone tints for `--atmos-warm`/`--atmos-paper`/`--atmos-wood`/
`--atmos-cork`, a subtle 4%-intensity glow at 78% 8% (matching `light-refined`'s
restraint), and ink-tinted (`rgba(28,26,22,…)`) elevation shadows. These are a
judgment call, not part of the high-fidelity spec — flag if they read wrong in the visual
QA pass below.

## Still needs QA

Run a whole-site visual pass before accepting as final: dashboard/library, project
overview, manuscript editor, account settings/theme picker, public/marketing pages
(both the React app's public routes and the static `public/*/index.html` pages), modals/
toasts, and responsive widths. Also check:
- The four Badge/tag one-off colors (teal/terracotta/plum/gold) at their actual call
  sites — gold in particular measures low text contrast (~2.6:1) against the Quiet Slate
  background, so it should only be used as a badge fill with dark text, never as plain
  text/link color.
- Logo rendering (`--logo-filter: brightness(0)`, same as the other light themes).
- If the direction feels wrong, restore the backup CSS copy or revert the theme-token
  diff only.
