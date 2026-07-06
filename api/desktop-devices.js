import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Vercel API route — desktop device activation registry (PRD Phase 4).
// POST   { deviceId, deviceName?, platform? } → activate or re-verify this
//        device and return a signed entitlement record. Enforces a soft cap
//        on simultaneously active devices.
// GET    ?deviceId=... → list this user's active devices.
// DELETE { deviceId } → self-service deactivation (frees a cap slot).
//
// The registry is advisory by design: it powers the cap, the devices UI, and
// offline-grace re-verification. It never gates editing or export client-side.

const LIFETIME_PLAN_KEYS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder'])
const DEFAULT_DEVICE_CAP = 3

const deviceCap = () => {
  const parsed = Number.parseInt(process.env.DESKTOP_DEVICE_CAP || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEVICE_CAP
}

// Entitlement records are HMAC-signed so the server can recognise its own
// issued records later. Field order is fixed — the signature covers the exact
// serialized string.
export const buildEntitlementRecord = (userId, deviceId, plan) => ({
  version: 1,
  userId,
  deviceId,
  plan,
  issuedAt: new Date().toISOString(),
})

export const signEntitlementRecord = (record, secret) => {
  if (!secret) return null
  return crypto.createHmac('sha256', secret).update(JSON.stringify(record)).digest('hex')
}

const normalizeDeviceId = (value) => {
  const id = String(value || '').trim()
  return /^[a-zA-Z0-9-]{8,64}$/.test(id) ? id : null
}

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    const plan = user.app_metadata?.subscription_plan || user.user_metadata?.subscription_plan || null
    if (!LIFETIME_PLAN_KEYS.has(plan)) {
      return res.status(403).json({ error: 'The desktop app is available to Lifetime and Founder members.' })
    }

    if (req.method === 'GET') {
      const { data, error: listError } = await supabase
        .from('desktop_devices')
        .select('device_id, device_name, platform, activated_at, last_seen_at')
        .eq('user_id', user.id)
        .is('deactivated_at', null)
      if (listError) throw listError
      return res.status(200).json({ devices: data || [], cap: deviceCap() })
    }

    const deviceId = normalizeDeviceId(req.body?.deviceId)
    if (!deviceId) return res.status(400).json({ error: 'A valid deviceId is required.' })

    if (req.method === 'DELETE') {
      const { error: deactivateError } = await supabase
        .from('desktop_devices')
        .update({ deactivated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('device_id', deviceId)
      if (deactivateError) throw deactivateError
      return res.status(200).json({ deactivated: deviceId })
    }

    // POST — activate or re-verify
    const { data: existing, error: existingError } = await supabase
      .from('desktop_devices')
      .select('device_id, device_name, platform, activated_at, last_seen_at, deactivated_at')
      .eq('user_id', user.id)
    if (existingError) throw existingError

    const rows = existing || []
    const active = rows.filter(row => !row.deactivated_at)
    const thisDeviceActive = active.some(row => row.device_id === deviceId)
    if (!thisDeviceActive && active.length >= deviceCap()) {
      return res.status(409).json({
        error: `Device limit reached (${deviceCap()} active devices). Deactivate one to activate this device.`,
        devices: active.map(({ device_id, device_name, platform, last_seen_at }) => ({ device_id, device_name, platform, last_seen_at })),
        cap: deviceCap(),
      })
    }

    const now = new Date().toISOString()
    const { error: upsertError } = await supabase
      .from('desktop_devices')
      .upsert({
        user_id: user.id,
        device_id: deviceId,
        device_name: String(req.body?.deviceName || '').slice(0, 120),
        platform: String(req.body?.platform || '').slice(0, 40),
        last_seen_at: now,
        deactivated_at: null,
      }, { onConflict: 'user_id,device_id' })
    if (upsertError) throw upsertError

    const record = buildEntitlementRecord(user.id, deviceId, plan)
    const signature = signEntitlementRecord(record, process.env.ENTITLEMENT_SIGNING_SECRET)
    return res.status(200).json({ record, signature, cap: deviceCap() })
  } catch (err) {
    console.error('[desktop-devices]', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
