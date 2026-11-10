import { useEffect, useState } from 'react'
import { fetchRemoteBuild, isNewBuild } from './versionCheck'

const CHECK_EVERY_MS = 10 * 60 * 1000
const MIN_GAP_MS = 60 * 1000
const clock = () => Date.now()

// True once the site has a newer build than the one this tab is running. Checks every ten minutes while the tab
// is open and whenever it comes back to the foreground (at most once a minute). Never turns itself off again.
export function useNewVersionAvailable(currentBuild, { enabled = true, fetchBuild = fetchRemoteBuild } = {}) {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!enabled || !currentBuild || available) return undefined
    let cancelled = false
    let lastCheck = clock()
    const check = async () => {
      lastCheck = clock()
      const remote = await fetchBuild()
      if (!cancelled && isNewBuild(currentBuild, remote)) setAvailable(true)
    }
    const timer = setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && clock() - lastCheck >= MIN_GAP_MS) check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [currentBuild, enabled, available, fetchBuild])
  return available
}
