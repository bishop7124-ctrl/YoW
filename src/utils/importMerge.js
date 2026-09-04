// ── Import-into-existing-project merge helpers ──────────────────────────────
//
// Pure, store-agnostic helpers backing the "Import into existing project"
// destination option in AIImportModal.jsx: duplicate detection (case-
// insensitive, trimmed name/title match), the four per-category resolution
// policies (skip / merge / replace / createSeparate), and a small compensating-
// action undo stack that gives the actual import a transaction-like rollback
// on failure — without needing bulk collection setters the store doesn't
// expose. Kept side-effect-free (aside from running caller-supplied
// functions) so it's unit-testable without standing up the full useStore
// hook. See AIImportModal.jsx (populateYowProjectIntoExisting /
// populateProjectIntoExisting) for how these are wired to real store calls.

export function matchKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

// Treated as "empty" for merge purposes: undefined/null, blank/whitespace
// strings, and empty arrays. Note 0 and false are NOT empty — a populated
// falsy value must never be clobbered by "Merge".
export function isEmptyValue(v) {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

// Find the destination record (if any) whose name/title matches the source
// record's, case-insensitively and trimmed. `getName` extracts the
// comparable field (e.g. `x => x.name` or `x => x.title`).
export function findDuplicate(destItems, sourceItem, getName) {
  const key = matchKey(getName(sourceItem))
  if (!key) return null
  return (destItems || []).find(d => matchKey(getName(d)) === key) || null
}

// Preview-time duplicate analysis for one category — no writes, just the
// matched pairs and counts driving the "N new · M match an existing record"
// summary shown before the user commits.
export function analyzeCategory(sourceItems, destItems, getName) {
  const matches = []
  const newItems = []
  for (const item of sourceItems || []) {
    const dest = findDuplicate(destItems, item, getName)
    if (dest) matches.push({ source: item, dest })
    else newItems.push(item)
  }
  return { newItems, matches, newCount: newItems.length, duplicateCount: matches.length }
}

// Fields present on `source` that are empty/falsy on `dest` — used by the
// "Merge" policy, which must never overwrite a field the destination record
// already has populated.
export function computeMergePatch(dest, source, omitKeys = []) {
  const patch = {}
  for (const [k, v] of Object.entries(source || {})) {
    if (omitKeys.includes(k)) continue
    if (isEmptyValue(v)) continue
    if (!isEmptyValue(dest?.[k])) continue
    patch[k] = v
  }
  return patch
}

// A tiny LIFO undo stack. Each successful write during an import pushes a
// compensating action; on failure undoAll() replays them in reverse so a
// half-applied import leaves the destination project exactly as it was
// found — the scoped-collection equivalent of the existing new-project
// path's `store.deleteNovel(id)` rollback. A failure inside one compensating
// action is swallowed (best-effort) so it can't stop the rest of the
// rollback from running.
export function createUndoStack() {
  const stack = []
  return {
    push(undoFn) { stack.push(undoFn) },
    get length() { return stack.length },
    undoAll() {
      while (stack.length) {
        const fn = stack.pop()
        try { fn() } catch { /* best-effort rollback — keep unwinding */ }
      }
    },
  }
}

export const RESOLUTION_POLICIES = ['skip', 'merge', 'replace', 'createSeparate']

// Resolve one source record against its (possibly absent) destination match:
//   - no destMatch            → always create
//   - policy 'createSeparate' → always create, even though a name match exists
//   - policy 'skip' (default) → leave the destination record untouched
//   - policy 'merge'          → fill only empty/falsy fields on the dest record
//   - policy 'replace'        → overwrite the dest record's fields from source
//
// `create()` and `update(id, patch)` are supplied by the caller, perform the
// actual store write, and are expected to register their own undo action —
// this function only decides which one to call and with what patch.
export function applyDuplicateResolution({ policy, destMatch, sourceFields, create, update }) {
  if (!destMatch || policy === 'createSeparate') {
    const id = create()
    return { action: 'create', id }
  }
  if (policy === 'merge') {
    const patch = computeMergePatch(destMatch, sourceFields)
    if (Object.keys(patch).length === 0) return { action: 'skip', id: destMatch.id }
    update(destMatch.id, patch)
    return { action: 'merge', id: destMatch.id, patch }
  }
  if (policy === 'replace') {
    update(destMatch.id, sourceFields)
    return { action: 'replace', id: destMatch.id, patch: sourceFields }
  }
  // 'skip', or an unrecognized policy — fall back to the safe choice.
  return { action: 'skip', id: destMatch.id }
}

export function emptySummary() {
  return { new: 0, skipped: 0, merged: 0, replaced: 0 }
}

// Tally helper for the running "N new, M skipped, K merged, J replaced" summary.
export function tallyAction(summary, action) {
  if (action === 'create') summary.new++
  else if (action === 'skip') summary.skipped++
  else if (action === 'merge') summary.merged++
  else if (action === 'replace') summary.replaced++
  return summary
}
