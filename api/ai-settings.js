import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const PROVIDER_IDS = new Set(['google', 'anthropic', 'openrouter', 'openai'])
const MAX_BODY_BYTES = 20_000

function getEncryptionKey() {
  const secret = process.env.AI_SETTINGS_ENCRYPTION_KEY || process.env.AI_SETTINGS_SECRET
  if (!secret) return null

  const trimmed = secret.trim()
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex')

  try {
    const decoded = Buffer.from(trimmed, 'base64')
    if (decoded.length === 32) return decoded
  } catch {
    // Fall through to deterministic derivation below.
  }

  return crypto.createHash('sha256').update(trimmed).digest()
}

export function encryptSettings(settings, secretKey = getEncryptionKey()) {
  if (!secretKey) throw new Error('AI settings encryption key is not configured.')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(settings), 'utf8'),
    cipher.final(),
  ])
  return {
    version: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptSettings(payload, secretKey = getEncryptionKey()) {
  if (!secretKey) throw new Error('AI settings encryption key is not configured.')
  if (!payload || payload.version !== 1 || payload.alg !== 'aes-256-gcm') {
    throw new Error('Unsupported AI settings payload.')
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    secretKey,
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(plaintext)
}

function sanitizeSettings(input = {}) {
  const settings = typeof input === 'object' && input ? input : {}
  const activeProvider = PROVIDER_IDS.has(settings.activeProvider) ? settings.activeProvider : 'openrouter'
  const sanitized = { activeProvider }

  for (const provider of PROVIDER_IDS) {
    const cfg = typeof settings[provider] === 'object' && settings[provider] ? settings[provider] : {}
    sanitized[provider] = {
      apiKey: String(cfg.apiKey || '').trim().slice(0, 5000),
      model: String(cfg.model || '').trim().slice(0, 300),
    }
    if (provider === 'openai') {
      sanitized[provider].baseUrl = String(cfg.baseUrl || '').trim().slice(0, 500)
    }
  }

  if (JSON.stringify(sanitized).length > MAX_BODY_BYTES) {
    throw new Error('AI settings payload is too large.')
  }

  return sanitized
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
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
    const secretKey = getEncryptionKey()
    if (!secretKey) {
      return res.status(500).json({ error: 'AI settings sync is not configured yet.' })
    }

    const supabase = getSupabase()
    const token = (req.headers.authorization || '').replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return res.status(401).json({ error: 'Unauthorized' })

    if (req.method === 'GET') {
      const { data, error: readError } = await supabase
        .from('synced_ai_settings')
        .select('encrypted_payload, updated_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (readError) throw readError
      if (!data?.encrypted_payload) return res.status(200).json({ exists: false })
      return res.status(200).json({
        exists: true,
        settings: decryptSettings(data.encrypted_payload, secretKey),
        updatedAt: data.updated_at,
      })
    }

    if (req.method === 'DELETE') {
      const { error: deleteError } = await supabase
        .from('synced_ai_settings')
        .delete()
        .eq('user_id', user.id)
      if (deleteError) throw deleteError
      return res.status(200).json({ deleted: true })
    }

    const settings = sanitizeSettings(req.body?.settings)
    const encryptedPayload = encryptSettings(settings, secretKey)
    const { error: upsertError } = await supabase
      .from('synced_ai_settings')
      .upsert({ user_id: user.id, encrypted_payload: encryptedPayload })
    if (upsertError) throw upsertError

    return res.status(200).json({ saved: true })
  } catch (err) {
    console.error('[ai-settings]', err)
    const message = err.message || 'Internal server error'
    const status = message.includes('too large') ? 400 : 500
    return res.status(status).json({ error: message })
  }
}
