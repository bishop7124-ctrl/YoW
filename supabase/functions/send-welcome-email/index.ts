import { createClient } from 'npm:@supabase/supabase-js@2.39.7'
import { jsonResponse } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

function welcomeEmailHtml(email: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Your Own World</title>
</head>
<body style="margin:0;padding:0;background:#0a1f24;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a1f24;padding:48px 16px;">
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
                Welcome
              </p>
              <h1 style="margin:0 0 20px;font-size:28px;line-height:1.25;color:#e2f0ee;font-weight:400;">
                Your world is ready.
              </h1>

              <p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#7ab8b4;">
                You've joined a growing community of writers, worldbuilders, and storytellers.
                <span style="color:#e2f0ee;">Your Own World</span> gives you one place to build everything
                — so nothing gets lost between notebooks, docs, and scattered files.
              </p>

              <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#7ab8b4;">
                Whatever you're creating, we've built a dedicated workflow for it:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="48%" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:14px 16px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:13px;color:#e2f0ee;">Novel</p>
                    <p style="margin:0;font-size:12px;color:#7ab8b4;line-height:1.4;">Full-length prose with rich worldbuilding</p>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:14px 16px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:13px;color:#e2f0ee;">Novella</p>
                    <p style="margin:0;font-size:12px;color:#7ab8b4;line-height:1.4;">Medium-length fiction, lighter planning</p>
                  </td>
                </tr>
                <tr><td colspan="3" style="padding-top:8px;"></td></tr>
                <tr>
                  <td width="48%" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:14px 16px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:13px;color:#e2f0ee;">Short Story</p>
                    <p style="margin:0;font-size:12px;color:#7ab8b4;line-height:1.4;">Focused and stripped-down drafting</p>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:14px 16px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:13px;color:#e2f0ee;">D&amp;D Campaign</p>
                    <p style="margin:0;font-size:12px;color:#7ab8b4;line-height:1.4;">Sessions, encounters, factions &amp; lore</p>
                  </td>
                </tr>
                <tr><td colspan="3" style="padding-top:8px;"></td></tr>
                <tr>
                  <td width="48%" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:14px 16px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:13px;color:#e2f0ee;">Tabletop Campaign</p>
                    <p style="margin:0;font-size:12px;color:#7ab8b4;line-height:1.4;">System-neutral, any ruleset or genre</p>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;padding:14px 16px;vertical-align:top;">
                    <p style="margin:0 0 3px;font-size:13px;color:#e2f0ee;">Comic / Graphic Novel</p>
                    <p style="margin:0;font-size:12px;color:#7ab8b4;line-height:1.4;">Sequential art with volume &amp; issue structure</p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="background:#133840;border:1px solid #1e4a50;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#e8724e;">
                      A few things to try
                    </p>
                    <p style="margin:0 0 8px;font-size:14px;color:#7ab8b4;line-height:1.5;">
                      <span style="color:#e2f0ee;">Create your first project</span> — pick the type that fits your story
                    </p>
                    <p style="margin:0 0 8px;font-size:14px;color:#7ab8b4;line-height:1.5;">
                      <span style="color:#e2f0ee;">Build your world</span> — add locations, factions, characters, and lore
                    </p>
                    <p style="margin:0 0 8px;font-size:14px;color:#7ab8b4;line-height:1.5;">
                      <span style="color:#e2f0ee;">Open the editor</span> — and write your first scene or session
                    </p>
                    <p style="margin:0;font-size:14px;color:#7ab8b4;line-height:1.5;">
                      <span style="color:#e2f0ee;">Try the AI tools</span> — brainstorm, expand ideas, and get unstuck
                    </p>
                  </td>
                </tr>
              </table>

              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#e8724e;border-radius:8px;">
                    <a href="https://www.yourownworld.co.uk"
                       style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;
                              color:#ffffff;text-decoration:none;letter-spacing:0.04em;font-family:'Georgia',serif;">
                      Start Writing &#8594;
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background:#133840;border-radius:0 0 12px 12px;padding:18px 40px 24px;border:1px solid #1e4a50;border-top:none;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#2a5a62;">
                Your Own World &middot; <a href="https://www.yourownworld.co.uk" style="color:#2a5a62;text-decoration:none;">yourownworld.co.uk</a>
              </p>
              <p style="margin:0;font-size:11px;color:#1e4a50;">
                You're receiving this because you created an account with ${email}
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
  // Only accept POST from Supabase database webhooks (service role)
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let payload: { record?: { user_id?: string } }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const userId = payload?.record?.user_id
  if (!userId) return jsonResponse({ error: 'No user_id in payload' }, 400)

  // Look up the user's email
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) {
    return jsonResponse({ error: 'User not found' }, 404)
  }

  const email = data.user.email

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Your Own World <hello@yourownworld.co.uk>',
      to: [email],
      subject: 'Welcome to Your Own World ✍️',
      html: welcomeEmailHtml(email),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Resend error:', body)
    return jsonResponse({ error: 'Failed to send email', detail: body }, 500)
  }

  return jsonResponse({ sent: true, to: email })
})
