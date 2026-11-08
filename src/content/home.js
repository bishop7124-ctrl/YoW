// Default copy for the public homepage. The owner can override any of this
// from /site-editor (published overrides are merged on top, see
// src/utils/siteContent.js). Editing this file changes the built-in fallback.
// Keys starting with "_" are structural and hidden in the editor.

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
    label: '5E Campaign',
    tagline: 'Build worlds. Prepare sessions.',
    description: 'A fifth-edition compatible campaign workspace — 5E character tools, NPCs, locations, lore, factions, maps, and session-shaped structure connected in one place.',
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
    description: 'Build and manage a campaign using any game system — fantasy, horror, sci-fi, or homebrew. System-neutral tools to build your world and run your sessions.',
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

const RAW_FEATURE_TABS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    overview: 'Your project command center — see word counts, chapter progress, recent activity, and quick access to every tool in one view.',
    shot: { src: '/screenshots/project-dashboard.jpg', alt: 'Your Own World project dashboard showing writing progress and quick links to every project section', width: 1600, height: 723 },
    why: 'Writers lose momentum switching between tools. The dashboard keeps your entire project\'s health visible at a glance so you can focus on writing, not on managing files.',
    useCases: [
      { type: 'Novel', text: 'Track daily word count targets, see which chapters are drafted vs. revised, and monitor overall manuscript progress at a glance.' },
      { type: 'Novella', text: 'Keep a tighter manuscript target visible while working with a lighter project structure.' },
      { type: '5E Campaign', text: 'See campaign structure, recently updated NPCs, maps, factions, and unresolved plot threads in one screen.' },
    ],
    capabilities: [
      'Word count tracking and daily goals',
      'Chapter and scene progress indicators',
      'Recently updated manuscript scenes',
      'Quick-jump to any section of your project',
      'Writing streak calendar',
      'Project health overview',
    ],
  },
  {
    id: 'manuscript',
    label: 'Manuscript',
    overview: 'A distraction-free editor organized by acts, chapters, and scenes. Write your story in the structure that makes sense for your format.',
    shot: { src: '/screenshots/manuscript-editor.jpg', alt: 'Your Own World manuscript editor showing a chapter draft with writing status and targets', width: 1600, height: 733 },
    why: 'Generic word processors don\'t understand story structure. YOW\'s manuscript editor knows what an act break is, what a scene does, and how chapters build into a book.',
    useCases: [
      { type: 'Novel', text: 'Draft chapters with nested scenes, add notes and chapter summaries, and track revision status so you always know what\'s done.' },
      { type: 'Short Story', text: 'Draft a focused story with compact sections and a short-form word target.' },
      { type: '5E Campaign', text: 'Organize campaign writing by story arc, session, and encounter.' },
    ],
    capabilities: [
      'Rich text editing with dedicated Write and Edit modes',
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
    overview: 'Character dossiers with personality profiles, physical descriptions, backstory, motivations, and story links in one place.',
    shot: { src: '/screenshots/character-dossier.jpg', alt: 'A character dossier in Your Own World showing profile details, faction, and biography', width: 1600, height: 613 },
    why: 'Characters are the heart of any story, but their details scatter across notebooks and documents. YOW keeps character records together so details are easier to check while you write.',
    useCases: [
      { type: 'Novel', text: 'Build full protagonist profiles, track character arc milestones, and see exactly which scenes each character appears in.' },
      { type: 'Short Story', text: 'Keep only the essential character details close at hand for a tighter cast.' },
      { type: '5E Campaign', text: 'Create private NPC profiles with goals, secrets, faction loyalties, and GM notes for campaign preparation.' },
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
    overview: 'A searchable archive for every rule, history, magic system, religion, and world fact — always at your fingertips when you\'re writing.',
    shot: { src: '/screenshots/lore-firekeeper-blood.png', alt: 'A lore entry in Your Own World showing a tagged worldbuilding note linked to characters and related lore', width: 1600, height: 590 },
    why: 'World logic is the invisible scaffolding of every great story. When lore lives in your head or scattered notes, contradictions creep in. YOW makes lore searchable, cross-linked, and consistent.',
    useCases: [
      { type: 'Novel', text: 'Document your magic system rules, historical events, and cultural traditions so every scene stays internally consistent.' },
      { type: 'Novella', text: 'Keep the world rules and backstory that matter without carrying a full epic-scale bible.' },
      { type: '5E Campaign', text: 'Build a private world codex for gods, histories, languages, laws, and campaign discoveries.' },
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
    overview: 'Document every place in your world — from kingdoms to tavern back rooms — with descriptions, history, inhabitants, and connections to your story.',
    shot: { src: '/screenshots/locations-atlas.png', alt: 'Your Own World locations atlas showing a location field note with tags and cross-references', width: 1600, height: 650 },
    why: 'A rich sense of place makes a world feel real. Disconnected location notes lose the relationships between places. YOW links locations to characters, events, and maps.',
    useCases: [
      { type: 'Novel', text: 'Track which chapters are set where, link key plot events to their locations, and maintain consistent atmospheric descriptions.' },
      { type: 'Short Story', text: 'Track the few places that matter and keep atmosphere notes consistent.' },
      { type: '5E Campaign', text: 'Build a navigable location hierarchy from continents to dungeon rooms, keeping every secret in your own private prep.' },
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
    overview: 'Upload and annotate world maps with pinned locations, region boundaries, and custom notes — all connected to your location database.',
    shot: { src: '/screenshots/map-terrain-editor.jpg', alt: 'Your Own World map builder showing terrain editing tools and a linked location pin on an interactive map', width: 1600, height: 971 },
    why: 'A map is worth a thousand words of description. YOW connects your visual geography to your written world so pins link directly to location pages, lore, and associated characters.',
    useCases: [
      { type: 'Novel', text: 'Pin every city, keep, and landmark your characters visit, with plot relevance and visit notes attached to each place.' },
      { type: 'TTRPG Campaign', text: 'Upload campaign maps and connect important places to your location database.' },
      { type: '5E Campaign', text: 'Prepare world maps, regional maps, and dungeon floor plans with linked locations and GM notes.' },
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
    overview: 'A chronological view of your story\'s events — plot moments, character beats, world history, and in-story dates — on one visual timeline.',
    shot: { src: '/screenshots/timeline-calendar.png', alt: 'Your Own World timeline calendar view showing story events plotted across a custom in-world calendar', width: 1600, height: 541 },
    why: 'Chronology errors are among the most common story problems. A visual timeline lets you see the full shape of your story\'s time and catch contradictions before readers do.',
    useCases: [
      { type: 'Novel', text: 'Track the exact in-story date of every chapter event, see flashback vs. present-day threads, and verify timeline consistency.' },
      { type: '5E Campaign', text: 'Track campaign events, world history, and in-world timing as the party changes the setting.' },
      { type: '5E Campaign', text: 'Track in-game calendar dates, world history events, and session-by-session plot developments on a single view.' },
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
    overview: 'Visual genealogy charts that map bloodlines, marriages, adoptions, and family connections — essential for complex casts and epic stories.',
    shot: { src: '/screenshots/family-tree-thorn.png', alt: 'A family tree in Your Own World showing generations of a character\'s bloodline with relationship details', width: 1600, height: 508 },
    why: 'Epic stories have complex family histories. Tracking dynasties and bloodlines in prose is error-prone. Visual family trees make hereditary relationships instantly clear.',
    useCases: [
      { type: 'Novel', text: 'Map royal succession lines, track which characters share blood, and keep dynastic histories accurate across a long series.' },
      { type: 'Novel', text: 'Build extended family trees for dynasties, inherited secrets, and complicated casts.' },
      { type: '5E Campaign', text: 'Track noble house genealogies, NPC family connections, and hereditary titles for political intrigue campaigns.' },
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
    overview: 'Track organizations, guilds, governments, and power groups — their goals, members, rivalries, and shifting political relationships.',
    shot: { src: '/screenshots/factions-guild.jpg', alt: 'A faction profile in Your Own World showing organization details and active membership', width: 1600, height: 873 },
    why: 'Political complexity and factional conflict drive the most compelling stories. YOW makes organizational relationships as manageable as character relationships.',
    useCases: [
      { type: 'Novel', text: 'Map competing guilds, political parties, or cults — track their agendas, leadership, and how they evolve across the story.' },
      { type: 'TTRPG Campaign', text: 'Track guilds, factions, governments, and rivals as their power shifts between sessions.' },
      { type: '5E Campaign', text: 'Build a living political web — document faction standing, NPC allegiances, and how player choices shift the balance of power in your own private prep.' },
    ],
    capabilities: [
      'Faction profiles with a logo and description',
      'Member character linking with custom role labels',
      'Free-text notes for alliances, rivalries, and political history',
      'Sorting by name or member count',
      'Project-scoped faction records',
    ],
  },
  {
    id: 'ideas',
    label: 'Ideas Board',
    overview: 'A freeform board for capturing stray ideas, plot possibilities, dialogue snippets, research notes, and anything that doesn\'t fit neatly elsewhere yet.',
    shot: { src: '/screenshots/ideas-board.jpg', alt: 'Your Own World ideas board showing idea cards moving from raw capture through developing to in story', width: 1600, height: 700 },
    why: 'Inspiration doesn\'t arrive in organized categories. The Ideas Board is a safe place for the messy, half-formed thoughts that eventually become the best moments in your story.',
    useCases: [
      { type: 'Novel', text: 'Capture chapter ideas before they\'re ready, park alternative plot threads, and collect dialogue that might appear later.' },
      { type: 'Short Story', text: 'Keep spare endings, alternate openings, and title ideas in one accessible place.' },
      { type: '5E Campaign', text: 'Park random encounter ideas, half-formed villain backstories, and future adventure hooks for exactly the right moment.' },
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
    overview: 'Context-aware AI that knows your characters, lore, and plot — ready to answer questions, detect problems, and help you move forward when you\'re stuck.',
    shot: { src: '/screenshots/ai-plot-hole-detector.jpg', alt: 'Your Own World AI plot hole detector flagging a character motivation gap with a suggested fix', width: 1600, height: 652 },
    why: 'Generic AI has no idea who your characters are. YOW\'s AI is briefed on your specific world so it gives help that actually fits your story — not suggestions for someone else\'s.',
    useCases: [
      { type: 'Novel', text: 'Ask "how would Elena react to this betrayal?" and get an answer grounded in her established personality, history, and motivations.' },
      { type: '5E Campaign', text: 'Check if a session beat contradicts established NPC motivation, lore, or timeline context.' },
      { type: '5E Campaign', text: 'Generate NPC dialogue that reflects their faction loyalty and secrets, fully consistent with your campaign\'s established lore.' },
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
    overview: 'Export your manuscript, world bible, character sheets, and lore archives in formats ready for editors, publishers, or personal archiving.',
    why: 'Your work shouldn\'t be trapped inside one app. YOW is where you create — exports let you share, submit, or back up your work in standard formats anytime.',
    useCases: [
      { type: 'Novel', text: 'Export your manuscript as a clean, professionally formatted DOCX or PDF ready for agent submission or beta readers.' },
      { type: 'Novella', text: 'Export your manuscript as a clean DOCX or PDF for readers and editors.' },
      { type: '5E Campaign', text: 'Export your project archive or reference material for backup and sharing.' },
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

// Every tab carries a screenshot slot so the editor can add one to a tab that
// has none yet. An empty src renders no image.
const FEATURE_TABS = RAW_FEATURE_TABS.map(t => ({
  ...t,
  shot: t.shot || { src: '', alt: '', width: 1600, height: 900 },
}))

const COMPARISON_ROWS = [
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
    solution: 'Manuscript editor with chapters, scenes, progress tracking, and separate Write/Edit modes — all built around how stories are actually structured.',
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
    name: 'AI Character Simulation',
    desc: 'Explore an AI-generated roleplay of any character in your project, informed by their profile, history, and relationships.',
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

export const HOME_SECTION_LABELS = {
  projectTypes: 'Project types',
  features: 'What we do (feature tabs)',
  comparison: 'Comparison table',
  problems: 'Tool sprawl (before / with YOW)',
  ai: 'AI features',
  cta: 'Final call to action',
}

export const HOME_DEFAULTS = {
  sectionOrder: ['projectTypes', 'features', 'comparison', 'problems', 'ai', 'cta'],
  hero: {
    image: { src: '/homepage 1.png', alt: '', width: 0, height: 0 },
    eyebrow: 'Your Own World',
    title: "One workspace.\nEvery world\nyou'll ever build.",
    intro: 'YOW is the all-in-one creative workspace for writers, worldbuilders, and game masters — manuscript, characters, lore, maps, and timelines, all connected in one focused studio.',
    sub: 'Built for prose writers and tabletop storytellers — novels, short stories, graphic novels, 5E campaigns, and system-neutral tabletop campaigns.',
    primaryCta: 'Start building your world →',
    secondaryCta: 'Log in',
    trustLine: 'Free to start · No credit card required · Works in your web browser',
  },
  projectTypesSection: {
    eyebrow: 'Built for every format',
    title: 'YOW adapts to how you tell your story.',
    sub: 'Select your project type to see how YOW tailors the workspace to your specific workflow.',
  },
  projectTypes: PROJECT_TYPES,
  featuresSection: {
    eyebrow: 'What we do',
    title: 'Every tool your story needs.',
    sub: 'Explore the complete set of tools inside every YOW project. Select a tab to see what each one does and why it matters.',
    whyLabel: 'Why it matters',
    useCasesLabel: 'Example use cases',
    capabilitiesLabel: 'Key capabilities',
  },
  featureTabs: FEATURE_TABS,
  comparisonSection: {
    eyebrow: 'Not one size fits all',
    title: 'YOW adapts its workspace to each project type.',
    sub: 'Every project type gets its own structure, defaults, and workspace language — built for the way that format actually works.',
  },
  comparisonRows: COMPARISON_ROWS,
  problemsSection: {
    eyebrow: 'The tool sprawl problem',
    title: 'Stop managing tools. Start building worlds.',
    sub: 'Manuscripts, character notes, lore, maps, and timelines often end up in separate tools. YOW keeps those parts connected in one project workspace.',
  },
  problems: PROBLEMS,
  aiSection: {
    eyebrow: 'AI that knows your world',
    title: 'Creative intelligence built for storytellers.',
    sub: "YOW's AI is briefed on your characters, lore, and plot — so it gives help that actually fits your story, not generic suggestions.",
  },
  aiFeatures: AI_FEATURES,
  cta: {
    eyebrow: 'Ready to begin?',
    title: 'Your world is waiting.',
    intro: "Start with a free account — no credit card, no time limit. Upgrade when you're ready for more projects and advanced tools.",
    primaryCta: 'Create your free account →',
    secondaryCta: 'Log in',
    trustLine: 'Free to start · Sync across devices · Export your work anytime',
  },
}
