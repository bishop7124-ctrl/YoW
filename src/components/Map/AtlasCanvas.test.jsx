// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AtlasCanvas from './AtlasCanvas.jsx'

describe('AtlasCanvas shared borders', () => {
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
