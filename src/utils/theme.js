// ─── Theme Registry ────────────────────────────────────────────────────────────
//
// Each theme has six semantic swatches:
//   bgMain/textMain       – canvas and readable body ink
//   bgNav/textMuted       – panel surface and secondary ink
//   accent/border         – action colour and structural line colour
//
// CSS maps these swatches into richer semantic roles (`--color-canvas`,
// `--color-surface`, `--color-line`, etc.) and keeps legacy aliases alive.
//
// The heavy lifting happens in index.css via [data-theme="..."] blocks which
// override both primitive and atmosphere CSS vars, letting every derived
// studio token (--studio-wood, --studio-paper, etc.) adapt automatically.
//

export const BUILT_IN_THEMES = [
  {
    id: 'dark-refined',
    label: 'Nocturne Grove',
    description: 'Dark green signature — coral action colour & muted sage',
    radiusUnit: 9,
    visualStrength: 1.25,
    glowIntensity: 7,
    glowPos: '82% 9%',
    swatches: {
      bgMain: '#0e1a18', bgNav: '#132220', textMain: '#ece6da',
      textMuted: '#8ea19b', accent: '#9c4935', border: 'rgba(255, 255, 255, 0.09)',
    },
  },
  {
    id: 'light-refined',
    label: 'Sage Grove',
    description: 'Light green signature — leafy surfaces & terracotta action colour',
    radiusUnit: 9,
    visualStrength: 0.82,
    glowIntensity: 4,
    glowPos: '78% 8%',
    swatches: {
      bgMain: '#e8f3ec', bgNav: '#dceae2', textMain: '#16261f',
      textMuted: '#51675c', accent: '#8f3f2d', border: 'rgba(22, 38, 31, 0.16)',
    },
  },
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

export const SYSTEM_THEME = 'system'
export const SYSTEM_LIGHT_THEME = 'light-refined'
export const SYSTEM_DARK_THEME = 'dark-refined'
export const DEFAULT_THEME = SYSTEM_THEME

export const getSystemResolvedTheme = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return SYSTEM_LIGHT_THEME
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? SYSTEM_DARK_THEME : SYSTEM_LIGHT_THEME
}

export const resolveThemeChoice = (theme) => theme === SYSTEM_THEME ? getSystemResolvedTheme() : theme

export const SYSTEM_THEME_OPTION = {
  id: SYSTEM_THEME,
  label: 'Match system',
  description: 'Uses Sage Grove in light mode and Nocturne Grove in dark mode',
  radiusUnit: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.radiusUnit ?? 9,
  visualStrength: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.visualStrength ?? 0.82,
  swatches: {
    bgMain: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.swatches.bgMain ?? '#e8f3ec',
    bgNav: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_DARK_THEME)?.swatches.bgNav ?? '#132220',
    textMain: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_DARK_THEME)?.swatches.textMain ?? '#ece6da',
    textMuted: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.swatches.textMuted ?? '#51675c',
    accent: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_DARK_THEME)?.swatches.accent ?? '#9c4935',
    border: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.swatches.border ?? 'rgba(22, 38, 31, 0.16)',
  },
}

export const DEFAULT_CUSTOM_COLORS = BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.swatches || BUILT_IN_THEMES[0].swatches
export const DEFAULT_THEME_TUNING = {
  radiusUnit: BUILT_IN_THEMES.find(theme => theme.id === SYSTEM_LIGHT_THEME)?.radiusUnit || BUILT_IN_THEMES[0].radiusUnit,
  visualStrength: 1,
}

const ALL_CSS_VARS = [
  '--color-canvas', '--color-surface', '--color-surface-muted', '--color-surface-raised',
  '--color-surface-hover', '--color-text', '--color-text-muted', '--color-text-faint',
  '--color-prose', '--color-accent', '--color-accent-soft', '--color-accent-text',
  '--color-accent-secondary', '--color-accent-contrast', '--color-line',
  '--color-line-strong',
  '--bg-main', '--bg-nav', '--bg-raise', '--bg-hover', '--text-main', '--text-muted',
  '--text-faint', '--prose-text', '--accent', '--accent-fade', '--accent-text',
  '--accent-2', '--accent-contrast', '--border', '--border-strong', '--logo-filter', '--accent2',
  '--atmos-warm', '--atmos-cool', '--atmos-paper', '--atmos-paper-line',
  '--atmos-wood', '--atmos-cork', '--atmos-spine-tint',
  '--atmos-glow-pos', '--atmos-glow-size', '--atmos-glow-intensity',
  '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-overlay',
  '--shadow-soft', '--shadow-modal', '--radius-unit', '--font-serif',
]

const THEME_OPTIONS = [...BUILT_IN_THEMES, ...QUICK_PALETTES]
const THEME_IDS = new Set(THEME_OPTIONS.map(t => t.id))

export const normalizeThemeChoice = (theme) => (
  THEME_IDS.has(theme) || theme === SYSTEM_THEME || theme === 'custom' ? theme : DEFAULT_THEME
)

export const loadThemeChoice = () => normalizeThemeChoice(localStorage.getItem('nf-theme'))

export const getThemeOption = (theme) => THEME_OPTIONS.find(option => option.id === normalizeThemeChoice(theme))

export const getThemeColors = (theme, customColors = {}) => {
  const normalized = normalizeThemeChoice(theme)
  if (normalized === 'custom') return { ...DEFAULT_CUSTOM_COLORS, ...customColors }
  return getThemeOption(resolveThemeChoice(normalized))?.swatches || DEFAULT_CUSTOM_COLORS
}

export const getThemeTuning = (theme, fallback = DEFAULT_THEME_TUNING) => {
  const option = getThemeOption(resolveThemeChoice(normalizeThemeChoice(theme)))
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
  if (!rgb) return fallback
  const toLinear = channel => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b)
}

export const rgbaFromHex = (hex, alpha) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return `rgba(255,255,255,${alpha})`
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

const logoFilterForBackground = (hex) => {
  return luminanceFromHex(hex) > 0.56 ? 'brightness(0)' : 'none'
}

export const getAccentContrast = (accent) => {
  const accentLum = luminanceFromHex(accent, 0.5)
  const darkLum = luminanceFromHex('#151713')
  const lightLum = luminanceFromHex('#ffffff')
  const darkRatio = (Math.max(accentLum, darkLum) + 0.05) / (Math.min(accentLum, darkLum) + 0.05)
  const lightRatio = (Math.max(accentLum, lightLum) + 0.05) / (Math.min(accentLum, lightLum) + 0.05)
  return darkRatio >= lightRatio ? '#151713' : '#ffffff'
}

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
    '--color-canvas': bgMain,
    '--color-surface': bgNav,
    '--color-surface-muted': mixHex(bgNav, bgMain, light ? 0.38 : 0.24),
    '--color-surface-raised': light ? mixHex(bgNav, '#ffffff', 0.72) : mixHex(bgNav, textMain, 0.09),
    '--color-surface-hover': rgbaFromHex(textMain, clamp(0.025 + strength * 0.035, 0.03, 0.09)),
    '--color-text': textMain,
    '--color-text-muted': textMuted,
    '--color-text-faint': mixHex(textMuted, bgMain, light ? 0.34 : 0.3),
    '--color-prose': textMain,
    '--color-accent': accent,
    '--color-accent-soft': rgbaFromHex(accent, clamp(0.08 + strength * 0.08, 0.08, 0.24)),
    '--color-accent-text': light ? mixHex(accent, textMain, 0.16) : mixHex(accent, '#ffffff', 0.32),
    '--color-accent-secondary': mixHex(accent, textMuted, 0.42),
    '--color-accent-contrast': getAccentContrast(accent),
    '--color-line': border,
    '--color-line-strong': light ? rgbaFromHex(textMain, 0.28) : rgbaFromHex('#ffffff', 0.16),
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
  const shadowTone = isLight ? '20,24,28' : '0,0,0'

  root.style.setProperty('--radius-unit', `${radiusUnit}px`)
  root.style.setProperty('--accent-contrast', getAccentContrast(colors.accent))
  root.style.setProperty('--accent-fade', rgbaFromHex(colors.accent, clamp(0.08 + visualStrength * 0.08, 0.08, 0.24)))
  root.style.setProperty('--bg-hover', rgbaFromHex(colors.textMain, clamp(0.025 + visualStrength * 0.035, 0.03, 0.09)))
  root.style.setProperty('--atmos-glow-intensity', `${Math.round(visualStrength * 7)}%`)
  if (isLight) {
    root.style.setProperty('--shadow-sm', `0 4px 12px rgba(${shadowTone},${clamp(0.11 * visualStrength, 0.06, 0.2)}), 0 1px 1px rgba(255,255,255,.68) inset`)
    root.style.setProperty('--shadow-md', `0 14px 34px rgba(${shadowTone},${clamp(0.17 * visualStrength, 0.1, 0.3)}), 0 2px 8px rgba(${shadowTone},${clamp(0.07 * visualStrength, 0.04, 0.16)})`)
    root.style.setProperty('--shadow-lg', `0 30px 68px rgba(${shadowTone},${clamp(0.22 * visualStrength, 0.13, 0.38)}), 0 10px 24px rgba(${shadowTone},${clamp(0.09 * visualStrength, 0.05, 0.18)})`)
    root.style.setProperty('--shadow-overlay', `0 34px 86px rgba(${shadowTone},${clamp(0.36 * visualStrength, 0.2, 0.52)}), 0 10px 28px rgba(${shadowTone},${clamp(0.14 * visualStrength, 0.08, 0.26)})`)
    return
  }

  const base = 0.22
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

// Keeps the browser's own chrome (iOS Safari status bar / toolbar tint) in sync with
// the active theme, so it never falls back to a default white bar above/below the app.
const syncThemeColorMeta = (bgMain) => {
  if (!bgMain) return
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', bgMain)
}

export const applyThemeToDocument = (theme, customColors = {}) => {
  const root = document.documentElement
  const normalized = normalizeThemeChoice(theme)
  const resolved = resolveThemeChoice(normalized)

  if (normalized === 'custom') {
    root.setAttribute('data-theme', 'custom')
    root.setAttribute('data-theme-choice', 'custom')
    const colors = { ...DEFAULT_CUSTOM_COLORS, ...customColors }
    const tokens = deriveCustomThemeTokens(colors, loadThemeTuning())
    Object.entries(tokens).forEach(([property, value]) => root.style.setProperty(property, value))
    // Cached so the pre-paint boot script in index.html can replay these vars
    // synchronously on the next load, before React mounts — avoids a theme flash.
    try { localStorage.setItem('nf-custom-computed', JSON.stringify(tokens)) } catch { /* storage unavailable */ }
    syncThemeColorMeta(colors.bgMain)
    return normalized
  }

  const quickPalette = QUICK_PALETTES.find(option => option.id === normalized)
  if (quickPalette) {
    root.setAttribute('data-theme', normalized)
    root.setAttribute('data-theme-choice', normalized)
    setThemeVars(root, quickPalette.swatches)
    syncThemeColorMeta(quickPalette.swatches.bgMain)
    return normalized
  }

  // Built-in theme — remove any inline overrides and let the CSS block handle everything
  ALL_CSS_VARS.forEach(variable => root.style.removeProperty(variable))
  root.setAttribute('data-theme', resolved)
  root.setAttribute('data-theme-choice', normalized)
  syncThemeColorMeta(getThemeOption(resolved)?.swatches?.bgMain)
  return normalized
}

export const saveThemeChoice = (theme, customColors) => {
  const normalized = applyThemeToDocument(theme, customColors)
  localStorage.setItem('nf-theme', normalized)
  return normalized
}
