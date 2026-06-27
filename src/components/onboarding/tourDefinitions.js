// Tour step definitions for each section of the app.
// Each step: { target: string (data-tour attr), title: string, body: string }
// target can be null for a centered tip with no spotlight.

export const WELCOME_TOUR = [
  {
    target: null,
    title: 'Welcome to YOW',
    body: 'This is your private workspace for shaping worlds, drafting stories, and keeping the important details close at hand.',
  },
  {
    target: null,
    title: 'Tours will appear as you explore',
    body: 'Short guided tours will introduce the library, manuscript editor, characters, lore, maps, and other tools the first time you visit them.',
  },
  {
    target: null,
    title: 'You stay in control',
    body: 'You can skip any tour, replay tours from the question-mark buttons, or turn all guided tours off now or later in Account Settings.',
  },
]

export const LIBRARY_TOUR = [
  {
    target: 'library-top-bar',
    title: 'Your library',
    body: 'This is your command centre. Create projects, start a new series, or import existing work from here.',
  },
  {
    target: 'new-project-btn',
    title: 'Create a project',
    body: 'Click New Project to choose a format — novel, campaign, comic, and more — then name it and open your workspace.',
  },
  {
    target: 'import-btn',
    title: 'Import existing work',
    body: 'Already have writing? Use AI Import to upload any file, or Import ZIP to restore a YOW backup or compatible project archive.',
  },
  {
    target: 'active-project-hero',
    title: 'Active project',
    body: 'Star any project to pin it here as your active focus. Click the hero panel to open it directly.',
  },
  {
    target: 'library-content',
    title: 'Your project library',
    body: 'All your projects and series live here. Organize into series, track status, and sort by words, title, or update date.',
  },
]

export const MANUSCRIPT_TOUR = [
  {
    target: 'manuscript-structure',
    title: 'Structure sidebar',
    body: 'Your story is organized into acts, chapters, and scenes. Add, rename, reorder, or delete them here.',
  },
  {
    target: 'manuscript-editor',
    title: 'Writing area',
    body: 'Click any scene to open it here. Your work autosaves as you type — look for the save indicator at the top.',
  },
  {
    target: 'manuscript-toolbar',
    title: 'Writing toolbar',
    body: 'Switch between Planning and Writing modes, apply templates, and open the AI writing assistant.',
  },
  {
    target: 'manuscript-word-count',
    title: 'Word count',
    body: 'Live word count for the current scene. Your project total and target completion are shown in the project overview.',
  },
]

export const CHARACTERS_TOUR = [
  {
    target: 'characters-header',
    title: 'Characters',
    body: 'Create and manage all the people in your story. Each character has a profile, relationships tab, and links back to lore and timeline events.',
  },
  {
    target: 'characters-add',
    title: 'Add a character',
    body: 'Click here to create a new character. Give them a name, role, faction, and as much or as little detail as you like.',
  },
]

export const LOCATIONS_TOUR = [
  {
    target: 'locations-header',
    title: 'Locations',
    body: 'Track every place in your world. Locations can be linked to lore entries, timeline events, and placed on your world map.',
  },
]

export const LORE_TOUR = [
  {
    target: 'lore-header',
    title: 'Lore encyclopedia',
    body: 'Your world bible lives here. Create entries for magic systems, artifacts, organizations, history — anything your world needs.',
  },
  {
    target: 'lore-categories',
    title: 'Categories',
    body: 'Filter entries by category to find what you need. Entries can also link to each other, characters, and locations.',
  },
]

export const IDEAS_TOUR = [
  {
    target: 'ideas-header',
    title: 'Ideas board',
    body: 'Capture anything — plot threads, character moments, world details — before they slip away. Move ideas between columns as they develop.',
  },
  {
    target: 'ideas-capture',
    title: 'Quick capture',
    body: 'Jot down an idea fast with the capture bar. You can flesh it out later or convert it into a character, location, or lore entry.',
  },
]

export const MAP_TOUR = [
  {
    target: 'map-header',
    title: 'Map builder',
    body: 'Create world, region, and interior maps. Draw land, water, roads, and borders — then link locations directly to the map.',
  },
  {
    target: 'map-tools',
    title: 'Drawing tools',
    body: 'Select a tool from the palette, then draw on the canvas. Use the inspector on the right to style objects and manage layers.',
  },
]

export const AI_TOOLS_TOUR = [
  {
    target: 'aitools-header',
    title: 'AI tools',
    body: 'Run deeper analysis on your project — detect plot holes, check lore consistency, interview characters, or review style.',
  },
  {
    target: 'aitools-provider',
    title: 'Choose a tool',
    body: 'Pick from Plot Hole Detector, Lore Conflict Checker, Character Interview, and Style Consistency. Connect your API key in Account Settings → AI to get started.',
  },
]

export const TIMELINE_TOUR = [
  {
    target: 'timeline-header',
    title: 'Timeline',
    body: 'Plot events in chronological order and group them by era in World History. Link events to characters and locations.',
  },
]

export const FACTIONS_TOUR = [
  {
    target: 'factions-header',
    title: 'Factions & Allegiances',
    body: 'Define the groups, organisations, and political bodies in your world — guilds, kingdoms, cults, corporations. Characters can belong to one or more factions.',
  },
  {
    target: 'factions-add',
    title: 'Create a faction',
    body: 'Click here to create a new faction. Give it a name, symbol, and description, then assign characters to it from their profiles.',
  },
]

export const WORLDHISTORY_TOUR = [
  {
    target: 'worldhistory-header',
    title: 'Chronicle wall',
    body: 'Record the deep history of your world — eras, wars, founding myths, apocalypses. Entries can be linked to timeline events and lore.',
  },
  {
    target: 'worldhistory-new',
    title: 'Add a chronicle entry',
    body: 'Click New to create a history entry. Assign it an era and date so entries sort correctly on your world timeline.',
  },
]

export const FAMILYTREE_TOUR = [
  {
    target: 'familytree-header',
    title: 'Family Tree',
    body: 'See family members laid out by family group and generation. Social links have their own focal-character Relationship Map.',
  },
  {
    target: 'familytree-canvas',
    title: 'The tree',
    body: 'Each card is a character. Click one to select it, then use the panel on the right to add relationships, jump to their profile, or create a new character.',
  },
]

export const COMIC_TOUR = [
  {
    target: 'comic-sidebar',
    title: 'Issue structure',
    body: 'Organise your comic into volumes and issues here. Add a volume first, then create issues inside it.',
  },
  {
    target: 'comic-page-list',
    title: 'Pages',
    body: 'Each issue is broken into pages. Add pages, set type (splash, spread, standard), and track their status as you script and letter.',
  },
  {
    target: 'comic-page-editor',
    title: 'Page editor',
    body: 'Click a page to open it here. Define panel layouts, write dialogue balloons, add captions, and attach script notes for your artist.',
  },
]

export const OUTLINE_TOUR = [
  {
    target: 'outline-header',
    title: 'Outline',
    body: 'Plan your story structure before you write. Add beats, scenes, and notes here — they stay separate from your manuscript until you\'re ready.',
  },
  {
    target: 'outline-add',
    title: 'Add an act',
    body: 'Click here to add a new act. Each act can contain chapters, and each chapter can contain scenes — build out your structure before you write.',
  },
]

export const DASHBOARD_TOUR = [
  {
    target: 'dashboard-header',
    title: 'Project overview',
    body: 'Your project at a glance — word count progress, recent activity, and quick links to jump back into your writing.',
  },
  {
    target: 'dashboard-word-target',
    title: 'Word count goal',
    body: 'Set a target word count in Project Settings to track your progress here. The bar fills as you write.',
  },
  {
    target: 'dashboard-quick-links',
    title: 'Quick links',
    body: 'Jump straight to your manuscript, characters, or any section of the project from here.',
  },
]
