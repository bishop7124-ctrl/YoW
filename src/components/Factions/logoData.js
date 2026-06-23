export const DEFAULT_LOGO_BACKGROUND = '#0c0c12'
export const DEFAULT_LOGO_BACKGROUND_TRANSPARENT = true

export function normalizeFactionLogo(logo) {
  if (Array.isArray(logo)) {
    return {
      source: 'builder',
      image: '',
      shapes: logo,
      backgroundColor: DEFAULT_LOGO_BACKGROUND,
      backgroundTransparent: DEFAULT_LOGO_BACKGROUND_TRANSPARENT,
    }
  }

  if (logo && typeof logo === 'object') {
    const image = typeof logo.image === 'string' ? logo.image : ''
    return {
      source: logo.source === 'image' && image ? 'image' : 'builder',
      image,
      shapes: Array.isArray(logo.shapes) ? logo.shapes : [],
      backgroundColor: logo.backgroundColor || DEFAULT_LOGO_BACKGROUND,
      backgroundTransparent: Object.hasOwn(logo, 'backgroundTransparent')
        ? Boolean(logo.backgroundTransparent)
        : DEFAULT_LOGO_BACKGROUND_TRANSPARENT,
    }
  }

  return {
    source: 'builder',
    image: '',
    shapes: [],
    backgroundColor: DEFAULT_LOGO_BACKGROUND,
    backgroundTransparent: DEFAULT_LOGO_BACKGROUND_TRANSPARENT,
  }
}
