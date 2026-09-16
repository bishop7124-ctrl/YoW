const MAP_ID = 'u8wguqm7dcms1ip6no'
const PROJECT_ID = 'yvb7i4sufksms1ip6no'

const pointObject = (id, type, x, y, properties, linkedEntity = null) => ({
  id: `ember-map-${id}`,
  type,
  x,
  y,
  width: 44,
  height: 44,
  visible: true,
  geometry: null,
  properties,
  linkedEntity,
})

const pathObject = (id, type, points, properties = {}, linkedEntity = null) => ({
  id: `ember-map-${id}`,
  type,
  x: 0,
  y: 0,
  width: 44,
  height: 44,
  visible: true,
  geometry: { type: ['shape', 'water', 'territory'].includes(type) ? 'polygon' : 'path', points: points.map(([x, y]) => ({ x, y })) },
  properties,
  linkedEntity,
})

const linkedLocation = entityId => ({ entityType: 'location', entityId })

const FIRST_ATLAS_TERRITORY_POINTS = [
  [[65, 315], [330, 275], [505, 415], [415, 735], [70, 670]],
  [[390, 220], [735, 175], [910, 320], [855, 590], [535, 620], [405, 470]],
  [[700, 55], [1120, 55], [1125, 355], [915, 340], [735, 190]],
]

const SECOND_ATLAS_TERRITORIES = [
  ['red-pine-march', [[65, 315], [330, 275], [405, 220], [405, 470], [535, 620], [415, 735], [70, 670]]],
  ['crownlands', [[405, 220], [735, 190], [915, 340], [855, 590], [535, 620], [405, 470]]],
  ['hollow-reach', [[700, 55], [1120, 55], [1125, 355], [915, 340], [735, 190]]],
]

const STRAIGHT_ENGLAND_TERRITORIES = [
  ['red-pine-march', [[430, 350], [390, 300], [420, 245], [385, 190], [430, 140], [470, 80], [600, 70], [700, 100], [735, 150], [790, 200], [820, 270], [780, 330], [610, 390]]],
  ['crownlands', [[430, 350], [610, 390], [650, 660], [560, 690], [450, 670], [360, 700], [260, 680], [180, 635], [230, 590], [340, 550], [390, 500], [430, 450], [400, 395]]],
  ['hollow-reach', [[780, 330], [820, 370], [875, 410], [860, 470], [800, 500], [820, 550], [900, 590], [860, 640], [760, 675], [650, 660], [610, 390]]],
]

const roughEdge = (start, end, seed, amplitude) => {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy) || 1
  const segments = Math.max(2, Math.ceil(length / 28))
  const phase = seed * 1.618
  const frequency = 2 + (seed % 4)
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments
    const envelope = Math.sin(Math.PI * t)
    const offset = envelope * amplitude * (
      Math.sin(t * Math.PI * frequency + phase) * 0.72
      + Math.sin(t * Math.PI * (frequency + 3) + phase * 0.43) * 0.28
    )
    return [
      Math.round((start[0] + dx * t - (dy / length) * offset) * 100) / 100,
      Math.round((start[1] + dy * t + (dx / length) * offset) * 100) / 100,
    ]
  })
}

const roughChain = (vertices, seed, amplitude) => vertices.slice(0, -1).flatMap((start, index) => (
  roughEdge(start, vertices[index + 1], seed + index * 17, amplitude).slice(0, -1)
)).concat([vertices.at(-1)])

const polygonFromChains = (...chains) => {
  const points = chains.flatMap((chain, index) => index ? chain.slice(1) : chain)
  const first = points[0]
  const last = points.at(-1)
  return first[0] === last[0] && first[1] === last[1] ? points.slice(0, -1) : points
}

const A = [430, 350]
const B = [780, 330]
const C = [610, 390]
const D = [650, 660]
const northCoast = roughChain([A, [390, 300], [420, 245], [385, 190], [430, 140], [470, 80], [600, 70], [700, 100], [735, 150], [790, 200], [820, 270], B], 11, 7)
const southwestCoast = roughChain([D, [560, 690], [450, 670], [360, 700], [260, 680], [180, 635], [230, 590], [340, 550], [390, 500], [430, 450], [400, 395], A], 53, 7)
const eastCoast = roughChain([B, [820, 370], [875, 410], [860, 470], [800, 500], [820, 550], [900, 590], [860, 640], [760, 675], D], 89, 7)
const borderAC = roughEdge(A, C, 131, 4)
const borderBC = roughEdge(B, C, 149, 4)
const borderCD = roughEdge(C, D, 167, 4)

const ENGLAND_INSPIRED_TERRITORIES = [
  ['red-pine-march', polygonFromChains(northCoast, borderBC, [...borderAC].reverse())],
  ['crownlands', polygonFromChains(borderAC, borderCD, southwestCoast)],
  ['hollow-reach', polygonFromChains(eastCoast, [...borderCD].reverse(), [...borderBC].reverse())],
]

const FIRST_ATLAS_TERRAIN_STAMPS = [
  ['mountain-1', 'mountain', 175, 115, 50], ['mountain-2', 'mountain', 230, 105, 58],
  ['mountain-3', 'mountain', 290, 122, 52], ['mountain-4', 'mountain', 355, 105, 60],
  ['mountain-5', 'mountain', 420, 125, 48], ['mountain-6', 'mountain', 470, 150, 44],
  ['forest-1', 'forest', 150, 535, 46], ['forest-2', 'forest', 205, 565, 52],
  ['forest-3', 'forest', 265, 540, 48], ['forest-4', 'forest', 315, 580, 54],
  ['forest-5', 'forest', 355, 525, 44], ['forest-6', 'forest', 885, 275, 42],
  ['forest-7', 'forest', 940, 300, 48], ['forest-8', 'forest', 990, 260, 42],
  ['hills-1', 'hills', 470, 690, 44], ['hills-2', 'hills', 540, 670, 48],
  ['hills-3', 'hills', 805, 140, 44],
]

const TERRAIN_STAMPS = [
  ['mountain-1', 'mountain', 470, 115, 38], ['mountain-2', 'mountain', 515, 95, 44],
  ['mountain-3', 'mountain', 555, 125, 40], ['mountain-4', 'mountain', 495, 165, 42],
  ['mountain-5', 'mountain', 545, 190, 36], ['mountain-6', 'mountain', 605, 110, 34],
  ['forest-1', 'forest', 250, 620, 38], ['forest-2', 'forest', 305, 640, 42],
  ['forest-3', 'forest', 355, 610, 38], ['forest-4', 'forest', 405, 575, 42],
  ['forest-5', 'forest', 455, 535, 36], ['forest-6', 'forest', 805, 390, 34],
  ['forest-7', 'forest', 840, 420, 38], ['forest-8', 'forest', 815, 455, 34],
  ['hills-1', 'hills', 545, 585, 38], ['hills-2', 'hills', 600, 615, 40],
  ['hills-3', 'hills', 775, 250, 36],
]

const FIRST_ATLAS_PLACES = [
  ['dragon-graveyard', 'graveyard', 270, 185, 'The Dragon Graveyard', '1ydih4b8tenms1ip6np', 44],
  ['glassmere', 'ruin', 405, 205, 'Glassmere Observatory', 'xnxf4afm13ms1ip6np', 42],
  ['northwatch', 'castle', 525, 105, 'Northwatch Keep', '797wyczpzdms1ip6np', 46],
  ['windmere', 'village', 125, 425, 'Windmere Village', '1w4n9i2b3czms1ip6np', 42],
  ['whispering-wood', 'forest', 230, 500, 'Whispering Wood', '2cxmk8ug3dxms1ip6np', 48],
  ['red-pine-gate', 'tower', 365, 430, 'Red Pine Gate', '1646jjdo5ocms1ip6np', 40],
  ['mournstone', 'mine', 450, 650, 'Mournstone Mine', 't2ycy9pvu0ams1ip6np', 44],
  ['archive', 'temple', 525, 290, 'Archive of Saint Oris', '1c1x33klp43ms1ip6np', 38],
  ['ashen-citadel', 'castle', 615, 335, 'The Ashen Citadel', 'zezgb4l5b5gms1ip6np', 54],
  ['sable-hall', 'castle', 690, 275, 'Sable Hall', 'o39iadggw4cms1ip6np', 34],
  ['kestrel-market', 'village', 710, 405, 'Kestrel Market', 'wqxu5gud6xms1ip6np', 40],
  ['catacombs', 'cave', 585, 455, 'Old City Catacombs', 'w9fwarztmucms1ip6np', 38],
  ['sunspire', 'temple', 790, 235, 'Sunspire Temple', '5p1qg93z3inms1ip6np', 42],
  ['rivergate', 'bridge', 825, 455, 'Rivergate Locks', '0rpzdpmacr7ms1ip6np', 42],
  ['hollow-vale', 'cave', 935, 165, 'Hollow Vale', 'd38d623gp3ms1ip6np', 42],
  ['saltbell', 'lighthouse', 1015, 380, 'Saltbell Tower', 'w1bpfiogxqcms1ip6np', 42],
  ['emberfall', 'harbour', 1020, 610, 'Emberfall Harbor', '0nvzyteomnnms1ip6np', 48],
]

const PLACES = [
  ['dragon-graveyard', 'graveyard', 535, 145, 'The Dragon Graveyard', '1ydih4b8tenms1ip6np', 34],
  ['glassmere', 'ruin', 650, 150, 'Glassmere Observatory', 'xnxf4afm13ms1ip6np', 34],
  ['northwatch', 'castle', 745, 180, 'Northwatch Keep', '797wyczpzdms1ip6np', 38],
  ['windmere', 'village', 480, 260, 'Windmere Village', '1w4n9i2b3czms1ip6np', 34],
  ['whispering-wood', 'forest', 560, 290, 'Whispering Wood', '2cxmk8ug3dxms1ip6np', 38],
  ['red-pine-gate', 'tower', 700, 300, 'Red Pine Gate', '1646jjdo5ocms1ip6np', 34],
  ['mournstone', 'mine', 440, 445, 'Mournstone Mine', 't2ycy9pvu0ams1ip6np', 36],
  ['archive', 'temple', 535, 375, 'Archive of Saint Oris', '1c1x33klp43ms1ip6np', 32],
  ['ashen-citadel', 'castle', 610, 410, 'The Ashen Citadel', 'zezgb4l5b5gms1ip6np', 44],
  ['sable-hall', 'castle', 720, 370, 'Sable Hall', 'o39iadggw4cms1ip6np', 30],
  ['kestrel-market', 'village', 700, 465, 'Kestrel Market', 'wqxu5gud6xms1ip6np', 34],
  ['catacombs', 'cave', 560, 475, 'Old City Catacombs', 'w9fwarztmucms1ip6np', 32],
  ['sunspire', 'temple', 780, 420, 'Sunspire Temple', '5p1qg93z3inms1ip6np', 34],
  ['rivergate', 'bridge', 760, 520, 'Rivergate Locks', '0rpzdpmacr7ms1ip6np', 36],
  ['hollow-vale', 'cave', 800, 350, 'Hollow Vale', 'd38d623gp3ms1ip6np', 34],
  ['saltbell', 'lighthouse', 820, 580, 'Saltbell Tower', 'w1bpfiogxqcms1ip6np', 36],
  ['emberfall', 'harbour', 740, 625, 'Emberfall Harbor', '0nvzyteomnnms1ip6np', 40],
]

const firstAtlasObjects = territoryVariant => [
  ...territoryVariant.map(([id, points], index) => pathObject(id, 'territory', points, index < FIRST_ATLAS_TERRITORY_POINTS.length && territoryVariant === SECOND_ATLAS_TERRITORIES ? { organicEdges: false } : {})),
  pathObject('ember-sea', 'water', [[1080, 0], [1200, 0], [1200, 800], [935, 800], [955, 710], [1010, 640], [1040, 555], [1020, 470], [1060, 385], [1035, 300], [1085, 205], [1060, 110]]),
  pathObject('river-vale', 'river', [[720, 55], [700, 145], [735, 245], [690, 335], [760, 415], [825, 455], [900, 520], [1015, 610]], { size: 7 }),
  pathObject('river-west', 'river', [[505, 70], [480, 170], [500, 265], [455, 360], [405, 470], [450, 650]], { size: 4 }),
  pathObject('cinder-road', 'road', [[125, 425], [365, 430], [505, 385], [615, 335], [710, 405], [825, 455], [915, 525], [1020, 610]], { size: 5 }),
  pathObject('north-road', 'road', [[365, 430], [405, 205], [525, 105], [615, 335]], { size: 3 }),
  pathObject('sun-road', 'road', [[615, 335], [690, 275], [790, 235], [935, 165], [1015, 380]], { size: 3 }),
  pointObject('red-pine-label', 'label', 175, 315, { name: 'RED PINE MARCH', size: 24 }),
  pointObject('crownlands-label', 'label', 650, 585, { name: 'CROWNLANDS', size: 24 }),
  pointObject('hollow-reach-label', 'label', 900, 90, { name: 'HOLLOW REACH', size: 24 }),
  pointObject('ember-sea-label', 'label', 1100, 515, { name: 'THE EMBER SEA', size: 24 }),
  pointObject('cinder-road-label', 'label', 760, 545, { name: 'THE CINDER ROAD', size: 22 }, linkedLocation('b2dn599nazms1ip6np')),
  ...FIRST_ATLAS_TERRAIN_STAMPS.map(([id, symbol, x, y, size]) => pointObject(id, 'stamp', x, y, { symbol, name: '', size })),
  ...FIRST_ATLAS_PLACES.map(([id, symbol, x, y, name, locationId, size]) => pointObject(id, 'stamp', x, y, { symbol, name, size }, linkedLocation(locationId))),
]

const buildEnglandMapObjects = territories => [
    ...territories.map(([id, points]) => pathObject(id, 'territory', points, { landmass: true, organicEdges: false })),
    pathObject('glassmere-lake', 'water', [[470, 205], [495, 190], [525, 208], [515, 238], [485, 245], [462, 228]], { organicEdges: false }),
    pathObject('river-vale', 'river', [[500, 235], [540, 300], [570, 355], [610, 410], [680, 470], [760, 520], [860, 640]], { size: 6 }),
    pathObject('river-west', 'river', [[260, 610], [360, 555], [470, 520], [560, 475], [610, 410]], { size: 4 }),
    pathObject('cinder-road', 'road', [[480, 260], [560, 290], [700, 300], [610, 410], [700, 465], [760, 520], [740, 625]], { size: 5 }),
    pathObject('north-road', 'road', [[535, 145], [650, 150], [745, 180], [700, 300], [610, 410]], { size: 3 }),
    pathObject('sun-road', 'road', [[610, 410], [720, 370], [780, 420], [800, 350], [820, 580]], { size: 3 }),
    pointObject('red-pine-label', 'label', 615, 225, { name: 'RED PINE MARCH', size: 20 }),
    pointObject('crownlands-label', 'label', 335, 535, { name: 'CROWNLANDS', size: 20 }),
    pointObject('hollow-reach-label', 'label', 770, 560, { name: 'HOLLOW REACH', size: 20 }),
    pointObject('ember-sea-label', 'label', 1080, 590, { name: 'THE EMBER SEA', size: 20 }),
    pointObject('cinder-road-label', 'label', 650, 575, { name: 'THE CINDER ROAD', size: 18 }, linkedLocation('b2dn599nazms1ip6np')),
    ...TERRAIN_STAMPS.map(([id, symbol, x, y, size]) => pointObject(id, 'stamp', x, y, { symbol, name: '', size })),
    ...PLACES.map(([id, symbol, x, y, name, locationId, size]) => pointObject(id, 'stamp', x, y, { symbol, name, size }, linkedLocation(locationId))),
]

export function buildTheLastEmberMap() {
  return {
    id: MAP_ID,
    novelId: PROJECT_ID,
    name: 'Eldermere and the Ember Road',
    notes: 'An editable regional atlas of Eldermere, arranged around an England-inspired island coastline and linked to every sample location.',
    created: 1785053389821,
    updatedAt: '2026-09-16T00:00:00.000Z',
    mapPins: [],
    mapType: 'region',
    width: 1200,
    height: 800,
    metadata: {
      builder: 'atlas-v1',
      palette: 'paper',
      organicBorders: true,
      organicStrength: 10,
      baseLayer: 'water',
      gridSettings: { enabled: false, snapToGrid: false, size: 40, scale: '1 square = 10 miles' },
    },
    mapLayers: [],
    mapObjects: buildEnglandMapObjects(ENGLAND_INSPIRED_TERRITORIES),
  }
}

export function buildStraightEnglandLastEmberMap() {
  return { ...buildTheLastEmberMap(), mapObjects: buildEnglandMapObjects(STRAIGHT_ENGLAND_TERRITORIES) }
}

export function buildPriorLastEmberMap(joined = true) {
  const current = buildTheLastEmberMap()
  return {
    ...current,
    notes: 'An editable regional atlas of Eldermere, built with the current Map Builder and linked to every sample location.',
    metadata: { ...current.metadata, baseLayer: 'land' },
    mapObjects: firstAtlasObjects(joined
      ? SECOND_ATLAS_TERRITORIES
      : FIRST_ATLAS_TERRITORY_POINTS.map((points, index) => [SECOND_ATLAS_TERRITORIES[index][0], points])),
  }
}

const LEGACY_LABEL_POSITIONS = new Map([
  ['The Ashen Citadel', [594, 319]], ['Kestrel Market', [627, 350]], ['Archive of Saint Oris', [539, 296]],
  ['Glassmere Observatory', [396, 190]], ['The Dragon Graveyard', [264, 160]], ['Whispering Wood', [330, 441]],
  ['Red Pine Gate', [374, 418]], ['Rivergate Locks', [682, 464]], ['Emberfall Harbor', [814, 532]],
  ['Sable Hall', [605, 304]], ['Old City Catacombs', [583, 372]], ['Sunspire Temple', [726, 251]],
  ['Northwatch Keep', [495, 129]], ['Hollow Vale', [803, 182]], ['Mournstone Mine', [462, 555]],
  ['Windmere Village', [231, 365]], ['The Cinder Road', [550, 486]], ['Saltbell Tower', [891, 395]],
])

export function isUntouchedLegacyLastEmberMap(map) {
  if (!map || map.name !== 'Eldermere and the Ember Road' || map.metadata?.builder || map.mapObjects?.length !== LEGACY_LABEL_POSITIONS.size) return false
  return map.mapObjects.every(object => {
    const expected = LEGACY_LABEL_POSITIONS.get(object?.properties?.text)
    return object?.type === 'label' && expected?.[0] === object.x && expected?.[1] === object.y
  })
}

const comparableMapObject = object => ({
  ...object,
  id: undefined,
  linkedEntity: object.linkedEntity ? { entityType: object.linkedEntity.entityType } : null,
})

export function isUntouchedOverlappingLastEmberMap(map) {
  if (!map || map.name !== 'Eldermere and the Ember Road' || map.metadata?.builder !== 'atlas-v1') return false
  const expectedMap = buildPriorLastEmberMap()
  if (
    map.notes !== expectedMap.notes
    || map.mapType !== expectedMap.mapType
    || map.width !== expectedMap.width
    || map.height !== expectedMap.height
    || JSON.stringify(map.metadata) !== JSON.stringify(expectedMap.metadata)
  ) return false
  const variants = [buildPriorLastEmberMap(false).mapObjects, expectedMap.mapObjects]
  return variants.some(expectedObjects => map.mapObjects?.length === expectedObjects.length && map.mapObjects.every((object, index) => (
    JSON.stringify(comparableMapObject(object)) === JSON.stringify(comparableMapObject(expectedObjects[index]))
  )))
}

export function isUntouchedStraightEnglandLastEmberMap(map) {
  const expectedMap = buildStraightEnglandLastEmberMap()
  if (
    !map
    || map.name !== expectedMap.name
    || map.notes !== expectedMap.notes
    || map.mapType !== expectedMap.mapType
    || map.width !== expectedMap.width
    || map.height !== expectedMap.height
    || JSON.stringify(map.metadata) !== JSON.stringify(expectedMap.metadata)
    || map.mapObjects?.length !== expectedMap.mapObjects.length
  ) return false
  return map.mapObjects.every((object, index) => (
    JSON.stringify(comparableMapObject(object)) === JSON.stringify(comparableMapObject(expectedMap.mapObjects[index]))
  ))
}

export function isUpgradeableLastEmberMap(map) {
  return isUntouchedLegacyLastEmberMap(map)
    || isUntouchedOverlappingLastEmberMap(map)
    || isUntouchedStraightEnglandLastEmberMap(map)
}
