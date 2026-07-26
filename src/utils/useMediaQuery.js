import { useEffect, useState } from 'react'

// The two breakpoints actually used consistently across the app's CSS.
// New responsive work should stick to these instead of introducing new
// ad hoc pixel values.
export const BREAKPOINT_TABLET = 860
export const BREAKPOINT_PHONE = 640

function matchesMaxWidth(maxWidth) {
  if (typeof window === 'undefined') return false
  // jsdom (used by the test suite) doesn't implement matchMedia — fall back
  // to a plain width comparison so hooks/helpers still work under test.
  if (typeof window.matchMedia !== 'function') return window.innerWidth <= maxWidth
  return window.matchMedia(`(max-width: ${maxWidth}px)`).matches
}

export function useMediaQuery(maxWidth) {
  const [matches, setMatches] = useState(() => matchesMaxWidth(maxWidth))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      const handleResize = () => setMatches(matchesMaxWidth(maxWidth))
      handleResize()
      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const handleChange = () => setMatches(media.matches)
    handleChange()
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [maxWidth])

  return matches
}

// Reactive — re-renders the component when the viewport crosses the breakpoint.
export function useIsMobile() {
  return useMediaQuery(BREAKPOINT_TABLET)
}

export function useIsPhone() {
  return useMediaQuery(BREAKPOINT_PHONE)
}

// Non-reactive — for one-off checks (lazy useState initializers, event handlers)
// where a component doesn't need to re-render on resize.
export function isMobileViewport() {
  return matchesMaxWidth(BREAKPOINT_TABLET)
}

export function isPhoneViewport() {
  return matchesMaxWidth(BREAKPOINT_PHONE)
}
