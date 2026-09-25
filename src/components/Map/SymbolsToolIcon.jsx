export default function SymbolsToolIcon({ mapType }) {
  const icon = mapType === 'interior' ? 'bed' : mapType === 'local' ? 'building' : 'tree'
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'data-symbols-tool-icon': icon,
  }
  if (icon === 'bed') return <svg {...common}><path d="M4 4v16M20 10v10M4 16h16M7 10h10a3 3 0 0 1 3 3v3H4v-3a3 3 0 0 1 3-3Z"/><path d="M4 13h16"/></svg>
  if (icon === 'building') return <svg {...common}><path d="M4 21V8l8-5 8 5v13M2 21h20M9 21v-6h6v6M8 10h1M15 10h1"/></svg>
  return <svg {...common}><path d="M12 22v-7M8 22h8M12 16c-5 0-8-2.7-8-6.1 0-2.2 1.5-4.1 3.7-5A5 5 0 0 1 12 2a5 5 0 0 1 4.3 2.9c2.2.9 3.7 2.8 3.7 5 0 3.4-3 6.1-8 6.1Z"/><path d="m8.5 11 3.5 4 3.5-4"/></svg>
}
