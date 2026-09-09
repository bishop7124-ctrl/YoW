// A shared displacement field keeps touching ink/paper edges registered. Paths
// are converted once when the artwork module loads, never during pointer moves.
export function organicInkPath(path, seed = 0) {
  const tokens = path.match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/ig) || []
  let index = 0, command, x = 0, y = 0, startX = 0, startY = 0, control = null
  const output = []
  const counts = { M: 2, L: 2, H: 1, V: 1, Q: 4, T: 2, Z: 0 }
  const warp = (px, py) => [
    px + .4 * Math.sin(py * .19 + seed) + .19 * Math.sin(px * .49 + py * .31 + seed),
    py + .36 * Math.sin(px * .17 + seed * .7) + .17 * Math.sin(py * .43 - px * .29 + seed),
  ]
  const pair = p => p.map(n => Number(n.toFixed(3))).join(' ')
  const segment = (endX, endY, quadratic) => {
    const fromX = x, fromY = y
    const length = quadratic
      ? Math.hypot(quadratic[0] - x, quadratic[1] - y) + Math.hypot(endX - quadratic[0], endY - quadratic[1])
      : Math.hypot(endX - x, endY - y)
    const steps = Math.max(1, Math.ceil(length / 3))
    const at = t => quadratic
      ? warp((1-t)**2*fromX + 2*(1-t)*t*quadratic[0] + t*t*endX, (1-t)**2*fromY + 2*(1-t)*t*quadratic[1] + t*t*endY)
      : warp(fromX + (endX-fromX)*t, fromY + (endY-fromY)*t)
    // Cubic Hermite interpolation makes the pen contour smooth without
    // rounding away architectural corners or turning edges into zigzags.
    for (let step = 0; step < steps; step++) {
      const a = step / steps, b = (step + 1) / steps, h = .0001
      const p = at(a), q = at(b), pa = at(a-h), pb = at(a+h), qa = at(b-h), qb = at(b+h)
      const c1 = p.map((n,i) => n + (pb[i]-pa[i])/(2*h)*(b-a)/3)
      const c2 = q.map((n,i) => n - (qb[i]-qa[i])/(2*h)*(b-a)/3)
      output.push(`C${pair(c1)} ${pair(c2)} ${pair(q)}`)
    }
    x = endX; y = endY
  }
  while (index < tokens.length) {
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
    const upper = command?.toUpperCase(), relative = command !== upper
    if (!(upper in counts)) throw new Error(`Unsupported ink path command: ${command}`)
    if (upper === 'Z') {
      segment(startX, startY); output.push('Z'); control = null; command = null
      continue
    }
    const args = tokens.slice(index, index + counts[upper]).map(Number)
    if (args.length !== counts[upper] || args.some(n => !Number.isFinite(n))) throw new Error('Invalid ink path')
    index += counts[upper]
    const px = n => n + (relative ? x : 0), py = n => n + (relative ? y : 0)
    if (upper === 'M') {
      x = px(args[0]); y = py(args[1]); startX = x; startY = y
      output.push(`M${pair(warp(x,y))}`); command = relative ? 'l' : 'L'; control = null
    } else if (upper === 'Q' || upper === 'T') {
      const nextControl = upper === 'Q' ? [px(args[0]), py(args[1])] : control ? [2*x-control[0], 2*y-control[1]] : [x,y]
      const end = upper === 'Q' ? 2 : 0
      segment(px(args[end]), py(args[end+1]), nextControl); control = nextControl
    } else {
      segment(upper === 'V' ? x : px(args[0]), upper === 'H' ? y : py(args[upper === 'V' ? 0 : 1])); control = null
    }
  }
  return output.join(' ')
}
