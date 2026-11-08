import { useEffect } from 'react'
import HomePage from '../auth/HomePage'
import FeaturesPage from '../features/FeaturesPage'
import FAQPage from '../faq/FAQPage'

// The real marketing page, fed by the editor's unsaved draft over a same-origin
// BroadcastChannel. It exposes nothing the public site does not already show
// (until the editor pushes a draft, it renders the built-in copy), and it is
// marked noindex.
export default function SitePreview({ page }) {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'robots'; document.head.appendChild(meta) }
    const previous = meta.content
    meta.content = 'noindex, nofollow'
    return () => { meta.content = previous || 'index, follow' }
  }, [])

  const noop = () => {}
  return (
    <>
      <div style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 9999, background: '#1d1d1d', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 99, boxShadow: '0 2px 12px rgba(0,0,0,.4)', pointerEvents: 'none' }}>
        Draft preview — not live
      </div>
      {page === 'home' && <HomePage preview />}
      {page === 'features' && <FeaturesPage preview onGetStarted={noop} onLogin={noop} />}
      {page === 'faq' && <FAQPage preview onGetStarted={noop} onLogin={noop} />}
    </>
  )
}
