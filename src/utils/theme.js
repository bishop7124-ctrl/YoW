// ─── Theme Registry ────────────────────────────────────────────────────────────
//
// Each theme has:
//   swatches  – six preview colours shown in the theme picker
//   atmos     – atmosphere tokens that drive gradients, textures, and shadows
//
// The heavy lifting happens in index.css via [data-theme="..."] blocks which
// override both primitive and atmosphere CSS vars, letting every derived
// studio token (--studio-wood, --studio-paper, etc.) adapt automatically.
//

export const BUILT_IN_THEMES = [
  {
    id: 'tropical',
    label: 'Tropical',
    description: 'Deep rainforest dusk — coral accent & dark teal',
    radiusUnit: 9,
    visualStrength: 1.25,
    glowIntensity: 8,
    glowPos: '85% 8%',
    swatches: {
      bgMain: '#0d282e', bgNav: '#133840', textMain: '#e2f0ee',
      textMuted: '#7ab8b4', accent: '#e8724e', border: '#1e4a50',
    },
  },
  {
    id: 'sage-modern',
    label: 'Sage Modern',
    description: 'Natural light studio — sage green & soft white',
    radiusUnit: 6,
    visualStrength: 0.75,
    glowIntensity: 4,
    glowPos: '80% 90%',
    swatches: {
      bgMain: '#f5f8f3', bgNav: '#eaeee6', textMain: '#1e2922',
      textMuted: '#5a7060', accent: '#4a8c68', border: '#ced8ca',
    },
  },
  {
    id: 'industrial-loft',
    label: 'Industrial Loft',
    description: 'Concrete & steel — amber & dark slate',
    radiusUnit: 3,
    visualStrength: 1.15,
    glowIntensity: 2,
    glowPos: '50% 50%',
    swatches: {
      bgMain: '#141720', bgNav: '#1c2028', textMain: '#dce0e8',
      textMuted: '#6a7282', accent: '#d08820', border: '#282c38',
    },
  },
  {
    id: 'caramel-latte',
    label: 'Caramel Latte',
    description: 'Warm café afternoon — caramel & cream',
    radiusUnit: 10,
    visualStrength: 0.9,
    glowIntensity: 5,
    glowPos: '80% 90%',
    swatches: {
      bgMain: '#fef8f0', bgNav: '#f4e8d8', textMain: '#28200c',
      textMuted: '#7a6840', accent: '#b87830', border: '#e0c8a0',
    },
  },
  {
    id: 'ocean-depth',
    label: 'Ocean Depth',
    description: 'Bioluminescent deep sea — teal & midnight navy',
    radiusUnit: 5,
    visualStrength: 1.45,
    glowIntensity: 7,
    glowPos: '88% 12%',
    swatches: {
      bgMain: '#07151c', bgNav: '#0e2432', textMain: '#d4eef8',
      textMuted: '#4888a8', accent: '#189ab0', border: '#143848',
    },
  },
  {
    id: 'pearl-minimal',
    label: 'Pearl Minimal',
    description: 'Clean blank page — cool grey-blue & white',
    radiusUnit: 5,
    visualStrength: 0.55,
    glowIntensity: 0,
    glowPos: '50% 50%',
    swatches: {
      bgMain: '#fafaf9', bgNav: '#f0f2f1', textMain: '#1c1f23',
      textMuted: '#656e77', accent: '#7a8a9c', border: '#e2e6ea',
    },
  },
]

export const QUICK_PALETTES = []

export const DEFAULT_THEME = BUILT_IN_THEMES[0].id
export const DEFAULT_CUSTOM_COLORS = BUILT_IN_THEMES[0].swatches
export const DEFAULT_THEME_TUNING = {
  radiusUnit: BUILT_IN_THEMES[0].radiusUnit,
  visualStrength: 1,
}

const ALL_CSS_VARS = [
  '--bg-main', '--bg-nav', '--bg-hover', '--text-main', '--text-muted',
  '--accent', '--accent-fade', '--accent-contrast', '--border', '--logo-filter', '--accent2',
  '--atmos-warm', '--atmos-cool', '--atmos-paper', '--atmos-paper-line',
  '--atmos-wood', '--atmos-cork', '--atmos-spine-tint',
  '--atmos-glow-pos', '--atmos-glow-size', '--atmos-glow-intensity',
  '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-overlay',
  '--shadow-soft', '--shadow-modal', '--radius-unit', '--font-serif',
]

const THEME_OPTIONS = [...BUILT_IN_THEMES, ...QUICK_PALETTES]
const THEME_IDS = new Set(THEME_OPTIONS.map(t => t.id))

export const normalizeThemeChoice = (theme) => (
  THEME_IDS.has(theme) || theme === 'custom' ? theme : DEFAULT_THEME
)

export const loadThemeChoice = () => normalizeThemeChoice(localStorage.getItem('nf-theme'))

export const getThemeOption = (theme) => THEME_OPTIONS.find(option => option.id === normalizeThemeChoice(theme))

export const getThemeColors = (theme, customColors = {}) => {
  const normalized = normalizeThemeChoice(theme)
  if (normalized === 'custom') return { ...DEFAULT_CUSTOM_COLORS, ...customColors }
  return getThemeOption(normalized)?.swatches || DEFAULT_CUSTOM_COLORS
}

export const getThemeTuning = (theme, fallback = DEFAULT_THEME_TUNING) => {
  const option = getThemeOption(theme)
  if (!option) return fallback
  return {
    radiusUnit: option.radiusUnit ?? fallback.radiusUnit,
    visualStrength: option.visualStrength ?? fallback.visualStrength,
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export const loadThemeTuning = () => {
  const radiusUnit = Number(localStorage.getItem('nf-radius-unit'))
  const visualStrength = Number(localStorage.getItem('nf-visual-strength'))
  return {
    radiusUnit: Number.isFinite(radiusUnit) ? clamp(radiusUnit, 2, 16) : DEFAULT_THEME_TUNING.radiusUnit,
    visualStrength: Number.isFinite(visualStrength) ? clamp(visualStrength, 0.45, 1.7) : DEFAULT_THEME_TUNING.visualStrength,
  }
}

const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return null
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  const v = parseInt(clean, 16)
  if (Number.isNaN(v)) return null
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 }
}

const rgbToHex = ({ r, g, b }) => (
  `#${[r, g, b].map(channel => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')).join('')}`
)

const mixHex = (a, b, amount = 0.5) => {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  if (!ca || !cb) return a || b || '#888888'
  const t = clamp(amount, 0, 1)
  return rgbToHex({
    r: ca.r * (1 - t) + cb.r * t,
    g: ca.g * (1 - t) + cb.g * t,
    b: ca.b * (1 - t) + cb.b * t,
  })
}

const luminanceFromHex = (hex, fallback = 0) => {
  const rgb = hexToRgb(hex)
  return rgb ? (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255 : fallback
}

export const rgbaFromHex = (hex, alpha) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(255,255,255,${alpha})`
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

const logoFilterForBackground = (hex) => {
  return luminanceFromHex(hex) > 0.56 ? 'brightness(0)' : 'none'
}

export const getAccentContrast = (accent) => (
  luminanceFromHex(accent, 0.5) > 0.58 ? '#151713' : '#ffffff'
)

export const deriveCustomThemeTokens = (colors = DEFAULT_CUSTOM_COLORS, tuning = DEFAULT_THEME_TUNING) => {
  const bgMain = colors.bgMain || DEFAULT_CUSTOM_COLORS.bgMain
  const bgNav = colors.bgNav || DEFAULT_CUSTOM_COLORS.bgNav
  const textMain = colors.textMain || DEFAULT_CUSTOM_COLORS.textMain
  const textMuted = colors.textMuted || DEFAULT_CUSTOM_COLORS.textMuted
  const accent = colors.accent || DEFAULT_CUSTOM_COLORS.accent
  const border = colors.border || DEFAULT_CUSTOM_COLORS.border
  const light = luminanceFromHex(bgMain) > 0.58
  const strength = clamp(Number(tuning.visualStrength) || DEFAULT_THEME_TUNING.visualStrength, 0.45, 1.7)
  const depth = light ? '#ffffff' : '#030405'

  return {
    '--bg-main': bgMain,
    '--bg-nav': bgNav,
    '--text-main': textMain,
    '--text-muted': textMuted,
    '--accent': accent,
    '--accent2': mixHex(accent, textMuted, 0.42),
    '--border': border,
    '--accent-contrast': getAccentContrast(accent),
    '--accent-fade': rgbaFromHex(accent, clamp(0.08 + strength * 0.08, 0.08, 0.24)),
    '--bg-hover': rgbaFromHex(textMain, clamp(0.025 + strength * 0.035, 0.03, 0.09)),
    '--logo-filter': logoFilterForBackground(bgNav),
    '--atmos-warm': mixHex(bgNav, accent, light ? 0.22 : 0.16),
    '--atmos-cool': mixHex(bgMain, depth, light ? 0.2 : 0.34),
    '--atmos-paper': light ? mixHex(bgNav, bgMain, 0.38) : mixHex(bgNav, textMain, 0.13),
    '--atmos-paper-line': mixHex(border, accent, light ? 0.14 : 0.24),
    '--atmos-wood': mixHex(bgMain, accent, light ? 0.08 : 0.1),
    '--atmos-cork': mixHex(bgNav, accent, light ? 0.18 : 0.18),
    '--atmos-spine-tint': mixHex(bgNav, bgMain, 0.42),
    '--atmos-glow-pos': light ? '80% 90%' : '86% 10%',
    '--atmos-glow-size': light ? '28%' : '32%',
  }
}

export const applyThemeTuning = (tuning = {}, colors = DEFAULT_CUSTOM_COLORS) => {
  const root = document.documentElement
  const radiusUnit = clamp(Number(tuning.radiusUnit) || DEFAULT_THEME_TUNING.radiusUnit, 2, 16)
  const visualStrength = clamp(Number(tuning.visualStrength) || DEFAULT_THEME_TUNING.visualStrength, 0.45, 1.7)
  const bg = hexToRgb(colors.bgMain)
  const isLight = bg ? (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255 > 0.58 : false
  const base = isLight ? 0.075 : 0.22
  const shadowTone = isLight ? '20,24,28' : '0,0,0'

  root.style.setProperty('--radius-unit', `${radiusUnit}px`)
  root.style.setProperty('--accent-contrast', getAccentContrast(colors.accent))
  root.style.setProperty('--accent-fade', rgbaFromHex(colors.accent, clamp(0.08 + visualStrength * 0.08, 0.08, 0.24)))
  root.style.setProperty('--bg-hover', rgbaFromHex(colors.textMain, clamp(0.025 + visualStrength * 0.035, 0.03, 0.09)))
  root.style.setProperty('--atmos-glow-intensity', `${Math.round(visualStrength * 7)}%`)
  root.style.setProperty('--shadow-sm', `0 2px 8px rgba(${shadowTone},${clamp(base * visualStrength, 0.04, 0.45)})`)
  root.style.setProperty('--shadow-md', `0 10px 28px rgba(${shadowTone},${clamp((base + 0.08) * visualStrength, 0.08, 0.6)})`)
  root.style.setProperty('--shadow-lg', `0 24px 62px rgba(${shadowTone},${clamp((base + 0.16) * visualStrength, 0.12, 0.72)})`)
  root.style.setProperty('--shadow-overlay', `0 30px 80px rgba(${shadowTone},${clamp((base + 0.26) * visualStrength, 0.18, 0.82)})`)
}

export const saveThemeTuning = (tuning, colors) => {
  localStorage.setItem('nf-radius-unit', String(tuning.radiusUnit))
  localStorage.setItem('nf-visual-strength', String(tuning.visualStrength))
  applyThemeTuning(tuning, colors)
}

// Applied only for quick palettes / custom — built-in themes are fully driven
// by CSS [data-theme] blocks in index.css.
const setThemeVars = (root, colors) => {
  const tokens = deriveCustomThemeTokens(colors, loadThemeTuning())
  Object.entries(tokens).forEach(([property, value]) => root.style.setProperty(property, value))
}

export const applyThemeToDocument = (theme, customColors = {}) => {
  const root = document.documentElement
  const normalized = normalizeThemeChoice(theme)

  if (normalized === 'custom') {
    root.setAttribute('data-theme', 'custom')
    setThemeVars(root, { ...DEFAULT_CUSTOM_COLORS, ...customColors })
    return normalized
  }

  const quickPalette = QUICK_PALETTES.find(option => option.id === normalized)
  if (quickPalette) {
    root.setAttribute('data-theme', normalized)
    setThemeVars(root, quickPalette.swatches)
    return normalized
  }

  // Built-in theme — remove any inline overrides and let the CSS block handle everything
  ALL_CSS_VARS.forEach(variable => root.style.removeProperty(variable))
  root.setAttribute('data-theme', normalized)
  return normalized
}

export const saveThemeChoice = (theme, customColors) => {
  const normalized = applyThemeToDocument(theme, customColors)
  localStorage.setItem('nf-theme', normalized)
  return normalized
}
