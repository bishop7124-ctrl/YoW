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
    id: 'short_story',
    label: 'Short Story',
    tagline: 'Focused. Stripped down. Finished.',
    description: 'A compact workspace for short fiction — tight structure, a 5,000-word target, and every planning tool scaled to match the shorter form.',
    features: [
      'Compact section and scene structure',
      '5,000-word default target with analytics',
      'Character and location planning',
      'Lore and ideas boards',
      'Export to DOCX and PDF',
    ],
    emphasis: ['Compact Structure', 'Short-Form Analytics', 'Characters', 'Lore'],
  },
  {
    id: 'comic',
    label: 'Comic / Graphic Novel',
    beta: true,
    tagline: 'Volume, issue, page. All connected.',
    description: 'A planning workspace for sequential art narratives — organise by volume and issue, build your world, and map out the visual story before you draw.',
    features: [
      'Volume, issue, and page structure',
      'Character and relationship planning',
      'Location and world lore archive',
      'Interactive map support',
      'Timeline for story chronology',
      'Export to DOCX and PDF',
    ],
    emphasis: ['Issue Structure', 'Characters', 'World Lore', 'Maps'],
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
  {
    id: 'tabletop',
    label: 'Tabletop Campaign',
    tagline: 'Any system. Any world. Any table.',
    description: 'A system-neutral campaign bible for any ruleset — fantasy, horror, sci-fi, or homebrew. No D&D assumptions. Just the tools to build your world and run your sessions.',
    features: [
      'Campaign arc, session, and encounter structure',
      'NPC and character roster',
      'Faction and political web tracking',
      'Interactive map and location browser',
      'Lore codex and world history',
      'Works for any ruleset or homebrew system',
    ],
    emphasis: ['System-Neutral', 'Session Planning', 'Factions', 'World Lore'],
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
  { feature: 'AI Import',              novel: 'Assisted project setup',  novella: 'Assisted project setup',    shortStory: 'Assisted project setup',   tabletop: 'Notes-to-campaign import' },
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
  {
    problem: 'Existing notes too big to re-enter by hand',
    solution: 'AI Import can analyse notes, manuscripts, documents, or worldbuilding files, identify useful entities, and populate connected YOW areas for you to review and refine.',
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

export default function HomePage({ onOpenAbout, onOpenLegal }) {
  const [activeProjectType, setActiveProjectType] = useState('novel')
  const [activeFeatureTab, setActiveFeatureTab] = useState('dashboard')

  const currentProject = PROJECT_TYPES.find(p => p.id === activeProjectType)
  const currentFeature = FEATURE_TABS.find(f => f.id === activeFeatureTab)

  return (
    <div className="yow-home min-h-screen text-[var(--text-main)]">

      <MarketingNav activePath="/" />

      {/* ── 1. Hero — full-bleed outside .yow-home-main ── */}
      <section className="yow-home-hero" aria-label="Hero">
        <img src="/homepage 1.png" alt="" className="yow-hero-bg-img" aria-hidden="true"/>
        <div className="yow-hero-inner">
          <div className="yow-home-copy">
            <p className="eyebrow mb-3">Your Own World</p>
            <h1>One world.<br />Every story<br />you'll ever tell.</h1>
            <p>
              YOW is the all-in-one creative workspace for writers, worldbuilders, and dungeon masters — manuscript, characters, lore, maps, and timelines, all connected in one focused studio.
            </p>
            <p className="yow-hero-sub">
              Built for prose writers and tabletop storytellers — novels, short stories, graphic novels, D&D campaigns, and system-neutral TTRPGs.
            </p>
            <div className="yow-home-actions">
              <a href="/signup" className="btn btn-primary btn-lg">
                Start building your world →
              </a>
              <a href="/login" className="btn btn-secondary btn-lg">
                Log in
              </a>
            </div>
            <p className="yow-trust-line">Free to start · No credit card required · Works on any device</p>
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
                {pt.beta && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', borderRadius: 4, padding: '1px 5px', marginLeft: 5, verticalAlign: 'middle' }}>Beta</span>}
              </button>
            ))}
          </div>

          {currentProject && (
            <div className="yow-project-panel" role="tabpanel">
              <div className="yow-project-panel-left">
                {currentProject.beta && (
                  <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 8 }}>
                    Beta — core features available; full QA in progress.
                  </p>
                )}
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
              Every project type gets its own structure, defaults, and workspace language — built for the way that format actually works.
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
              <a href="/signup" className="btn btn-primary btn-lg">
                Create your free account →
              </a>
              <a href="/login" className="btn btn-secondary btn-lg">
                Log in
              </a>
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
          <a href="/founders/" className="yow-footer-link">Founders</a>
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
