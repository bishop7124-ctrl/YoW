import { Fragment, useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'
import { useSiteContent } from '../../utils/siteContent'
import { HOME_DEFAULTS } from '../../content/home'

const FEATURE_TAB_ICONS = {
  dashboard: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="10" y="2" width="6" height="6" rx="1.5"/>
          <rect x="2" y="10" width="6" height="6" rx="1.5"/><rect x="10" y="10" width="6" height="6" rx="1.5"/>
        </svg>
  ),
  manuscript: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="2" width="12" height="14" rx="1.5"/>
          <line x1="6" y1="6" x2="12" y2="6"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="12" x2="9" y2="12"/>
        </svg>
  ),
  characters: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="6" r="3"/><path d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6"/>
        </svg>
  ),
  lore: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 2L11 7H16L12 10.5L13.5 16L9 13L4.5 16L6 10.5L2 7H7L9 2Z"/>
        </svg>
  ),
  locations: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 2C6.24 2 4 4.24 4 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"/>
          <circle cx="9" cy="7" r="1.5"/>
        </svg>
  ),
  maps: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="2,3 7,5 11,3 16,5 16,15 11,13 7,15 2,13"/>
          <line x1="7" y1="5" x2="7" y2="15"/><line x1="11" y1="3" x2="11" y2="13"/>
        </svg>
  ),
  timeline: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="9" x2="16" y2="9"/>
          <circle cx="5" cy="9" r="2"/><circle cx="9" cy="9" r="2"/><circle cx="13" cy="9" r="2"/>
          <line x1="5" y1="5" x2="5" y2="7"/><line x1="9" y1="11" x2="9" y2="13"/><line x1="13" y1="5" x2="13" y2="7"/>
        </svg>
  ),
  factions: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="3"/>
          <circle cx="3" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="15" r="2"/>
          <line x1="5" y1="6" x2="7" y2="8"/><line x1="13" y1="6" x2="11" y2="8"/><line x1="9" y1="12" x2="9" y2="13"/>
        </svg>
  ),
  ideas: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="7" r="4"/>
          <line x1="9" y1="11" x2="9" y2="14"/>
          <line x1="7" y1="14" x2="11" y2="14"/>
          <line x1="6" y1="16" x2="12" y2="16"/>
        </svg>
  ),
  ai: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 2L10.5 6.5L15 8L10.5 9.5L9 14L7.5 9.5L3 8L7.5 6.5L9 2Z"/>
          <circle cx="14" cy="14" r="2"/>
        </svg>
  ),
  exports: (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12v3a1 1 0 001 1h10a1 1 0 001-1v-3"/>
          <line x1="9" y1="2" x2="9" y2="12"/>
          <polyline points="5,8 9,12 13,8"/>
        </svg>
  ),
  'family-trees': (
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="3" r="2"/>
          <circle cx="4" cy="10" r="2"/><circle cx="14" cy="10" r="2"/>
          <line x1="9" y1="5" x2="9" y2="7"/><line x1="9" y1="7" x2="4" y2="8"/><line x1="9" y1="7" x2="14" y2="8"/>
          <circle cx="4" cy="15" r="1.5"/><circle cx="14" cy="15" r="1.5"/>
          <line x1="4" y1="12" x2="4" y2="13.5"/><line x1="14" y1="12" x2="14" y2="13.5"/>
        </svg>
  ),
}

function normaliseSectionOrder(order) {
  const known = HOME_DEFAULTS.sectionOrder
  const seen = new Set()
  const result = []
  for (const id of Array.isArray(order) ? order : []) {
    if (known.includes(id) && !seen.has(id)) { seen.add(id); result.push(id) }
  }
  for (const id of HOME_DEFAULTS.sectionOrder) if (!seen.has(id)) result.push(id)
  return result
}

function CellDisplay({ value }) {
  if (value === true) return <span className="yow-compare-check">✓</span>
  if (value === false) return <span className="yow-compare-dash">—</span>
  return <span className="yow-compare-text">{value}</span>
}

function cellClass(value) {
  if (value === true) return 'yow-compare-yes'
  if (value === false) return 'yow-compare-no'
  return 'yow-compare-partial'
}

export default function HomePage({ onOpenAbout, onOpenLegal, preview = false }) {
  const c = useSiteContent('home', HOME_DEFAULTS, { preview })
  const [activeProjectType, setActiveProjectType] = useState('novel')
  const [activeFeatureTab, setActiveFeatureTab] = useState('dashboard')

  const currentProject = c.projectTypes.find(p => p.id === activeProjectType) || c.projectTypes[0]
  const currentFeature = c.featureTabs.find(f => f.id === activeFeatureTab) || c.featureTabs[0]
  const heroImage = c.hero.image
  const titleLines = c.hero.title.split('\n')

  const sections = {
    projectTypes: (
          <section className="yow-section" aria-label="Project types">
            <div className="yow-section-header">
              <p className="eyebrow">{c.projectTypesSection.eyebrow}</p>
              <h2>{c.projectTypesSection.title}</h2>
              <p className="yow-section-sub">{c.projectTypesSection.sub}</p>
            </div>
  
            <div className="yow-project-tabs" role="tablist" aria-label="Project types">
              {c.projectTypes.map(pt => (
                <button
                  key={pt.id}
                  role="tab"
                  aria-selected={currentProject?.id === pt.id}
                  className={`yow-project-tab${currentProject?.id === pt.id ? ' active' : ''}`}
                  onClick={() => setActiveProjectType(pt.id)}
                >
                  <span>{pt.label}</span>
                </button>
              ))}
            </div>
  
            {currentProject && (
              <div className="yow-project-panel" role="tabpanel">
                <div className="yow-project-panel-left">
                  <p className="yow-project-tagline">{currentProject.tagline}</p>
                  <p className="yow-project-desc">{currentProject.description}</p>
                  <div className="yow-project-emphasis">
                    {currentProject.emphasis.map((e, i) => (
                      <span key={i} className="yow-emphasis-pill">{e}</span>
                    ))}
                  </div>
                  <ul className="yow-project-features">
                    {currentProject.features.map((f, i) => (
                      <li key={i}>
                        <span className="yow-feature-check">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="/signup" className="btn btn-primary mt-6">
                    Start a {currentProject.label} project →
                  </a>
                </div>
                <div className="yow-project-panel-right" aria-hidden="true">
                  <div className="yow-project-visual">
                    <div className="yow-project-visual-label">
                      {currentProject.label} Project
                    </div>
                    <div className="yow-project-tool-grid">
                      {currentProject.emphasis.map((tool, i) => (
                        <div key={i} className="yow-project-tool-card">
                          <div className="yow-project-tool-name">{tool}</div>
                          <div className="yow-project-tool-bar" />
                          <div className="yow-project-tool-bar short" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
    ),
    features: (
          <section className="yow-section yow-feature-section" aria-label="Features">
            <div className="yow-section-header">
              <p className="eyebrow">{c.featuresSection.eyebrow}</p>
              <h2>{c.featuresSection.title}</h2>
              <p className="yow-section-sub">{c.featuresSection.sub}</p>
            </div>
  
            <div className="yow-feature-interface">
              <nav className="yow-feature-tabs" aria-label="Feature list">
                {c.featureTabs.map(tab => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={currentFeature?.id === tab.id}
                    className={`yow-feature-tab${currentFeature?.id === tab.id ? ' active' : ''}`}
                    onClick={() => setActiveFeatureTab(tab.id)}
                  >
                    <span className="yow-feature-tab-icon">{FEATURE_TAB_ICONS[tab.id] || null}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
  
              {currentFeature && (
                <div className="yow-feature-content" key={currentFeature.id}>
                  <h3 className="yow-feature-title">{currentFeature.label}</h3>
                  <p className="yow-feature-overview">{currentFeature.overview}</p>
  
                  {currentFeature.shot?.src && (
                    <div className="yow-feature-shot">
                      <img
                        src={currentFeature.shot.src}
                        alt={currentFeature.shot.alt}
                        width={currentFeature.shot.width}
                        height={currentFeature.shot.height}
                        loading="lazy"
                      />
                    </div>
                  )}
  
                  <div className="yow-feature-block">
                    <p className="yow-feature-block-label">{c.featuresSection.whyLabel}</p>
                    <p className="yow-feature-block-text">{currentFeature.why}</p>
                  </div>
  
                  <div className="yow-feature-block">
                    <p className="yow-feature-block-label">{c.featuresSection.useCasesLabel}</p>
                    <div className="yow-feature-usecase-grid">
                      {currentFeature.useCases.map((uc, i) => (
                        <div key={i} className="yow-usecase-card">
                          <span className="yow-usecase-type">{uc.type}</span>
                          <p>{uc.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
  
                  <div className="yow-feature-block">
                    <p className="yow-feature-block-label">{c.featuresSection.capabilitiesLabel}</p>
                    <ul className="yow-capability-list">
                      {currentFeature.capabilities.map((cap, i) => (
                        <li key={i}>
                          <span className="yow-feature-check">✓</span>
                          {cap}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>
    ),
    comparison: (
          <section className="yow-section" aria-label="Feature comparison by project type">
            <div className="yow-section-header">
              <p className="eyebrow">{c.comparisonSection.eyebrow}</p>
              <h2>{c.comparisonSection.title}</h2>
              <p className="yow-section-sub">{c.comparisonSection.sub}</p>
            </div>
            <div className="yow-comparison-wrap">
              <table className="yow-comparison-table">
                <thead>
                  <tr>
                    <th className="yow-compare-label-col">Feature</th>
                    <th>Novel</th>
                    <th>Novella</th>
                    <th>Short Story</th>
                    <th>Tabletop</th>
                  </tr>
                </thead>
                <tbody>
                  {c.comparisonRows.map((row, i) => (
                    <tr key={i}>
                      <td className="yow-compare-label-col yow-compare-feature">{row.feature}</td>
                      <td className={cellClass(row.novel)}><CellDisplay value={row.novel} /></td>
                      <td className={cellClass(row.novella)}><CellDisplay value={row.novella} /></td>
                      <td className={cellClass(row.shortStory)}><CellDisplay value={row.shortStory} /></td>
                      <td className={cellClass(row.tabletop)}><CellDisplay value={row.tabletop} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
    ),
    problems: (
          <section className="yow-section" aria-label="Why use YOW">
            <div className="yow-section-header">
              <p className="eyebrow">{c.problemsSection.eyebrow}</p>
              <h2>{c.problemsSection.title}</h2>
              <p className="yow-section-sub">{c.problemsSection.sub}</p>
            </div>
            <div className="yow-problems-grid">
              {c.problems.map(({ problem, solution }, i) => (
                <div key={i} className="yow-problem-card">
                  <div className="yow-problem-before">
                    <span className="yow-problem-label">Before</span>
                    <p>{problem}</p>
                  </div>
                  <div className="yow-problem-arrow" aria-hidden="true">→</div>
                  <div className="yow-problem-after">
                    <span className="yow-problem-label yow-after-label">With YOW</span>
                    <p>{solution}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
    ),
    ai: (
          <section className="yow-section" aria-label="AI-powered features">
            <div className="yow-section-header">
              <p className="eyebrow">{c.aiSection.eyebrow}</p>
              <h2>{c.aiSection.title}</h2>
              <p className="yow-section-sub">{c.aiSection.sub}</p>
            </div>
            <div className="yow-ai-grid">
              {c.aiFeatures.map((feat, i) => (
                <div key={i} className="yow-ai-card">
                  <h4 className="yow-ai-name">{feat.name}</h4>
                  <p className="yow-ai-desc">{feat.desc}</p>
                  <p className="yow-ai-benefit">{feat.benefit}</p>
                </div>
              ))}
            </div>
          </section>
    ),
    cta: (
          <section className="yow-cta-section" aria-label="Get started">
            <div className="yow-cta-inner">
              <p className="eyebrow">{c.cta.eyebrow}</p>
              <h2>{c.cta.title}</h2>
              <p>{c.cta.intro}</p>
              <div className="yow-home-actions" style={{ justifyContent: 'center', marginTop: '32px' }}>
                <a href="/signup" className="btn btn-primary btn-lg">
                  {c.cta.primaryCta}
                </a>
                <a href="/login" className="btn btn-secondary btn-lg">
                  {c.cta.secondaryCta}
                </a>
              </div>
              <p className="yow-trust-line" style={{ textAlign: 'center' }}>
                {c.cta.trustLine}
              </p>
            </div>
          </section>
    ),
  }
  const order = normaliseSectionOrder(c.sectionOrder)

  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">

      <MarketingNav activePath="/" />

      {/* ── 1. Hero — full-bleed outside .yow-home-main ── */}
      <section className="yow-home-hero" aria-label="Hero">
        <img src={heroImage.src} alt="" className="yow-hero-bg-img" aria-hidden="true"/>
        <div className="yow-hero-inner">
          <div className="yow-home-copy">
            <p className="eyebrow mb-3">{c.hero.eyebrow}</p>
            <h1>{titleLines.map((line, i) => (<Fragment key={i}>{i > 0 && <br />}{line}</Fragment>))}</h1>
            <p>{c.hero.intro}</p>
            <p className="yow-hero-sub">{c.hero.sub}</p>
            <div className="yow-home-actions">
              <a href="/signup" className="btn btn-primary btn-lg">
                {c.hero.primaryCta}
              </a>
              <a href="/login" className="btn btn-secondary btn-lg">
                {c.hero.secondaryCta}
              </a>
            </div>
            <p className="yow-trust-line">{c.hero.trustLine}</p>
          </div>
        </div>
      </section>

      <main className="yow-home-main">

          <div style={{display:'none'}}><svg xmlns="http://www.w3.org/2000/svg" style={{display:'none'}}>
              <defs>
                <radialGradient id="hero-atmo1" cx="42%" cy="32%" r="55%">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16"/>
                  <stop offset="100%" stopColor="transparent"/>
                </radialGradient>
                <radialGradient id="hero-atmo2" cx="78%" cy="72%" r="42%">
                  <stop offset="0%" stopColor="var(--accent2,#6ea8cf)" stopOpacity="0.09"/>
                  <stop offset="100%" stopColor="transparent"/>
                </radialGradient>
                <filter id="hero-glow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="hero-node-glow" x="-120%" y="-120%" width="340%" height="340%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* Atmosphere */}
              <rect width="440" height="310" fill="url(#hero-atmo1)"/>
              <rect width="440" height="310" fill="url(#hero-atmo2)"/>

              {/* Cartographic grid */}
              <g opacity="0.05" stroke="var(--text-muted)" strokeWidth="0.5">
                <line x1="0" y1="77" x2="440" y2="77"/>
                <line x1="0" y1="155" x2="440" y2="155"/>
                <line x1="0" y1="233" x2="440" y2="233"/>
                <line x1="110" y1="0" x2="110" y2="310"/>
                <line x1="220" y1="0" x2="220" y2="310"/>
                <line x1="330" y1="0" x2="330" y2="310"/>
              </g>

              {/* Star field */}
              <g fill="var(--text-muted)" opacity="0.45">
                <circle cx="18" cy="22" r="0.8"/><circle cx="48" cy="10" r="0.6"/>
                <circle cx="73" cy="32" r="1.1"/><circle cx="98" cy="14" r="0.7"/>
                <circle cx="143" cy="24" r="0.9"/><circle cx="182" cy="12" r="0.7"/>
                <circle cx="243" cy="17" r="0.7"/><circle cx="288" cy="10" r="0.9"/>
                <circle cx="323" cy="27" r="0.7"/><circle cx="402" cy="14" r="0.7"/>
                <circle cx="432" cy="32" r="0.9"/><circle cx="422" cy="57" r="0.7"/>
                <circle cx="12" cy="67" r="0.7"/><circle cx="58" cy="82" r="0.9"/>
                <circle cx="358" cy="67" r="1.1"/><circle cx="398" cy="82" r="0.7"/>
                <circle cx="14" cy="132" r="0.7"/><circle cx="10" cy="182" r="0.9"/>
                <circle cx="17" cy="242" r="0.7"/><circle cx="22" cy="292" r="0.9"/>
                <circle cx="432" cy="132" r="0.7"/><circle cx="437" cy="177" r="1.1"/>
                <circle cx="427" cy="232" r="0.7"/><circle cx="434" cy="277" r="0.9"/>
                <circle cx="202" cy="293" r="0.7"/><circle cx="282" cy="302" r="0.9"/>
                <circle cx="352" cy="292" r="0.7"/><circle cx="102" cy="272" r="0.9"/>
                <circle cx="67" cy="297" r="0.7"/><circle cx="168" cy="302" r="0.7"/>
                <circle cx="335" cy="262" r="0.7"/>
              </g>
              {/* Accent-coloured bright stars */}
              <g fill="var(--accent)" filter="url(#hero-glow)">
                <circle cx="214" cy="38" r="1.5" opacity="0.55"/>
                <circle cx="362" cy="20" r="1.2" opacity="0.45"/>
                <circle cx="73" cy="32" r="1.1" opacity="0.45"/>
              </g>

              {/* ── Landmasses ── */}
              {/* Northwest continent */}
              <path d="M 38,68 C 44,46 68,32 96,34 C 122,36 150,48 157,70 C 166,96 152,126 130,140 C 107,152 74,150 54,132 C 33,114 30,92 38,68 Z"
                fill="color-mix(in srgb, var(--text-muted) 7%, transparent)"
                stroke="color-mix(in srgb, var(--border) 70%, var(--text-muted) 30%)" strokeWidth="0.7"/>
              {/* Inland lake */}
              <ellipse cx="95" cy="92" rx="18" ry="11"
                fill="color-mix(in srgb, var(--accent2,#6ea8cf) 15%, transparent)"
                stroke="color-mix(in srgb, var(--accent2,#6ea8cf) 30%, transparent)" strokeWidth="0.5"/>
              {/* Southeast landmass */}
              <path d="M 262,208 C 276,186 306,178 330,184 C 354,190 374,208 377,232 C 380,254 362,272 340,277 C 318,282 292,268 278,248 C 262,226 250,230 262,208 Z"
                fill="color-mix(in srgb, var(--text-muted) 7%, transparent)"
                stroke="color-mix(in srgb, var(--border) 70%, var(--text-muted) 30%)" strokeWidth="0.7"/>
              {/* Eastern island cluster */}
              <path d="M 386,74 C 393,66 408,70 410,80 C 413,92 404,100 394,97 C 385,93 380,83 386,74 Z"
                fill="color-mix(in srgb, var(--text-muted) 6%, transparent)"
                stroke="color-mix(in srgb, var(--border) 70%, var(--text-muted) 30%)" strokeWidth="0.5"/>
              <path d="M 416,88 C 421,82 430,85 428,95 C 426,103 416,100 416,88 Z"
                fill="color-mix(in srgb, var(--text-muted) 5%, transparent)"
                stroke="color-mix(in srgb, var(--border) 70%, var(--text-muted) 30%)" strokeWidth="0.5"/>
              {/* Central isle */}
              <path d="M 185,158 C 192,148 210,145 220,153 C 230,162 228,175 218,180 C 208,185 190,182 185,170 C 181,162 182,162 185,158 Z"
                fill="color-mix(in srgb, var(--text-muted) 6%, transparent)"
                stroke="color-mix(in srgb, var(--border) 70%, var(--text-muted) 30%)" strokeWidth="0.5"/>

              {/* ── Character relationship constellation ── */}
              <g stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="0.9" strokeDasharray="3,5" fill="none">
                <line x1="170" y1="88" x2="298" y2="128"/>
                <line x1="298" y1="128" x2="238" y2="192"/>
                <line x1="238" y1="192" x2="128" y2="208"/>
                <line x1="128" y1="208" x2="170" y2="88"/>
                <line x1="170" y1="88" x2="238" y2="192"/>
              </g>

              {/* Node glows */}
              <g filter="url(#hero-node-glow)">
                <circle cx="170" cy="88" r="4" fill="var(--accent)" opacity="0.6"/>
                <circle cx="298" cy="128" r="4" fill="var(--accent)" opacity="0.5"/>
                <circle cx="238" cy="192" r="4" fill="var(--accent)" opacity="0.5"/>
                <circle cx="128" cy="208" r="3.5" fill="var(--accent2,#6ea8cf)" opacity="0.55"/>
              </g>
              {/* Node points */}
              <circle cx="170" cy="88" r="2.8" fill="var(--accent)"/>
              <circle cx="298" cy="128" r="2.8" fill="var(--accent)"/>
              <circle cx="238" cy="192" r="2.8" fill="var(--accent)"/>
              <circle cx="128" cy="208" r="2.3" fill="var(--accent2,#6ea8cf)"/>

              {/* Node labels */}
              <g fontFamily="var(--font-serif)" fontSize="9.5" fill="var(--text-main)" opacity="0.78">
                <text x="178" y="85">Elena Voss</text>
                <text x="306" y="125">The Iron Court</text>
                <text x="245" y="202">Blood Compact</text>
                <text x="78" y="205">House Morvaine</text>
              </g>
              {/* Label underlines */}
              <g stroke="var(--border)" strokeWidth="0.4" opacity="0.35">
                <line x1="178" y1="87" x2="218" y2="87"/>
                <line x1="306" y1="127" x2="360" y2="127"/>
                <line x1="245" y1="204" x2="287" y2="204"/>
                <line x1="78" y1="207" x2="126" y2="207"/>
              </g>

              {/* ── Compass rose ── */}
              <g transform="translate(398,268)">
                <circle cx="0" cy="0" r="17" fill="none" stroke="var(--border)" strokeWidth="0.6" opacity="0.45"/>
                <circle cx="0" cy="0" r="3.5" fill="none" stroke="var(--border)" strokeWidth="0.5" opacity="0.45"/>
                <polygon points="0,-17 -2.5,-7 0,-10 2.5,-7" fill="var(--accent)" opacity="0.65"/>
                <polygon points="0,17 -2,8 0,10 2,8" fill="var(--text-muted)" opacity="0.35"/>
                <polygon points="17,0 8,-2 10,0 8,2" fill="var(--text-muted)" opacity="0.35"/>
                <polygon points="-17,0 -8,-2 -10,0 -8,2" fill="var(--text-muted)" opacity="0.35"/>
                <text x="-2.8" y="-20" fill="var(--text-muted)" fontSize="7" fontWeight="700" opacity="0.6">N</text>
              </g>

              {/* Bottom survey mark */}
              <g transform="translate(30,272)" opacity="0.3">
                <circle cx="0" cy="0" r="11" fill="none" stroke="var(--border)" strokeWidth="0.6"/>
                <circle cx="0" cy="0" r="6" fill="none" stroke="var(--border)" strokeWidth="0.4"/>
                <line x1="-11" y1="0" x2="11" y2="0" stroke="var(--border)" strokeWidth="0.4"/>
                <line x1="0" y1="-11" x2="0" y2="11" stroke="var(--border)" strokeWidth="0.4"/>
              </g>

              {/* ── Decorative frames ── */}
              <rect x="6" y="6" width="428" height="298" rx="7" fill="none"
                stroke="var(--border)" strokeWidth="0.7" strokeOpacity="0.35" strokeDasharray="5,4"/>
              <rect x="2" y="2" width="436" height="306" rx="9" fill="none"
                stroke="var(--border)" strokeWidth="0.4" strokeOpacity="0.2"/>

              {/* Title inscription */}
              <text x="52" y="276" fontFamily="var(--font-serif)" fontSize="7.5"
                fill="var(--text-muted)" opacity="0.4" letterSpacing="2">THE CHRONICLES OF MORVAINE</text>
              <text x="40" y="276" fill="var(--accent)" fontSize="8" opacity="0.35">✦</text>
            </svg></div>


        {order.map(id => (
          <Fragment key={id}>{sections[id]}</Fragment>
        ))}

      </main>


      {/* ── Footer ── */}
      <footer className="yow-home-footer">
        <p className="yow-home-footer-copy">© 2026 YourOwnWorld. All rights reserved.</p>
        <nav className="yow-home-footer-nav" aria-label="Legal and info links">
          {onOpenAbout && (
            <button type="button" onClick={onOpenAbout} className="yow-footer-link">About</button>
          )}
          <a href="/about/" className="yow-footer-link">About Us</a>
          {onOpenLegal && (
            <>
              <button type="button" onClick={() => onOpenLegal('privacy')}  className="yow-footer-link">Privacy</button>
              <button type="button" onClick={() => onOpenLegal('terms')}    className="yow-footer-link">Terms</button>
              <button type="button" onClick={() => onOpenLegal('ethics')}   className="yow-footer-link">Ethics</button>
              <button type="button" onClick={() => onOpenLegal('beta')}     className="yow-footer-link">Launch notice</button>
              <button type="button" onClick={() => onOpenLegal('cookies')}  className="yow-footer-link">Cookies</button>
            </>
          )}
        </nav>
      </footer>
    </div>
  )
}
