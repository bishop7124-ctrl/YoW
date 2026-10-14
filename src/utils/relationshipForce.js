// Small force-directed layout for the relationship map: linked characters pull
// together, everyone repels everyone else, and a faint gravity keeps the cast
// from drifting. Pure and deterministic so it can be tested without a browser.

const REPULSION = 26000
const LINK_REST = 150
const LINK_STRENGTH = 0.06
const GRAVITY = 0.012
const MIN_GAP = 92
const DAMPING = 0.6
const ALPHA_DECAY = 0.972
export const ALPHA_STOP = 0.02

// Positions are seeded from the previous layout when a node is already known,
// otherwise next to a linked neighbour (or on a ring) so the map never jumps.
export function createForceState(nodes, edges, seeds = new Map()) {
  const ids = nodes.map(node => node.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const x = new Float64Array(ids.length)
  const y = new Float64Array(ids.length)
  const neighbours = ids.map(() => [])
  const links = []
  edges.forEach(edge => {
    const a = index.get(edge.sourceId)
    const b = index.get(edge.targetId)
    if (a === undefined || b === undefined || a === b) return
    links.push([a, b])
    neighbours[a].push(b)
    neighbours[b].push(a)
  })
  const ring = Math.max(160, ids.length * 18)
  ids.forEach((id, i) => {
    const seed = seeds.get(id)
    if (seed) { x[i] = seed.x; y[i] = seed.y; return }
    const known = neighbours[i].map(n => seeds.get(ids[n])).find(Boolean)
    const angle = (Math.PI * 2 * i) / Math.max(ids.length, 1) - Math.PI / 2
    if (known) { x[i] = known.x + Math.cos(angle) * LINK_REST; y[i] = known.y + Math.sin(angle) * LINK_REST }
    else { x[i] = Math.cos(angle) * ring; y[i] = Math.sin(angle) * ring }
  })
  return { ids, index, x, y, vx: new Float64Array(ids.length), vy: new Float64Array(ids.length), links, pinned: new Map(), alpha: 1 }
}

export function stepForce(state) {
  const { x, y, vx, vy, links, pinned } = state
  const n = x.length
  const alpha = state.alpha
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      let dx = x[j] - x[i]
      let dy = y[j] - y[i]
      let d2 = dx * dx + dy * dy
      if (d2 < 1) { dx = (i % 2 ? 1 : -1) * 0.5; dy = (j % 3 - 1) * 0.5 || 0.5; d2 = dx * dx + dy * dy }
      const d = Math.sqrt(d2)
      let push = (REPULSION * alpha) / Math.max(d2, 400)
      if (d < MIN_GAP) push += (MIN_GAP - d) * 0.25
      const fx = (dx / d) * push
      const fy = (dy / d) * push
      vx[i] -= fx; vy[i] -= fy; vx[j] += fx; vy[j] += fy
    }
  }
  for (const [a, b] of links) {
    const dx = x[b] - x[a]
    const dy = y[b] - y[a]
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const pull = (d - LINK_REST) * LINK_STRENGTH * Math.max(alpha, 0.25)
    const fx = (dx / d) * pull
    const fy = (dy / d) * pull
    vx[a] += fx; vy[a] += fy; vx[b] -= fx; vy[b] -= fy
  }
  for (let i = 0; i < n; i += 1) {
    vx[i] -= x[i] * GRAVITY * alpha
    vy[i] -= y[i] * GRAVITY * alpha
    const pin = pinned.get(i)
    if (pin) { x[i] = pin.x; y[i] = pin.y; vx[i] = 0; vy[i] = 0; continue }
    vx[i] *= DAMPING; vy[i] *= DAMPING
    x[i] += vx[i]; y[i] += vy[i]
  }
  state.alpha = alpha * ALPHA_DECAY
  return state.alpha > ALPHA_STOP
}

export function settleForce(state, steps = 260) {
  for (let i = 0; i < steps && stepForce(state); i += 1) { /* run until calm */ }
  return state
}

export function reheatForce(state, alpha = 0.35) { state.alpha = Math.max(state.alpha, alpha) }

export function forceBounds(state, padding = 60) {
  if (!state.x.length) return { minX: -200, maxX: 200, minY: -150, maxY: 150, width: 400, height: 300 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < state.x.length; i += 1) {
    minX = Math.min(minX, state.x[i]); maxX = Math.max(maxX, state.x[i])
    minY = Math.min(minY, state.y[i]); maxY = Math.max(maxY, state.y[i])
  }
  minX -= padding; maxX += padding; minY -= padding; maxY += padding
  return { minX, maxX, minY, maxY, width: Math.max(maxX - minX, 200), height: Math.max(maxY - minY, 160) }
}

// ---- first-load layout quality -------------------------------------------
// A single force run can leave many links crossing. Score a layout by link
// crossings (plus links that pass through a third character) and keep the best
// of several deterministic restarts, so the first view is as untangled as the
// force model can make it. Pure and seeded: the same cast always gives the same map.

const segmentsCross = (ax, ay, bx, by, cx, cy, dx, dy) => {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax)
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx)
  return d1 * d2 < 0 && d3 * d4 < 0
}

export function layoutScore(state, nodeRadius = 34) {
  const { x, y, links } = state
  let crossings = 0
  for (let i = 0; i < links.length; i += 1) {
    const [a, b] = links[i]
    for (let j = i + 1; j < links.length; j += 1) {
      const [c, d] = links[j]
      if (a === c || a === d || b === c || b === d) continue
      if (segmentsCross(x[a], y[a], x[b], y[b], x[c], y[c], x[d], y[d])) crossings += 1
    }
  }
  let throughNode = 0
  for (const [a, b] of links) {
    const dx = x[b] - x[a]
    const dy = y[b] - y[a]
    const len2 = dx * dx + dy * dy || 1
    for (let k = 0; k < x.length; k += 1) {
      if (k === a || k === b) continue
      const t = ((x[k] - x[a]) * dx + (y[k] - y[a]) * dy) / len2
      if (t <= 0.05 || t >= 0.95) continue
      const px = x[a] + t * dx - x[k]
      const py = y[a] + t * dy - y[k]
      if (px * px + py * py < nodeRadius * nodeRadius) throughNode += 1
    }
  }
  return crossings + throughNode * 2
}

const seededRandom = seed => {
  let s = seed >>> 0 || 1
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
}

// Hill-climb: nudge one character at a time and keep the move only if it lowers
// the score without crowding anyone. Deterministic (seeded) and bounded.
export function refineLayout(state, iterations) {
  const n = state.x.length
  if (n < 3 || !state.links.length) return state
  const random = seededRandom(n * 104729 + state.links.length)
  let score = layoutScore(state)
  for (let step = 0; step < iterations && score > 0; step += 1) {
    const i = Math.floor(random() * n)
    const ox = state.x[i]
    const oy = state.y[i]
    const reach = 40 + random() * 220
    const angle = random() * Math.PI * 2
    const nx = ox + Math.cos(angle) * reach
    const ny = oy + Math.sin(angle) * reach
    let crowded = false
    for (let k = 0; k < n && !crowded; k += 1) if (k !== i && Math.hypot(state.x[k] - nx, state.y[k] - ny) < MIN_GAP) crowded = true
    if (crowded) continue
    state.x[i] = nx; state.y[i] = ny
    const next = layoutScore(state)
    if (next < score) score = next
    else { state.x[i] = ox; state.y[i] = oy }
  }
  return state
}

export function createBestLayout(nodes, edges, { tries } = {}) {
  const count = nodes.length
  const attempts = tries ?? (count > 150 ? 1 : count > 80 ? 3 : 14)
  let best = null
  let bestScore = Infinity
  for (let attempt = 0; attempt < attempts && bestScore > 0; attempt += 1) {
    const state = createForceState(nodes, edges)
    if (attempt > 0) {
      // Different starting scatter each try (the first keeps the plain ring seed).
      const random = seededRandom(attempt * 7919 + count)
      const radius = Math.max(160, count * 18)
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2
        const r = radius * (0.35 + random() * 0.65)
        state.x[i] = Math.cos(angle) * r
        state.y[i] = Math.sin(angle) * r
      }
    }
    settleForce(state)
    const score = layoutScore(state)
    if (score < bestScore) { best = state; bestScore = score }
  }
  if (best) refineLayout(best, count > 150 ? 0 : count > 80 ? 800 : 6000)
  return best || createForceState(nodes, edges)
}

// Place characters that are new to a saved layout without disturbing the ones
// already placed: known characters are held still while the newcomers settle.
export function settleNewcomers(state, knownIds) {
  const known = new Set(knownIds)
  state.ids.forEach((id, i) => { if (known.has(id)) state.pinned.set(i, { x: state.x[i], y: state.y[i] }) })
  state.alpha = 1
  settleForce(state)
  state.pinned.clear()
  state.alpha = 0
  return state
}
