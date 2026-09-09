import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_lib/cors.js'

/**
 * GET /api/get-founder-slots
 *
 * Public endpoint — no auth required.
 * Returns the current founder slot availability derived from app_config
 * and the count of rows in user_profiles where is_founder = true.
 *
 * Response shape:
 *   { total: number, taken: number, remaining: number }
 */
export default async function handler(req, res) {
  applyCors(req, res, { methods: 'GET, OPTIONS', headers: 'content-type' })
  // Short cache — stale by up to 60 s is acceptable for a slot counter.
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120')

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
