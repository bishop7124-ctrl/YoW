// Default copy for the public Features page. The owner can override any of
// this from /site-editor (see src/utils/siteContent.js). Keys starting with
// "_" are structural and hidden in the editor.

const RAW_MATRIX = [
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
        note: 'Labels adapt to each format: Hook / Inciting incident / Climax for novels; Quest hook / Boss battle / Arc climax for 5E campaigns; Splash / Page turn / Issue climax for comics.',
      },
      {
        label: 'Dedicated Write/Edit modes',
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
        label: 'Character sheet builder',
        prose: false,
        comic: false,
        ttrpg: 'System-neutral custom sheet',
        dnd: '5E classes, stats, spells, and inventory',
        _unique: 'ttrpg',
        note: 'Exclusive to tabletop project types. Tabletop Campaign gets a system-neutral sheet with your own stats, trackers, and traits; 5E Campaign gets a full 5E sheet with ability scores, class, level, equipment, and spell slots.',
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
        note: 'Maps are on by default for Tabletop, 5E, and Comic projects. Novel/novella/short story projects can enable them in project settings.',
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
        label: 'Connect your own AI provider',
        prose: true,
        comic: true,
        ttrpg: true,
        dnd: true,
        note: 'You link your own account from OpenRouter or OpenAI, right from Account Settings. You pay that provider directly for what you use — YOW never marks up or resells AI usage.',
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

// Muted accents chosen to sit alongside the app's forest-green/ivory/
// terracotta palette rather than a stock UI-kit rainbow. Used sparingly —
// top border, title, bullets, and a very faint background glow — so every

// Every row carries note/_unique so the editor can fill them in on any row.
const FEATURE_MATRIX = RAW_MATRIX.map(section => ({
  ...section,
  features: section.features.map(f => ({ note: null, _unique: null, ...f })),
}))

const CALLOUTS = [
  {
    type: 'Prose Fiction',
    _col: 'prose',
    badge: '',
    items: [
      'Word count targets calibrated per format (80k / 30k / 5k)',
      'Acts, Parts, or Sections structure depending on length',
      'Voice consistency analysis — maintain narrative tone across long manuscripts',
      'Project Encyclopaedia export — characters, lore, and world data in one formatted document',
    ],
  },
  {
    type: 'Comic / Graphic Novel',
    _col: 'comic',
    badge: '',
    items: [
      'Volume → Issue → Page structure purpose-built for sequential art',
      'Page-level status tracking (Draft / Revised / Final per page)',
      'Story events mapped to comic moments: Splash, Page turn, Issue climax, Stinger',
      'Interactive maps on by default for visual world reference',
    ],
  },
  {
    type: 'Tabletop Campaign',
    _col: 'ttrpg',
    badge: '',
    items: [
      'System-neutral character sheets — your own stats, trackers, traits, and gear',
      'Session → Encounter structure with campaign arc planning',
      'System-neutral: works for any genre, game system, or ruleset',
      'Maps, factions, and world history all on by default',
      'NPC interview mode — interrogate any character in-voice',
    ],
  },
  {
    type: '5E Campaign',
    _col: 'dnd',
    badge: '',
    items: [
      '5E character builder with classes, stats, spell slots, and inventory',
      'Story events use fantasy-adventure language: Quest hook, Dungeon reveal, Boss battle, Arc climax',
      'Fantasy-first lore language: gods, dungeons, monsters, and high-fantasy world codex',
      'Full NPC database with secrets, faction loyalties, and GM-only notes',
    ],
  },
]

export const FEATURES_DEFAULTS = {
  hero: {
    eyebrow: 'Features',
    title: 'Every tool your story needs.\nBuilt for the way you write.',
    intro: 'YOW is one workspace for six different creative formats. AI Import can turn existing notes, drafts, and worldbuilding documents into connected project records for you to review, alongside manuscript, characters, lore, maps, timelines, and AI tools.',
    primaryCta: 'Start for free →',
    secondaryCta: 'View pricing',
  },
  unique: {
    title: 'What makes each format different',
    intro: 'Every project type shares the same core workspace. These are the features that set each one apart.',
  },
  callouts: CALLOUTS,
  matrixSection: {
    title: 'Full feature breakdown',
    introBefore: 'Every feature, every project type. Click the ',
    introAfter: ' for more detail on any row.',
    featureColumnLabel: 'Feature',
  },
  matrix: FEATURE_MATRIX,
  proseDiff: {
    title: 'Novel vs Novella vs Short Story',
    intro: "These three formats share the same prose workspace. The differences are in scope and what's switched on by default.",
    items: [
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
    ],
  },
  cta: {
    title: 'Ready to build your world?',
    sub: 'Free to start · No credit card required · Works in your web browser',
    primaryCta: 'Start building for free →',
    secondaryCta: 'Read the FAQ',
  },
}
