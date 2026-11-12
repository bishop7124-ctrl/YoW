import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Vercel API route: unsubscribe from the day-1/3/7 re-engagement email sequence. Flags the account so
// send-reengagement-emails.js skips it on every future run.
//
// Opening the emailed link (GET) only shows a confirmation page. It changes nothing, because mail scanners and link
// prefetchers GET every link in a message, with the same signature the real reader has. The preference changes only
// on POST: the button on that page, or a mail client's RFC 8058 one-click request to the same address. The HMAC
// signature over the user id stops anyone forging a link from a bare UUID; it does not tell a click from a scanner,
// which is why GET stays inert (audit AUD-25). The success page is shown only once the update really succeeded.
//
// Links already sent keep working: the same URL now opens the confirmation page.
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

function confirmPage(res, query) {
  // Only the verified user id and signature are placed back into the form action, never anything else from the URL.
  const action = `?u=${encodeURIComponent(query.u)}&sig=${encodeURIComponent(query.sig)}`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Your Own World</title></head>
<body style="font-family:Georgia,serif;background:#0d282e;color:#e2f0ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
  <form method="POST" action="${action}" style="max-width:420px;">
    <p style="font-size:16px;line-height:1.6;">Stop the reminder emails from Your Own World? Your account and everything in it are unaffected.</p>
    <button type="submit" style="font-size:16px;padding:10px 22px;border-radius:8px;border:0;background:#e2f0ee;color:#0d282e;cursor:pointer;">Unsubscribe</button>
  </form>
</body></html>`)
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

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

  // A GET is only ever a look at the page.
  if (req.method === 'GET') return confirmPage(res, { u: userId, sig: signature })

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: existing, error: fetchError } = await supabase.auth.admin.getUserById(userId)
    if (fetchError || !existing?.user) {
      return htmlResponse(res, 200, 'That link has already expired. No further action needed.')
    }

    // The admin API reports most failures as a returned error rather than a throw, so it must be checked:
    // "Done" is only shown when the preference was actually saved.
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...(existing.user.user_metadata || {}), reengagement_opt_out: true },
    })
    if (updateError) {
      console.error('[reengagement-unsubscribe] update failed', updateError)
      return htmlResponse(res, 500, 'We could not save that just now, so you have not been unsubscribed yet. Please try the link again shortly.')
    }

    return htmlResponse(res, 200, 'Done. You will not receive any more reminder emails. Your account and everything in it are unaffected.')
  } catch (err) {
    console.error('[reengagement-unsubscribe]', err)
    return htmlResponse(res, 500, 'Something went wrong processing that request. Please try again shortly.')
  }
}
