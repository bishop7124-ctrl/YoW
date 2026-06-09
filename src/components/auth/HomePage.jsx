import { useState } from 'react'
import MarketingNav from '../marketing/MarketingNav'

const PROJECT_TYPES = [
  {
    id: 'novel',
    label: 'Novel & Novella',
    tagline: 'From first draft to final chapter.',
    description: 'A complete writing environment that grows with your story — from rough outline to polished manuscript. Every tool adapts to long-form prose.',
    features: [
      'Manuscript editor with acts, chapters, and scenes',
      'Character arcs and relationship mapping',
      'World lore archive and location database',
      'Visual timeline with in-story calendar support',
      'Plot planning with beat sheets and outlines',
      'Word count goals and writing analytics',
      'Export to DOCX and PDF',
    ],
    emphasis: ['Manuscript Editor', 'Character Arcs', 'Lore Archive', 'Timeline'],
  },
  {
    id: 'screenplay',
    label: 'Screenplay',
    tagline: 'Beta workflow. Script polish next.',
    description: 'Create screenplay projects now with script-shaped structure, paragraph element controls, and readable beta DOCX export. Industry-perfect formatting and FDX/PDF script export are still in progress.',
    features: [
      'Beta project creation',
      'Act and scene structure',
      'Character and location planning',
      'Readable beta DOCX script export',
    ],
    emphasis: ['Beta', 'Script Planning', 'Characters', 'Locations'],
  },
  {
    id: 'tv',
    label: 'TV Series',
    tagline: 'Beta workflow. Episodes next.',
    description: 'Create TV Series projects now with season and episode structure plus script drafting controls. Dedicated episode tracking and series-bible workflows are still in progress.',
    features: [
      'Beta project creation',
      'Season and episode structure',
      'Script drafting controls',
      'Series bible tools planned next',
    ],
    emphasis: ['Beta', 'Seasons', 'Episodes', 'Series Bible'],
  },
  {
    id: 'dnd',
    label: 'D&D Campaign',
    tagline: 'Build worlds. Prepare sessions.',
    description: 'A campaign workspace for dungeon masters — NPCs, locations, lore, factions, maps, and session-shaped structure connected in one place.',
    features: [
      'Campaign and adventure arc management',
      'NPC tracker with motivations and secrets',
      'Session and encounter structure',
      'Interactive map and location browser',
      'Faction and political web tracking',
      'Lore codex and world history',
      'Campaign lore and reference material',
    ],
    emphasis: ['Campaign Manager', 'NPC Tracking', 'Session Planning', 'Maps & Lore'],
  },
]

const FEATURE_TABS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="10" y="2" width="6" height="6" rx="1.5"/>
        <rect x="2" y="10" width="6" height="6" rx="1.5"/><rect x="10" y="10" width="6" height="6" rx="1.5"/>
      </svg>
    ),
    overview: 'Your project command center — see word counts, chapter progress, recent activity, and quick access to every tool in one view.',
    why: 'Writers lose momentum switching between tools. The dashboard keeps your entire project\'s health visible at a glance so you can focus on writing, not on managing files.',
    useCases: [
      { type: 'Novel', text: 'Track daily word count targets, see which chapters are drafted vs. revised, and monitor overall manuscript progress at a glance.' },
      { type: 'Novella', text: 'Keep a tighter manuscript target visible while working with a lighter project structure.' },
      { type: 'D&D Campaign', text: 'See campaign structure, recently updated NPCs, maps, factions, and unresolved plot threads in one screen.' },
    ],
    capabilities: [
      'Word count tracking and daily goals',
      'Chapter and scene progress indicators',
      'Recent activity feed across all project sections',
      'Quick-jump to any section of your project',
      'Writing streak calendar',
      'Project health overview',
    ],
  },
  {
    id: 'manuscript',
    label: 'Manuscript',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="2" width="12" height="14" rx="1.5"/>
        <line x1="6" y1="6" x2="12" y2="6"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="12" x2="9" y2="12"/>
      </svg>
    ),
    overview: 'A distraction-free editor organized by acts, chapters, and scenes. Write your story in the structure that makes sense for your format.',
    why: 'Generic word processors don\'t understand story structure. YOW\'s manuscript editor knows what an act break is, what a scene does, and how chapters build into a book.',
    useCases: [
      { type: 'Novel', text: 'Draft chapters with nested scenes, add notes and chapter summaries, and track revision status so you always know what\'s done.' },
      { type: 'Short Story', text: 'Draft a focused story with compact sections and a short-form word target.' },
      { type: 'D&D Campaign', text: 'Organize campaign writing by story arc, session, and encounter.' },
    ],
    capabilities: [
      'Rich text editing with distraction-free focus mode',
      'Acts, chapters, and scenes hierarchy',
      'Scene-level status tracking (draft / revised / final)',
      'Word count per scene and chapter',
      'Notes and synopsis per chapter',
      'Drag-and-drop scene reordering',
    ],
  },
  {
    id: 'characters',
    label: 'Characters',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="6" r="3"/><path d="M3 16c0-3.314 2.686-6 6-6s6 2.686 6 6"/>
      </svg>
    ),
    overview: 'Character dossiers with personality profiles, physical descriptions, backstory, motivations, and story links in one place.',
    why: 'Characters are the heart of any story, but their details scatter across notebooks and documents. YOW centralizes every character so you never contradict yourself two hundred pages later.',
    useCases: [
      { type: 'Novel', text: 'Build full protagonist profiles, track character arc milestones, and see exactly which scenes each character appears in.' },
      { type: 'Short Story', text: 'Keep only the essential character details close at hand for a tighter cast.' },
      { type: 'D&D Campaign', text: 'Create NPC profiles with goals, secrets, faction loyalties, and DM-only notes hidden from players.' },
    ],
    capabilities: [
      'Rich character profiles with custom fields',
      'Character arc tracking across the story',
      'Relationship notes',
      'Faction affiliations and allegiances',
      'Scene appearance tracking',
      'Character interview AI mode',
      'Project-scoped character records',
    ],
  },
  {
    id: 'lore',
    label: 'Lore',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2L11 7H16L12 10.5L13.5 16L9 13L4.5 16L6 10.5L2 7H7L9 2Z"/>
      </svg>
    ),
    overview: 'A searchable archive for every rule, history, magic system, religion, and world fact — always at your fingertips when you\'re writing.',
    why: 'World logic is the invisible scaffolding of every great story. When lore lives in your head or scattered notes, contradictions creep in. YOW makes lore searchable, cross-linked, and consistent.',
    useCases: [
      { type: 'Novel', text: 'Document your magic system rules, historical events, and cultural traditions so every scene stays internally consistent.' },
      { type: 'Novella', text: 'Keep the world rules and backstory that matter without carrying a full epic-scale bible.' },
      { type: 'D&D Campaign', text: 'Build a world codex — gods, histories, languages, and laws — that your players can explore progressively as they discover it.' },
    ],
    capabilities: [
      'Tagged and categorized lore entries',
      'Cross-linking to characters and locations',
      'Full-text search across all lore',
      'Lore conflict detection with AI',
      'Searchable reference archive',
      'Project-scoped lore records',
    ],
  },
  {
    id: 'locations',
    label: 'Locations',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2C6.24 2 4 4.24 4 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"/>
        <circle cx="9" cy="7" r="1.5"/>
      </svg>
    ),
    overview: 'Document every place in your world — from kingdoms to tavern back rooms — with descriptions, history, inhabitants, and connections to your story.',
    why: 'A rich sense of place makes a world feel real. Disconnected location notes lose the relationships between places. YOW links locations to characters, events, and maps.',
    useCases: [
      { type: 'Novel', text: 'Track which chapters are set where, link key plot events to their locations, and maintain consistent atmospheric descriptions.' },
      { type: 'Short Story', text: 'Track the few places that matter and keep atmosphere notes consistent.' },
      { type: 'D&D Campaign', text: 'Build a navigable location hierarchy from continents to dungeon rooms, with secrets only the DM can see.' },
    ],
    capabilities: [
      'Nested location hierarchy (continent → city → building → room)',
      'Full descriptions and historical notes',
      'Linked characters and associated events',
      'Map pin integration',
      'Scene and chapter associations',
      'Custom tags and location types',
    ],
  },
  {
    id: 'maps',
    label: 'Maps',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="2,3 7,5 11,3 16,5 16,15 11,13 7,15 2,13"/>
        <line x1="7" y1="5" x2="7" y2="15"/><line x1="11" y1="3" x2="11" y2="13"/>
      </svg>
    ),
    overview: 'Upload and annotate world maps with pinned locations, region boundaries, and custom notes — all connected to your location database.',
    why: 'A map is worth a thousand words of description. YOW connects your visual geography to your written world so pins link directly to location pages, lore, and associated characters.',
    useCases: [
      { type: 'Novel', text: 'Pin every city, keep, and landmark your characters visit, with plot-relevant notes visible only as your story reaches those places.' },
      { type: 'TTRPG Campaign', text: 'Upload campaign maps and connect important places to your location database.' },
      { type: 'D&D Campaign', text: 'Layer world maps, regional maps, and dungeon floor plans — each with pins your players discover progressively.' },
    ],
    capabilities: [
      'Upload any image as a map canvas',
      'Interactive pin placement and labels',
      'Pin-to-location page linking',
      'Multiple map layers per project',
      'Zoom and pan navigation',
      'Region and territory annotations',
    ],
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="9" x2="16" y2="9"/>
        <circle cx="5" cy="9" r="2"/><circle cx="9" cy="9" r="2"/><circle cx="13" cy="9" r="2"/>
        <line x1="5" y1="5" x2="5" y2="7"/><line x1="9" y1="11" x2="9" y2="13"/><line x1="13" y1="5" x2="13" y2="7"/>
      </svg>
    ),
    overview: 'A chronological view of your story\'s events — plot moments, character beats, world history, and in-story dates — on one visual timeline.',
    why: 'Chronology errors are among the most common story problems. A visual timeline lets you see the full shape of your story\'s time and catch contradictions before readers do.',
    useCases: [
      { type: 'Novel', text: 'Track the exact in-story date of every chapter event, see flashback vs. present-day threads, and verify timeline consistency.' },
      { type: 'D&D Campaign', text: 'Track campaign events, world history, and in-world timing as the party changes the setting.' },
      { type: 'D&D Campaign', text: 'Track in-game calendar dates, world history events, and session-by-session plot developments on a single view.' },
    ],
    capabilities: [
      'Visual timeline with event markers',
      'Custom in-story calendar support',
      'Event tagging by type and character',
      'Multiple timeline tracks',
      'Chapter-to-event linking',
      'Separate world history vs. plot event tracks',
    ],
  },
  {
    id: 'family-trees',
    label: 'Family Trees',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="3" r="2"/>
        <circle cx="4" cy="10" r="2"/><circle cx="14" cy="10" r="2"/>
        <line x1="9" y1="5" x2="9" y2="7"/><line x1="9" y1="7" x2="4" y2="8"/><line x1="9" y1="7" x2="14" y2="8"/>
        <circle cx="4" cy="15" r="1.5"/><circle cx="14" cy="15" r="1.5"/>
        <line x1="4" y1="12" x2="4" y2="13.5"/><line x1="14" y1="12" x2="14" y2="13.5"/>
      </svg>
    ),
    overview: 'Visual genealogy charts that map bloodlines, marriages, adoptions, and family connections — essential for complex casts and epic stories.',
    why: 'Epic stories have complex family histories. Tracking dynasties and bloodlines in prose is error-prone. Visual family trees make hereditary relationships instantly clear.',
    useCases: [
      { type: 'Novel', text: 'Map royal succession lines, track which characters share blood, and keep dynastic histories accurate across a long series.' },
      { type: 'Novel', text: 'Build extended family trees for dynasties, inherited secrets, and complicated casts.' },
      { type: 'D&D Campaign', text: 'Track noble house genealogies, NPC family connections, and hereditary titles for political intrigue campaigns.' },
    ],
    capabilities: [
      'Drag-and-drop tree builder',
      'Parent, child, partner, and adopted links',
      'Character profile integration on every node',
      'Multi-generational trees',
      'Export as image',
      'Custom relationship type labels',
    ],
  },
  {
    id: 'factions',
    label: 'Factions',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3"/>
        <circle cx="3" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="15" r="2"/>
        <line x1="5" y1="6" x2="7" y2="8"/><line x1="13" y1="6" x2="11" y2="8"/><line x1="9" y1="12" x2="9" y2="13"/>
      </svg>
    ),
    overview: 'Track organizations, guilds, governments, and power groups — their goals, members, rivalries, and shifting political relationships.',
    why: 'Political complexity and factional conflict drive the most compelling stories. YOW makes organizational relationships as manageable as character relationships.',
    useCases: [
      { type: 'Novel', text: 'Map competing guilds, political parties, or cults — track their agendas, leadership, and how they evolve across the story.' },
      { type: 'TTRPG Campaign', text: 'Track guilds, factions, governments, and rivals as their power shifts between sessions.' },
      { type: 'D&D Campaign', text: 'Build a living political web — track faction reputation, NPC allegiances, and how player choices shift the balance of power.' },
    ],
    capabilities: [
      'Faction profiles with goals and leadership',
      'Member character linking',
      'Faction relationship and rivalry mapping',
      'Alliance and conflict tracking',
      'Character loyalty and reputation scores',
      'Faction history event log',
    ],
  },
  {
    id: 'ideas',
    label: 'Ideas Board',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4"/>
        <line x1="9" y1="11" x2="9" y2="14"/>
        <line x1="7" y1="14" x2="11" y2="14"/>
        <line x1="6" y1="16" x2="12" y2="16"/>
      </svg>
    ),
    overview: 'A freeform board for capturing stray ideas, plot possibilities, dialogue snippets, research notes, and anything that doesn\'t fit neatly elsewhere yet.',
    why: 'Inspiration doesn\'t arrive in organized categories. The Ideas Board is a safe place for the messy, half-formed thoughts that eventually become the best moments in your story.',
    useCases: [
      { type: 'Novel', text: 'Capture chapter ideas before they\'re ready, park alternative plot threads, and collect dialogue that might appear later.' },
      { type: 'Short Story', text: 'Keep spare endings, alternate openings, and title ideas in one accessible place.' },
      { type: 'D&D Campaign', text: 'Park random encounter ideas, half-formed villain backstories, and future adventure hooks for exactly the right moment.' },
    ],
    capabilities: [
      'Freeform idea cards with rich text',
      'Tag and categorize ideas',
      'Link ideas to characters, locations, or chapters',
      'Promote any idea to a full character, location, or lore entry',
      'Board and list view',
      'Quick capture from anywhere in the app',
    ],
  },
  {
    id: 'ai',
    label: 'AI Tools',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2L10.5 6.5L15 8L10.5 9.5L9 14L7.5 9.5L3 8L7.5 6.5L9 2Z"/>
        <circle cx="14" cy="14" r="2"/>
      </svg>
    ),
    overview: 'Context-aware AI that knows your characters, lore, and plot — ready to answer questions, detect problems, and help you move forward when you\'re stuck.',
    why: 'Generic AI has no idea who your characters are. YOW\'s AI is briefed on your specific world so it gives help that actually fits your story — not suggestions for someone else\'s.',
    useCases: [
      { type: 'Novel', text: 'Ask "how would Elena react to this betrayal?" and get an answer grounded in her established personality, history, and motivations.' },
      { type: 'D&D Campaign', text: 'Check if a session beat contradicts established NPC motivation, lore, or timeline context.' },
      { type: 'D&D Campaign', text: 'Generate NPC dialogue that reflects their faction loyalty and secrets, fully consistent with your campaign\'s established lore.' },
    ],
    capabilities: [
      'Plot hole detection across the manuscript',
      'Lore conflict checker',
      'Character interview mode — talk to any character',
      'Voice consistency analysis',
      'Context-aware brainstorming',
      'Scene and dialogue suggestions',
      'Worldbuilding expansion prompts',
    ],
  },
  {
    id: 'exports',
    label: 'Exports',
    icon: (
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12v3a1 1 0 001 1h10a1 1 0 001-1v-3"/>
        <line x1="9" y1="2" x2="9" y2="12"/>
        <polyline points="5,8 9,12 13,8"/>
      </svg>
    ),
    overview: 'Export your manuscript, world bible, character sheets, and lore archives in formats ready for editors, publishers, or personal archiving.',
    why: 'Your work shouldn\'t be trapped inside one app. YOW is where you create — exports let you share, submit, or back up your work in standard formats anytime.',
    useCases: [
      { type: 'Novel', text: 'Export your manuscript as a clean, professionally formatted DOCX or PDF ready for agent submission or beta readers.' },
      { type: 'Novella', text: 'Export your manuscript as a clean DOCX or PDF for readers and editors.' },
      { type: 'D&D Campaign', text: 'Export your project archive or reference material for backup and sharing.' },
    ],
    capabilities: [
      'DOCX manuscript export',
      'PDF export with formatting options',
      'World bible compilation export',
      'Project archive export',
      'Lore archive export',
      'Chapter-by-chapter or full manuscript',
    ],
  },
]

const COMPARISON_FEATURES = [
  { feature: 'Manuscript Editor',      novel: 'Acts / chapters / scenes', novella: 'Parts / chapters / scenes', shortStory: 'Parts / sections / scenes', tabletop: 'Arcs / sessions / encounters' },
  { feature: 'Default Word Target',    novel: '80k words',               novella: '30k words',                 shortStory: '5k words',                 tabletop: false },
  { feature: 'Character Profiles',     novel: true,                      novella: true,                        shortStory: true,                       tabletop: 'NPC-focused' },
  { feature: 'Lore Archive',           novel: true,                      novella: true,                        shortStory: true,                       tabletop: 'Campaign codex' },
  { feature: 'Interactive Maps',       novel: 'Optional',                novella: 'Optional',                  shortStory: 'Optional',                 tabletop: true },
  { feature: 'Timeline',               novel: true,                      novella: true,                        shortStory: true,                       tabletop: 'Campaign history' },
  { feature: 'Factions',               novel: true,                      novella: 'Optional',                  shortStory: 'Optional',                 tabletop: true },
  { feature: 'AI Tools',               novel: true,                      novella: true,                        shortStory: true,                       tabletop: 'Campaign-aware' },
  { feature: 'Exports',                novel: 'DOCX / PDF / ZIP',        novella: 'DOCX / PDF / ZIP',          shortStory: 'DOCX / PDF / ZIP',         tabletop: 'DOCX / PDF / ZIP' },
]

const PROBLEMS = [
  {
    problem: 'Draft in Google Docs',
    solution: 'Manuscript editor with chapters, scenes, progress tracking, and focus mode — all built around how stories are actually structured.',
  },
  {
    problem: 'Characters in a spreadsheet',
    solution: 'Rich character profiles with arcs, relationship notes, faction links, and scene appearance tracking — all connected to the story.',
  },
  {
    problem: 'Timeline in a calendar app',
    solution: 'Visual story timeline linked to chapters, characters, and world events — with support for custom in-story calendars.',
  },
  {
    problem: 'Maps as image files in Finder',
    solution: 'Interactive maps with location pins linked directly to your world database — every pin opens a full location entry.',
  },
  {
    problem: 'Lore in random notebooks',
    solution: 'Searchable lore archive connected to characters, locations, and chapters — with AI conflict detection built in.',
  },
  {
    problem: 'Ideas scattered across 5 apps',
    solution: 'An Ideas Board that lives inside your project and can link any idea directly to any character, scene, or location.',
  },
]

const AI_FEATURES = [
  {
    name: 'Plot Hole Detector',
    desc: 'Analyzes your manuscript structure and flags events, timeline sequences, or character actions that contradict each other or lack logical follow-through.',
    benefit: 'Catch the continuity errors that editors and readers notice — before you do.',
  },
  {
    name: 'Lore Conflict Checker',
    desc: 'Compares your manuscript text against your lore archive and flags anywhere the writing contradicts an established world rule or historical fact.',
    benefit: 'Keep your magic system, world history, and internal rules consistent across hundreds of pages.',
  },
  {
    name: 'Character Interview Mode',
    desc: 'Have a real conversation with any character in your project. The AI responds as that character, informed by their full profile, history, and relationships.',
    benefit: 'Find authentic character voice, unlock natural dialogue, and understand how your character would genuinely react to your plot.',
  },
  {
    name: 'Voice Consistency Analysis',
    desc: 'Evaluates whether your narrator\'s voice, a character\'s dialogue patterns, or a scene\'s tone remains consistent with the rest of the manuscript.',
    benefit: 'Maintain a coherent narrative voice across a long work without rereading every scene back-to-back.',
  },
  {
    name: 'Character Arc Tracking',
    desc: 'Maps each character\'s emotional state, goals, and development across the scenes they appear in, flagging arcs that stall or develop inconsistently.',
    benefit: 'Ensure every major character has a meaningful journey — not just presence — in your story.',
  },
]

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

export default function HomePage({ onGetStarted, onLogin, onOpenAbout, onOpenLegal }) {
  const [activeProjectType, setActiveProjectType] = useState('novel')
  const [activeFeatureTab, setActiveFeatureTab] = useState('dashboard')

  const currentProject = PROJECT_TYPES.find(p => p.id === activeProjectType)
  const currentFeature = FEATURE_TABS.find(f => f.id === activeFeatureTab)

  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">

      <MarketingNav activePath="/" onLogin={onLogin} onGetStarted={onGetStarted} />

      <main className="yow-home-main">

        {/* ── 1. Hero ── */}
        <section className="yow-home-hero" aria-label="Hero">
          <div className="yow-home-copy">
            <p className="eyebrow mb-3">Your Own World</p>
            <h1>One world.<br />Every story<br />you'll ever tell.</h1>
            <p>
              YOW is the all-in-one creative workspace for writers, worldbuilders, and dungeon masters — manuscript, characters, lore, maps, and timelines, all connected in one focused studio.
            </p>
            <p className="yow-hero-sub">
              Launch-ready for prose and tabletop campaigns, with screenplay and TV workflows available as clearly marked betas.
            </p>
            <div className="yow-home-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={onGetStarted}>
                Start building your world →
              </button>
              <button type="button" className="btn btn-secondary btn-lg" onClick={onLogin}>
                Log in
              </button>
            </div>
            <p className="yow-trust-line">Free to start · No credit card required · Works on any device</p>
          </div>

          <div className="yow-home-visual" aria-hidden="true">
            <div className="yow-hero-mockup">
              <div className="yow-hero-mockup-nav">
                {['Manuscript', 'Characters', 'Lore', 'Maps', 'Timeline'].map(label => (
                  <div key={label} className={`yow-hero-mockup-nav-item ${label === 'Manuscript' ? 'active' : ''}`}>{label}</div>
                ))}
              </div>
              <div className="yow-hero-mockup-content">
                <div className="yow-hero-mockup-chapter">Chapter 12 — The Betrayal</div>
                <div className="yow-hero-mockup-lines">
                  {[85, 100, 62, 95, 70, 88, 45, 100, 78, 55, 90].map((w, i) => (
                    <div key={i} className="yow-hero-mockup-line" style={{ width: `${w}%` }} />
                  ))}
                </div>
                <div className="yow-hero-mockup-pills">
                  <span className="yow-pill yow-pill-char">Elena Voss</span>
                  <span className="yow-pill yow-pill-loc">The Iron Court</span>
                  <span className="yow-pill yow-pill-lore">Blood Compact</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. Project Type Showcase ── */}
        <section className="yow-section" aria-label="Project types">
          <div className="yow-section-header">
            <p className="eyebrow">Built for every format</p>
            <h2>YOW adapts to how you tell your story.</h2>
            <p className="yow-section-sub">
              Select your project type to see how YOW tailors the workspace to your specific workflow.
            </p>
          </div>

          <div className="yow-project-tabs" role="tablist" aria-label="Project types">
            {PROJECT_TYPES.map(pt => (
              <button
                key={pt.id}
                role="tab"
                aria-selected={activeProjectType === pt.id}
                className={`yow-project-tab${activeProjectType === pt.id ? ' active' : ''}`}
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
                  {currentProject.emphasis.map(e => (
                    <span key={e} className="yow-emphasis-pill">{e}</span>
                  ))}
                </div>
                <ul className="yow-project-features">
                  {currentProject.features.map(f => (
                    <li key={f}>
                      <span className="yow-feature-check">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-primary mt-6" onClick={onGetStarted}>
                  Start a {currentProject.label} project →
                </button>
              </div>
              <div className="yow-project-panel-right" aria-hidden="true">
                <div className="yow-project-visual">
                  <div className="yow-project-visual-label">
                    {currentProject.label} Project
                  </div>
                  <div className="yow-project-tool-grid">
                    {currentProject.emphasis.map(tool => (
                      <div key={tool} className="yow-project-tool-card">
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

        {/* ── 3. What We Do ── */}
        <section className="yow-section yow-feature-section" aria-label="Features">
          <div className="yow-section-header">
            <p className="eyebrow">What we do</p>
            <h2>Every tool your story needs.</h2>
            <p className="yow-section-sub">
              Explore the complete set of tools inside every YOW project. Select a tab to see what each one does and why it matters.
            </p>
          </div>

          <div className="yow-feature-interface">
            <nav className="yow-feature-tabs" aria-label="Feature list">
              {FEATURE_TABS.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeFeatureTab === tab.id}
                  className={`yow-feature-tab${activeFeatureTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveFeatureTab(tab.id)}
                >
                  <span className="yow-feature-tab-icon">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            {currentFeature && (
              <div className="yow-feature-content" key={activeFeatureTab}>
                <h3 className="yow-feature-title">{currentFeature.label}</h3>
                <p className="yow-feature-overview">{currentFeature.overview}</p>

                <div className="yow-feature-block">
                  <p className="yow-feature-block-label">Why it matters</p>
                  <p className="yow-feature-block-text">{currentFeature.why}</p>
                </div>

                <div className="yow-feature-block">
                  <p className="yow-feature-block-label">Example use cases</p>
                  <div className="yow-feature-usecase-grid">
                    {currentFeature.useCases.map(uc => (
                      <div key={uc.type} className="yow-usecase-card">
                        <span className="yow-usecase-type">{uc.type}</span>
                        <p>{uc.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="yow-feature-block">
                  <p className="yow-feature-block-label">Key capabilities</p>
                  <ul className="yow-capability-list">
                    {currentFeature.capabilities.map(cap => (
                      <li key={cap}>
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

        {/* ── 4. Feature Comparison ── */}
        <section className="yow-section" aria-label="Feature comparison by project type">
          <div className="yow-section-header">
            <p className="eyebrow">Not one size fits all</p>
            <h2>YOW adapts to launch-ready project types.</h2>
            <p className="yow-section-sub">
              Start with prose projects or tabletop campaigns, each with its own structure, defaults, and workspace language.
            </p>
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
                {COMPARISON_FEATURES.map(row => (
                  <tr key={row.feature}>
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

        {/* ── 5. Why YOW ── */}
        <section className="yow-section" aria-label="Why use YOW">
          <div className="yow-section-header">
            <p className="eyebrow">The tool sprawl problem</p>
            <h2>Stop managing tools. Start building worlds.</h2>
            <p className="yow-section-sub">
              Most writers use 5–8 separate apps for what YOW handles in one place. Every context switch costs time, momentum, and the thread of your story.
            </p>
          </div>
          <div className="yow-problems-grid">
            {PROBLEMS.map(({ problem, solution }) => (
              <div key={problem} className="yow-problem-card">
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

        {/* ── 6. AI Features ── */}
        <section className="yow-section" aria-label="AI-powered features">
          <div className="yow-section-header">
            <p className="eyebrow">AI that knows your world</p>
            <h2>Creative intelligence built for storytellers.</h2>
            <p className="yow-section-sub">
              YOW's AI is briefed on your characters, lore, and plot — so it gives help that actually fits your story, not generic suggestions.
            </p>
          </div>
          <div className="yow-ai-grid">
            {AI_FEATURES.map(feat => (
              <div key={feat.name} className="yow-ai-card">
                <h4 className="yow-ai-name">{feat.name}</h4>
                <p className="yow-ai-desc">{feat.desc}</p>
                <p className="yow-ai-benefit">{feat.benefit}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. Final CTA ── */}
        <section className="yow-cta-section" aria-label="Get started">
          <div className="yow-cta-inner">
            <p className="eyebrow">Ready to begin?</p>
            <h2>Your world is waiting.</h2>
            <p>
              Start with a free account — no credit card, no time limit. Upgrade when you're ready for more projects and advanced tools.
            </p>
            <div className="yow-home-actions" style={{ justifyContent: 'center', marginTop: '32px' }}>
              <button type="button" className="btn btn-primary btn-lg" onClick={onGetStarted}>
                Create your free account →
              </button>
              <button type="button" className="btn btn-secondary btn-lg" onClick={onLogin}>
                Log in
              </button>
            </div>
            <p className="yow-trust-line" style={{ textAlign: 'center' }}>
              Free to start · Sync across devices · Export your work anytime
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="yow-home-footer">
        <p className="yow-home-footer-copy">© 2026 YourOwnWorld. All rights reserved.</p>
        <nav className="yow-home-footer-nav" aria-label="Legal and info links">
          {onOpenAbout && (
            <button type="button" onClick={onOpenAbout} className="yow-footer-link">About</button>
          )}
          {onOpenLegal && (
            <>
              <button type="button" onClick={() => onOpenLegal('privacy')}  className="yow-footer-link">Privacy</button>
              <button type="button" onClick={() => onOpenLegal('terms')}    className="yow-footer-link">Terms</button>
              <button type="button" onClick={() => onOpenLegal('ethics')}   className="yow-footer-link">Ethics</button>
              <button type="button" onClick={() => onOpenLegal('beta')}     className="yow-footer-link">Beta</button>
              <button type="button" onClick={() => onOpenLegal('cookies')}  className="yow-footer-link">Cookies</button>
            </>
          )}
        </nav>
      </footer>
    </div>
  )
}
