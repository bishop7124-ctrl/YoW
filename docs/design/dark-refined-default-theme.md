# "Dark refined" as the site-wide default theme — deferred

Not applied. This captures what `Manuscript Editor Handoff Spec.md` §2.2 originally asked
for (a new default dark palette) so it can be picked up later without re-deriving it. The
manuscript editor redesign itself does **not** touch the app's base colors — see the
decision note below.

## Why this is separate from the manuscript editor work

The handoff spec's §2.2 says to replace "the current default dark theme (`#0d282e`)" with
a new palette, editing "both `:root` blocks — `index.css:6` and the duplicate at
`index.css:3144`." That instruction is stale on two counts:

1. **`index.css:6`'s plain `:root { ... }` block is dead code.** It holds `--bg-main:
   #0d282e` etc. (the old teal palette the spec describes replacing), but it's never the
   one that actually renders: any element either has a `[data-theme="..."]` attribute (one
   of the six named themes wins) or doesn't (`:root:not([data-theme])` wins — same
   specificity as plain `:root`, but declared later in the file, so it always overrides
   it). There is no code path where the plain `:root` block is the one a user sees.
2. **`index.css:3144` is not a duplicate of `index.css:6`.** It's the
   `:root:not([data-theme])` block, added later, labeled "Phase 1: Calm literary operating
   system" — `--bg-main: #101211`, `--bg-nav: #171918`, `--accent: #b8aa79` (near-black,
   warm gold/olive accent). This is the palette that actually renders as the app's default
   today, and it's already a full theme swap away from the `#0d282e` teal the spec assumed
   it was patching.

Given that, the manuscript editor redesign (this directory's other files) adds the six new
tokens below to **all seven** themes — the six named ones plus this Phase-1 default — tuned
to each theme's *existing* colors. It does not change any theme's base palette. See
`src/index.css` around `:root:not([data-theme])` (currently ~line 3144) for the six tokens
actually landed there.

There's also a leftover empty `:root:not([data-theme]) {}` block a bit earlier in the file
(currently ~line 127, right after a comment claiming the fallback "inherits the Tropical
palette" — also no longer true). Worth deleting whenever someone next touches this area;
harmless as-is, just dead and confusing.

## The palette itself, if/when someone wants to ship it site-wide

From the handoff spec §2.2, unedited:

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

## What actually has to change to ship it

This is a **site-wide** default-theme swap, not a manuscript-editor change — `--bg-main`,
`--text-main`, `--accent`, etc. are consumed everywhere (dashboard, `.studio-shell`,
settings, every other screen), not just inside `.ms-*` rules. Before landing it:

1. **Replace the core tokens** in the `:root:not([data-theme])` block (~line 3144) with the
   values above. `--border` and `--border-strong` go from solid hex to translucent
   `rgba(255,255,255,...)` in this palette — check every rule that assumes `--border` is an
   opaque color (e.g. anything layering a semi-transparent fill *under* a border and
   expecting the border to fully occlude it).
2. **Recompute the atmosphere/studio-derived literals in the same block.** The current
   Phase-1 block hard-codes secondary hex values inside `color-mix()` calls that were tuned
   to *that* palette — e.g. `--studio-wood: color-mix(in srgb, var(--bg-main) 76%, #2b2117
   24%)`, `--studio-paper: color-mix(in srgb, var(--bg-nav) 62%, #d6c0a0 38%)`, `--paper:
   color-mix(in srgb, var(--bg-nav) 74%, #6e593d 26%)`, plus `--studio-wood-dark`,
   `--studio-paper-strong`, `--studio-paper-line`, `--studio-cork`. Swapping `--bg-main`/
   `--bg-nav` without re-tuning those literal mix targets will look muddy or mismatched —
   these need fresh values picked against the new `#0e1a18`/`#132220` base, the same way
   each of the six named themes has its own `--atmos-*` set.
3. **Re-verify contrast.** `--accent-text: #f0a180` against the new `--bg-nav: #132220` and
   `--prose-text: #f2ece0` against `--bg-main: #0e1a18` — both should clear comfortably
   given how light they are, but confirm rather than assume once the surrounding tokens are
   in.
4. **Delete the dead blocks** while in there: the empty `:root:not([data-theme]) {}` at
   ~line 127, and decide whether the unreachable plain `:root` at line 6 should be deleted
   or repurposed as the real fallback (its current values are the old `#0d282e` teal, which
   nothing currently reads).
5. Load all seven themes and spot-check the theme picker / account settings screen, not
   just the manuscript editor — this is the one change in the whole redesign that isn't
   scoped to `.ms-*`.
