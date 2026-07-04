export const MAP_W = 2400
export const MAP_H = 1600
export const SCHEMA_VERSION = 3
export const DEFAULT_ZOOM = 0.44
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 3
export const WHEEL_ZOOM_INTENSITY = 0.0016
export const DRAG_THRESHOLD_PX = 4
export const MIN_SIZE = 16
export const SNAP_SIZES = [20, 40, 80]

export const STYLE_PRESETS = [
  { value: 'parchment', label: 'Parchment' },
  { value: 'atlas', label: 'Atlas' },
  { value: 'campaign', label: 'Campaign Sketch' },
  { value: 'blueprint', label: 'Blueprint' },
]

export const MAP_TYPE_OPTIONS = [
  { value: 'world', label: 'World Map' },
  { value: 'region', label: 'Region Map' },
  { value: 'local', label: 'Local Map' },
  { value: 'interior', label: 'Interior Map' },
]

// Scale-matched noun for the political-territory tool on each map type:
// Kingdom > Territory > Area > Room. Label-only — the underlying object type
// stays 'territory' so existing map data is unaffected.
const TERRITORY_NOUNS = { world: 'Kingdom', region: 'Territory', local: 'Area', interior: 'Room' }
export function territoryNounFor(mapType) {
  return TERRITORY_NOUNS[mapType] || 'Region'
}
export function territoryNounPluralFor(mapType) {
  const noun = territoryNounFor(mapType)
  return noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`
}

// Default background base per map type: world maps start as open water,
// region/local maps start as land (you are usually inside a continent).
// Only applied to newly created maps; existing maps keep 'water'.
export function defaultBaseLayerFor(mapType) {
  return mapType === 'region' || mapType === 'local' ? 'land' : 'water'
}

// Default movement-scale labels per map type (interior is set at creation).
export const DEFAULT_GRID_SCALES = {
  world: '1 square = 100 miles',
  region: '1 square = 10 miles',
  local: '1 square = 100 ft',
}

export const TERRAIN_TYPES = [
  { value: 'mountains', label: 'Mountains', color: '#8a8075' },
  { value: 'hills', label: 'Hills', color: '#9aaa7a' },
  { value: 'forest', label: 'Forest', color: '#2d5a27' },
  { value: 'grassland', label: 'Grassland', color: '#6b9e44' },
  { value: 'desert', label: 'Desert', color: '#c9a85c' },
  { value: 'swamp', label: 'Swamp', color: '#4a6b47' },
  { value: 'tundra', label: 'Snowy Tundra', color: '#c9d6d4' },
  { value: 'farmland', label: 'Farmland', color: '#b8c87a' },
]

export const TOOLS = [
  { id: 'select', label: 'Select', icon: '↖', group: 'nav' },
  { id: 'pan', label: 'Pan', icon: '✥', group: 'nav' },
  { id: 'shape', label: 'Landmass', icon: '▰', group: 'draw' },
  { id: 'terrain', label: 'Terrain', icon: '◫', group: 'draw' },
  { id: 'region', label: 'Region', icon: '□', group: 'draw' },
  { id: 'wall', label: 'Wall', icon: '▊', group: 'draw' },
  { id: 'opening', label: 'Door / Window', icon: '⌞', group: 'draw' },
  { id: 'water', label: 'Water', icon: '≈', group: 'draw' },
  { id: 'river', label: 'River', icon: '〜', group: 'draw' },
  { id: 'road', label: 'Road', icon: '—', group: 'draw' },
  { id: 'path', label: 'Path', icon: '╌', group: 'draw' },
  { id: 'border', label: 'Border', icon: '⋯', group: 'draw' },
  { id: 'stamp', label: 'Stamp', icon: '✦', group: 'place' },
  { id: 'location', label: 'Location', icon: '⌖', group: 'place' },
  { id: 'label', label: 'Label', icon: 'T', group: 'place' },
  { id: 'note', label: 'Note', icon: '✎', group: 'place' },
]

// 'terrain' draws filled terrain regions; 'region' draws named political territories/rooms
export const POINT_DRAW_TOOLS = new Set(['shape', 'terrain', 'region', 'wall', 'water', 'river', 'road', 'path', 'border'])

// 'note' is intentionally absent from every toolset (product decision
// 2026-07-04: no Note tool in the left rail). Existing placed notes still
// render, select, and edit through Object Properties.
const ALL_DRAWING_TOOLS = ['select', 'pan', 'shape', 'terrain', 'region', 'water', 'river', 'road', 'border', 'stamp', 'location', 'label']
const LOCAL_DRAWING_TOOLS = ['select', 'pan', 'shape', 'terrain', 'region', 'water', 'river', 'path', 'wall', 'stamp', 'location', 'label']
const INTERIOR_DRAWING_TOOLS = ['select', 'pan', 'wall', 'opening', 'region', 'stamp', 'label']
export const MAP_TYPE_TOOLS = {
  world: ALL_DRAWING_TOOLS,
  region: ALL_DRAWING_TOOLS,
  local: LOCAL_DRAWING_TOOLS,
  interior: INTERIOR_DRAWING_TOOLS,
}

export const stampAssetCache = new Map()

export function loadStampAsset(src) {
  if (!src || typeof Image === 'undefined') return null
  const cached = stampAssetCache.get(src)
  if (cached) return cached
  const img = new Image()
  const entry = { image: img, loaded: false, failed: false }
  img.onload = () => {
    entry.loaded = true
    window.dispatchEvent(new CustomEvent('yow:stamp-asset-loaded'))
  }
  img.onerror = () => { entry.failed = true }
  img.src = src
  stampAssetCache.set(src, entry)
  return entry
}

export const STAMP_LIBRARY = [
  // Settlements
  { id: 'capital', name: 'Capital', category: 'Settlements', assetSrc: '/map-stamps/capital.png', size: 110, keywords: 'capital crown realm kingdom seat' },
  { id: 'city', name: 'City', category: 'Settlements', assetSrc: '/map-stamps/city.png', size: 106, keywords: 'city settlement urban towers' },
  { id: 'village', name: 'Village', category: 'Settlements', assetSrc: '/map-stamps/village.png', size: 96, keywords: 'village town settlement houses' },
  // Fortifications
  { id: 'castle', name: 'Castle', category: 'Fortifications', assetSrc: '/map-stamps/castle.png', size: 104, keywords: 'castle fort keep citadel' },
  { id: 'fortress', name: 'Fortress', category: 'Fortifications', assetSrc: '/map-stamps/fortress.png', size: 104, keywords: 'fortress fort stronghold keep' },
  { id: 'tower', name: 'Tower', category: 'Fortifications', size: 88, keywords: 'tower watch watchtower' },
  // Landmarks
  { id: 'harbor', name: 'Harbor', category: 'Landmarks', assetSrc: '/map-stamps/harbor.png', size: 98, keywords: 'harbor port docks anchor sea' },
  { id: 'ruins', name: 'Ruins', category: 'Landmarks', assetSrc: '/map-stamps/ruins.png', size: 96, keywords: 'ruins ancient broken landmark' },
  { id: 'landmark', name: 'Landmark', category: 'Landmarks', assetSrc: '/map-stamps/landmark.png', size: 92, keywords: 'landmark obelisk monument' },
  { id: 'bridge', name: 'Bridge', category: 'Landmarks', size: 90, keywords: 'bridge crossing river' },
  // Nature
  { id: 'mountains', name: 'Mountains', category: 'Nature', assetSrc: '/map-stamps/mountains.png', size: 116, keywords: 'mountains peaks range hills' },
  { id: 'forest', name: 'Forest', category: 'Nature', assetSrc: '/map-stamps/forest.png', size: 112, keywords: 'forest woods trees woodland' },
  { id: 'cave', name: 'Cave', category: 'Nature', assetSrc: '/map-stamps/cave.png', size: 102, keywords: 'cave cavern grotto lair' },
  { id: 'mine', name: 'Mine', category: 'Nature', assetSrc: '/map-stamps/mine.png', size: 102, keywords: 'mine quarry pickaxe ore' },
  // Magic
  { id: 'temple', name: 'Temple', category: 'Magic', assetSrc: '/map-stamps/temple.png', size: 104, keywords: 'temple shrine columns sacred' },
  { id: 'portal', name: 'Portal', category: 'Magic', assetSrc: '/map-stamps/portal.png', size: 96, keywords: 'portal gate magic arch' },
  { id: 'magic-source', name: 'Magic Source', category: 'Magic', assetSrc: '/map-stamps/magic-source.png', size: 96, keywords: 'magic source crystal mana power' },
  { id: 'shrine', name: 'Shrine', category: 'Magic', size: 88, keywords: 'shrine small sacred altar' },
  // Conflict
  { id: 'battlefield', name: 'Battlefield', category: 'Conflict', assetSrc: '/map-stamps/battlefield.png', size: 98, keywords: 'battlefield battle swords war' },
  { id: 'camp', name: 'Camp', category: 'Conflict', assetSrc: '/map-stamps/camp.png', size: 90, keywords: 'camp military encampment tents' },
  // Furniture
  { id: 'bed', name: 'Bed', category: 'Furniture', size: 92, keywords: 'bed bedroom furniture cot bunk' },
  { id: 'table', name: 'Table', category: 'Furniture', size: 86, keywords: 'table dining furniture workbench' },
  { id: 'chair', name: 'Chair', category: 'Furniture', size: 70, keywords: 'chair stool seat furniture' },
  { id: 'desk', name: 'Desk', category: 'Furniture', size: 84, keywords: 'desk study writing table furniture' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'Furniture', size: 86, keywords: 'bookshelf shelves library bookcase furniture' },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Furniture', size: 82, keywords: 'wardrobe cupboard cabinet armoire furniture' },
  { id: 'chest', name: 'Chest', category: 'Furniture', size: 76, keywords: 'chest storage trunk treasure loot' },
  { id: 'barrel-crate', name: 'Barrel / Crate', category: 'Furniture', size: 76, keywords: 'barrel crate box storage supplies' },
  { id: 'rug', name: 'Rug', category: 'Furniture', size: 96, keywords: 'rug carpet mat floor' },
  // Fixtures
  { id: 'fireplace', name: 'Fireplace', category: 'Fixtures', size: 84, keywords: 'fireplace hearth fire chimney fixture' },
  { id: 'altar', name: 'Altar', category: 'Fixtures', size: 84, keywords: 'altar shrine ritual temple fixture' },
  { id: 'pillar', name: 'Pillar', category: 'Fixtures', size: 78, keywords: 'pillar column support fixture' },
  { id: 'statue', name: 'Statue', category: 'Fixtures', size: 82, keywords: 'statue sculpture monument fixture' },
  { id: 'stairs', name: 'Stairs', category: 'Fixtures', size: 86, keywords: 'stairs steps stairway up down fixture' },
  { id: 'ladder', name: 'Ladder', category: 'Fixtures', size: 80, keywords: 'ladder climb hatch fixture' },
  // Signifiers
  { id: 'trap', name: 'Trap', category: 'Signifiers', size: 76, keywords: 'trap snare pit spike danger signifier' },
  { id: 'secret', name: 'Secret', category: 'Signifiers', size: 74, keywords: 'secret hidden concealed clue signifier' },
  { id: 'locked', name: 'Locked', category: 'Signifiers', size: 72, keywords: 'locked lock key sealed signifier' },
  { id: 'hazard', name: 'Hazard', category: 'Signifiers', size: 76, keywords: 'hazard danger warning poison fire signifier' },
  { id: 'loot', name: 'Loot', category: 'Signifiers', size: 78, keywords: 'loot treasure reward cache signifier' },
  { id: 'encounter', name: 'Encounter', category: 'Signifiers', size: 78, keywords: 'encounter enemy monster npc fight signifier' },
  { id: 'objective', name: 'Objective', category: 'Signifiers', size: 78, keywords: 'objective goal quest target signifier' },
  // Local map features
  { id: 'building', name: 'Building', category: 'Local Structures', size: 90, keywords: 'building house structure local' },
  { id: 'cottage', name: 'Cottage', category: 'Local Structures', size: 86, keywords: 'cottage house cabin home local' },
  { id: 'shop', name: 'Shop', category: 'Local Structures', size: 82, keywords: 'shop store market local' },
  { id: 'inn', name: 'Inn', category: 'Local Structures', size: 86, keywords: 'inn tavern alehouse local' },
  { id: 'well', name: 'Well', category: 'Local Features', size: 72, keywords: 'well water town square local' },
  { id: 'fountain', name: 'Fountain', category: 'Local Features', size: 78, keywords: 'fountain water plaza local' },
  { id: 'gate', name: 'Gate', category: 'Local Features', size: 84, keywords: 'gate entrance arch local' },
  { id: 'fence', name: 'Fence', category: 'Local Features', size: 88, keywords: 'fence boundary posts local' },
  { id: 'signpost', name: 'Signpost', category: 'Local Features', size: 70, keywords: 'sign signpost marker local' },
  { id: 'market-stall', name: 'Market Stall', category: 'Local Features', size: 82, keywords: 'market stall tent vendor local' },
  { id: 'wagon', name: 'Wagon', category: 'Local Features', size: 84, keywords: 'wagon cart transport local' },
  { id: 'dock', name: 'Dock', category: 'Local Features', size: 88, keywords: 'dock pier jetty local water' },
  { id: 'boat', name: 'Boat', category: 'Local Features', size: 86, keywords: 'boat skiff river lake local' },
  { id: 'tree', name: 'Tree', category: 'Local Nature', size: 72, keywords: 'tree local nature' },
  { id: 'boulder', name: 'Boulder', category: 'Local Nature', size: 66, keywords: 'boulder rock stone local nature' },
  { id: 'garden', name: 'Garden', category: 'Local Nature', size: 86, keywords: 'garden plants local nature' },
  { id: 'field', name: 'Field', category: 'Local Nature', size: 96, keywords: 'field crop farmland local nature' },
  { id: 'campfire', name: 'Campfire', category: 'Local Markers', size: 70, keywords: 'campfire fire campsite local marker' },
  { id: 'lookout', name: 'Lookout', category: 'Local Markers', size: 76, keywords: 'lookout watch point marker local' },
  { id: 'ambush', name: 'Ambush', category: 'Local Markers', size: 76, keywords: 'ambush danger encounter local marker' },
]

export const LOCATION_ICON_OPTIONS = [
  { value: 'pin', label: 'Pin' },
  { value: 'dot', label: 'Dot' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'star', label: 'Star' },
  { value: 'tower', label: 'Tower' },
]

export const MAP_FONT_OPTIONS = [
  { value: 'Papyrus, "Apple Chancery", "Palatino Linotype", "Book Antiqua", fantasy, serif', label: 'Fantasy serif' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Standard serif' },
  { value: '"Trebuchet MS", Arial, sans-serif', label: 'Clean sans' },
  { value: '"Courier New", monospace', label: 'Scribed' },
]
