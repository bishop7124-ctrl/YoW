import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { jsonResponse } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const DEFAULT_REDIRECT = 'https://www.yourownworld.co.uk/login'

// Audit finding P0-03: redirectTo was accepted from the caller with no
// validation, so a crafted request could get Supabase to embed an
// attacker-controlled redirect in a real recovery link — a link that, when
// clicked by the legitimate user from their own inbox, could carry their
// session token to an attacker's domain. Only the app's own known origins
// may be used; anything else silently falls back to the safe default rather
// than failing the whole request (a stray/dev redirectTo shouldn't block
// someone from resetting their password).
const ALLOWED_REDIRECT_ORIGINS = new Set([
  'https://www.yourownworld.co.uk',
  'http://localhost:3000',
  'http://localhost:5173',
])

function sanitizeRedirectTo(candidate: unknown): string {
  if (typeof candidate !== 'string' || !candidate) return DEFAULT_REDIRECT
  try {
    const url = new URL(candidate)
    return ALLOWED_REDIRECT_ORIGINS.has(url.origin) ? candidate : DEFAULT_REDIRECT
  } catch {
    return DEFAULT_REDIRECT
  }
}

// Durable per-email rate limit (supabase/migrations/20260901120000_email_action_rate_limits.sql)
// — audit finding P0-03: this route had no rate limit at all, so it could be
// hammered to spam a target inbox with reset emails. Deliberately generous
// (a real user retrying a typo'd email a few times shouldn't get blocked)
// while bounding sustained abuse.
const RATE_LIMIT_MAX = Number(Deno.env.get('PASSWORD_RESET_RATE_LIMIT_MAX')) || 5
const RATE_LIMIT_WINDOW_MINUTES = Number(Deno.env.get('PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES')) || 15

async function isRateLimited(email: string): Promise<boolean> {
  const rateKey = email.trim().toLowerCase()
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count, error: countError } = await supabaseAdmin
    .from('email_action_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', 'password-reset')
    .eq('rate_key', rateKey)
    .gte('created_at', windowStart)
  // Fail open on a rate-limit infra error rather than blocking a real
  // password-reset attempt on a durability blip.
  if (countError) {
    console.error('[send-reset-email] rate limit check failed', countError.message)
    return false
  }
  if ((count || 0) >= RATE_LIMIT_MAX) return true
  const { error: insertError } = await supabaseAdmin
    .from('email_action_rate_limits')
    .insert({ bucket: 'password-reset', rate_key: rateKey })
  if (insertError) console.error('[send-reset-email] rate limit record failed', insertError.message)
  return false
}

function resetEmailHtml(email: string, resetUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password — Your Own World</title>
</head>
<body style="margin:0;padding:0;background:transparent;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:transparent;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

          <tr>
            <td style="background:#133840;border-radius:12px 12px 0 0;padding:24px 40px;border-bottom:1px solid #1e4a50;text-align:center;">
              <span style="font-family:'Georgia',serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#7ab8b4;">
                Your Own World
              </span>
            </td>
          </tr>

          <tr>
            <td style="background:#0d282e;padding:40px 40px 32px;border-left:1px solid #1e4a50;border-right:1px solid #1e4a50;">

              <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#e8724e;">
                Password Reset
              </p>
              <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#e2f0ee;font-weight:400;">
                Reset your password.
              </h1>

              <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#7ab8b4;">
                We received a request to reset the password for <span style="color:#e2f0ee;">${email}</span>.
                Click the button below to choose a new one. This link expires in 1 hour.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#e8724e;border-radius:8px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.04em;font-family:'Georgia',serif;">
                      Reset Password &#8594;
                    </a>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#4a8a86;">
                      Didn't request this?
                    </p>
                    <p style="margin:0;font-size:13px;color:#7ab8b4;line-height:1.6;">
                      You can safely ignore this email. Your password will not change unless you click the button above.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background:#133840;border-radius:0 0 12px 12px;padding:18px 40px 24px;border:1px solid #1e4a50;border-top:none;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#7ab8b4;">
                Your Own World &middot; <a href="https://www.yourownworld.co.uk" style="color:#7ab8b4;text-decoration:none;">yourownworld.co.uk</a>
              </p>
              <p style="margin:0;font-size:11px;color:#4a8a86;">
                You're receiving this because a reset was requested for ${email}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const email = payload?.email as string | undefined
  if (!email) return jsonResponse({ error: 'No email in payload' }, 400)

  // Generic response from here on regardless of what actually happened
  // (rate-limited, account doesn't exist, provider failure) — never confirm
  // or deny whether an email has an account, a standard password-reset-flow
  // practice this route didn't previously follow. The client already treats
  // any 200 as "check your email".
  const genericOk = () => jsonResponse({ sent: true })

  if (await isRateLimited(email)) return genericOk()

  const redirectTo = sanitizeRedirectTo(payload?.redirectTo)

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (linkError || !linkData?.properties?.action_link) {
    // Expected/routine for an email with no account — not logged as an
    // error. Still returns success to the caller (no enumeration).
    return genericOk()
  }

  const resetUrl = linkData.properties.action_link

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Your Own World <hello@yourownworld.co.uk>',
      to: [email],
      subject: 'Reset your Your Own World password',
      html: resetEmailHtml(email, resetUrl),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Resend error:', body)
    return genericOk()
  }

  return genericOk()
})
