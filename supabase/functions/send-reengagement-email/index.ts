import { jsonResponse } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const APP_URL = 'https://www.yourownworld.co.uk'

type Stage = 'day1' | 'day3' | 'day7'

type Copy = {
  subject: string
  eyebrow: string
  heading: string
  body: string
  ctaLabel: string
}

// One entry per (stage, whether they ever created a project). Kept short —
// this is a nudge, not the welcome email's full feature tour.
const COPY: Record<string, Copy> = {
  day1_new: {
    subject: 'Pick up where you left off ✍️',
    eyebrow: 'Still here for you',
    heading: 'Your account is ready — you just haven’t started yet.',
    body: 'Starting from a blank page can wait for another day. If you’d rather explore first, open the guided sample world instead — it’s already full of characters, places, and a working draft you can look around in before building your own.',
    ctaLabel: 'Continue in Your Own World',
  },
  day1_active: {
    subject: 'Your world is waiting',
    eyebrow: 'Still here for you',
    heading: 'You started something yesterday.',
    body: 'It’s exactly where you left it. Three things worth five minutes: write a line in your first scene, add a character, or ask the AI assistant for an idea to get unstuck.',
    ctaLabel: 'Open your project',
  },
  day3_new: {
    subject: 'Still deciding what to build?',
    eyebrow: 'A gentler way in',
    heading: 'No pressure — but your world is still saved and waiting.',
    body: 'If a blank page felt like a lot, try the sample world instead. It’s a fully built demo — characters, lore, a map, a working draft — that you can explore, remix, or just borrow ideas from.',
    ctaLabel: 'Explore the sample world',
  },
  day3_active: {
    subject: 'A few things you might not have tried yet',
    eyebrow: 'A gentler way in',
    heading: 'There’s more to your world than the page you left open.',
    body: 'Characters, locations, lore, and a timeline all live alongside your manuscript and stay connected as you write. Everything you write also exports to a real Word document any time you want a copy.',
    ctaLabel: 'Open your project',
  },
  day7_new: {
    subject: 'Before you go — your world is still here',
    eyebrow: 'One last note',
    heading: 'It didn’t go anywhere.',
    body: 'No pressure at all — we just didn’t want you to think your account disappeared. It’s saved and ready whenever you want to look, even if that’s just to poke around the sample world.',
    ctaLabel: 'Take a look',
  },
  day7_active: {
    subject: 'Before you go — your world is still here',
    eyebrow: 'One last note',
    heading: 'It didn’t go anywhere.',
    body: 'No pressure at all — we just didn’t want you to think your work disappeared. It’s saved exactly as you left it, whenever you’re ready to pick it back up.',
    ctaLabel: 'Open your project',
  },
}

function reengagementEmailHtml(copy: Copy, unsubscribeUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${copy.subject}</title>
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
                ${copy.eyebrow}
              </p>
              <h1 style="margin:0 0 20px;font-size:26px;line-height:1.3;color:#e2f0ee;font-weight:400;">
                ${copy.heading}
              </h1>

              <p style="margin:0 0 28px;font-size:15px;line-height:1.75;color:#7ab8b4;">
                ${copy.body}
              </p>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#e8724e;border-radius:8px;">
                    <a href="${APP_URL}"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.04em;font-family:'Georgia',serif;">
                      ${copy.ctaLabel} &#8594;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background:#133840;border-radius:0 0 12px 12px;padding:18px 40px 24px;border:1px solid #1e4a50;border-top:none;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#7ab8b4;">
                Your Own World &middot; <a href="${APP_URL}" style="color:#7ab8b4;text-decoration:none;">yourownworld.co.uk</a>
              </p>
              <p style="margin:0;font-size:11px;color:#4a8a86;">
                <a href="${unsubscribeUrl}" style="color:#4a8a86;text-decoration:underline;">Stop these reminder emails</a>
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

  const userId = payload?.user_id as string | undefined
  const email = payload?.email as string | undefined
  const stage = payload?.stage as Stage | undefined
  const hasProject = Boolean(payload?.hasProject)

  if (!userId || !email || !stage || !COPY[`${stage}_${hasProject ? 'active' : 'new'}`]) {
    return jsonResponse({ error: 'Missing or invalid user_id, email, stage, or hasProject', payload }, 400)
  }

  const copy = COPY[`${stage}_${hasProject ? 'active' : 'new'}`]
  const unsubscribeUrl = `${APP_URL}/api/reengagement-unsubscribe?u=${encodeURIComponent(userId)}`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Your Own World <hello@yourownworld.co.uk>',
      to: [email],
      subject: copy.subject,
      html: reengagementEmailHtml(copy, unsubscribeUrl),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Resend error:', body, 'key prefix:', RESEND_API_KEY.slice(0, 8))
    return jsonResponse({ error: 'Failed to send email', detail: body }, 500)
  }

  return jsonResponse({ sent: true, to: email, stage })
})
