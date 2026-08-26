# "Dark refined" as the site-wide default theme — applied

Applied 2026-08-17 as a whole-site default-theme overhaul. A rollback copy of the previous
`src/index.css` iteration is preserved at
`docs/design/backups/index.css.pre-dark-refined-overhaul.2026-08-17.css`.

## What changed

The old Phase 1 default (`--bg-main: #101211`, `--bg-nav: #171918`, warm gold accent) has
been replaced by the handoff spec's dark refined palette in both default token locations:
the plain `:root` fallback near the top of `src/index.css` and the later
`:root:not([data-theme])` block. The actual app default preset is now `dark-refined`.
The previous Tropical palette remains available as its own `tropical` preset, and a
`light-refined` counterpart is available as the paired light option. The stale empty
`:root:not([data-theme]) {}` fallback near the top of the file was removed.

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
  --accent:       #9c4935;
  --accent-fade:  rgba(156, 73, 53, 0.14);
  --accent-text:  #d99a7d;
  --accent-2:     #9db07a;
  --accent-contrast: #1a1210;
  --prose-text:   #f2ece0;
}
```

The default theme's atmosphere/studio values were also retuned away from the old Phase 1
warm paper/wood literals so dashboard, studio, and workspace surfaces harmonize with the
new green-black base instead of mixing against the previous gold/olive palette. Static
marketing CSS was moved to the same Dark Refined token values so public pages match the
app default.

## QA notes

This is a **site-wide** default-theme swap, not a manuscript-editor-only change —
`--bg-main`, `--text-main`, `--accent`, `--border`, and related tokens are consumed across
the dashboard, `.studio-shell`, settings, public/app surfaces, and editor chrome.

Checks to keep with this change:

1. Build CSS successfully.
2. Confirm contrast for `--accent-text: #d99a7d` on `--bg-nav: #132220` and
   `--prose-text: #f2ece0` on `--bg-main: #0e1a18`.
3. Spot-check the default theme on dashboard, project overview, manuscript editor, account
   settings/theme picker, and at least one modal.
4. Spot-check the named themes to ensure the shared root changes did not create
   unresolved variables or visual regressions.
5. If the new default feels wrong at scale, restore the backup copy listed above or revert
   the token changes in `src/index.css`.
