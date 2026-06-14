import { useState } from 'react'
import { supabase } from '../../supabase'
import { createProjectZipBlob, getProjectExportFilename, downloadBlob } from '../../utils/projectExport'

export default function MaintenanceLapsedScreen({ store }) {
  const [exporting, setExporting] = useState(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  const novels = store?.novels ?? []

  const handleExport = async (novelId) => {
    setExporting(novelId)
    setError('')
    try {
      const projectData = store.getProjectExportData(novelId)
      if (!projectData) throw new Error('Project data not found')
      const blob = await createProjectZipBlob(projectData)
      downloadBlob(blob, getProjectExportFilename(projectData.project))
    } catch (err) {
      setError(`Export failed: ${err.message}`)
    } finally {
      setExporting(null)
    }
  }

  const handlePayMaintenance = async () => {
    setPaying(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: 'maintenance' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Checkout failed')
      window.location.href = json.url
    } catch (err) {
      setError(err.message)
      setPaying(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-main)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      gap: 0,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>☁️</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-main)' }}>
            Cloud hosting renewal needed
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 460, alignSelf: 'center' }}>
            Your lifetime YOW licence is still yours. Your included cloud hosting period has ended, so full cloud
            account access now requires the annual Cloud Hosting &amp; Storage Renewal.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 460, alignSelf: 'center' }}>
            Not renewing? No problem — you can still export all your data below at no charge.
          </p>
        </div>

        {/* Pay CTA */}
        <div style={{
          background: 'var(--bg-nav)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 15 }}>
              Cloud Hosting &amp; Storage Renewal
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
              £6/year · Restores full access immediately
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4, opacity: 0.7 }}>
              This fee covers ongoing hosting and storage costs only. It may change in future if provider costs materially change.
            </div>
          </div>
          <button
            onClick={handlePayMaintenance}
            disabled={paying}
            style={{
              padding: '10px 22px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              border: 'none',
              cursor: paying ? 'wait' : 'pointer',
              opacity: paying ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {paying ? 'Redirecting…' : 'Renew cloud hosting — £6/year'}
          </button>
        </div>

        {error && (
          <p style={{ margin: 0, color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</p>
        )}

        {/* Export section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Export my data
          </div>
          {novels.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>No projects found.</p>
          ) : (
            novels.map(novel => (
              <div key={novel.id} style={{
                background: 'var(--bg-nav)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div style={{ fontWeight: 500, color: 'var(--text-main)', fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {novel.title || 'Untitled project'}
                </div>
                <button
                  onClick={() => handleExport(novel.id)}
                  disabled={exporting === novel.id}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 6,
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-main)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: exporting === novel.id ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {exporting === novel.id ? 'Exporting…' : 'Export ZIP'}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Sign out */}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleSignOut}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
