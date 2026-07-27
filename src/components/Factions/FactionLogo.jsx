// Renders a faction logo from an array of shape objects, or a logo object.
// Each shape: { id, type, cx, cy, size, color }

import { normalizeFactionLogo } from './logoData'

// eslint-disable-next-line react-refresh/only-export-components
export function getShapeElement(shape, extraProps = {}) {
  const { type, cx, cy, size, color, opacity } = shape
  const base = { fill: color || 'currentColor', opacity: opacity ?? 1, ...extraProps }

  switch (type) {
    case 'circle':
      return <circle cx={cx} cy={cy} r={size} {...base} />

    case 'square':
      return <rect x={cx - size} y={cy - size} width={size * 2} height={size * 2} rx={Math.max(1, size * 0.1)} {...base} />

    case 'triangle': {
      const pts = `${cx},${cy - size} ${cx + size * 0.866},${cy + size * 0.5} ${cx - size * 0.866},${cy + size * 0.5}`
      return <polygon points={pts} {...base} />
    }

    case 'diamond': {
      const pts = `${cx},${cy - size} ${cx + size * 0.65},${cy} ${cx},${cy + size} ${cx - size * 0.65},${cy}`
      return <polygon points={pts} {...base} />
    }

    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const angle = (i * Math.PI) / 5 - Math.PI / 2
        const r = i % 2 === 0 ? size : size * 0.42
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} {...base} />
    }

    case 'hexagon': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const angle = (i * Math.PI) / 3 - Math.PI / 6
        return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} {...base} />
    }

    case 'pentagon': {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2
        return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} {...base} />
    }

    case 'octagon': {
      const pts = Array.from({ length: 8 }, (_, i) => {
        const angle = (i * 2 * Math.PI) / 8 - Math.PI / 8
        return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} {...base} />
    }

    case 'cross': {
      const t = size * 0.35
      const d = `M ${cx - t},${cy - size} H ${cx + t} V ${cy - t} H ${cx + size} V ${cy + t} H ${cx + t} V ${cy + size} H ${cx - t} V ${cy + t} H ${cx - size} V ${cy - t} H ${cx - t} Z`
      return <path d={d} {...base} />
    }

    case 'shield': {
      const d = `M ${cx - size},${cy - size} H ${cx + size} L ${cx + size},${cy + size * 0.25} L ${cx},${cy + size} L ${cx - size},${cy + size * 0.25} Z`
      return <path d={d} {...base} />
    }

    case 'crescent': {
      const R = size, r = size * 0.75, d = size * 0.3
      const ix = (R * R - r * r + d * d) / (2 * d)
      const iy = Math.sqrt(Math.max(0, R * R - ix * ix))
      const p1x = cx + ix, p1y = cy - iy
      const p2x = cx + ix, p2y = cy + iy
      const path = `M ${p1x},${p1y} A ${R},${R} 0 1,0 ${p2x},${p2y} A ${r},${r} 0 1,1 ${p1x},${p1y} Z`
      return <path d={path} {...base} />
    }

    case 'ring': {
      const ro = size, ri = size * 0.55
      const d = `M ${cx + ro},${cy} A ${ro},${ro} 0 1,0 ${cx - ro},${cy} A ${ro},${ro} 0 1,0 ${cx + ro},${cy} Z M ${cx + ri},${cy} A ${ri},${ri} 0 1,1 ${cx - ri},${cy} A ${ri},${ri} 0 1,1 ${cx + ri},${cy} Z`
      return <path d={d} fillRule="evenodd" {...base} />
    }

    case 'arrow': {
      const hw = size * 0.35, aw = size * 0.9
      const pts = `${cx},${cy - size} ${cx + aw},${cy + size * 0.1} ${cx + hw},${cy + size * 0.1} ${cx + hw},${cy + size} ${cx - hw},${cy + size} ${cx - hw},${cy + size * 0.1} ${cx - aw},${cy + size * 0.1}`
      return <polygon points={pts} {...base} />
    }

    case 'lightning': {
      const pts = `${cx + size * 0.1},${cy - size} ${cx - size * 0.4},${cy - size * 0.08} ${cx + size * 0.08},${cy - size * 0.08} ${cx - size * 0.1},${cy + size} ${cx + size * 0.4},${cy + size * 0.08} ${cx - size * 0.08},${cy + size * 0.08}`
      return <polygon points={pts} {...base} />
    }

    case 'flame': {
      const d = `M ${cx},${cy + size} C ${cx - size * 0.65},${cy + size * 0.2} ${cx - size * 0.65},${cy - size * 0.4} ${cx},${cy - size} C ${cx + size * 0.65},${cy - size * 0.4} ${cx + size * 0.65},${cy + size * 0.2} ${cx},${cy + size} Z`
      return <path d={d} {...base} />
    }

    case 'teardrop': {
      const d = `M ${cx},${cy + size} C ${cx - size * 0.65},${cy + size * 0.2} ${cx - size * 0.65},${cy - size * 0.35} ${cx},${cy - size * 0.45} C ${cx + size * 0.65},${cy - size * 0.35} ${cx + size * 0.65},${cy + size * 0.2} ${cx},${cy + size} Z`
      return <path d={d} {...base} />
    }

    case 'heart': {
      const d = `M ${cx},${cy + size * 0.85} C ${cx - size * 1.15},${cy - size * 0.15} ${cx - size * 0.5},${cy - size * 0.95} ${cx},${cy - size * 0.35} C ${cx + size * 0.5},${cy - size * 0.95} ${cx + size * 1.15},${cy - size * 0.15} ${cx},${cy + size * 0.85} Z`
      return <path d={d} {...base} />
    }

    case 'crown': {
      const pts = `${cx - size},${cy + size * 0.55} ${cx - size},${cy - size * 0.1} ${cx - size * 0.5},${cy + size * 0.15} ${cx},${cy - size * 0.65} ${cx + size * 0.5},${cy + size * 0.15} ${cx + size},${cy - size * 0.1} ${cx + size},${cy + size * 0.55}`
      return <polygon points={pts} {...base} />
    }

    case 'sword': {
      const bw = size * 0.09
      const d = `M ${cx},${cy - size} L ${cx + bw},${cy + size * 0.25} L ${cx - bw},${cy + size * 0.25} Z
        M ${cx - size * 0.38},${cy + size * 0.25} H ${cx + size * 0.38} V ${cy + size * 0.36} H ${cx - size * 0.38} Z
        M ${cx - size * 0.07},${cy + size * 0.36} H ${cx + size * 0.07} V ${cy + size * 0.78} H ${cx - size * 0.07} Z
        M ${cx - size * 0.12},${cy + size * 0.78} L ${cx + size * 0.12},${cy + size * 0.78} L ${cx},${cy + size * 0.95} Z`
      return <path d={d} {...base} />
    }

    case 'axe': {
      const d = `M ${cx - size * 0.06},${cy - size * 0.9} H ${cx + size * 0.06} V ${cy + size * 0.9} H ${cx - size * 0.06} Z
        M ${cx + size * 0.05},${cy - size * 0.85} C ${cx + size * 0.95},${cy - size * 0.9} ${cx + size * 0.95},${cy - size * 0.05} ${cx + size * 0.05},${cy - size * 0.1} Z`
      return <path d={d} {...base} />
    }

    case 'tree': {
      const d = `M ${cx},${cy - size} L ${cx + size * 0.4},${cy - size * 0.35} H ${cx - size * 0.4} Z
        M ${cx},${cy - size * 0.55} L ${cx + size * 0.65},${cy + size * 0.25} H ${cx - size * 0.65} Z
        M ${cx - size * 0.1},${cy + size * 0.25} H ${cx + size * 0.1} V ${cy + size * 0.6} H ${cx - size * 0.1} Z`
      return <path d={d} {...base} />
    }

    case 'banner': {
      const d = `M ${cx - size * 0.85},${cy - size} H ${cx - size * 0.7} V ${cy + size} H ${cx - size * 0.85} Z
        M ${cx - size * 0.7},${cy - size * 0.75} L ${cx + size * 0.85},${cy - size * 0.15} L ${cx - size * 0.7},${cy + size * 0.45} Z`
      return <path d={d} {...base} />
    }

    case 'leaf': {
      const d = `M ${cx},${cy - size} Q ${cx + size * 1.15},${cy} ${cx},${cy + size} Q ${cx - size * 1.15},${cy} ${cx},${cy - size} Z`
      return <path d={d} {...base} />
    }

    case 'key': {
      const kx = cx - size * 0.45, ky = cy
      const R = size * 0.42, r = size * 0.22
      const d = `M ${kx + R},${ky} A ${R},${R} 0 1,0 ${kx - R},${ky} A ${R},${R} 0 1,0 ${kx + R},${ky} Z
        M ${kx + r},${ky} A ${r},${r} 0 1,1 ${kx - r},${ky} A ${r},${r} 0 1,1 ${kx + r},${ky} Z
        M ${kx + R * 0.9},${ky - size * 0.09} H ${cx + size * 0.85} V ${ky + size * 0.09} H ${kx + R * 0.9} Z
        M ${cx + size * 0.45},${ky + size * 0.09} H ${cx + size * 0.6} V ${ky + size * 0.32} H ${cx + size * 0.45} Z
        M ${cx + size * 0.68},${ky + size * 0.09} H ${cx + size * 0.8} V ${ky + size * 0.28} H ${cx + size * 0.68} Z`
      return <path d={d} fillRule="evenodd" {...base} />
    }

    case 'gear': {
      const teeth = 8
      const outerPts = Array.from({ length: teeth * 2 }, (_, i) => {
        const angle = (i * Math.PI) / teeth
        const r = i % 2 === 0 ? size : size * 0.78
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      }).join(' L ')
      const holeR = size * 0.38
      const d = `M ${outerPts} Z
        M ${cx + holeR},${cy} A ${holeR},${holeR} 0 1,0 ${cx - holeR},${cy} A ${holeR},${holeR} 0 1,0 ${cx + holeR},${cy} Z`
      return <path d={d} fillRule="evenodd" {...base} />
    }

    case 'sunburst': {
      const points = 12
      const pts = Array.from({ length: points * 2 }, (_, i) => {
        const angle = (i * Math.PI) / points - Math.PI / 2
        const r = i % 2 === 0 ? size : size * 0.35
        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
      }).join(' ')
      return <polygon points={pts} {...base} />
    }

    default:
      return null
  }
}

export default function FactionLogo({ shapes = [], size = 64 }) {
  const logo = normalizeFactionLogo(shapes)

  if (logo.source === 'image' && logo.image) {
    return (
      <img
        src={logo.image}
        alt=""
        width={size}
        height={size}
        className="block object-contain"
        style={{ width: size, height: size }}
      />
    )
  }

  if (logo.shapes.length === 0) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {!logo.backgroundTransparent && <rect width="100" height="100" fill={logo.backgroundColor} />}
        <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="8 4" opacity="0.3" />
        <text x="50" y="57" textAnchor="middle" fontSize="32" fill="currentColor" opacity="0.25">?</text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      {!logo.backgroundTransparent && <rect width="100" height="100" fill={logo.backgroundColor} />}
      {logo.shapes.map((shape, i) => (
        <g key={shape.id || i}>
          {getShapeElement(shape)}
        </g>
      ))}
    </svg>
  )
}
