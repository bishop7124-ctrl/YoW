import { replaceUserData } from './firestoreSync'
import { saveLocalFirstSnapshot } from './storageMode'
import { pruneSaveDataToProjects } from './syncSummary'

export async function persistReviewedCloudSyncResume(userId, mergedData, options = {}) {
  const reviewedData = pruneSaveDataToProjects(mergedData || {})
  const replaceData = options.replaceUserData || replaceUserData
  const trackSync = options.trackSync
  const write = replaceData(userId, reviewedData)
  await (typeof trackSync === 'function' ? trackSync(write) : write)
  saveLocalFirstSnapshot(userId, reviewedData)
  return reviewedData
}
