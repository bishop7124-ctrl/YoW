import { useEffect } from 'react'

const SITE_URL = 'https://www.yourownworld.co.uk'

function setMeta(selector, attr, value) {
  if (!value) return null
  const el = document.querySelector(selector)
  if (!el) return null
  const prev = el.getAttribute(attr)
  el.setAttribute(attr, value)
  return prev
}

function setCanonical(href) {
  let el = document.querySelector('link[rel="canonical"]')
  const prevHref = el?.getAttribute('href') ?? null
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
  return prevHref
}

// Updates document title, meta description, canonical link, and Open Graph /
// Twitter card tags while a public marketing page is mounted, then restores
// the previous (homepage) values on unmount — otherwise every SPA-rendered
// public route inherits index.html's homepage canonical/OG tags verbatim.
export function usePageMeta({ path, title, description, ogDescription, twitterDescription }) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`
    const prevTitle = document.title
    document.title = title

    const prevDescription = setMeta('meta[name="description"]', 'content', description)
    const prevCanonical = setCanonical(url)
    const prevOgTitle = setMeta('meta[property="og:title"]', 'content', title)
    const prevOgDescription = setMeta('meta[property="og:description"]', 'content', ogDescription || description)
    const prevOgUrl = setMeta('meta[property="og:url"]', 'content', url)
    const prevTwitterTitle = setMeta('meta[name="twitter:title"]', 'content', title)
    const prevTwitterDescription = setMeta('meta[name="twitter:description"]', 'content', twitterDescription || ogDescription || description)

    return () => {
      document.title = prevTitle
      if (prevDescription != null) setMeta('meta[name="description"]', 'content', prevDescription)
      if (prevCanonical != null) setCanonical(prevCanonical)
      if (prevOgTitle != null) setMeta('meta[property="og:title"]', 'content', prevOgTitle)
      if (prevOgDescription != null) setMeta('meta[property="og:description"]', 'content', prevOgDescription)
      if (prevOgUrl != null) setMeta('meta[property="og:url"]', 'content', prevOgUrl)
      if (prevTwitterTitle != null) setMeta('meta[name="twitter:title"]', 'content', prevTwitterTitle)
      if (prevTwitterDescription != null) setMeta('meta[name="twitter:description"]', 'content', prevTwitterDescription)
    }
  }, [path, title, description, ogDescription, twitterDescription])
}
