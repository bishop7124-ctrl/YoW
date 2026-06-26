import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'

const FOUNDERS = [
  {
    slug: 'morgan-bishop',
    name: 'Morgan Bishop',
    genre: 'Fantasy · World-builder',
    bio: 'American writer based in England. Degree in English Literature, background in tech. Currently building a three-part fantasy series with a world big enough to get lost in — which is exactly why she made this tool. Wife, mum, dog owner. Writes late.',
    works: 'Trilogy in progress',
    avatar: null,
    emoji: '🌍',
  },
]

function FounderCard({ founder }) {
  return (
    <a
      href={`/founders/${founder.slug}/`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 12,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      {founder.avatar
        ? <img src={founder.avatar} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0 }} />
        : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-card2)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>{founder.emoji}</div>
      }
      <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {founder.name}
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>✦ Founder</span>
      </p>
      <p style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 500, margin: 0 }}>{founder.genre}</p>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{founder.bio}</p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{founder.works}</p>
      <span style={{ fontSize: '0.825rem', color: 'var(--accent)', fontWeight: 500, marginTop: 'auto', paddingTop: 4 }}>View profile →</span>
    </a>
  )
}

export default function FoundersPage({ user, onGetStarted, onLogin }) {
  return (
    <div className="yow-home min-h-screen" style={{ color: 'var(--text-main)' }}>
      <MarketingNav activePath="/founders/" user={user} onGetStarted={onGetStarted} onLogin={onLogin} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* Hero */}
        <section style={{ padding: '80px 0 48px' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>YOW Founders</p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 20px', maxWidth: 640 }}>
            The writers who believed first.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', maxWidth: 580, lineHeight: 1.7, margin: 0 }}>
            Founder membership is limited to a small number of slots — once they're gone, they're gone. These are the writers who supported Your Own World from the start. Explore their work and follow their worlds.
          </p>
        </section>

        {/* Founders grid */}
        <section style={{ paddingBottom: 80 }}>
          {FOUNDERS.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 24 }}>
              {FOUNDERS.map(f => <FounderCard key={f.slug} founder={f} />)}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--text-muted)' }}>
              <p style={{ maxWidth: 440, margin: '0 auto 24px' }}>No Founders yet — be the first.</p>
              <a href="/pricing/" className="btn btn-primary">See Founder pricing</a>
            </div>
          )}
        </section>

        {/* Become a Founder */}
        <section style={{ marginBottom: 80 }}>
          <div style={{
            maxWidth: 640, margin: '0 auto', textAlign: 'center',
            padding: '40px 32px',
            border: '1px solid var(--border)', borderRadius: 16,
            background: 'var(--bg-card)',
          }}>
            <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Become a Founder</h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24, fontSize: 15 }}>
              Founder membership is a limited, one-time purchase. It includes a permanent profile on this page, lifetime app access, lifetime Cloud Mode within the published fair-use cap, and early input on the platform's direction. Once slots are gone, this tier closes.
            </p>
            <a href="/pricing/" className="btn btn-primary" style={{ textDecoration: 'none' }}>See Founder pricing</a>
          </div>
        </section>

        {/* CTA */}
        <section style={{ textAlign: 'center' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>Free to start</p>
          <h2 style={{ fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', fontWeight: 800, marginBottom: 16 }}>Your stories. Your lore. Your world.</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 16 }}>
            Start your first project free — no credit card, no time limit. Build the world your story needs.
          </p>
          <a href="/signup" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}>Get started free</a>
        </section>

      </main>

      <MarketingFooter />
    </div>
  )
}
