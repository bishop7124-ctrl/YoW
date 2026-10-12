// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AtlasCanvas from './AtlasCanvas.jsx'
import AtlasGridControls from './AtlasGridControls.jsx'
import { canvasPoint, hexMetrics, newMapData, normalizeGrid, parseAtlas, snapToHexCenter, WIDTH, HEIGHT } from './atlasModel.js'

describe('grid settings', () => {
  it('fills in defaults and clamps unsafe values', () => {
    expect(normalizeGrid(undefined)).toMatchObject({ enabled: false, type: 'square', size: 40, snapToGrid: false, scale: '' })
    expect(normalizeGrid({ enabled: true, type: 'hex', size: 5 }).size).toBe(10)
    expect(normalizeGrid({ size: 100000 }).size).toBe(400)
    expect(normalizeGrid({ type: 'triangle' }).type).toBe('square')
    expect(normalizeGrid({ atlasOpacity: 9 }).atlasOpacity).toBe(0.7)
  })

  it('keeps an existing map\'s saved grid fields when read', () => {
    const grid = normalizeGrid({ enabled: true, type: 'square', size: 80, opacity: 0.36, color: '#d0d5d8', snapToGrid: true, scale: '1 square = 5 ft' })
    expect(grid).toMatchObject({ enabled: true, type: 'square', size: 80, snapToGrid: true, scale: '1 square = 5 ft' })
  })

  it('sanitises the grid of an imported map', () => {
    const data = newMapData('local', true, 'paper')
    const imported = parseAtlas(JSON.stringify({ format: 'atlas-v1', mapType: 'local', mapObjects: [], metadata: { ...data.metadata, gridSettings: { enabled: true, type: 'hex', size: -50 } } }))
    expect(imported.metadata.gridSettings).toMatchObject({ enabled: true, type: 'hex', size: 10 })
  })
})

describe('hex snapping', () => {
  it('uses pointy-top hexes with alternate rows offset by half a hex', () => {
    const { width, rowHeight } = hexMetrics(60)
    expect(snapToHexCenter(1, 2, 60)).toEqual({ x: 0, y: 0 })
    const odd = snapToHexCenter(width / 2 + 1, rowHeight + 2, 60)
    expect(odd.x).toBeCloseTo(width / 2)
    expect(odd.y).toBeCloseTo(rowHeight)
    const next = snapToHexCenter(width + 1, 1, 60)
    expect(next.x).toBeCloseTo(width)
    expect(next.y).toBe(0)
  })

  it('always returns the closest hex centre', () => {
    const size = 50
    const { width, rowHeight } = hexMetrics(size)
    const centres = []
    for (let row = -2; row < 30; row++) for (let col = -2; col < 40; col++) centres.push({ x: col * width + Math.abs(row % 2) * width / 2, y: row * rowHeight })
    for (let i = 0; i < 200; i++) {
      const x = (i * 37.3) % WIDTH
      const y = (i * 53.1) % HEIGHT
      const best = centres.reduce((a, c) => ((c.x - x) ** 2 + (c.y - y) ** 2 < (a.x - x) ** 2 + (a.y - y) ** 2 ? c : a))
      const snapped = snapToHexCenter(x, y, size)
      expect(snapped.x).toBeCloseTo(best.x)
      expect(snapped.y).toBeCloseTo(best.y)
    }
  })

  it('snaps canvas points to squares or hexes and stays on the map', () => {
    const rect = { left: 0, top: 0, width: WIDTH, height: HEIGHT }
    expect(canvasPoint(47, 63, rect, 40)).toEqual({ x: 40, y: 80 })
    const hex = canvasPoint(3, 4, rect, { type: 'hex', size: 60 })
    expect(hex).toEqual({ x: 0, y: 0 })
    expect(canvasPoint(-100, -100, rect, { type: 'hex', size: 60 })).toEqual({ x: 0, y: 0 })
    expect(canvasPoint(20, 20, rect, 0)).toEqual({ x: 20, y: 20 })
  })
})

describe('grid overlay drawing', () => {
  const renderCanvas = gridSettings => render(<AtlasCanvas objects={[]} metadata={{ palette: 'paper', gridSettings }} mapType="local" name="Test"/>)

  it('draws nothing when the grid is off', () => {
    const { container } = renderCanvas({ enabled: false, type: 'hex', size: 60 })
    expect(container.querySelector('rect[fill^="url(#"][fill$="grid)"]')).toBeNull()
  })

  it('draws a square or hex pattern at the chosen size', () => {
    const square = renderCanvas({ enabled: true, type: 'square', size: 80 })
    const squarePattern = square.container.querySelector('pattern[data-grid-type="square"]')
    expect(squarePattern.getAttribute('width')).toBe('80')
    expect(square.container.querySelector('rect[fill$="grid)"]')).not.toBeNull()
    square.unmount()
    const hex = renderCanvas({ enabled: true, type: 'hex', size: 60 })
    const pattern = hex.container.querySelector('pattern[data-grid-type="hex"]')
    const { width, radius } = hexMetrics(60)
    expect(Number(pattern.getAttribute('width'))).toBeCloseTo(width)
    expect(Number(pattern.getAttribute('height'))).toBeCloseTo(3 * radius)
  })
})

describe('grid controls', () => {
  it('offers only the on/off switch until the grid is shown', () => {
    const onChange = vi.fn()
    render(<AtlasGridControls grid={{ enabled: false }} onChange={onChange}/>)
    expect(screen.queryByRole('button', { name: 'Hex' })).toBeNull()
    fireEvent.click(screen.getByLabelText('Show grid'))
    expect(onChange).toHaveBeenCalledWith({ enabled: true })
  })

  it('switches between square and hex, resizes, and relabels the scale', () => {
    const onChange = vi.fn()
    render(<AtlasGridControls grid={{ enabled: true, type: 'square', size: 40, scale: '1 square = 5 ft' }} onChange={onChange}/>)
    expect(screen.getByRole('button', { name: 'Square' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Hex' }))
    expect(onChange).toHaveBeenLastCalledWith({ type: 'hex', scale: '1 hex = 5 ft' })
    fireEvent.change(screen.getByLabelText('Grid cell size'), { target: { value: '90' } })
    expect(onChange).toHaveBeenLastCalledWith({ size: 90 })
    fireEvent.click(screen.getByLabelText('Snap to grid'))
    expect(onChange).toHaveBeenLastCalledWith({ snapToGrid: true })
  })
})
