import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { usePageMeta } from '../../utils/usePageMeta'

const FOUNDER_PROFILES = {
  'morgan-bishop': {
    name: 'Morgan Bishop',
    genre: 'Fantasy · World-builder',
    location: 'England (originally from the US)',
    avatar: null,
    emoji: '🌍',
    bio: [
      "Morgan Bishop is an American writer living in England, working on a three-part fantasy series that has been quietly consuming her spare hours for longer than she'd care to admit.",
      "With a degree in English Literature and a background in tech, Morgan occupies that particular overlap between storytelling and systems — the kind of person who builds tools because the existing ones don't quite fit the shape of the world in her head. Your Own World is one of those tools.",
      "She lives with her wife, their son, and a dog who has no interest in narrative structure whatsoever.",
    ],
    series: {
      title: 'Untitled Fantasy Trilogy',
      status: 'In progress',
      description: 'A three-part fantasy series. Details forthcoming — worlds take time.',
    },
    links: [],
  },
}

export default function FounderProfilePage({ slug, user, onGetStarted, onLogin }) {
  const profile = FOUNDER_PROFILES[slug]

  usePageMeta({
    path: `/founders/${slug}/`,
    title: profile ? `${profile.name} — Founder | Your Own World` : 'Founder not found | Your Own World',
    description: profile ? `${profile.name}, ${profile.genre} — a Founder member of Your Own World. ${profile.series?.description || ''}`.trim() : 'This Founder profile could not be found.',
  })

  if (!profile) {
    return (
      <div className="yow-home min-h-screen" style={{ color: 'var(--text-main)' }}>
        <MarketingNav activePath="/founders/" user={user} onGetStarted={onGetStarted} onLogin={onLogin} />
        <main style={{ maxWidth: 700, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 17 }}>Founder not found.</p>
          <a href="/founders/" style={{ color: 'var(--accent)', fontSize: 15 }}>← Back to Founders</a>
        </main>
        <MarketingFooter />
      </div>
    )
  }

  return (
    <div className="yow-home min-h-screen" style={{ color: 'var(--text-main)' }}>
      <MarketingNav activePath="/founders/" user={user} onGetStarted={onGetStarted} onLogin={onLogin} />

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Back */}
        <div style={{ paddingTop: 48, marginBottom: 40 }}>
          <a href="/founders/" style={{ color: 'var(--text-muted)', fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={e => { e.preventDefault(); window.history.back() }}>
            ← All Founders
          </a>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28, marginBottom: 48, flexWrap: 'wrap' }}>
          {profile.avatar
            ? <img src={profile.avatar} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
            : <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--bg-card2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', flexShrink: 0 }}>{profile.emoji}</div>
          }
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.4rem)', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>{profile.name}</h1>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '2px 8px', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>✦ Founder</span>
            </div>
            <p style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 15, margin: '0 0 6px' }}>{profile.genre}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>{profile.location}</p>
          </div>
        </div>

        {/* Bio */}
        <section style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {profile.bio.map((para, i) => (
              <p key={i} style={{ color: 'var(--text-muted)', lineHeight: 1.75, fontSize: 16, margin: 0 }}>{para}</p>
            ))}
          </div>
        </section>

        {/* Current work */}
        {profile.series && (
          <section style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-main)' }}>Current Work</h2>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 16 }}>{profile.series.title}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px' }}>{profile.series.status}</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{profile.series.description}</p>
            </div>
          </section>
        )}

        {/* CTA */}
        <section style={{ textAlign: 'center', paddingTop: 32, borderTop: '1px solid var(--border)' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 15 }}>Building your own world?</p>
          <a href="/signup" className="btn btn-primary" style={{ textDecoration: 'none' }} onClick={e => { e.preventDefault(); onGetStarted?.() }}>Get started free</a>
        </section>

      </main>

      <MarketingFooter />
    </div>
  )
}
