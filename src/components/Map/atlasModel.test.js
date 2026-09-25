import { describe, expect, it } from 'vitest'
import { ATLAS_VERSION, SCALES, newMapData, moveObject, parseAtlas, canvasPoint, getOrganicStrength, inkPath, organicOutline, SYMBOLS, zoomFromWheel } from './atlasModel.js'
import { getSymbolGroups } from './atlasSymbols.js'

describe('atlas map data', () => {
  it.each(SCALES.map(s => s.id))('creates an editable %s starter without sharing object identities', type => {
    const first = newMapData(type, false, 'paper')
    const second = newMapData(type, false, 'paper')
    expect(first.mapObjects.length).toBeGreaterThan(5)
    expect(first.metadata.builder).toBe(ATLAS_VERSION)
    expect(first.mapObjects.every(o => !second.mapObjects.some(p => p.id === o.id))).toBe(true)
    expect(newMapData(type, true, 'paper').mapObjects).toEqual([])
  })
  it('builds the approved local starter map with fresh object IDs', () => {
    const local = newMapData('local', false, 'paper')
    const stamps = local.mapObjects.filter(object => object.type === 'stamp')
    const symbols = stamps.map(object => object.properties.symbol)
    const roads = local.mapObjects.filter(object => object.type === 'road')

    expect(local.metadata.baseLayer).toBe('land')
    expect(local.metadata.gridSettings.scale).toBe('1 square = 100 ft')
    expect(local.mapObjects).toHaveLength(20)
    expect(local.mapObjects.filter(object => object.type === 'water')).toHaveLength(1)
    expect(roads).toHaveLength(2)
    expect(roads.map(object => object.properties.size)).toEqual([23, 19])
    expect(roads.map(object => object.properties.drawMode)).toEqual(['points', 'points'])
    expect(roads[0].geometry.points).toHaveLength(6)
    expect(roads[0].geometry.points[2]).toEqual({ x: 642.4971440091391, y: 217.7340232511256 })
    expect(stamps.find(object => object.properties.symbol === 'temple')).toMatchObject({ x: 1094.4896176332231, y: 315.45595054095827, properties: { size: 108 } })
    expect(symbols).toEqual(['house','house','house','house','house','house','house','house','well','gate','forest','shop','inn','cottage','tower','windmill','temple'])
    expect(symbols).not.toEqual(expect.arrayContaining(['village','castle','mountain','bridge','tree']))
  })
  it('moves polygon geometry and preserves location links without mutating the saved original', () => {
    const object = { ...newMapData('world', false, 'paper').mapObjects[0], linkedEntity: { entityType: 'location', entityId: 'place-1' } }
    const original = structuredClone(object)
    const moved = moveObject(object, 30, -20)
    expect(moved.geometry.points[0]).toEqual({ x: object.geometry.points[0].x + 30, y: object.geometry.points[0].y - 20 })
    expect(moved.linkedEntity).toEqual(object.linkedEntity)
    expect(object).toEqual(original)
  })
  it('imports a portable map with new object IDs', () => {
    const original = newMapData('world', false, 'sage')
    const imported = parseAtlas(JSON.stringify({ format: ATLAS_VERSION, name: 'Test', mapType: 'world', ...original }))
    expect(imported.mapObjects).toHaveLength(original.mapObjects.length)
    expect(imported.mapObjects[0].id).not.toBe(original.mapObjects[0].id)
    expect(imported.metadata.palette).toBe('sage')
  })
  it.each([{}, { format: ATLAS_VERSION, mapType: 'world', mapObjects: [null] }, { format: ATLAS_VERSION, mapType: 'world', mapObjects: [{ type: 'shape', x: 0, y: 0, geometry: { points: [{ x: 'oops', y: 2 }] } }] }])('rejects invalid imports before creating a map', invalid => {
    expect(() => parseAtlas(JSON.stringify(invalid))).toThrow()
  })
})


describe('pointer coordinates and border choices', () => {
  it('keeps organic variation separate by polygon tool and falls back for existing maps', () => {
    const metadata = { organicStrength: 17, organicStrengthByType: { shape: 24, water: 7 } }
    expect(getOrganicStrength(metadata, 'shape')).toBe(24)
    expect(getOrganicStrength(metadata, 'water')).toBe(7)
    expect(getOrganicStrength(metadata, 'territory')).toBe(17)
    expect(getOrganicStrength({}, 'shape')).toBe(12)
  })

  it('zooms in and out from wheel direction within the editor limits', () => {
    expect(zoomFromWheel(1, -100)).toBe(1.1)
    expect(zoomFromWheel(1, 100)).toBe(.9)
    expect(zoomFromWheel(3, -100)).toBe(3)
    expect(zoomFromWheel(.5, 100)).toBe(.5)
    expect(zoomFromWheel(1, 0)).toBe(1)
  })

  it('maps the visible paper correctly after scaling, panning and letterboxing', () => {
    expect(canvasPoint(450, 330, { left: 150, top: 130, width: 600, height: 400 })).toEqual({ x: 600, y: 400 })
    expect(canvasPoint(850, 650, { left: 250, top: 250, width: 1200, height: 800 })).toEqual({ x: 600, y: 400 })
    expect(canvasPoint(300, 300, { left: 0, top: 0, width: 600, height: 600 })).toEqual({ x: 600, y: 400 })
  })
  it('only snaps when explicitly requested and preserves subpixel precision otherwise', () => {
    const rect = { left: 0, top: 0, width: 1200, height: 800 }
    expect(canvasPoint(517.2, 409.6, rect)).toEqual({ x: 517.2, y: 409.6 })
    expect(canvasPoint(517.2, 409.6, rect, 40)).toEqual({ x: 520, y: 400 })
  })
  it('keeps straight starter outlines reversible when toggled or moved', () => {
    const object = newMapData('world', false, 'paper').mapObjects[0]
    const before = structuredClone(object)
    expect(inkPath(object.geometry.points, true)).toContain('Q')
    expect(inkPath(object.geometry.straightPoints, true, true)).not.toContain('Q')
    const moved = moveObject(object, 40, 50)
    expect(moved.geometry.straightPoints[0]).toEqual({ x: 235, y: 310 })
    expect(object).toEqual(before)
  })
})


it('organic edges visibly vary dense freehand geometry, deterministically and without changing the source', () => {
  const points = []
  for (let x=100;x<500;x+=3) points.push({ x,y:100 })
  for (let y=100;y<400;y+=3) points.push({ x:500,y })
  for (let x=500;x>100;x-=3) points.push({ x,y:400 })
  for (let y=400;y>100;y-=3) points.push({ x:100,y })
  const saved = structuredClone(points)
  const edge = organicOutline(points, 20)
  expect(Math.max(...edge.filter(p => p.x>150 && p.x<450 && p.y<150).map(p => Math.abs(p.y-100)))).toBeGreaterThan(10)
  expect(organicOutline(points,20)).toEqual(edge)
  expect(organicOutline(points,4)).not.toEqual(edge)
  expect(points).toEqual(saved)
  expect(organicOutline([{ x:1,y:1 },{ x:1,y:1 },{ x:1,y:1 }])).toEqual([{ x:1,y:1 },{ x:1,y:1 },{ x:1,y:1 }])
})

it('offers scale-specific symbol catalogues, including local buildings and features', () => {
  expect(SYMBOLS).toHaveLength(38)
  expect(SYMBOLS).toEqual(expect.arrayContaining(['bridge','cave','temple','bed','chest','fireplace','house','farm','well','shop','inn','tree']))
  expect(getSymbolGroups('local').map(group => group.name)).toEqual(['Local buildings', 'Local features', 'Local nature'])
  expect(getSymbolGroups('local').flatMap(group => group.symbols)).toEqual(expect.arrayContaining(['house','cottage','farm','shop','inn','well','fountain','gate','tree']))
  expect(getSymbolGroups('world').flatMap(group => group.symbols)).not.toContain('house')
  expect(getSymbolGroups('interior').flatMap(group => group.symbols)).toContain('bed')
})
