import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { usePageMeta } from '../../utils/usePageMeta'

export default function FoundersPage({ user, onGetStarted }) {
  usePageMeta({
    path: '/about/',
    title: 'About Us — Your Own World',
    description: 'Meet Morgan Bishop and learn why she built Your Own World: one independent writing and worldbuilding workspace for the manuscript and everything around it.',
  })

  return (
    <div className="yow-home min-h-screen" style={{ color: 'var(--text-main)' }}>
      <MarketingNav activePath="/about/" user={user} onGetStarted={onGetStarted} />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 104px' }}>
        <section style={{ padding: 'clamp(64px, 10vw, 112px) 0 56px', maxWidth: 760 }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>About us</p>
          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 4.75rem)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.02, margin: '0 0 24px' }}>One home for the story and the world around it.</h1>
          <p style={{ fontSize: 18, color: 'var(--text-muted)', lineHeight: 1.75, margin: 0 }}>YOW exists because writing a big story can become ridiculously complicated—and the useful bits always seem to end up in six different places.</p>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)', gap: 'clamp(32px, 7vw, 72px)', alignItems: 'start', marginBottom: 72 }}>
          <aside style={{ padding: 24, border: '1px solid var(--border)', borderRadius: 18, background: 'var(--bg-card)', textAlign: 'center' }}>
            <img src="/founders/morgan-bishop/pencil-sketch.png" alt="Portrait of Morgan Bishop" style={{ width: 148, height: 148, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', marginBottom: 18 }} />
            <h2 style={{ fontSize: 20, margin: '0 0 5px' }}>Morgan Bishop</h2>
            <p style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 800, margin: '0 0 12px' }}>Writer · worldbuilder · independent maker</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.65, margin: 0 }}>American writer in England. English Literature graduate, tech background, fantasy trilogy in progress. Wife, mum and dog owner. Writes late.</p>
          </aside>

          <div style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.82 }}>
            <h2 style={{ color: 'var(--text-main)', fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', margin: '0 0 20px' }}>I built the tool I wanted to write in.</h2>
            <p>I was trying to keep a manuscript, character histories, lore, timelines, locations, maps, relationships and all the half-formed notes around them in sync. The manuscript lived in one app. Worldbuilding lived across documents and spreadsheets. Important details were forever hiding in whichever tab I had closed.</p>
            <p>That mess is where Your Own World came from. I wanted the manuscript at the centre, with the world around it close enough to consult without losing my place. Not a blank page on one side and an enormous wiki project on the other—one connected workspace that could hold the whole thing.</p>
            <p>YOW is built by an actual writer and worldbuilder because it solves problems I have in my own work. It is independently made, not a huge software company dressed up in friendly copy. If something feels personal here, that is because it is.</p>
            <p>The aim is straightforward: useful writing software people can own. Cloud sync is available when it helps, but a Lifetime licence does not disappear because someone decides they no longer need hosted storage.</p>
          </div>
        </section>

        <section style={{ maxWidth: 760, margin: '0 auto 72px', padding: 'clamp(30px, 6vw, 52px)', border: '1px solid var(--border)', borderRadius: 18, background: 'var(--bg-nav)', textAlign: 'center' }}>
          <p className="eyebrow">The philosophy</p>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', margin: '10px 0 16px' }}>Buy YOW for what it is today. Enjoy what we add tomorrow.</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.75, margin: 0 }}>YOW should earn a place in your process because it is useful now—not because of a countdown, a locked-in subscription or promises about a distant roadmap.</p>
        </section>

        <section style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', marginBottom: 14 }}>Your stories. Your lore. Your world.</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 26 }}>Start one project free. No card and no time limit.</p>
          <a href="/signup" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}>Get started free</a>
        </section>
      </main>
      <MarketingFooter />
    </div>
  )
}
