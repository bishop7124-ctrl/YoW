import { useState } from 'react'
import PlotHoleDetector from './PlotHoleDetector'
import LoreConflictChecker from './LoreConflictChecker'
import CharacterInterview from './CharacterInterview'
import StyleConsistency from './StyleConsistency'

const TOOLS = [
  {
    id:      'plot_hole',
    label:   'Plot Holes',
    icon:    (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={12} cy={12} r={9} />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    ),
    desc:    'Find logical gaps, missing payoff, and timeline issues',
  },
  {
    id:      'lore_conflict',
    label:   'Lore Conflicts',
    icon:    (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    desc:    'Flag contradictions in lore, characters, and world rules',
  },
  {
    id:      'interview',
    label:   'Character Interview',
    icon:    (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx={9} cy={8} r={3} />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <path d="M16 3l5 3-5 3V3z" />
        <path d="M21 6h-5" />
      </svg>
    ),
    desc:    'Chat with AI roleplaying as your character',
  },
  {
    id:      'style',
    label:   'Style Analysis',
    icon:    (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16" />
        <path d="M4 12h10" />
        <path d="M4 17h12" />
        <path d="M17 14l2 2 4-4" />
      </svg>
    ),
    desc:    'Detect voice drift and prose inconsistency across scenes',
  },
]

export default function AITools({ store, userId }) {
  const [activeTool, setActiveTool] = useState('plot_hole')

  const novel = store.activeNovel
  if (!novel) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, padding: 40, textAlign: 'center' }}>
        <svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" />
        </svg>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>No project open</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 260 }}>Open a project to use AI Tools.</p>
      </div>
    )
  }

  return (
    <div data-tour="aitools-header" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tool tab bar */}
      <div data-tour="aitools-provider" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
            style={{
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              gap:           4,
              padding:       '10px 16px',
              background:    'none',
              border:        'none',
              borderBottom:  activeTool === tool.id ? '2px solid var(--accent)' : '2px solid transparent',
              color:         activeTool === tool.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor:        'pointer',
              whiteSpace:    'nowrap',
              flexShrink:    0,
              transition:    'color 0.12s',
            }}
          >
            <span style={{ opacity: activeTool === tool.id ? 1 : 0.7 }}>{tool.icon}</span>
            <span style={{ fontSize: 11, fontWeight: 700 }}>{tool.label}</span>
          </button>
        ))}
      </div>

      {/* All tools stay mounted; visibility toggled via display so state survives tab switches */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {TOOLS.map(tool => (
          <div key={tool.id} style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: activeTool === tool.id ? 'block' : 'none' }}>
            {tool.id === 'plot_hole'     && <PlotHoleDetector    store={store} userId={userId} />}
            {tool.id === 'lore_conflict' && <LoreConflictChecker store={store} userId={userId} />}
            {tool.id === 'interview'     && <CharacterInterview  store={store} userId={userId} />}
            {tool.id === 'style'         && <StyleConsistency    store={store} userId={userId} />}
          </div>
        ))}
      </div>
    </div>
  )
}
