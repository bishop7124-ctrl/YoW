// Rank only visible characters. Partners share a generation, and descendants
// are placed below their parents. Cyclic/unusual facts remain saved; a back
// edge is ignored for ranking so an allowed family loop cannot hang rendering.
export function getFamilyGenerations(characters, lookups) {
  const representatives = new Map(characters.map(character => [character.id, character.id]))
  const find = id => {
    let root = id
    while (representatives.get(root) !== root) root = representatives.get(root)
    while (id !== root) {
      const next = representatives.get(id)
      representatives.set(id, root)
      id = next
    }
    return root
  }
  characters.forEach(character => {
    ;(lookups.partnersByCharacter.get(character.id) || []).forEach(partner => {
      if (representatives.has(partner.id)) representatives.set(find(partner.id), find(character.id))
    })
  })

  const children = new Map()
  const incoming = new Map()
  characters.forEach(character => {
    const group = find(character.id)
    if (!children.has(group)) children.set(group, new Set())
    incoming.set(group, 0)
  })
  characters.forEach(character => {
    const child = find(character.id)
    ;(lookups.parentsByChild.get(character.id) || []).forEach(parent => {
      if (!representatives.has(parent.id)) return
      const group = find(parent.id)
      if (group === child || children.get(group).has(child)) return
      children.get(group).add(child)
      incoming.set(child, incoming.get(child) + 1)
    })
  })

  const ranks = new Map([...children.keys()].map(id => [id, 0]))
  const processed = new Set()
  const queue = [...incoming.keys()].filter(id => incoming.get(id) === 0)
  let cursor = 0
  const drainQueue = () => {
    for (; cursor < queue.length; cursor += 1) {
      const id = queue[cursor]
      if (processed.has(id)) continue
      processed.add(id)
      children.get(id).forEach(child => {
        if (processed.has(child)) return
        ranks.set(child, Math.max(ranks.get(child), ranks.get(id) + 1))
        incoming.set(child, incoming.get(child) - 1)
        if (incoming.get(child) === 0) queue.push(child)
      })
    }
  }
  drainQueue()
  // Remaining components contain cycles. Break ties deterministically and
  // visit each group once, rather than repeatedly increasing its generation.
  children.forEach((_, id) => {
    if (processed.has(id)) return
    queue.push(id)
    drainQueue()
  })
  return new Map(characters.map(character => [character.id, ranks.get(find(character.id))]))
}
