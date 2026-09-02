import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Vercel API route — one-click unsubscribe from the day-1/3/7 re-engagement
// email sequence. Linked directly from those emails (GET, no session — a
// signed-out person clicking an email link has no session to present, same
// as most one-click email unsubscribe links). Flags the account so
// send-reengagement-emails.js skips it on every future run.
//
// The link carries an HMAC signature over the user id (see signUnsubscribeLink()
// below, also used by supabase/functions/send-reengagement-email to build the
// link) so a bare user id in a GET URL isn't enough on its own — audit finding
// P0-03: "an unsigned raw user UUID in a GET URL; link scanners can
// unsubscribe automatically." Email link-scanners/prefetchers (Outlook Safe
// Links, corporate mail gateways, etc.) that GET-fetch links from inbound
// mail can no longer trigger this action, since they can't produce a valid
// signature.

// Signs a scoped string ("reengagement-unsubscribe:<userId>"), not a bare
// user id — security review flagged that signing just the id would let the
// same signature be replayed against any other action that happened to
// reuse this secret and this exact HMAC-over-a-user-id shape in the future.
// No such reuse exists today (REENGAGEMENT_UNSUBSCRIBE_SECRET is dedicated
// to this one purpose), but the scope prefix costs nothing and closes the
// gap permanently rather than relying on "don't reuse this secret" staying
// true forever.
const SIGNATURE_SCOPE = 'reengagement-unsubscribe'

export function signUnsubscribeLink(userId, secret) {
  return crypto.createHmac('sha256', secret).update(`${SIGNATURE_SCOPE}:${userId}`).digest('hex')
}

function verifySignature(userId, signature, secret) {
  if (!signature || typeof signature !== 'string') return false
  const expected = signUnsubscribeLink(userId, secret)
  const expectedBuf = Buffer.from(expected, 'hex')
  const givenBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== givenBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, givenBuf)
}

function htmlResponse(res, status, message) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(status).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8" /><title>Your Own World</title></head>
<body style="font-family:Georgia,serif;background:#0d282e;color:#e2f0ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
  <p style="font-size:16px;line-height:1.6;max-width:420px;">${message}</p>
</body></html>`)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const secret = process.env.REENGAGEMENT_UNSUBSCRIBE_SECRET
  if (!secret) {
    console.error('[reengagement-unsubscribe] REENGAGEMENT_UNSUBSCRIBE_SECRET is not configured')
    return htmlResponse(res, 500, 'Something went wrong processing that request. Please try again shortly.')
  }

  const userId = String(req.query.u || '').trim()
  if (!/^[0-9a-fA-F-]{36}$/.test(userId)) {
    return htmlResponse(res, 400, 'That unsubscribe link looks incomplete.')
  }
  const signature = String(req.query.sig || '').trim()
  if (!verifySignature(userId, signature, secret)) {
    return htmlResponse(res, 400, 'That unsubscribe link looks incomplete.')
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: existing, error: fetchError } = await supabase.auth.admin.getUserById(userId)
    if (fetchError || !existing?.user) {
      return htmlResponse(res, 200, 'That link has already expired. No further action needed.')
    }

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...(existing.user.user_metadata || {}), reengagement_opt_out: true },
    })

    return htmlResponse(res, 200, 'Done. You will not receive any more reminder emails. Your account and everything in it are unaffected.')
  } catch (err) {
    console.error('[reengagement-unsubscribe]', err)
    return htmlResponse(res, 500, 'Something went wrong processing that request. Please try again shortly.')
  }
}
