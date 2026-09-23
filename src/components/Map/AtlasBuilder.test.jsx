// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SymbolsToolIcon from './SymbolsToolIcon.jsx'

describe('Atlas symbols tool icon', () => {
  it.each([
    ['world', 'tree'],
    ['region', 'tree'],
    ['local', 'building'],
    ['interior', 'bed'],
  ])('uses the scale-specific icon for %s maps', (mapType, expectedIcon) => {
    const { container } = render(<SymbolsToolIcon mapType={mapType}/>)
    expect(container.querySelector('svg')?.getAttribute('data-symbols-tool-icon')).toBe(expectedIcon)
  })
})
