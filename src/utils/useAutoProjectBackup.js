import { useEffect, useRef } from 'react'
import { readItem, writeItem } from '../storage/projectStorage'
import { runAutoBackupIfDue } from './projectBackups'

const CHECK_EVERY_MS = 30 * 60 * 1000

// Automatic daily or weekly project snapshots, owned by the app instead of the Project Settings dialog (audit
// AUD-08). Checks when a project opens, when the tab or window regains focus, and every half hour, so a day or week
// boundary is noticed whether or not settings are ever opened. The decision uses the elapsed time since the last
// snapshot recorded on the project.
export function useAutoProjectBackup(store) {
  const latest = useRef(store)
  useEffect(() => { latest.current = store })
  const projectId = store?.activeNovelId

  useEffect(() => {
    if (!projectId) return undefined
    const check = () => {
      const current = latest.current
      if (!current || current.activeNovelId !== projectId || document.visibilityState === 'hidden') return
      runAutoBackupIfDue({
        novel: current.activeNovel,
        getProjectExportData: current.getProjectExportData,
        readItem, writeItem,
        updateNovel: current.updateNovel,
      })
    }
    // Let the project finish loading before the first check.
    const first = setTimeout(check, 5000)
    const timer = setInterval(check, CHECK_EVERY_MS)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [projectId])
}
