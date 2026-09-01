import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

const MAX_LENGTHS = { name: 120, email: 254, projectType: 160, message: 1200, plan: 80, planLabel: 120, page: 240 }
const ADMIN_EMAIL = 'yourownworld.admin@gmail.com'
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const rateBuckets = new Map()

export function getMissingEnv(required, env = process.env) {
  return required.filter(key => !env[key])
}

export function checkRateLimit(ip, now = Date.now()) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const hits = (rateBuckets.get(ip) || []).filter(t => t > cutoff)
  if (hits.length >= RATE_LIMIT_MAX) { rateBuckets.set(ip, hits); return false }
  hits.push(now)
  rateBuckets.set(ip, hits)
  if (rateBuckets.size > 5000) {
    for (const [key, times] of rateBuckets) {
      if (!times.some(t => t > cutoff)) rateBuckets.delete(key)
    }
  }
  return true
}

export function validatePaidInterestBody(body) {
  if (!body?.email?.trim()) return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return 'Enter a valid email address.'
  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    const value = body?.[field]
    if (value != null && String(value).length > max) return `"${field}" is too long (max ${max} characters).`
  }
  return null
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || ''
  return String(header).startsWith('Bearer ') ? String(header).slice(7).trim() : ''
}

export function getSupabaseAdminConfig(env = process.env) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || process.env.SITE_URL || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many submissions. Please try again later.' })

  const invalid = validatePaidInterestBody(req.body)
  if (invalid) return res.status(400).json({ error: invalid })

  const ownerEmail = process.env.FEEDBACK_EMAIL
  const ownerPass = process.env.FEEDBACK_EMAIL_PASSWORD
  const missingEmailEnv = getMissingEnv(['FEEDBACK_EMAIL', 'FEEDBACK_EMAIL_PASSWORD'])
  if (missingEmailEnv.length) {
    console.error('[register-paid-interest] email env missing:', missingEmailEnv.join(', '))
    return res.status(500).json({ error: `Email is not configured. Missing: ${missingEmailEnv.join(', ')}.` })
  }

  const { name = '', email, projectType = '', message = '', plan = '', planLabel = 'Paid plan', page = '' } = req.body
  const token = getBearerToken(req)
  let authedUser = null

  if (token) {
    const { url, serviceRoleKey } = getSupabaseAdminConfig()
    if (!url || !serviceRoleKey) {
      console.error('[register-paid-interest] Supabase admin env missing', {
        hasUrl: !!url,
        hasServiceRoleKey: !!serviceRoleKey,
      })
      return res.status(500).json({ error: 'Beta access is not configured.' })
    }

    const supabase = createClient(url, serviceRoleKey)
    const { data, error } = await supabase.auth.getUser(token)
    if (error) {
      console.error('[register-paid-interest] token lookup failed:', error.message)
      return res.status(401).json({ error: 'Please sign in again before registering interest.' })
    }
    if (!error && data?.user) {
      authedUser = data.user
      const existingAppMeta = authedUser.app_metadata || {}
      const now = new Date().toISOString()
      const { error: updateError } = await supabase.auth.admin.updateUserById(authedUser.id, {
        app_metadata: {
          ...existingAppMeta,
          subscription_status: 'active',
          subscription_plan: 'beta_tester',
          beta_tester: true,
          beta_tester_started_at: existingAppMeta.beta_tester_started_at || now,
          beta_tester_source: 'paid_plan_interest',
          beta_tester_requested_plan: plan || null,
        },
      })
      if (updateError) {
        console.error('[register-paid-interest] metadata update failed:', updateError)
        return res.status(500).json({ error: 'Interest was received, but beta access could not be activated.' })
      }
    }
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: ownerEmail, pass: ownerPass },
  })

  try {
    await transporter.sendMail({
      from: `"YOW Paid Plan Interest" <${ownerEmail}>`,
      to: ADMIN_EMAIL,
      replyTo: email.trim(),
      subject: `[YOW Interest] ${planLabel}`,
      text: [
        `Plan: ${planLabel}${plan ? ` (${plan})` : ''}`,
        `Name: ${name || 'Not provided'}`,
        `Email: ${email}`,
        authedUser ? `User ID: ${authedUser.id}` : 'User ID: not signed in',
        projectType ? `Project: ${projectType}` : 'Project: not provided',
        page ? `Page: ${page}` : '',
        '',
        message || 'No message provided.',
      ].filter(Boolean).join('\n'),
    })
  } catch (err) {
    console.error('[register-paid-interest] email failed:', err)
    return res.status(500).json({ error: `Failed to send interest email: ${err.message}` })
  }

  return res.status(200).json({ ok: true, betaTester: !!authedUser })
}
