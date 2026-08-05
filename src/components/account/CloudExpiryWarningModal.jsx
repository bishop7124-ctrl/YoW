import { useState } from 'react'
import { MaintenancePayButton } from './AccountSettings'
import { HOSTING_RENEWAL_FEE_GBP } from '../../utils/membership'
import { exportAllProjects } from '../../utils/projectExportAll'

// Pre-expiry popup for Lifetime (non-Founder) cloud hosting. Shown once per
// warning cycle, on top of — not instead of — the persistent banner in
// Account Settings → Membership. Platform-agnostic on purpose: desktop and
// web both fall back to limited/local access the same way, so both need to
// see this, not just web.
export default function CloudExpiryWarningModal({ membership, store, novels, desktopApp, onClose, onOpenExportSettings }) {
  const [busyFormat, setBusyFormat] = useState('')
  const [progress, setProgress] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const days = membership.maintenanceDaysRemaining
  const list = novels ?? []

  const runExportAll = async (format) => {
    if (!list.length || busyFormat) return
    setBusyFormat(format)
    setMessage('')
    setError('')
    setProgress({ done: 0, total: list.length })
    try {
      const results = await exportAllProjects(store, list, format, {
        onProgress: (done, total) => setProgress({ done, total }),
      })
      const failed = results.filter(r => !r.ok)
      setMessage(failed.length
        ? `Exported ${results.length - failed.length} of ${results.length} projects. Some failed — try again from Storage settings.`
        : `Exported all ${results.length} project${results.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setError(err.message || 'Export failed. Please try again from Storage settings.')
    } finally {
      setBusyFormat('')
      setProgress(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-expiry-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        width: 'min(560px, 100%)',
        background: 'var(--bg-main)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        boxShadow: '0 30px 90px rgba(0,0,0,0.45)',
        padding: '28px',
        color: 'var(--text-main)',
      }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f59e0b' }}>
          Cloud hosting ending soon
        </p>
        <h2 id="cloud-expiry-modal-title" style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 900 }}>
          {typeof days === 'number' ? `${days} day${days !== 1 ? 's' : ''} left on your included Cloud Mode` : 'Your included Cloud Mode is ending soon'}
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {desktopApp
            ? "When it ends, the desktop app switches to Local Mode automatically — your writing stays on this device and nothing is deleted. Cloud sync just pauses until you renew."
            : "When it ends, your web account falls back to Free cloud limits (one project, 3 MB) until you renew Cloud Mode. Nothing is deleted, but it's a good time to grab a full backup."}
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Renew for £{HOSTING_RENEWAL_FEE_GBP}/year to keep hosted sync, storage, and backups — or export everything now just in case.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            type="button"
            style={{ padding: '8px 14px', borderRadius: 7, background: 'none', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', cursor: busyFormat ? 'wait' : 'pointer' }}
            disabled={!list.length || Boolean(busyFormat)}
            onClick={() => runExportAll('zip')}
          >
            {busyFormat === 'zip' && progress ? `Exporting ${progress.done}/${progress.total}…` : 'Export all as ZIP'}
          </button>
          <button
            type="button"
            style={{ padding: '8px 14px', borderRadius: 7, background: 'none', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', cursor: busyFormat ? 'wait' : 'pointer' }}
            disabled={!list.length || Boolean(busyFormat)}
            onClick={() => runExportAll('docx')}
          >
            {busyFormat === 'docx' && progress ? `Exporting ${progress.done}/${progress.total}…` : 'Export all as Word docs'}
          </button>
        </div>
        {message && <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--accent)', fontWeight: 800 }}>{message}</p>}
        {error && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#ef4444', fontWeight: 800 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '9px 16px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Not now
            </button>
            <button
              type="button"
              onClick={onOpenExportSettings}
              style={{ padding: '9px 16px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Storage settings
            </button>
          </div>
          <MaintenancePayButton />
        </div>
      </div>
    </div>
  )
}
