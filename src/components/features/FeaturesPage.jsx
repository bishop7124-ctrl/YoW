import { useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'
import MarketingFooter from '../marketing/MarketingFooter'

// ── Feature presence values ──────────────────────────────────────────────────
// true = included (default on)
// 'opt' = available but not on by default
// false = not applicable
// string = nuanced value to display

const FEATURE_MATRIX = [
  // ── Writing workspace ──
  {
    category: 'Writing workspace',
    features: [
      {
        label: 'Writing workspace',
        prose: 'Manuscript editor',
        comic: 'Page script editor',
        ttrpg: 'Session notes editor',
        dnd: 'Session notes editor',
        note: null,
      },
      {
        label: 'Structure',
        prose: 'Acts → Chapters → Scenes (novel); Parts → Chapters → Scenes (novella/short story)',
        comic: 'Volumes → Issues → Pages',
        ttrpg: 'Campaign Arcs → Sessions → Encounters',
        dnd: 'Story Arcs → Sessions → Encounters',
        note: null,
      },
      {
        label: 'Word target',
        prose: '80,000 (novel) · 30,000 (novella) · 5,000 (short story)',
        comic: false,
        ttrpg: false,
        dnd: false,
        note: 'Prose only — session notes are freeform without a word target.',
      },
      {
        label: 'Story event markers',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: 'Labels adapt to each format: Hook / Inciting incident / Climax for novels; Quest hook / Boss battle / Arc climax for D&D; Splash / Page turn / Issue climax for comics.',
      },
      {
        label: 'Distraction-free focus mode',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Scene/page status tracking',
        prose: 'Draft / Revised / Final',
        comic: 'Draft / Revised / Final',
        ttrpg: 'Draft / Revised / Final',
        dnd: 'Draft / Revised / Final',
        note: null,
      },
      {
        label: 'Writing analytics',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Writing streak calendar',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
    ],
  },

  // ── Characters ──
  {
    category: 'Characters',
    features: [
      {
        label: 'Character profiles',
        prose: true,
        comic: true,
        ttrpg: 'NPC-focused profiles',
        dnd: 'NPC-focused profiles',
        note: null,
      },
      {
        label: 'Character arc tracking',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Relationship notes',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Scene/encounter appearance tracking',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Family tree builder',
        prose: 'Default on (novel) · Available (novella, short story)',
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'RPG character sheet builder',
        prose: false,
        comic: false,
        ttrpg: true,
        dnd: 'D&D-flavoured with classes, stats, spells, and inventory',
        unique: 'ttrpg',
        note: 'Exclusive to tabletop project types. Full character sheet with ability scores, class, level, equipment, and spell slots.',
      },
    ],
  },

  // ── World ──
  {
    category: 'World',
    features: [
      {
        label: 'Lore archive',
        prose: true,
        comic: true,
        ttrpg: 'Campaign codex',
        dnd: 'Campaign codex',
        note: null,
      },
      {
        label: 'Locations database',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Interactive maps',
        prose: 'Available (not on by default)',
        comic: true,
        ttrpg: true,
        dnd: true,
        note: 'Maps are on by default for TTRPG, D&D, and Comic projects. Novel/novella/short story projects can enable them in project settings.',
      },
      {
        label: 'Factions & organisations',
        prose: 'Default on (novel) · Available (novella, short story)',
        comic: 'Available (not on by default)',
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'World history log',
        prose: 'Default on (novel) · Available (novella, short story)',
        comic: 'Available (not on by default)',
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'AI lore conflict checker',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
    ],
  },

  // ── Planning ──
  {
    category: 'Planning',
    features: [
      {
        label: 'Timeline',
        prose: true,
        comic: true,
        ttrpg: 'Campaign history',
        dnd: 'Campaign history',
        note: null,
      },
      {
        label: 'Custom in-world calendar',
        prose: true,
        comic: 'Available',
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Ideas board',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Writing / session scheduler',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Project dashboard',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
    ],
  },

  // ── AI tools ──
  {
    category: 'AI tools',
    features: [
      {
        label: 'Plot hole detector',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Lore conflict checker',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Character interview mode',
        prose: true,
        comic: true,
        ttrpg: 'NPC interview mode',
        dnd: 'NPC interview mode',
        note: 'Talk to any character or NPC in-voice. The AI responds informed by their full profile, history, and relationships.',
      },
      {
        label: 'Voice consistency analysis',
        prose: true,
        comic: true,
        ttrpg: false,
        dnd: false,
        note: null,
      },
      {
        label: 'Character arc tracking (AI)',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
      {
        label: 'Bring-your-own API key',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: 'Connect your own keys from OpenRouter, Google AI, Anthropic, or other providers. YOW never marks up AI usage.',
      },
    ],
  },

  // ── Export ──
  {
    category: 'Export',
    features: [
      {
        label: 'Manuscript / session export',
        prose: 'DOCX / PDF / ZIP',
        comic: 'DOCX / PDF / ZIP',
        ttrpg: 'DOCX / PDF / ZIP',
        dnd: 'DOCX / PDF / ZIP',
        note: null,
      },
      {
        label: 'Project encyclopaedia export',
        prose: 'Characters, lore, locations, and world data as a formatted document',
        comic: 'Available',
        ttrpg: 'Campaign Bible export',
        dnd: 'Campaign Bible export',
        note: null,
      },
      {
        label: 'Map export',
        prose: 'Available',
        comic: true,
        ttrpg: true,
        dnd: true,
        note: null,
      },
    ],
  },
]

const COLS = [
  { id: 'prose',  label: 'Prose Fiction',        sub: 'Novel · Novella · Short Story', color: '#6366f1' },
  { id: 'comic',  label: 'Comic / Graphic Novel', sub: 'Beta',                          color: '#ec4899', badge: 'Beta' },
  { id: 'ttrpg',  label: 'Tabletop Campaign',     sub: 'System-neutral',               color: '#10b981' },
  { id: 'dnd',    label: 'D&D Campaign',           sub: 'D&D-flavoured',                color: '#f59e0b' },
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
            <CellVal val={feature[col.id]} colId={col.id} uniqueCol={feature.unique} />
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

const UNIQUE_CALLOUTS = [
  {
    type: 'Prose Fiction',
    color: '#6366f1',
    items: [
      'Word count targets calibrated per format (80k / 30k / 5k)',
      'Acts, Parts, or Sections structure depending on length',
      'Voice consistency analysis — maintain narrative tone across long manuscripts',
      'Project Encyclopaedia export — characters, lore, and world data in one formatted document',
    ],
  },
  {
    type: 'Comic / Graphic Novel',
    color: '#ec4899',
    badge: 'Beta',
    items: [
      'Volume → Issue → Page structure purpose-built for sequential art',
      'Page-level status tracking (Draft / Revised / Final per page)',
      'Story events mapped to comic moments: Splash, Page turn, Issue climax, Stinger',
      'Interactive maps on by default for visual world reference',
    ],
  },
  {
    type: 'Tabletop Campaign',
    color: '#10b981',
    items: [
      'RPG character sheet builder — ability scores, class, level, gear, and spells',
      'Session → Encounter structure with campaign arc planning',
      'System-neutral: no D&D assumptions, works for any genre or ruleset',
      'Maps, factions, and world history all on by default',
      'NPC interview mode — interrogate any character in-voice',
    ],
  },
  {
    type: 'D&D Campaign',
    color: '#f59e0b',
    items: [
      'D&D-flavoured character builder with classes, stats, spell slots, and inventory',
      'Story events use D&D language: Quest hook, Dungeon reveal, Boss battle, Arc climax',
      'Fantasy-first lore language: gods, dungeons, monsters, and high-fantasy world codex',
      'Full NPC database with secrets, faction loyalties, and DM-only notes',
    ],
  },
]

export default function FeaturesPage({ onGetStarted, onLogin, user }) {
  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">
      <MarketingNav activePath="/features/" onLogin={onLogin} onGetStarted={onGetStarted} user={user} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 96px' }}>

        {/* ── Hero ── */}
        <section style={{ textAlign: 'center', padding: '80px 0 64px' }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>Features</p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 20 }}>
            Every tool your story needs.<br />Built for the way you write.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-muted)', maxWidth: 580, margin: '0 auto 36px', lineHeight: 1.65 }}>
            YOW is one workspace for six different creative formats. Manuscript, characters, lore, maps, timelines, and AI tools — all connected, all in one place.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onGetStarted}>
              Start for free →
            </button>
            <a href="/pricing/" className="btn btn-secondary btn-lg" style={{ textDecoration: 'none' }}>
              View pricing
            </a>
          </div>
        </section>

        {/* ── What's unique per type ── */}
        <section style={{ marginBottom: 80 }} aria-label="What's unique per project type">
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>What makes each format different</h2>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: 36, fontSize: 15 }}>
            Every project type shares the same core workspace. These are the features that set each one apart.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {UNIQUE_CALLOUTS.map(col => (
              <div key={col.type} style={{
                border: `1px solid ${col.color}33`,
                borderTop: `3px solid ${col.color}`,
                borderRadius: 12, padding: '20px 22px',
                background: 'var(--bg-card)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{col.type}</span>
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
                  {col.items.map(item => (
                    <li key={item} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.5 }}>
                      <span style={{ color: col.color, flexShrink: 0, marginTop: 1 }}>↳</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Full feature matrix ── */}
        <section style={{ marginBottom: 80 }} aria-label="Full feature comparison">
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Full feature breakdown</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 15 }}>
            Every feature, every project type. Click the <span style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '0 4px' }}>i</span> for more detail on any row.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={{ width: '30%', textAlign: 'left', paddingBottom: 16, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Feature</th>
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
                {FEATURE_MATRIX.map(section => (
                  <>
                    <tr key={section.category + '-heading'}>
                      <td colSpan={5} style={{
                        paddingTop: 20, paddingBottom: 6,
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.08em', color: 'var(--text-muted)',
                      }}>
                        {section.category}
                      </td>
                    </tr>
                    {section.features.map(f => <FeatureRow key={f.label} feature={f} />)}
                  </>
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
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Novel vs Novella vs Short Story</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 14, lineHeight: 1.65 }}>
            These three formats share the same prose workspace. The differences are in scope and what's switched on by default.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              {
                label: 'Novel',
                target: '80,000 words',
                structure: 'Acts → Chapters → Scenes',
                on: 'Characters, family tree, factions, lore, locations, timeline, world history, ideas, schedule, AI',
                available: 'Interactive maps',
              },
              {
                label: 'Novella',
                target: '30,000 words',
                structure: 'Parts → Chapters → Scenes',
                on: 'Characters, lore, locations, timeline, ideas, schedule, AI',
                available: 'Family tree, factions, maps, world history',
              },
              {
                label: 'Short Story',
                target: '5,000 words',
                structure: 'Parts → Sections → Scenes',
                on: 'Characters, lore, locations, timeline, ideas, schedule, AI',
                available: 'Family tree, factions, maps, world history',
              },
            ].map(item => (
              <div key={item.label} style={{ padding: '16px 18px', border: '1px solid var(--border)', borderRadius: 10 }}>
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
          <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>Ready to build your world?</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 28, fontSize: 16 }}>Free to start · No credit card required · Works on any device</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={onGetStarted}>
              Start building for free →
            </button>
            <a href="/faq/" className="btn btn-secondary btn-lg" style={{ textDecoration: 'none' }}>
              Read the FAQ
            </a>
          </div>
        </section>

      </main>
      <MarketingFooter />
    </div>
  )
}
