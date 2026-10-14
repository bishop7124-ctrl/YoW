// Remembers how the user left the relationship map (character positions and the
// pan/zoom) per project, in this browser only. Everything is best-effort: storage
// can be blocked or full, and the map then simply lays itself out afresh.

const keyFor = projectKey => `yow-relationship-map-layout:${projectKey}`
const finite = value => typeof value === 'number' && Number.isFinite(value)

export function loadMapLayout(projectKey) {
  try {
    const raw = globalThis.localStorage?.getItem(keyFor(projectKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || typeof parsed.nodes !== 'object' || !parsed.nodes) return null
    const nodes = new Map()
    Object.entries(parsed.nodes).forEach(([id, point]) => {
      if (Array.isArray(point) && finite(point[0]) && finite(point[1])) nodes.set(id, { x: point[0], y: point[1] })
    })
    // The view is stored as the map point at the centre of the canvas, so it survives
    // the canvas being a slightly different size next time.
    const view = parsed.view && finite(parsed.view.scale) && finite(parsed.view.cx) && finite(parsed.view.cy) && parsed.view.scale > 0
      ? { scale: parsed.view.scale, cx: parsed.view.cx, cy: parsed.view.cy } : null
    return { nodes, view }
  } catch { return null }
}

// `view === undefined` keeps whatever view is already stored (positions only);
// `null` stores none.
export function saveMapLayout(projectKey, state, view, size) {
  try {
    if (view === undefined) {
      const kept = JSON.parse(globalThis.localStorage?.getItem(keyFor(projectKey)) || 'null')?.view
      const nodes = {}
      state.ids.forEach((id, i) => { nodes[id] = [Math.round(state.x[i] * 10) / 10, Math.round(state.y[i] * 10) / 10] })
      globalThis.localStorage?.setItem(keyFor(projectKey), JSON.stringify({ v: 1, nodes, view: kept ?? null }))
      return
    }
    const nodes = {}
    state.ids.forEach((id, i) => { nodes[id] = [Math.round(state.x[i] * 10) / 10, Math.round(state.y[i] * 10) / 10] })
    globalThis.localStorage?.setItem(keyFor(projectKey), JSON.stringify({ v: 1, nodes, view: view && size ? { scale: view.scale, cx: Math.round(((size.width / 2 - view.x) / view.scale) * 10) / 10, cy: Math.round(((size.height / 2 - view.y) / view.scale) * 10) / 10 } : null }))
  } catch { /* best effort */ }
}

export function clearMapLayout(projectKey) {
  try { globalThis.localStorage?.removeItem(keyFor(projectKey)) } catch { /* best effort */ }
}
