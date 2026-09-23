// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AtlasCanvas from './AtlasCanvas.jsx'

describe('AtlasCanvas shared borders', () => {
  it('renders the local farm symbol through the shared map artwork', () => {
    const farm = { id: 'farm', type: 'stamp', x: 240, y: 180, visible: true, properties: { symbol: 'farm', size: 50 } }
    const { container } = render(<AtlasCanvas objects={[farm]} mapType="local" />)

    expect(container.querySelectorAll('[data-symbol="farm"] path').length).toBeGreaterThan(0)
  })

  it('renders point-to-point routes as exact connected segments', () => {
    const route = {
      id: 'local-route',
      type: 'road',
      x: 0,
      y: 0,
      visible: true,
      geometry: { type: 'path', points: [{ x: 100, y: 120 }, { x: 260, y: 180 }, { x: 430, y: 110 }] },
      properties: { size: 8, drawMode: 'points' },
    }
    const { container, rerender } = render(<AtlasCanvas objects={[route]} mapType="local" />)
    let routePath = container.querySelector('[data-object-id="local-route"] > path')

    expect(routePath?.getAttribute('d')).toBe('M100 120 L260 180 L430 110')
    expect(routePath?.hasAttribute('stroke-dasharray')).toBe(false)

    rerender(<AtlasCanvas objects={[route]} mapType="region" />)
    routePath = container.querySelector('[data-object-id="local-route"] > path')
    expect(routePath?.getAttribute('stroke-dasharray')).toBe('7 6')
  })

  it('renders land and water with their own saved border variation', () => {
    const points = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]
    const object = type => ({ id: type, type, x: 0, y: 0, visible: true, geometry: { type: 'polygon', points }, properties: {} })
    const metadata = { organicBorders: true, organicStrengthByType: { shape: 4, water: 26 } }
    const { container } = render(<AtlasCanvas objects={[object('shape'), object('water')]} metadata={metadata} />)
    const landOutline = container.querySelector('[data-object-id="shape"] > path')?.getAttribute('d')
    const waterOutline = container.querySelector('[data-object-id="water"] > path')?.getAttribute('d')

    expect(landOutline).toBeTruthy()
    expect(waterOutline).toBeTruthy()
    expect(landOutline).not.toBe(waterOutline)
  })

  it('renders an organic-edge opt-out as the exact saved polygon', () => {
    const points = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]
    const object = {
      id: 'joined-territory',
      type: 'territory',
      x: 0,
      y: 0,
      visible: true,
      geometry: { type: 'polygon', points },
      properties: { landmass: true, organicEdges: false },
    }
    const { container } = render(<AtlasCanvas objects={[object]} metadata={{ organicBorders: true, organicStrength: 20 }} />)
    const outline = container.querySelector('[data-object-id="joined-territory"] > path')

    expect(outline?.getAttribute('d')).toBe('M100 100 L300 100 L300 300 L100 300Z')
    expect(outline?.getAttribute('d')).not.toContain('Q')
    expect(outline?.getAttribute('fill')).toBe('#e7dfc8')
    expect(outline?.getAttribute('fill-opacity')).toBe('1')
    expect(outline?.hasAttribute('stroke-dasharray')).toBe(false)
  })
})
