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

const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

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
      if (!jsonEq(expectedItem, actual.get(id))) throw new Error(`Cloud Sync resume did not persist ${key} ${id}.`)
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
