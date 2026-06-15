// Tour step definitions for each section of the app.
// Each step: { target: string (data-tour attr), title: string, body: string }
// target can be null for a centered tip with no spotlight.

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
    body: 'Already have writing? Use AI Import to upload any file, or Import ZIP to restore a YOW backup or NovelCrafter export.',
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
    title: 'AI provider',
    body: 'Connect your own API key in Account Settings → AI. YOW supports OpenAI, Anthropic, and others.',
  },
]

export const TIMELINE_TOUR = [
  {
    target: 'timeline-header',
    title: 'Timeline',
    body: 'Plot events in chronological order and group them by era in World History. Link events to characters and locations.',
  },
]
