import { Fragment, useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'
import { usePageMeta } from '../../utils/usePageMeta'
import { useSiteContent } from '../../utils/siteContent'
import { FEATURES_DEFAULTS } from '../../content/features'

const COLS = [
  { id: 'prose',  label: 'Prose Fiction',        sub: 'Novel · Novella · Short Story', color: '#C87855' }, // muted terracotta
  { id: 'comic',  label: 'Comic / Graphic Novel', sub: 'Panels, pages and issues',      color: '#B96762' }, // dusty rose
  { id: 'ttrpg',  label: 'Tabletop Campaign',     sub: 'System-neutral',               color: '#7FA47C' }, // muted sage
  { id: 'dnd',    label: '5E Campaign',            sub: 'Fifth-edition compatible',               color: '#C29A52' }, // antique ochre
]

function CellVal({ val, colId, uniqueCol }) {
  if (val === true)  return <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓</span>
  if (val === false) return <span style={{ color: 'var(--text-muted)', opacity: 0.4 }}>—</span>
  const isUnique = uniqueCol === colId
  return (
    <span style={{
      fontSize: 12, lineHeight: 1.45, color: isUnique ? 'var(--text-main)' : 'var(--text-muted)',
      fontWeight: isUnique ? 700 : 400,
    }}>
      {val}
    </span>
  )
}

function FeatureRow({ feature }) {
  const [showNote, setShowNote] = useState(false)
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border)' }}>
        <td style={{ padding: '10px 12px 10px 0', verticalAlign: 'top' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>{feature.label}</span>
            {feature.note && (
              <button
                type="button"
                onClick={() => setShowNote(n => !n)}
                title="More detail"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '50%',
                  width: 16, height: 16, cursor: 'pointer', fontSize: 10, flexShrink: 0,
                  color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                i
              </button>
            )}
          </div>
        </td>
        {COLS.map(col => (
          <td key={col.id} style={{ padding: '10px 12px', verticalAlign: 'top', textAlign: 'center' }}>
            <CellVal val={feature[col.id]} colId={col.id} uniqueCol={feature._unique} />
          </td>
        ))}
      </tr>
      {showNote && (
        <tr>
          <td colSpan={5} style={{ padding: '4px 0 12px', paddingRight: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
              {feature.note}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}


export default function FeaturesPage({ onGetStarted, onLogin, user, preview = false }) {
  const c = useSiteContent('features', FEATURES_DEFAULTS, { preview })
  const heroTitle = c.hero.title.split('\n')
  usePageMeta({
    path: '/features/',
    title: 'Features — Your Own World | Worldbuilding & Writing Software',
    description: 'Every tool your story needs: AI Import, manuscript editor, characters, lore, maps, timelines, family trees, and AI assistance — built for novelists, comic writers, and tabletop game masters.',
  })

  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">
      <MarketingNav activePath="/features/" onLogin={onLogin} onGetStarted={onGetStarted} user={user} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* ── Hero ── */}
        <section style={{ textAlign: 'center', padding: '80px 0 64px' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>{c.hero.eyebrow}</p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20 }}>
            {heroTitle.map((line, i) => (<Fragment key={i}>{i > 0 && <br />}{line}</Fragment>))}
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', maxWidth: 580, margin: '0 auto 36px', lineHeight: 1.65 }}>
            {c.hero.intro}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onGetStarted}>
              {c.hero.primaryCta}
            </button>
            <a href="/pricing/" className="btn btn-secondary btn-lg" style={{ textDecoration: 'none' }}>
              {c.hero.secondaryCta}
            </a>
          </div>
        </section>

        {/* ── What's unique per type ── */}
        <section style={{ marginBottom: 80 }} aria-label="What's unique per project type">
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>{c.unique.title}</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: 36, fontSize: 15 }}>
            {c.unique.intro}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {c.callouts.map((callout, ci) => {
              const col = { ...callout, color: (COLS.find(x => x.id === callout._col) || COLS[0]).color }
              return (
              <div key={ci} style={{
                border: '1px solid var(--border)',
                borderTop: `2px solid ${col.color}`,
                borderRadius: 12, padding: '20px 22px',
                // Same dark surface on every card — colour is a top-border
                // accent plus a faint corner glow, not a tinted background.
                background: `radial-gradient(120% 100% at 14% -12%, ${col.color}14, transparent 55%), var(--bg-raise)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: col.color }}>{col.type}</span>
                  {col.badge && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                      background: `${col.color}22`, color: col.color, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {col.badge}
                    </span>
                  )}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {col.items.map((item, ii) => (
                    <li key={ii} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
                      <span style={{ color: col.color, flexShrink: 0, marginTop: 1 }}>↳</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              )
            })}
          </div>
        </section>

        {/* ── Full feature matrix ── */}
        <section style={{ marginBottom: 80 }} aria-label="Full feature comparison">
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{c.matrixSection.title}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 15 }}>
            {c.matrixSection.introBefore}<span style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px' }}>i</span>{c.matrixSection.introAfter}
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: '30%', textAlign: 'left', paddingBottom: 16, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{c.matrixSection.featureColumnLabel}</th>
                  {COLS.map(col => (
                    <th key={col.id} style={{ textAlign: 'center', paddingBottom: 16, width: '17.5%' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: col.color }}>{col.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {col.sub}
                        {col.badge && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                            background: `${col.color}22`, color: col.color, textTransform: 'uppercase',
                          }}>
                            {col.badge}
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.matrix.map((section, si) => (
                  <Fragment key={si}>
                    <tr>
                      <td colSpan={5} style={{
                        paddingTop: 20, paddingBottom: 6,
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: 'var(--text-muted)',
                      }}>
                        {section.category}
                      </td>
                    </tr>
                    {section.features.map((f, fi) => <FeatureRow key={fi} feature={f} />)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Prose differences callout ── */}
        <section style={{
          marginBottom: 80, border: '1px solid var(--border)', borderRadius: 14,
          padding: '28px 32px', background: 'var(--bg-card)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{c.proseDiff.title}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14, lineHeight: 1.65 }}>
            {c.proseDiff.intro}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {c.proseDiff.items.map((item, ii) => (
              <div key={ii} style={{ padding: '16px 18px', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Target:</span> {item.target}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Structure:</span> {item.structure}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Default rooms:</span> {item.on}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>Also available:</span> {item.available}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ textAlign: 'center', padding: '16px 0 0' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>{c.cta.title}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 16 }}>{c.cta.sub}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onGetStarted}>
              {c.cta.primaryCta}
            </button>
            <a href="/faq/" className="btn btn-secondary btn-lg" style={{ textDecoration: 'none' }}>
              {c.cta.secondaryCta}
            </a>
          </div>
        </section>

      </main>
      <MarketingFooter />
    </div>
  )
}
