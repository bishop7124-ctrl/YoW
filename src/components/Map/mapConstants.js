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

export const TERRAIN_TYPES = [
  { value: 'mountains', label: 'Mountains', color: '#8a8075' },
  { value: 'hills', label: 'Hills', color: '#9aaa7a' },
  { value: 'forest', label: 'Forest', color: '#2d5a27' },
  { value: 'grassland', label: 'Grassland', color: '#6b9e44' },
  { value: 'desert', label: 'Desert', color: '#c9a85c' },
  { value: 'swamp', label: 'Swamp', color: '#4a6b47' },
  { value: 'tundra', label: 'Tundra', color: '#a0b0b8' },
  { value: 'snow', label: 'Snow / Ice', color: '#d8e8f0' },
  { value: 'farmland', label: 'Farmland', color: '#b8c87a' },
  { value: 'wasteland', label: 'Wasteland', color: '#7a6248' },
]

export const TOOLS = [
  { id: 'select', label: 'Select', icon: '↖', group: 'nav' },
  { id: 'pan', label: 'Pan', icon: '✥', group: 'nav' },
  { id: 'shape', label: 'Landmass', icon: '▰', group: 'draw' },
  { id: 'terrain', label: 'Terrain', icon: '◫', group: 'draw' },
  { id: 'region', label: 'Region', icon: '□', group: 'draw' },
  { id: 'river', label: 'River', icon: '〜', group: 'draw' },
  { id: 'road', label: 'Road', icon: '—', group: 'draw' },
  { id: 'border', label: 'Border', icon: '⋯', group: 'draw' },
  { id: 'stamp', label: 'Stamp', icon: '✦', group: 'place' },
  { id: 'location', label: 'Location', icon: '⌖', group: 'place' },
  { id: 'label', label: 'Label', icon: 'T', group: 'place' },
  { id: 'note', label: 'Note', icon: '✎', group: 'place' },
]

// 'terrain' draws filled terrain regions; 'region' draws named political territories
export const POINT_DRAW_TOOLS = new Set(['shape', 'terrain', 'region', 'river', 'road', 'border'])

const ALL_DRAWING_TOOLS = ['select', 'pan', 'shape', 'terrain', 'region', 'river', 'road', 'border', 'stamp', 'location', 'label', 'note']
export const MAP_TYPE_TOOLS = {
  world: ALL_DRAWING_TOOLS,
  region: ALL_DRAWING_TOOLS,
  local: ALL_DRAWING_TOOLS,
  interior: ['select', 'pan', 'shape', 'terrain', 'region', 'road', 'border', 'stamp', 'location', 'label', 'note'],
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
  { id: 'camp', name: 'Camp', category: 'Conflict', size: 90, keywords: 'camp military encampment tents' },
]

export const LOCATION_ICON_OPTIONS = [
  { value: 'pin', label: 'Pin' },
  { value: 'dot', label: 'Dot' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'star', label: 'Star' },
  { value: 'tower', label: 'Tower' },
]

export const MAP_FONT_OPTIONS = [
  { value: '"Palatino Linotype", "Book Antiqua", Georgia, serif', label: 'Fantasy serif' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Classic serif' },
  { value: '"Trebuchet MS", Arial, sans-serif', label: 'Clean sans' },
  { value: '"Courier New", monospace', label: 'Scribed' },
]
