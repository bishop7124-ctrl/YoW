// Splits a scene's prose (`.content`) out of the account-wide `nf_scenes`
// blob into its own per-scene storage key, so a single keystroke's commit
// only has to serialize and write the one scene actually being edited
// instead of re-stringifying and re-writing every scene in every project on
// the account.
//
// Background (see the 2026-08 typing-lag investigation in docs/ROADMAP.md):
// `nf_scenes` stores every scene across every project as one flat array.
// On a heavy multi-project account that array can run into the low
// single-digit megabytes — and every scene-content commit while typing was
// re-serializing and rewriting the *entire* array, dominated by every
// *other* scene's prose, not the one character that actually changed. That
// cost was flat regardless of which scene or project was being edited,
// because the account-wide blob size is what mattered, not the edited
// scene's own size — exactly why the earlier "shrink the textarea" plan
// (bounding how much content lives in one DOM node) could never have fixed
// it: the cost lived entirely in the storage layer, decoupled from what was
// rendered.
//
// This module keeps the in-memory data model completely unchanged — every
// scene object everywhere in the app (React state, commitLocal's multi-tab
// merge logic, exports, AI tools, word counts) still has a full `.content`
// string, exactly as before. Only the *serialized bytes on disk* are split:
// `nf_scenes` itself stores scene metadata with `.content` stripped out,
// and each scene's prose lives under its own `nf_scene_content:<id>` key.
// splitScenesForStorage()/hydrateScenesFromStorage() are the only two
// functions that need to know about this split; every caller of the
// existing `save('nf_scenes', ...)`/`load('nf_scenes', ...)` pattern keeps
// working unchanged as long as it goes through these first.

import { readItem, writeItem, removeItem, listKeys } from './projectStorage'
import { markLocalReadCorrupt } from './writeDurability'

const CONTENT_KEY_PREFIX = 'nf_scene_content:'
const SCENES_KEY = 'nf_scenes'

export const sceneContentKey = (id) => `${CONTENT_KEY_PREFIX}${id}`

/**
 * Given full scene objects (each with an inline `.content` string, exactly
 * the shape the rest of the app already works with) and the previous
 * in-memory copy of the same collection, writes each scene's content to its
 * own key as needed and returns a metadata-only array (content stripped)
 * suitable for the existing `nf_scenes` key.
 *
 * **A scene's content is only ever safe to strip from the metadata once its
 * own content key is confirmed to hold a copy on disk.** A content key gets
 * written when either of two things is true:
 *  - `touchedByThisUpdate`: this specific commit's own update changed that
 *    scene's content (comparing against `prevScenes`, this tab's own
 *    before/after — never a "differs from what I last wrote" cache, which
 *    would let one tab's stale copy of a scene it never touched clobber
 *    whatever a *different* tab most recently saved for that same scene —
 *    exactly the multi-tab clobber this project's existing per-record merge,
 *    see commitLocal in useStore.js, already exists to prevent for every
 *    other field);
 *  - `!knownContentKeyIds.has(scene.id)`: this scene has never been
 *    individually touched since the split shipped, so nothing has ever
 *    written its content key — a one-time migration write, using this tab's
 *    own current knowledge of that scene's content (`prevScenes`), safe for
 *    the same reason `touchedByThisUpdate` is: it's this tab's own
 *    best-known truth for a record no `externalWrite` rebase has flagged as
 *    changed elsewhere, not a guess from a stale cache.
 *
 * Getting this second condition wrong was a real, live data-loss incident
 * (2026-08-09, see docs/ROADMAP.md): an earlier version of this function
 * stripped content from *every* scene's metadata unconditionally, but only
 * ever wrote a content key for the one scene a given commit actually
 * touched. The very first commit on an account with more than one scene
 * silently discarded the content of every scene that wasn't the one being
 * edited at that moment — both locally and, once that damaged state made it
 * into a subsequent commit, in cloud sync too. `knownContentKeyIds` — not a
 * "has anything changed" cache, but "do we know this scene's key already
 * exists" — is what makes the migration path explicit and unconditional
 * instead of silently assumed.
 *
 * `lastWrittenContentById` and `knownContentKeyIds` are caller-owned
 * Map/Set (a React ref's `.current`, not module-level state — see
 * useStore.js's lastWrittenRawByKeyRef for why: this needs to be
 * per-tab/per-hook-instance so useStore.test.js's multi-tab simulations,
 * and repeated test runs within one file, don't bleed state into each
 * other). `lastWrittenContentById` is used only as a micro-optimization to
 * skip writing the exact same value twice in a row — never as the trigger
 * for whether a write is needed at all.
 */
export function splitScenesForStorage(scenes, prevScenes, lastWrittenContentById, knownContentKeyIds) {
  if (!Array.isArray(scenes)) return scenes
  const prevById = new Map((Array.isArray(prevScenes) ? prevScenes : []).map(s => [s?.id, s]))
  const nextIds = new Set()
  const metadata = scenes.map(scene => {
    if (!scene || typeof scene !== 'object' || scene.id == null) return scene
    nextIds.add(scene.id)
    const content = typeof scene.content === 'string' ? scene.content : ''
    const prevScene = prevById.get(scene.id)
    const touchedByThisUpdate = scene !== prevScene && (!prevScene || prevScene.content !== content)
    const needsContentKey = touchedByThisUpdate || !knownContentKeyIds.has(scene.id)
    if (needsContentKey) {
      if (lastWrittenContentById.get(scene.id) !== content) {
        try {
          writeItem(sceneContentKey(scene.id), content)
          lastWrittenContentById.set(scene.id, content)
        } catch {
          // Write failed (e.g. quota) — do NOT mark this id as known, so
          // the next attempt retries, and keep content inline in the
          // metadata below as a fallback rather than losing it.
          return scene
        }
      }
      knownContentKeyIds.add(scene.id)
    }
    // eslint-disable-next-line no-unused-vars
    const { content: _omit, ...meta } = scene
    return meta
  })
  // A scene id we previously confirmed has a content key but isn't part of
  // this write at all anymore (deleted, or merged away) leaves an orphaned
  // key behind unless cleaned up here.
  knownContentKeyIds.forEach(id => {
    if (!nextIds.has(id)) {
      try { removeItem(sceneContentKey(id)) } catch { /* best effort */ }
      lastWrittenContentById.delete(id)
      knownContentKeyIds.delete(id)
    }
  })
  return metadata
}

/**
 * Reverses splitScenesForStorage: given the metadata-only array read back
 * from `nf_scenes`, re-attaches each scene's content from its own
 * `nf_scene_content:<id>` key so every caller downstream keeps seeing full
 * scene objects exactly as before the split.
 *
 * Safe against pre-split (legacy) data with content still inline on the
 * metadata record itself — trusts it as-is rather than looking for a
 * content key that was never written, and it gets split out normally on
 * the next write. This is also what keeps `runPersistSceneDraft`
 * (manuscriptUtils.js — a separate, unmodified write path that still
 * writes `nf_scenes` with content inline for crash-safety) fully
 * compatible with this split: its writes are read back correctly here,
 * and get normalized into the split format again on the next regular
 * store commit. Also safe against a missing content key for any other
 * reason (falls back to an empty string rather than throwing) so a
 * storage hiccup degrades to "this scene looks empty," never a crash.
 */
export function hydrateScenesFromStorage(metaScenes) {
  if (!Array.isArray(metaScenes)) return metaScenes
  return metaScenes.map(scene => {
    if (!scene || typeof scene !== 'object') return scene
    if (typeof scene.content === 'string' && scene.content.length > 0) return scene
    let content = ''
    try {
      const stored = readItem(sceneContentKey(scene.id))
      if (typeof stored === 'string') content = stored
    } catch { /* fall through with empty content rather than throw */ }
    return { ...scene, content }
  })
}

/**
 * Removes every per-scene content key that belongs to a deleted project —
 * written for audit finding #16 ("Project deletion can leave per-scene
 * keys"). This is deliberately independent of any in-memory scene state
 * (`scenesRef`/React `scenes`): the caller's project-deletion code path
 * (`deleteNovel` in useStore.js) only knows which scenes to filter out of
 * `nf_scenes` via *this tab's own current state*, which can miss a scene
 * whose content key exists on disk but whose id never made it into this
 * tab's tracking this session — a stale/orphan key that then survives the
 * project "forever," even though the user believes the project is gone
 * (storage, privacy, and later-resurrection risk, per the finding).
 *
 * Two independent passes, both reading storage directly rather than trusting
 * memory:
 *  1. **Project-scoped**: reads the persisted `nf_scenes` metadata blob
 *     directly (not `scenesRef.current`) to find every scene id that
 *     actually belongs to `novelId` on disk right now, and removes each
 *     one's content key unconditionally — regardless of whether this tab's
 *     `knownContentKeyIds` ever saw it. This is the authoritative "index"
 *     the fix uses in place of an efficient per-project storage query: since
 *     content keys carry no project id of their own (`nf_scene_content:<id>`
 *     has no `novelId`), `nf_scenes` — which does — is the closest thing to
 *     one already in the schema.
 *  2. **Orphan sweep**: because per-scene content keys carry no project id,
 *     a key left behind by an *earlier* gap in this same cleanup (before
 *     this fix shipped) — i.e. a content key whose scene record is already
 *     gone from `nf_scenes` entirely, under any project — can't be
 *     attributed to `novelId` by the pass above. It has no living owner
 *     anywhere, though, so it's always safe to remove on sight. Project
 *     deletion is a natural, infrequent point to also run this sweep, using
 *     `listKeys` (see projectStorage.js) to enumerate every
 *     `nf_scene_content:*` key actually present in the backend rather than
 *     only ones some in-memory cache already knows about.
 *
 * **Both passes require `nf_scenes` to have actually been read.** If it
 * can't be read/parsed — key absent is fine and legitimately means "no
 * scenes anywhere yet" (handled below without throwing), but a genuine read
 * failure (backend unavailable) or corrupt JSON is not the same thing as
 * "zero scenes exist" — this function aborts entirely rather than guessing.
 * A prior version of this function treated any read/parse failure as an
 * empty `nf_scenes`, which made `liveIds` an empty set and turned the
 * orphan sweep into "delete every `nf_scene_content:*` key on the account,"
 * including every *other* project's scene prose — a real data-loss bug
 * caught in security review (see docs/ROADMAP.md, audit finding #16). See
 * projectStorage.js's `loadValue`/`markLocalReadCorrupt` for the same
 * corrupt-vs-absent distinction used elsewhere, and indexedDbBackend.js /
 * audit finding P0-07 for why an unreadable local value is a real,
 * anticipated scenario here, not just a theoretical one.
 *
 * `caches` (optional) lets the caller's own per-tab `knownContentKeyIds`/
 * `lastWrittenContentById` (see splitScenesForStorage's own doc comment)
 * stay in sync with what this function removes, so a later commit in the
 * same tab doesn't have stale bookkeeping for an id that no longer exists.
 *
 * Returns the full set of scene ids whose content key was removed (project
 * ids first, then any orphan ids), so a caller that also needs to clean up
 * a *different* per-scene store (e.g. scene version history, keyed by
 * `sceneId` — see sceneVersions.js's `clearSceneVersionsForNovel`) doesn't
 * have to re-derive the same id list.
 */
export function deleteAllSceneContentForNovel(novelId, caches = {}) {
  const { knownContentKeyIds, lastWrittenContentById } = caches
  let metadata
  try {
    const raw = readItem(SCENES_KEY)
    const parsed = raw == null ? [] : JSON.parse(raw)
    metadata = Array.isArray(parsed) ? parsed : []
  } catch (error) {
    // Genuinely unreadable/corrupt `nf_scenes` — NOT the same as "no scenes
    // exist" (see doc comment above). With no trustworthy metadata there is
    // no safe way to tell which content keys belong to `novelId`, nor which
    // ones are truly orphaned account-wide, so both the project-scoped
    // removal and the orphan sweep abort rather than risk deleting live
    // content that just happens to look unreferenced from here.
    markLocalReadCorrupt(SCENES_KEY)
    console.error(`[sceneContentStore] "${SCENES_KEY}" could not be read/parsed — aborting deleteAllSceneContentForNovel's storage sweep instead of risking deletion of live scene content.`, error)
    return []
  }
  const liveIds = new Set(metadata.map(s => s?.id).filter(id => id != null))
  const projectIds = novelId == null
    ? []
    : metadata.filter(s => s && s.novelId === novelId).map(s => s.id).filter(id => id != null)

  const removedIds = []
  const removeContentKey = (id) => {
    try { removeItem(sceneContentKey(id)) } catch { /* best effort */ }
    knownContentKeyIds?.delete(id)
    lastWrittenContentById?.delete(id)
    removedIds.push(id)
  }

  projectIds.forEach(removeContentKey)

  // Orphan sweep — see doc comment above. Runs after the project-scoped pass
  // so its own now-removed keys no longer appear in `listKeys`'s result.
  //
  // KNOWN CROSS-TAB RACE (security review finding, docs/ROADMAP.md audit
  // finding #16 — deferred to live QA, see docs/QA_PLAN.md): a scene edit
  // broadcasts its content-key write and its `nf_scenes` metadata write to
  // other tabs as two separate BroadcastChannel messages in sequence (see
  // browserVaultAdapter.js's wireCrossTabSync and the shared `mirror` in
  // indexedDbBackend.js). If this sweep runs *in a different tab* inside the
  // narrow window after that tab's mirror has applied the new content-key
  // message but before it applies the corresponding `nf_scenes` message, the
  // new scene's id is briefly missing from `liveIds` above even though it's
  // genuinely live under an unrelated, undeleted project — and this sweep
  // would delete its just-written content. Narrow (same-origin tabs, mid-
  // edit-and-delete race) and not closed by this fix: closing it fully would
  // mean making the two broadcasts atomic (a bigger change to the cross-tab
  // sync mechanism than this fix's scope), so it's left as a documented risk
  // rather than a rushed redesign.
  listKeys(CONTENT_KEY_PREFIX).forEach(key => {
    const id = key.slice(CONTENT_KEY_PREFIX.length)
    if (liveIds.has(id)) return // still belongs to a live scene in some project
    removeContentKey(id)
  })

  return removedIds
}
