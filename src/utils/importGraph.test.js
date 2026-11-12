import { describe, expect, it } from 'vitest'
import { createImportGraph } from './importGraph'

describe('import graph: scene links to lore, factions and history entries', () => {
  it('re-points them at the new records and drops links to records that were not imported', () => {
    const graph = createImportGraph()
    graph.register('loreEntries', 'k1', 'K1')
    graph.register('factions', 'f1', 'F1')
    graph.register('worldHistory', 'h1', 'H1')
    const patch = graph.references('scenes', { loreIds: ['k1', 'kx'], factionIds: ['f1'], historyEntryIds: ['h1', 'hx'], dismissedLinks: ['lore:k1'] })
    expect(patch).toMatchObject({ loreIds: ['K1'], factionIds: ['F1'], historyEntryIds: ['H1'], dismissedLinks: [] })
  })
})
