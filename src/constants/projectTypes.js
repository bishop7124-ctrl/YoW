// defaultSections: sections shown by default for this project type.
// All sections in ALL_SECTIONS (Layout.jsx) are available to enable per project.
// Projects may override with an enabledSections field on the novel object.

export const PROJECT_TYPES = {
  novel: {
    label: 'Novel',
    description: 'Full-length prose fiction with rich worldbuilding',
    workflowSummary: 'Long-form prose drafting with deep worldbuilding support.',
    structure: { level1: 'Act', level2: 'Chapter', level3: 'Scene' },
    storyEventIndicators: [
      { id: 'hook', label: 'Hook', color: '#38bdf8' },
      { id: 'inciting_incident', label: 'Inciting incident', color: '#f97316' },
      { id: 'first_plot_point', label: 'First plot point', color: '#a855f7' },
      { id: 'midpoint', label: 'Midpoint', color: '#22c55e' },
      { id: 'dark_night', label: 'Dark night', color: '#64748b' },
      { id: 'climax', label: 'Climax', color: '#ef4444' },
      { id: 'resolution', label: 'Resolution', color: '#eab308' },
    ],
    planningTab: 'PLANNING',
    writingTab: 'WRITING',
    workspaceLabel: 'Manuscript',
    analyticsLabel: 'Writing Analytics',
    exportLabel: 'Project Encyclopaedia',
    defaultWordTarget: 80000,
    defaultSections: [
      'outline','characters','relationships','familytree','factions',
      'locations','lore','ideas','schedule','timeline','worldhistory','aitools',
    ],
    starterOutline: [
      { title: 'Act 1', children: [{ title: 'Chapter 1', scenes: ['Opening Scene'] }] },
    ],
    // map available but not default — enable via project settings
  },
  novella: {
    label: 'Novella',
    description: 'Medium-length prose fiction — lighter than a novel',
    workflowSummary: 'Medium-form prose drafting with lighter default planning.',
    structure: { level1: 'Part', level2: 'Chapter', level3: 'Scene' },
    storyEventIndicators: [
      { id: 'opening_turn', label: 'Opening turn', color: '#38bdf8' },
      { id: 'inciting_incident', label: 'Inciting incident', color: '#f97316' },
      { id: 'point_of_no_return', label: 'Point of no return', color: '#a855f7' },
      { id: 'reversal', label: 'Reversal', color: '#22c55e' },
      { id: 'climax', label: 'Climax', color: '#ef4444' },
      { id: 'fallout', label: 'Fallout', color: '#eab308' },
    ],
    planningTab: 'PLANNING',
    writingTab: 'WRITING',
    workspaceLabel: 'Manuscript',
    analyticsLabel: 'Writing Analytics',
    exportLabel: 'Project Encyclopaedia',
    defaultWordTarget: 30000,
    defaultSections: [
      'outline','characters','relationships','locations','lore','ideas','schedule','timeline','aitools',
    ],
    starterOutline: [
      { title: 'Part 1', children: [{ title: 'Chapter 1', scenes: ['Opening Turn'] }] },
    ],
    // familytree, factions, map, worldhistory available but not default
  },
  short_story: {
    label: 'Short Story',
    description: 'Brief prose fiction — focused and stripped-down',
    workflowSummary: 'Short-form drafting with compact planning and a 5,000-word target.',
    structure: { level1: 'Part', level2: 'Section', level3: 'Scene' },
    storyEventIndicators: [
      { id: 'opening_image', label: 'Opening image', color: '#38bdf8' },
      { id: 'disruption', label: 'Disruption', color: '#f97316' },
      { id: 'turn', label: 'Turn', color: '#a855f7' },
      { id: 'reveal', label: 'Reveal', color: '#22c55e' },
      { id: 'climax', label: 'Climax', color: '#ef4444' },
      { id: 'final_image', label: 'Final image', color: '#eab308' },
    ],
    planningTab: 'PLANNING',
    writingTab: 'WRITING',
    workspaceLabel: 'Story Draft',
    analyticsLabel: 'Short Form Analytics',
    exportLabel: 'Story Project Export',
    defaultWordTarget: 5000,
    defaultSections: [
      'outline','characters','relationships','locations','lore','ideas','schedule','timeline','aitools',
    ],
    starterOutline: [
      { title: 'Story Draft', children: [{ title: 'Main Section', scenes: ['Opening Image'] }] },
    ],
    // heavy sections (factions, map, worldhistory) available but not default
  },
  dnd_campaign: {
    label: 'D&D Campaign',
    description: 'D&D-flavoured fantasy campaign bible with arcs, sessions, encounters, maps, factions, and lore',
    workflowSummary: 'D&D fantasy campaign bible for sessions, encounters, maps, factions, and lore.',
    hint: 'Designed for D&D — classes, gods, dungeons, monsters, and high-fantasy lore.',
    launchPositioning: 'D&D-flavoured campaign bible with fantasy-first language, NPCs, factions, maps, sessions, and encounters.',
    structure: { level1: 'Story Arc', level2: 'Session', level3: 'Encounter' },
    storyEventIndicators: [
      { id: 'quest_hook', label: 'Quest hook', color: '#38bdf8' },
      { id: 'inciting_quest', label: 'Inciting quest', color: '#f97316' },
      { id: 'dungeon_reveal', label: 'Dungeon reveal', color: '#a855f7' },
      { id: 'boss_battle', label: 'Boss battle', color: '#ef4444' },
      { id: 'party_setback', label: 'Party setback', color: '#64748b' },
      { id: 'arc_climax', label: 'Arc climax', color: '#dc2626' },
      { id: 'reward_fallout', label: 'Reward / fallout', color: '#eab308' },
    ],
    planningTab: 'WORLDBUILDING',
    writingTab: 'SESSIONS',
    workspaceLabel: 'Sessions',
    analyticsLabel: 'Campaign Draft Analytics',
    exportLabel: 'Campaign Bible Export',
    defaultSections: [
      'outline','characters','relationships','familytree','factions',
      'locations','lore','ideas','schedule','timeline','worldhistory','map','aitools','characterbuilder',
    ],
    starterOutline: [
      { title: 'Opening Arc', children: [{ title: 'Session 1', scenes: ['Opening Encounter'] }] },
    ],
  },
  tabletop_rpg: {
    label: 'Tabletop Campaign',
    description: 'System-neutral campaign bible — works for any ruleset, genre, or homebrew system',
    workflowSummary: 'System-neutral campaign bible. Works for any ruleset, tone, or genre — fantasy, horror, sci-fi, or homebrew.',
    hint: 'System-neutral — no D&D assumptions. Works for any ruleset or homebrew system.',
    launchPositioning: 'System-neutral campaign bible for any tabletop ruleset — sessions, encounters, factions, locations, and world lore.',
    structure: { level1: 'Campaign Arc', level2: 'Session', level3: 'Encounter' },
    storyEventIndicators: [
      { id: 'adventure_hook', label: 'Adventure hook', color: '#38bdf8' },
      { id: 'first_complication', label: 'First complication', color: '#f97316' },
      { id: 'escalation', label: 'Escalation', color: '#a855f7' },
      { id: 'player_choice', label: 'Major choice', color: '#22c55e' },
      { id: 'crisis_point', label: 'Crisis point', color: '#64748b' },
      { id: 'climax', label: 'Climax', color: '#ef4444' },
      { id: 'consequences', label: 'Consequences', color: '#eab308' },
    ],
    planningTab: 'WORLDBUILDING',
    writingTab: 'SESSIONS',
    workspaceLabel: 'Sessions',
    analyticsLabel: 'Campaign Analytics',
    exportLabel: 'Campaign Bible Export',
    defaultSections: [
      'outline','characters','relationships','familytree','factions',
      'locations','lore','ideas','schedule','timeline','worldhistory','map','aitools','characterbuilder',
    ],
    starterOutline: [
      { title: 'Campaign Arc 1', children: [{ title: 'Session 1', scenes: ['Opening Encounter'] }] },
    ],
  },
  comic: {
    label: 'Comic / Graphic Novel',
    description: 'Sequential art narrative',
    workflowSummary: 'Sequential-art beta with volume, issue, and page-level structure.',
    structure: { level1: 'Volume', level2: 'Issue', level3: 'Page' },
    storyEventIndicators: [
      { id: 'splash', label: 'Splash moment', color: '#38bdf8' },
      { id: 'inciting_panel', label: 'Inciting panel', color: '#f97316' },
      { id: 'page_turn', label: 'Page turn', color: '#a855f7' },
      { id: 'reveal', label: 'Reveal', color: '#22c55e' },
      { id: 'issue_climax', label: 'Issue climax', color: '#ef4444' },
      { id: 'stinger', label: 'Stinger', color: '#eab308' },
    ],
    planningTab: 'PLANNING',
    writingTab: 'PAGES',
    workspaceLabel: 'Pages',
    analyticsLabel: 'Page Draft Analytics',
    exportLabel: 'Comic Project Export',
    defaultSections: [
      'outline','characters','relationships','familytree','locations',
      'lore','ideas','schedule','timeline','map','aitools',
    ],
    starterOutline: [
      { title: 'Volume 1', children: [{ title: 'Issue 1', scenes: ['Page 1'] }] },
    ],
    // worldhistory available but not default for comics
  },
}

// ---------------------------------------------------------------------------
// Retired project types — removed from the creation UI but preserved here as
// a reference/backup. Existing projects with these type keys still load fine
// via getProjectType's novel fallback.
// ---------------------------------------------------------------------------
export const RETIRED_PROJECT_TYPES = {
  play: {
    label: 'Play',
    description: 'Stage play or theatrical script',
    workflowSummary: 'Stage-script beta with acts, scenes, beats, and dialogue-first drafting.',
    structure: { level1: 'Act', level2: 'Scene', level3: 'Beat' },
    storyEventIndicators: [
      { id: 'opening_tableau', label: 'Opening tableau', color: '#38bdf8' },
      { id: 'inciting_action', label: 'Inciting action', color: '#f97316' },
      { id: 'entrance', label: 'Key entrance', color: '#a855f7' },
      { id: 'reversal', label: 'Reversal', color: '#22c55e' },
      { id: 'curtain', label: 'Curtain moment', color: '#eab308' },
      { id: 'climax', label: 'Climax', color: '#ef4444' },
      { id: 'denouement', label: 'Denouement', color: '#14b8a6' },
    ],
    planningTab: 'PLANNING', writingTab: 'SCRIPT', workspaceLabel: 'Script',
    analyticsLabel: 'Script Draft Analytics', exportLabel: 'Play Project Export',
    defaultSections: ['outline','characters','relationships','familytree','locations','lore','ideas','schedule','aitools'],
    starterOutline: [{ title: 'Act I', children: [{ title: 'Scene 1', scenes: ['Opening Beat'] }] }],
  },
  screenplay: {
    label: 'Screenplay',
    description: 'Feature film or short film script',
    workflowSummary: 'Screenplay beta with acts, sequences, scenes, and script element controls.',
    structure: { level1: 'Act', level2: 'Sequence', level3: 'Scene' },
    storyEventIndicators: [
      { id: 'opening_image', label: 'Opening image', color: '#38bdf8' },
      { id: 'inciting_incident', label: 'Inciting incident', color: '#f97316' },
      { id: 'break_into_two', label: 'Break into Act II', color: '#a855f7' },
      { id: 'midpoint', label: 'Midpoint', color: '#22c55e' },
      { id: 'all_is_lost', label: 'All is lost', color: '#64748b' },
      { id: 'finale', label: 'Finale', color: '#ef4444' },
      { id: 'final_image', label: 'Final image', color: '#eab308' },
    ],
    planningTab: 'PLANNING', writingTab: 'SCRIPT', workspaceLabel: 'Script',
    analyticsLabel: 'Script Draft Analytics', exportLabel: 'Screenplay Project Export',
    defaultSections: ['outline','characters','relationships','familytree','factions','locations','lore','ideas','schedule','timeline','aitools'],
    starterOutline: [{ title: 'Act I', children: [{ title: 'Opening Sequence', scenes: ['Opening Image'] }] }],
  },
  tv_show: {
    label: 'TV Series',
    description: 'Multi-episode television series',
    workflowSummary: 'Episode beta with season, pilot, episode, and act-level structure.',
    structure: { level1: 'Season', level2: 'Episode', level3: 'Act' },
    storyEventIndicators: [
      { id: 'pilot_hook', label: 'Pilot hook', color: '#38bdf8' },
      { id: 'case_engine', label: 'Story engine', color: '#f97316' },
      { id: 'episode_break', label: 'Episode break', color: '#a855f7' },
      { id: 'midseason_turn', label: 'Midseason turn', color: '#22c55e' },
      { id: 'bottle_episode', label: 'Bottle episode', color: '#14b8a6' },
      { id: 'season_climax', label: 'Season climax', color: '#ef4444' },
      { id: 'cliffhanger', label: 'Cliffhanger', color: '#eab308' },
    ],
    planningTab: 'PLANNING', writingTab: 'EPISODES', workspaceLabel: 'Episodes',
    analyticsLabel: 'Episode Draft Analytics', exportLabel: 'TV Series Project Export',
    defaultSections: ['outline','characters','relationships','familytree','factions','locations','lore','ideas','schedule','timeline','worldhistory','aitools'],
    starterOutline: [{ title: 'Season 1', children: [{ title: 'Pilot', scenes: ['Act One'] }] }],
  },
  video_game: {
    label: 'Video Game',
    description: 'Interactive narrative or game world',
    workflowSummary: 'Game narrative beta for worlds, factions, missions, and story progression.',
    structure: { level1: 'Act', level2: 'Chapter', level3: 'Scene' },
    storyEventIndicators: [
      { id: 'tutorial_hook', label: 'Tutorial hook', color: '#38bdf8' },
      { id: 'call_to_action', label: 'Call to action', color: '#f97316' },
      { id: 'first_choice', label: 'First major choice', color: '#22c55e' },
      { id: 'quest_turn', label: 'Quest turn', color: '#a855f7' },
      { id: 'boss_encounter', label: 'Boss encounter', color: '#ef4444' },
      { id: 'final_mission', label: 'Final mission', color: '#dc2626' },
      { id: 'ending_state', label: 'Ending state', color: '#eab308' },
    ],
    planningTab: 'WORLDBUILDING', writingTab: 'LEVELS', workspaceLabel: 'Narrative',
    analyticsLabel: 'Narrative Draft Analytics', exportLabel: 'Game Narrative Bible Export',
    defaultSections: ['outline','characters','relationships','factions','locations','lore','ideas','schedule','timeline','worldhistory','map','aitools'],
    starterOutline: [{ title: 'Act 1', children: [{ title: 'Opening Mission', scenes: ['Tutorial Hook'] }] }],
  },
}

export const getProjectType = (type) => PROJECT_TYPES[type] ?? PROJECT_TYPES.novel

export const getStoryEventIndicators = (type) =>
  getProjectType(type).storyEventIndicators ?? PROJECT_TYPES.novel.storyEventIndicators

export const DEFAULT_TYPE = 'novel'

export const PROJECT_TYPE_STAGE = {
  novel: {
    stage: 'live',
    label: 'Live',
    note: 'Launch-ready long-form prose workflow.',
  },
  novella: {
    stage: 'live',
    label: 'Live',
    note: 'Launch-ready medium-form prose workflow.',
  },
  short_story: {
    stage: 'live',
    label: 'Live',
    note: 'Launch-ready short-form prose workflow.',
  },
  dnd_campaign: {
    stage: 'live',
    label: 'Live',
    note: 'Launch-ready campaign bible workflow.',
  },
  tabletop_rpg: {
    stage: 'live',
    label: 'Live',
    note: 'Launch-ready system-neutral campaign bible workflow.',
  },
  comic: {
    stage: 'beta',
    label: 'Beta',
    note: 'Limited workflow: page-level structure is available; panel planning and art-direction fields are still in progress.',
  },
}

export const getProjectTypeStage = (type) => PROJECT_TYPE_STAGE[type] ?? PROJECT_TYPE_STAGE.novel

// All section IDs that exist in the app — used to validate enabledSections overrides.
export const ALL_SECTION_IDS = [
  'outline','characters','relationships','familytree','factions',
  'locations','lore','ideas','schedule','timeline','worldhistory','map','aitools','characterbuilder',
]

// Returns the active section list for a project, supporting per-project overrides.
// Default: all sections on. Users opt-out via project settings.
// Use novel.enabledSections (saved by ProjectSettings) to persist preferences.
export const getEnabledSections = (novel) => {
  const override = novel?.enabledSections
  if (Array.isArray(override)) {
    const enabled = override.filter(id => id !== 'network')
    if (!novel?.relationshipMapConfigured && enabled.includes('characters') && !enabled.includes('relationships')) {
      enabled.splice(enabled.indexOf('characters') + 1, 0, 'relationships')
    }
    return enabled
  }
  return ALL_SECTION_IDS
}
