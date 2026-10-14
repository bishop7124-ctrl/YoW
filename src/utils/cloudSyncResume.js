import { loadUserData, replaceUserData } from './firestoreSync'
import { saveLocalFirstSnapshot } from './storageMode'
import { pruneSaveDataToProjects } from './syncSummary'

const RECORD_KEYS = [
  'novels',
  'series',
  'characters',
  'factions',
  'locations',
  'timeline',
  'worldHistory',
  'acts',
  'chapters',
  'scenes',
  'loreEntries',
  'ideaEntries',
  'maps',
  'whiteboards',
  'storySchedule',
  'rpgCharacters',
  'comicPages',
  'comicPanels',
  'eras',
]

// Compare by value, not by key order: the database stores records as JSONB,
// which does not preserve the order the app wrote the keys in.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]))
  }
  return value
}
const jsonEq = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

// Names (never values) of the top-level fields that differ, so a failed
// verification says what to look at without writing manuscript text anywhere.
function differingFields(expected, actual) {
  if (!actual) return ['(record missing in cloud)']
  const keys = new Set([...Object.keys(expected || {}), ...Object.keys(actual || {})])
  return [...keys].filter(k => !jsonEq(expected?.[k], actual?.[k])).sort()
}

function byId(items = []) {
  return new Map((Array.isArray(items) ? items : []).map(item => [item.id, item]))
}

function assertCloudMatchesReviewedData(cloudData, reviewedData) {
  const normalizedCloud = pruneSaveDataToProjects(cloudData || {})
  for (const key of RECORD_KEYS) {
    const expected = byId(reviewedData[key])
    const actual = byId(normalizedCloud[key])
    if (expected.size !== actual.size) throw new Error(`Cloud Sync resume did not persist ${key}.`)
    for (const [id, expectedItem] of expected) {
      if (!jsonEq(expectedItem, actual.get(id))) {
        throw new Error(`Cloud Sync resume did not persist ${key} ${id} (differs in: ${differingFields(expectedItem, actual.get(id)).join(', ') || 'unknown'}).`)
      }
    }
  }
  if (normalizedCloud.activeNovelId !== reviewedData.activeNovelId) {
    throw new Error('Cloud Sync resume did not persist the active project.')
  }
  if (!jsonEq(normalizedCloud.activeMapByNovel || {}, reviewedData.activeMapByNovel || {})) {
    throw new Error('Cloud Sync resume did not persist map settings.')
  }
}

export async function persistReviewedCloudSyncResume(userId, mergedData, options = {}) {
  const reviewedData = pruneSaveDataToProjects(mergedData || {})
  const replaceData = options.replaceUserData || replaceUserData
  const loadData = options.loadUserData || loadUserData
  const trackSync = options.trackSync
  const write = (async () => {
    await replaceData(userId, reviewedData)
    assertCloudMatchesReviewedData(await loadData(userId), reviewedData)
  })()
  await (typeof trackSync === 'function' ? trackSync(write) : write)
  saveLocalFirstSnapshot(userId, reviewedData)
  return reviewedData
}

// Backoff for retrying the automatic resume-on-renewal reconcile after a
// failed attempt (offline cold start, network not up yet). `attempt` is the
// number of retries already made; returns null once the budget is spent, after
// which the pending snapshot is kept and the next app launch tries again.
const LAPSE_RESUME_RETRY_DELAYS_MS = [15_000, 60_000, 180_000]

export function getLapseResumeRetryDelayMs(attempt) {
  const delay = LAPSE_RESUME_RETRY_DELAYS_MS[attempt]
  return delay === undefined ? null : delay
}
