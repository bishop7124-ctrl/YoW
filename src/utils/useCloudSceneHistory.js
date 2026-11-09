import { useEffect } from 'react'
import { useFeatureFlag } from './useFeatureFlag'
import { configureCloudSceneVersions } from './cloudSceneVersions'

// Turns cloud scene history on for the signed-in user only when the `cloud_scene_history`
// flag is on AND the account syncs to the cloud. Anything else leaves it off.
export function useCloudSceneHistory(userId, canSyncCloud) {
  const flagOn = useFeatureFlag('cloud_scene_history')
  const enabled = Boolean(flagOn && canSyncCloud && userId)
  useEffect(() => {
    configureCloudSceneVersions({ enabled, userId })
    return () => configureCloudSceneVersions({ enabled: false, userId: null })
  }, [enabled, userId])
}
