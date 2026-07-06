import YOWLogo from '../brand/YOWLogo'

// Shown in the desktop app when a signed-in account has no desktop
// entitlement (Free/Monthly/trial). Deliberately a clear, working state with
// an upgrade path — never a broken app (PRD Phase 4).

const SITE_URL = import.meta.env.VITE_DESKTOP_API_BASE_URL || 'https://www.yourownworld.co.uk'

const openExternal = (url) => {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke
  if (invoke) {
    invoke('open_external_url', { url }).catch(() => {})
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

export default function DesktopUpgradeWall({ user, onSignOut }) {
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex flex-col items-center justify-center gap-5 p-8 text-center">
      <span className="w-14 h-14 text-[var(--accent)]"><YOWLogo /></span>
      <div>
        <p className="eyebrow" style={{ marginBottom: 10 }}>Desktop app</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-main)', marginBottom: 10 }}>
          The desktop app comes with Lifetime
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, margin: '0 auto', lineHeight: 1.65 }}>
          Your account ({user?.email}) is on a browser plan. The YOW desktop app — with its
          local project vault and permanent Local Mode — is part of the Lifetime and Founder
          tiers. Your projects are safe and waiting in your browser workspace.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => openExternal(`${SITE_URL}/pricing`)}
        >
          View Lifetime plans
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => openExternal(`${SITE_URL}/dashboard`)}
        >
          Open YOW in your browser
        </button>
        <button type="button" className="btn btn-secondary" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Already upgraded? Sign out and back in to refresh your membership.
      </p>
    </div>
  )
}
