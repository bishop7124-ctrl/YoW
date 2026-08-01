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
  secondaryCtaLabel?: string
}

// One entry per (stage, whether they ever created a project). Each answers
// one question only: "what's the next smallest action?" Never "you haven't
// done X yet." Kept short; this is a nudge, not the welcome email's full
// feature tour.
const COPY: Record<string, Copy> = {
  day1_new: {
    subject: 'Not sure where to start?',
    eyebrow: 'Getting started',
    heading: 'Two easy ways in. Zero Pressure.',
    body: 'Start a blank project and shape it as you go, or open the sample world first to see how everything fits together. Either way, you can be inside a working writing space in under a minute.',
    ctaLabel: 'Try the sample project',
    secondaryCtaLabel: 'Create your own project',
  },
  day1_active: {
    subject: 'We’ve got your world, you’ve got the ideas',
    eyebrow: 'Nice start',
    heading: 'You’ve already started your world.',
    body: 'Whatever you added first, a scene, a character, or a lore entry, is a start. Add something else small next: a location, a faction, or a quick outline note. Your Own World gets more useful the more it fills in.',
    ctaLabel: 'Continue your project',
  },
  day3_new: {
    subject: 'Projects don’t need to be polished',
    eyebrow: 'Still easy to start',
    heading: 'A project can start with just a title and an idea.',
    body: 'You do not need a full plan. A name, a character, a place, or one scene you already have in your head is enough to begin. If you would rather look around first, the sample world is ready to explore.',
    ctaLabel: 'Create a project',
    secondaryCtaLabel: 'Explore the sample project',
  },
  day3_active: {
    subject: 'Add the next scene, even as a rough note',
    eyebrow: 'One small move',
    heading: 'Capture what happens next while it is still close.',
    body: 'It does not need to be polished. Even a rough note, or a quick lore entry, can hold the idea until you are ready to write it properly. One paragraph about what changes after your last scene is enough to give yourself a clear next step.',
    ctaLabel: 'Add the next scene',
  },
  day7_new: {
    subject: 'Feeling blocked? We’ve got you',
    eyebrow: 'No setup, no pressure',
    heading: 'The fastest way to understand it is to open the sample world.',
    body: 'The sample world is already built, with characters, places, and a working draft, so you can look through it without starting from a blank page. If it clicks, you can create your own project from there.',
    ctaLabel: 'Open the sample project',
  },
  day7_active: {
    subject: 'Make the next step visible',
    eyebrow: 'Whenever you’re ready',
    heading: 'Even a fragment keeps a world alive.',
    body: 'Add whatever feels easiest: the next scene, a character note, a location, a lore entry, or a quick outline beat. Your Own World is useful for connected fragments, not just finished drafts.',
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

              ${copy.secondaryCtaLabel ? `
              <p style="margin:14px 0 0;font-size:13px;color:#5d9490;">
                or, <a href="${APP_URL}" style="color:#7ab8b4;text-decoration:underline;">${copy.secondaryCtaLabel}</a>
              </p>` : ''}

            </td>
          </tr>

          <tr>
            <td style="background:#133840;border-radius:0 0 12px 12px;padding:18px 40px 24px;border:1px solid #1e4a50;border-top:none;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#7ab8b4;">
                Your Own World &middot; <a href="${APP_URL}" style="color:#7ab8b4;text-decoration:none;">yourownworld.co.uk</a>
              </p>
              <p style="margin:0;font-size:11px;color:#4a8a86;">
                <a href="${unsubscribeUrl}" style="color:#4a8a86;text-decoration:underline;">Stop reminder emails</a>
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
