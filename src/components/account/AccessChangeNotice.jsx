import { useState } from 'react'
import { exportAllProjects } from '../../utils/projectExportAll'

export function BackupAllButton({ store, novels }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const download = async () => {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const results = await exportAllProjects(store, novels, 'zip')
      const failed = results.filter(result => !result.ok).length
      setMessage(failed ? `${failed} project backups failed. Please retry before removing any projects.` : 'Project backups downloaded.')
    } catch {
      setMessage('Backup download failed. Please retry before removing any projects.')
    } finally { setBusy(false) }
  }
  return <span>
    <button type="button" className="membership-toast-link" disabled={busy || !novels?.length} onClick={download}>
      {busy ? 'Preparing backups…' : 'Download all project backups'}
    </button>
    {message && <span role="status">{message}</span>}
  </span>
}

export default function AccessChangeNotice({ membership, store, desktopApp, onManageMembership }) {
  const [dismissed, setDismissed] = useState(null)
  const noticeKey = `${membership.isBetaNoticeActive}:${membership.isBetaExpired}:${membership.usesFreeCloudLimits}:${membership.betaDaysRemaining}`
  const freeCloud = membership.usesFreeCloudLimits && !desktopApp
  if (dismissed === noticeKey) return null
  if (!membership.isBetaNoticeActive && !membership.isBetaExpired && !freeCloud) return null
  return <div role="status" className="membership-toast" style={{ zIndex: 900, color: 'var(--text-main)' }}>
    <span>{membership.isBetaNoticeActive
      ? `Your beta access ends in ${membership.betaDaysRemaining} days. Full web access continues until then; desktop downloads are not included. Upgrade to continue, or your account will move to Free.`
      : 'Your web account uses Free limits: one editable project and 250 MB. Download all project backups before choosing what to keep or removing projects. Other projects remain available to read and export.'}</span>
    <button type="button" className="membership-toast-link" onClick={() => setDismissed(noticeKey)}>Dismiss reminder</button>
    <BackupAllButton store={store} novels={store.novels} />
    <button type="button" className="membership-toast-link" onClick={onManageMembership}>
      {membership.isCloudFreeFallback ? 'Renew Cloud Mode' : 'Membership options'}
    </button>
  </div>
}
