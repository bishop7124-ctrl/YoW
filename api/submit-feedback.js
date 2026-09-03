import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { checkDurableRateLimit, maybeCleanupRateLimitLog } from '../src/utils/durableRateLimit.js'

// Field caps keep a scripted client from stuffing megabytes into the owner inbox.
const MAX_LENGTHS = { title: 200, message: 8000, category: 100, email: 254, name: 120 }

const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_WINDOW_MINUTES = RATE_LIMIT_WINDOW_MS / (60 * 1000)

// In-memory per-IP sliding-window rate limit. Serverless instances don't
// share memory, so this resets on every cold instance — kept only as a
// defense-in-depth floor for a deployment missing Supabase env vars (see
// `isRateLimited` below), not as the primary abuse boundary anymore.
// Audit finding #23 (docs/YOW_CODE_AUDIT_2026-09-01.md): this used to be
// the *only* limiter for this route.
const rateBuckets = new Map()

export function checkRateLimit(ip, now = Date.now(), buckets = rateBuckets) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const hits = (buckets.get(ip) || []).filter(t => t > cutoff)
  if (hits.length >= RATE_LIMIT_MAX) { buckets.set(ip, hits); return false }
  hits.push(now)
  buckets.set(ip, hits)
  if (buckets.size > 5000) {
    for (const [key, times] of buckets) {
      if (!times.some(t => t > cutoff)) buckets.delete(key)
    }
  }
  return true
}

// Durable per-IP rate limit backed by Supabase (audit finding #23), with
// the in-memory limiter above as a fallback only when Supabase isn't
// configured — never silently unprotected, but a real deployment always
// gets the durable check since env vars are expected to be set.
export async function isRateLimited(ip, env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return !checkRateLimit(ip)

  const supabase = createClient(url, serviceRoleKey)
  await maybeCleanupRateLimitLog(supabase)
  const allowed = await checkDurableRateLimit(supabase, {
    bucket: 'submit-feedback',
    rateKey: ip,
    max: RATE_LIMIT_MAX,
    windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
  })
  return !allowed
}

export function validateFeedbackBody(body) {
  const { type, title, message } = body || {}
  if (!type || !title?.trim() || !message?.trim()) return 'Missing required fields.'
  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    const value = body?.[field]
    if (value != null && String(value).length > max) return `"${field}" is too long (max ${max} characters).`
  }
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  if (await isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again later.' })
  }

  const invalid = validateFeedbackBody(req.body)
  if (invalid) return res.status(400).json({ error: invalid })
  const { type, title, message, category, email, name } = req.body

  const ownerEmail = process.env.FEEDBACK_EMAIL
  const ownerPass  = process.env.FEEDBACK_EMAIL_PASSWORD
  if (!ownerEmail || !ownerPass) {
    console.error('FEEDBACK_EMAIL or FEEDBACK_EMAIL_PASSWORD not set')
    return res.status(500).json({ error: 'Email not configured.' })
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: ownerEmail, pass: ownerPass },
  })

  const typeLabel    = type === 'feature_request' ? 'Feature Request' : 'Support'
  const categoryLine = category ? `\nCategory: ${category}` : ''
  const fromLine     = email ? `\nFrom: ${name ? `${name} <${email}>` : email}` : name ? `\nFrom: ${name}` : ''

  try {
    await transporter.sendMail({
      from:    `"YOW Feedback" <${ownerEmail}>`,
      to:      ownerEmail,
      replyTo: email || ownerEmail,
      subject: `[YOW ${typeLabel}] ${title.trim()}`,
      text: `Type: ${typeLabel}${categoryLine}${fromLine}\n\n${title.trim()}\n\n${message.trim()}`,
    })
  } catch (err) {
    console.error('nodemailer error:', err)
    return res.status(500).json({ error: `Failed to send email: ${err.message}` })
  }

  return res.status(200).json({ ok: true })
}
