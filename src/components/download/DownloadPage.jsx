import { useEffect, useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { supabase } from '../../supabase'

// Desktop app download page (/download). Lifetime and Founder members only —
// everyone else sees a sign-in or upgrade prompt. The installer links are
// fetched from the entitlement-gated API, never embedded in the bundle.

const PLATFORM_HINTS = {
  macos: 'macOS 12 or later · Apple Silicon',
  windows: 'Windows 10 or later · 64-bit',
}

function PlatformIcon({ platform }) {
  if (platform === 'macos') {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
      <path d="M3 5.55l7.36-1.01v7.1H3V5.55zM3 18.45l7.36 1.01v-7.01H3v6zM11.17 19.57L21 20.92v-8.47h-9.83v7.12zM11.17 4.43v7.21H21V3.08l-9.83 1.35z" />
    </svg>
  )
}

function StatusPanel({ title, body, children }) {
  return (
    <section style={{
      textAlign: 'center', padding: '48px 32px',
      border: '1px solid var(--border)', borderRadius: 16,
      background: 'var(--bg-card)',
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{title}</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: children ? 24 : 0, fontSize: 15, maxWidth: 440, margin: children ? '0 auto 24px' : '0 auto' }}>
        {body}
      </p>
      {children}
    </section>
  )
}

export default function DownloadPage({ user, membership, authLoading, onLogin, onGetStarted }) {
  const entitled = !!user && !!membership?.isLifetime
  const [links, setLinks] = useState(null)
  const [linksError, setLinksError] = useState(false)
  const [linksLoading, setLinksLoading] = useState(false)

  useEffect(() => {
    if (!entitled) return
    let cancelled = false
    setLinksLoading(true)
    setLinksError(false)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const endpoint = import.meta.env.VITE_GET_DOWNLOAD_LINKS_URL || '/api/get-download-links'
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const data = await res.json()
        if (!cancelled) setLinks(data)
      } catch (err) {
        console.error('[DownloadPage]', err)
        if (!cancelled) setLinksError(true)
      } finally {
        if (!cancelled) setLinksLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [entitled])

  const renderContent = () => {
    if (authLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }

    if (!user) {
      return (
        <StatusPanel
          title="Sign in to access downloads"
          body="The YOW desktop app is available to Lifetime and Founder members. Sign in to your account to download it."
        >
          <button type="button" className="btn btn-primary" onClick={onLogin}>
            Log in
          </button>
        </StatusPanel>
      )
    }

    if (!entitled) {
      return (
        <StatusPanel
          title="Available on Lifetime and Founder plans"
          body="The desktop app — with its local project vault and permanent Local Mode — is part of the Lifetime and Founder tiers. Upgrade to download it."
        >
          <a href="/pricing/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            View plans
          </a>
        </StatusPanel>
      )
    }

    if (linksLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }

    if (linksError || !links?.platforms?.length) {
      return (
        <StatusPanel
          title="Your builds are being prepared"
          body="Your Lifetime licence includes the desktop app. The installers aren't available for download just yet — check back here soon."
        >
          <a href="mailto:support@yourownworld.co.uk" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Contact support
          </a>
        </StatusPanel>
      )
    }

    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {links.platforms.map(platform => (
            <a
              key={platform.key}
              href={platform.url}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14,
                padding: '28px 26px', border: '1px solid var(--border)', borderRadius: 16,
                background: 'var(--bg-card)', textDecoration: 'none', color: 'var(--text-main)',
              }}
            >
              <span style={{ color: 'var(--accent)' }}><PlatformIcon platform={platform.key} /></span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>Download for {platform.label}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {PLATFORM_HINTS[platform.key] || 'Desktop installer'}
              </span>
              <span className="btn btn-primary btn-sm" style={{ marginTop: 6 }}>Download</span>
            </a>
          ))}
        </div>
        {links.version && (
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-muted)' }}>
            Version {links.version}
          </p>
        )}
        {links.platforms.some(p => p.key === 'macos') && (
          <div style={{
            marginTop: 28, padding: '20px 24px',
            border: '1px solid var(--border)', borderRadius: 12,
            background: 'var(--bg-card)',
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
              First launch on macOS — one-time step
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              This beta build isn't yet notarized with Apple, so macOS blocks the first launch — sometimes silently.
              If YOW doesn't open, that's the block, not a broken download.
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8, listStyle: 'decimal' }}>
              <li>Unzip the download and drag <strong>YOW</strong> into <strong>Applications</strong>.</li>
              <li>Double-click YOW once. If it's blocked or nothing happens, continue to the next step.</li>
              <li>Open <strong>System Settings → Privacy &amp; Security</strong>, scroll to the bottom, and click <strong>Open Anyway</strong> next to the YOW message, then confirm.</li>
            </ol>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              After that, YOW opens normally with a double-click.
            </p>
          </div>
        )}
        {links.platforms.some(p => p.key === 'windows') && (
          <div style={{
            marginTop: 28, padding: '20px 24px',
            border: '1px solid var(--border)', borderRadius: 12,
            background: 'var(--bg-card)',
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
              First launch on Windows — one-time step
            </p>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              This beta build isn't yet signed with a Windows code-signing certificate, so SmartScreen shows a
              warning on the installer. That's the warning, not a broken download.
            </p>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.8, listStyle: 'decimal' }}>
              <li>Run the downloaded installer. If SmartScreen shows "Windows protected your PC", continue to the next step.</li>
              <li>Click <strong>More info</strong>, then click <strong>Run anyway</strong>.</li>
              <li>Follow the installer prompts. If WebView2 isn't already installed, it downloads automatically during setup.</li>
            </ol>
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              After that, YOW opens normally from the Start menu.
            </p>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">
      <MarketingNav activePath="/download/" onLogin={onLogin} onGetStarted={onGetStarted} user={user} />

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '80px 0 56px' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>Desktop app</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.75rem)', fontWeight: 800, lineHeight: 1.2, marginBottom: 16 }}>
            Download Your Own World
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 480, margin: '0 auto' }}>
            Write with a true local project vault on your own device. Exclusive to Lifetime and Founder members.
          </p>
        </section>

        {renderContent()}

      </main>
      <MarketingFooter />
    </div>
  )
}
