import { loadValue, writeItem, removeItem } from '../storage/projectStorage'
import { TABLE_CONFIG, conflictFields } from './cloudSyncReconcile'

// Durable, per-account list of records edited on this device that the cloud has not acknowledged
// ("dirty"). It is what lets login recovery decide record by record whose copy is newer, instead of
// guessing from a timestamp and republishing a whole snapshot (audit YOW-04). Shape:
// { [table]: { [recordId]: { baseRevision? } } }. A missing key means tracking has never run for this
// account on this device (callers then fall back to the older heuristic).
const dirtyKey = owner => `nf_dirtyRecords:${owner}`

export function loadDirtyRecords(owner) {
  if (!owner) return null
  const stored = loadValue(dirtyKey(owner), null)
  return stored && typeof stored === 'object' ? stored : null
}

export function clearDirtyRecords(owner) {
  if (!owner) return
  try { removeItem(dirtyKey(owner)) } catch { /* storage unavailable */ }
}

export function setDirtyTable(owner, table, entries) {
  if (!owner) return
  const current = loadDirtyRecords(owner) || {}
  const next = { ...current }
  if (entries && Object.keys(entries).length) next[table] = entries
  else delete next[table]
  try { writeItem(dirtyKey(owner), JSON.stringify(next)) } catch { /* a failed local write is reported by the storage layer */ }
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Builds the data to show on login: the cloud copy, with this device's dirty records laid over it.
// Records that are NOT dirty always come from the cloud (so records deleted or updated elsewhere are
// not resurrected from stale local data). A dirty record wins over a cloud copy that differs, and that
// cloud copy is kept as a visible conflict, so neither side is silently lost. `pushes` lists what must
// still be sent to the cloud. Dirty scenes are pushed through the revision-checked scene save, which
// preserves a conflict copy if the cloud scene moved on; their base revision comes from the dirty entry.
export function overlayDirtyRecords(cloudData = {}, localData = {}, dirty = {}, options = {}) {
  const now = options.now || Date.now()
  const conflictId = options.conflictId || (() => Math.random().toString(36).slice(2) + Date.now().toString(36))
  const data = { ...cloudData }
  const conflicts = []
  const pushes = {}

  Object.entries(TABLE_CONFIG).forEach(([table, config]) => {
    const dirtyIds = dirty?.[table]
    if (!dirtyIds || !Object.keys(dirtyIds).length) return
    const cloudItems = Array.isArray(cloudData[config.key]) ? cloudData[config.key] : []
    const localById = new Map((Array.isArray(localData[config.key]) ? localData[config.key] : []).filter(item => item?.id != null).map(item => [item.id, item]))
    const cloudById = new Map(cloudItems.filter(item => item?.id != null).map(item => [item.id, item]))
    const result = cloudItems.map(item => item)

    Object.keys(dirtyIds).forEach(id => {
      const local = localById.get(id)
      if (!local) return
      const cloud = cloudById.get(id)
      if (cloud && sameJson(local, cloud)) return
      if (cloud) {
        const index = result.findIndex(item => item?.id === id)
        result[index] = local
        if (table !== 'scenes') {
          conflicts.push({
            id: conflictId(),
            table,
            recordId: id,
            label: config.label,
            name: local?.name || local?.title || 'Untitled',
            mine: local,
            theirs: cloud,
            fields: conflictFields(local, cloud),
            detectedAt: now,
            source: 'unsynced-local-recovery',
          })
        }
      } else {
        result.push(local)
      }
      ;(pushes[table] ||= []).push(id)
    })
    data[config.key] = result
  })

  return { data, conflicts, pushes }
}
