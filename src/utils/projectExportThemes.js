import { BUILT_IN_THEMES, SYSTEM_LIGHT_THEME, SYSTEM_THEME } from './theme.js'

const serifStack = 'Georgia, "Times New Roman", serif'
const sansStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const hexToRgb = (hex) => {
  const clean = String(hex || '#000000').replace('#', '')
  const normalized = clean.length === 3
    ? clean.split('').map(char => `${char}${char}`).join('')
    : clean.padEnd(6, '0').slice(0, 6)
  const value = parseInt(normalized, 16)
  if (Number.isNaN(value)) return { r: 0, g: 0, b: 0 }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map(channel => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0')).join('')}`

const mixHex = (from, to, weight = 0.5) => {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return rgbToHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  })
}

const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

const createPdfTheme = (theme) => {
  const swatches = theme.swatches
  const isLight = luminance(swatches.bgMain) > 0.58
  const marker = theme.label
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 5)
    .toUpperCase()

  return {
    id: theme.id,
    name: theme.label,
    tagline: theme.description,
    palette: {
      page: swatches.bgMain,
      pageAlt: swatches.bgNav,
      panel: isLight ? mixHex(swatches.bgNav, '#ffffff', 0.5) : mixHex(swatches.bgNav, '#ffffff', 0.06),
      panelSoft: isLight ? mixHex(swatches.border, '#ffffff', 0.42) : mixHex(swatches.bgNav, swatches.border, 0.55),
      text: swatches.textMain,
      muted: swatches.textMuted,
      faint: mixHex(swatches.textMuted, swatches.border, isLight ? 0.48 : 0.36),
      accent: swatches.accent,
      accent2: mixHex(swatches.accent, swatches.textMuted, 0.42),
      border: swatches.border,
      shadow: isLight ? 'rgba(20,24,28,.16)' : 'rgba(0,0,0,.3)',
    },
    typography: {
      display: serifStack,
      body: serifStack,
      ui: sansStack,
    },
    cover: {
      overlay: `linear-gradient(130deg, ${isLight ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.18)'}, ${mixHex(swatches.accent, swatches.bgMain, 0.45)}33 52%, ${isLight ? 'rgba(20,24,28,.12)' : 'rgba(0,0,0,.5)'})`,
      marker,
    },
    texture:
      `radial-gradient(circle at ${theme.glowPos || '80% 12%'}, ${swatches.accent}22, transparent 27%), linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.016) 1px, transparent 1px)`,
  }
}

export const EXPORT_PDF_THEMES = BUILT_IN_THEMES.reduce((themes, theme) => {
  themes[theme.id] = createPdfTheme(theme)
  return themes
}, {})

const LEGACY_THEME_ALIASES = {
  [SYSTEM_THEME]: SYSTEM_LIGHT_THEME,
  obsidian: 'dark-refined',
  royal: 'tropical',
  verdant: 'tropical',
  ivory: 'light-refined',
  crimson: 'tropical',
}

export const DEFAULT_EXPORT_PDF_THEME_ID = SYSTEM_LIGHT_THEME

export const EXPORT_PDF_THEME_OPTIONS = BUILT_IN_THEMES.map(theme => ({
  id: theme.id,
  name: theme.label,
  tagline: theme.description,
}))

export const getExportPdfTheme = (themeId = DEFAULT_EXPORT_PDF_THEME_ID) => {
  const normalizedThemeId = LEGACY_THEME_ALIASES[themeId] ?? themeId
  return EXPORT_PDF_THEMES[normalizedThemeId] ?? EXPORT_PDF_THEMES[DEFAULT_EXPORT_PDF_THEME_ID]
}
