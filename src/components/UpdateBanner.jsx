import { useState } from 'react'
import { useNewVersionAvailable } from '../utils/useNewVersionAvailable'
import { isDesktopAppRuntime } from '../utils/runtime'
import { OFFLINE_MODE } from '../utils/offlineMock'

// Shown when the site has been updated while this tab was open. Never reloads by itself: the writer chooses when,
// so nothing they are typing is interrupted. The desktop app has its own updater and never shows this.
export default function UpdateBanner({ currentBuild = import.meta.env.VITE_BUILD_SHA, enabled, fetchBuild }) {
  const allowed = enabled ?? (!OFFLINE_MODE && !isDesktopAppRuntime())
  const available = useNewVersionAvailable(currentBuild, { enabled: allowed, ...(fetchBuild ? { fetchBuild } : {}) })
  const [dismissed, setDismissed] = useState(false)
  if (!available || dismissed) return null
  return (
    <div className="yow-update-banner" role="status">
      <span>A new version of YOW is available. Reload when you reach a good stopping point.</span>
      <button type="button" className="yow-update-banner-btn" onClick={() => window.location.reload()}>Reload</button>
      <button type="button" className="yow-update-banner-later" onClick={() => setDismissed(true)} aria-label="Dismiss until later">Later</button>
    </div>
  )
}
