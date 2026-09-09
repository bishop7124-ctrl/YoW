# Map builder backup — 8 September 2026

Captured before the rebuild, including uncommitted map changes. Base commit: `2283f87035a82efeb63df4368a51a53bf7dd9bfb`.

Archive SHA-256: `8435f8c6cdc3c8d9d8e318c2f33fb00ea021103854c6d1643f1881f69d85204e`.

Contains `src/components/Map/`, plus reference snapshots of `src/index.css` and `src/store/useStore.js`. No user map data is changed or removed by this backup.

## Revert the builder

The original implementation remains at `src/components/Map/YOWMapBuilder.jsx`. To revert the default entry, change `src/components/Map/MapBuilder.jsx` back to:

```jsx
export { default } from './YOWMapBuilder'
```

For an exact source restore, extract the archive into a temporary directory and copy only `src/components/Map/` back after reviewing changes. Do not overwrite the shared stylesheet or store; their archived copies are reference snapshots and may contain unrelated newer work. Retain the new files and map data if switching back so the new maps can be reopened later.
