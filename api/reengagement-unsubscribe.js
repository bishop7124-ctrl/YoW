import { createClient } from '@supabase/supabase-js'

// Vercel API route — one-click unsubscribe from the day-1/3/7 re-engagement
// email sequence. Linked directly from those emails (GET, no auth — the
// user id in the link is the only thing needed, same pattern as most
// one-click email unsubscribe links). Flags the account so
// send-reengagement-emails.js skips it on every future run.

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

  const userId = String(req.query.u || '').trim()
  if (!/^[0-9a-fA-F-]{36}$/.test(userId)) {
    return htmlResponse(res, 400, 'That unsubscribe link looks incomplete.')
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: existing, error: fetchError } = await supabase.auth.admin.getUserById(userId)
    if (fetchError || !existing?.user) {
      return htmlResponse(res, 200, 'That link has already expired — no further action needed.')
    }

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...(existing.user.user_metadata || {}), reengagement_opt_out: true },
    })

    return htmlResponse(res, 200, 'Done — you will not receive any more reminder emails. Your account and everything in it are unaffected.')
  } catch (err) {
    console.error('[reengagement-unsubscribe]', err)
    return htmlResponse(res, 500, 'Something went wrong processing that request. Please try again shortly.')
  }
}
