#!/usr/bin/env node
// Owner-run bulk send of docs/emails/paid-launch-announcement.html to every account.
//
//   node scripts/send-launch-announcement.mjs                       dry run: counts and lists, sends nothing
//   node scripts/send-launch-announcement.mjs --test me@example.com sends ONE copy, to that address only
//   node scripts/send-launch-announcement.mjs --send --confirm 214  real send; --confirm must equal the dry-run count
//
// Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY and REENGAGEMENT_UNSUBSCRIBE_SECRET
// (the same secret Vercel uses for api/reengagement-unsubscribe.js) in the environment. Never commit them.
// The dry run only needs the two Supabase values. Every email carries a per-person signed unsubscribe link.
// Safe to re-run: every address that was accepted by Resend is appended to the ledger file, and later
// runs skip it, so a crash half-way never double-sends.

import { createClient } from '@supabase/supabase-js'
import { signUnsubscribeLink } from '../api/reengagement-unsubscribe.js'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HTML_PATH = path.join(ROOT, 'docs/emails/paid-launch-announcement.html')
const LEDGER_PATH = path.join(ROOT, 'scripts/.launch-announcement-sent.log')

const SUBJECT = 'Something exciting (and slightly terrifying!) is happening next week'
const FROM = 'Morgan at Your Own World <hello@yourownworld.co.uk>'
const REPLY_TO = 'support@yourownworld.co.uk'
const SEND_DELAY_MS = 600 // Resend's default limit is 2 requests/second

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

const testTo = value('--test')
const realSend = flag('--send')
const confirmCount = value('--confirm')

function need(name) {
  if (!process.env[name]) { console.error(`Missing env var ${name}`); process.exit(1) }
  return process.env[name]
}

const APP_URL = 'https://www.yourownworld.co.uk'
const template = readFileSync(HTML_PATH, 'utf8')

// Same signed link the re-engagement emails use; api/reengagement-unsubscribe.js sets
// user_metadata.reengagement_opt_out, which the audience filter below honours.
function unsubscribeUrlFor(userId) {
  const sig = signUnsubscribeLink(userId, need('REENGAGEMENT_UNSUBSCRIBE_SECRET'))
  return `${APP_URL}/api/reengagement-unsubscribe?u=${encodeURIComponent(userId)}&sig=${sig}`
}

const toText = (html) => html
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|tr|h\d)>/gi, '\n\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&rsquo;/g, "'").replace(/&ndash;/g, '-').replace(/&pound;/g, '£').replace(/&nbsp;/g, ' ')
  .replace(/&#127881;|&#127757;/g, '')
  .replace(/\n{3,}/g, '\n\n').trim()

async function resendSend(to, userId) {
  const unsubscribeUrl = unsubscribeUrlFor(userId)
  const html = template.replaceAll('{{UNSUBSCRIBE_URL}}', unsubscribeUrl)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${need('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [to], reply_to: REPLY_TO, subject: SUBJECT, html, text: toText(html),
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
    }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

if (testTo) {
  // Placeholder id: the link is correctly signed but belongs to no account, so clicking it is harmless.
  await resendSend(testTo, '00000000-0000-0000-0000-000000000000')
  console.log(`Test email sent to ${testTo} only.`)
  process.exit(0)
}

const supabase = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'))

const users = []
for (let page = 1; page <= 50; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) throw error
  users.push(...data.users)
  if (data.users.length < 1000) break
}

const already = new Set(existsSync(LEDGER_PATH) ? readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean) : [])
const skipped = { noEmail: 0, unconfirmed: 0, banned: 0, optedOut: 0, alreadySent: 0 }
const audience = []
for (const u of users) {
  const email = u.email?.trim().toLowerCase()
  if (!email) { skipped.noEmail += 1; continue }
  if (!u.email_confirmed_at) { skipped.unconfirmed += 1; continue }
  if (u.banned_until && new Date(u.banned_until) > new Date()) { skipped.banned += 1; continue }
  if (u.user_metadata?.reengagement_opt_out) { skipped.optedOut += 1; continue }
  if (already.has(email)) { skipped.alreadySent += 1; continue }
  audience.push({ id: u.id, email })
}

const limit = Number(value('--limit')) || Infinity
if (audience.length > limit) {
  console.log(`--limit ${limit}: sending the first ${limit} of ${audience.length}; re-run later for the rest.`)
  audience.length = limit
}

console.log(`Accounts found: ${users.length}`)
console.log(`Will receive the email: ${audience.length}`)
console.log('Skipped:', skipped)

if (!realSend) {
  console.log('\nDRY RUN, nothing sent. Recipients:')
  audience.forEach((r) => console.log('  ' + r.email))
  console.log(`\nTo send for real: --send --confirm ${audience.length}`)
  process.exit(0)
}

if (confirmCount !== String(audience.length)) {
  console.error(`Refusing to send: --confirm must equal the recipient count (${audience.length}).`)
  process.exit(1)
}

need('RESEND_API_KEY')
need('REENGAGEMENT_UNSUBSCRIBE_SECRET') // fail before the first email, not part-way through

let sent = 0
const failed = []
for (const { id, email } of audience) {
  try {
    await resendSend(email, id)
    appendFileSync(LEDGER_PATH, email + '\n')
    sent += 1
    if (sent % 25 === 0) console.log(`  ${sent}/${audience.length} sent`)
  } catch (err) {
    failed.push(email)
    console.error(`FAILED ${email}: ${err.message}`)
  }
  await new Promise((r) => setTimeout(r, SEND_DELAY_MS))
}
console.log(`\nDone. Sent ${sent}, failed ${failed.length}.`)
if (failed.length) console.log('Re-run the same command to retry only the failures.')
