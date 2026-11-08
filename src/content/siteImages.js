// Screenshots that ship with the site, offered in the editor's image picker.
export const BUILT_IN_IMAGES = [
  'ai-plot-hole-detector.jpg', 'character-dossier.jpg', 'factions-guild.jpg', 'family-tree-thorn.png',
  'ideas-board.jpg', 'locations-atlas.png', 'lore-firekeeper-blood.png', 'manuscript-editor.jpg',
  'map-builder-atlas.jpg', 'map-terrain-editor.jpg', 'project-dashboard.jpg', 'relationship-map.jpg',
  'timeline-calendar.png', 'timeline-history.png', 'worldbuilding-characters.png',
].map(f => ({ label: f, src: `/screenshots/${f}` }))
