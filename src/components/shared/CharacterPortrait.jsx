import { UserMediaImage } from './UserMedia'

// Single source of truth for cropping a character portrait to its saved focal
// point + zoom (set in the character's photo editor). Every place a portrait
// is rendered — character list, dossier header, relationship map, family
// tree — should render through this component so a crop chosen once looks
// identical everywhere it appears. Do not reimplement the objectPosition/
// transform math elsewhere; that drift is what caused portraits to render
// differently screen-to-screen before this component existed.
export function CharacterPortrait({ src, position, zoom, className = '', style }) {
  const pos = position || '50% 50%'
  const z = zoom || 1
  return (
    <div className={`overflow-hidden ${className}`} style={style}>
      <UserMediaImage
        src={src}
        alt=""
        className="w-full h-full object-cover pointer-events-none"
        style={{
          objectPosition: pos,
          ...(z !== 1 && { transform: `scale(${z})`, transformOrigin: pos }),
        }}
      />
    </div>
  )
}

// Two-letter initials fallback, shared so every avatar spot falls back the same way.
export const characterInitials = name =>
  String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || '?'

// Portrait-or-initials identity chip for compact spots (lists, map nodes, tree sidebars).
export function CharacterAvatar({ character, size = 40, shape = 'circle', className = '' }) {
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg'
  const style = { width: size, height: size }
  if (character?.image) {
    return (
      <CharacterPortrait
        src={character.image}
        position={character.imagePosition}
        zoom={character.imageZoom}
        className={`${shapeClass} border border-[var(--border)] flex-shrink-0 ${className}`}
        style={style}
      />
    )
  }
  return (
    <div
      style={style}
      className={`${shapeClass} bg-[var(--accent-fade)] border border-[var(--accent)]/20 flex items-center justify-center flex-shrink-0 text-[var(--accent)] font-bold ${className}`}
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}>{characterInitials(character?.name)}</span>
    </div>
  )
}
