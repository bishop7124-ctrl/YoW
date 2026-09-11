# Fantasy map ink artwork

Original, code-authored vector illustrations inspired by the supplied fantasy-cartography references. These are layered SVG paths, not extracted stock images or generated bitmap assets. No Paint application was used.

Each SVG contains editable paper silhouettes, solid ink shadows, fine detail, paper highlights, and ground marks. They can be opened in a vector drawing application. The application uses these same paths inline so resizing stays sharp and exported maps remain self-contained.

Contours receive a subtle deterministic pen variation from `src/components/Map/atlasOrganicInk.js`, shared across all layers so their edges stay aligned. Exported SVGs already contain those curves.

The source of truth is `src/components/Map/atlasInkArtwork.js`. After editing that source, run `node scripts/export-map-ink-art.mjs` to regenerate these standalone files. Editing these exported SVGs alone does not change the app.

Previous artwork is preserved in `recovery/map-builder-2026-09-09/`. The original builder backup remains in `recovery/map-builder-2026-09-08/`.

See `docs/ROADMAP.md` for status and `docs/QA_PLAN.md` for remaining product acceptance.
