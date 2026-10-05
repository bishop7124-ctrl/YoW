import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'

/**
 * GET /api/get-founder-slots
 *
 * Public endpoint — no auth required.
 * Returns current Founder availability. Active Founding Price checkouts are
 * included as temporary holds so the public offer cannot oversell the cap.
 *
 * Response shape:
 *   { total: number, taken: number, remaining: number }
 */
export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, OPTIONS', headers: 'content-type' })
  // Availability controls a real price, so never serve a stale positive count.
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')  return res.status(405).json({ error: 'Method not allowed' })

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )

    const { data, error } = await supabase.rpc('get_founder_slot_info')

    if (error) {
      console.error('[get-founder-slots] RPC error:', error.message)
      // Return a safe fallback rather than a hard error — the UI can handle null gracefully.
      return res.status(200).json({ total: null, taken: null, remaining: null })
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('[get-founder-slots]', err)
    return res.status(200).json({ total: null, taken: null, remaining: null })
  }
}
