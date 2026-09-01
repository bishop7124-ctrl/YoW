import { createClient } from '@supabase/supabase-js'

// Vercel API route — desktop app download delivery.
// Called by DownloadPage.jsx. The installer URLs live only in server env vars
// (DESKTOP_DOWNLOAD_URL_MACOS / DESKTOP_DOWNLOAD_URL_WINDOWS) so they are never
// shipped in the client bundle; entitlement is verified server-side before
// they are returned.

const DESKTOP_ENTITLED_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder', 'beta_tester'])

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const serverMetadata = user.app_metadata || {}
    const plan = serverMetadata.subscription_plan || (serverMetadata.beta_tester === true ? 'beta_tester' : null)
    if (!DESKTOP_ENTITLED_PLAN_KEYS.has(plan)) {
      return res.status(403).json({ error: 'Your account does not include desktop access.' })
    }

    const platforms = [
      { key: 'macos', label: 'macOS', url: process.env.DESKTOP_DOWNLOAD_URL_MACOS || null },
      { key: 'windows', label: 'Windows', url: process.env.DESKTOP_DOWNLOAD_URL_WINDOWS || null },
    ].filter(p => p.url)

    return res.status(200).json({
      version: process.env.DESKTOP_APP_VERSION || null,
      platforms,
    })
  } catch (err) {
    console.error('[get-download-links]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
