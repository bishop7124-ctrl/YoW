#!/usr/bin/env node
// Reads "[YOW Interest] ..." emails (sent by api/register-paid-interest.js
// to yourownworld.admin@gmail.com whenever someone registers interest in a
// paid plan) and appends one row per email to a Google Sheet.
//
// First-time setup: see scripts/interest-sync/README.md
//
// Usage:
//   node scripts/sync-interest-emails.mjs                  # uses config below / env vars
//   node scripts/sync-interest-emails.mjs --sheet-id=XXXXX # override the target sheet
//
// Safe to run repeatedly / on a schedule: already-synced emails are tagged
// with a Gmail label ("YOW-Interest-Synced") and skipped on later runs.

import { google } from 'googleapis'
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = join(__dirname, 'interest-sync')
const CREDENTIALS_PATH = join(CONFIG_DIR, 'credentials.json')
const TOKEN_PATH = join(CONFIG_DIR, 'token.json')

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify', // needed to add the "synced" label
  'https://www.googleapis.com/auth/spreadsheets',
]

const DEFAULT_SHEET_ID = process.env.YOW_INTEREST_SHEET_ID || '1k6WLfiRHc2tF3VB8IhX-th6RBdUSR0ukrECVlpZL3wQ'
const GMAIL_QUERY = 'to:yourownworld.admin@gmail.com subject:"[YOW Interest]"'
const SYNCED_LABEL = 'YOW-Interest-Synced'
const OAUTH_PORT = 8091

const HEADERS = [
  'Date', 'Plan', 'Plan Key', 'Name', 'Email', 'User ID',
  'Project', 'Page', 'Message', 'Gmail Message ID', 'Gmail Link',
]

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = /^--([\w-]+)=(.*)$/.exec(arg)
    if (m) out[m[1]] = m[2]
  }
  return out
}

// --- Auth -------------------------------------------------------------

async function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(
      `\nMissing ${CREDENTIALS_PATH}\n` +
      'Download an OAuth "Desktop app" client ID from Google Cloud Console\n' +
      'and save it there. See scripts/interest-sync/README.md.\n',
    )
    process.exit(1)
  }
  const raw = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf8'))
  return raw.installed || raw.web
}

async function getAuthedClient() {
  const creds = await loadCredentials()
  const redirectUri = `http://localhost:${OAUTH_PORT}`
  const client = new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri)

  if (existsSync(TOKEN_PATH)) {
    client.setCredentials(JSON.parse(await readFile(TOKEN_PATH, 'utf8')))
    return client
  }

  const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })
  console.log('\nOpen this URL in a browser and sign in as yourownworld.admin@gmail.com:\n')
  console.log(authUrl + '\n')
  console.log(`Waiting for the redirect to http://localhost:${OAUTH_PORT} ...\n`)

  const code = await new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, redirectUri)
      const authCode = url.searchParams.get('code')
      const err = url.searchParams.get('error')
      res.end(authCode ? 'Signed in — you can close this tab and return to the terminal.' : `Error: ${err}`)
      server.close()
      if (authCode) resolvePromise(authCode)
      else reject(new Error(err || 'No code returned'))
    })
    server.listen(OAUTH_PORT)
  })

  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2))
  console.log(`Saved credentials to ${TOKEN_PATH} — future runs won't need browser sign-in.\n`)
  return client
}

// --- Gmail --------------------------------------------------------------

function decodeBody(payload) {
  function walk(part) {
    if (!part) return ''
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf8')
    }
    if (part.parts) {
      for (const child of part.parts) {
        const text = walk(child)
        if (text) return text
      }
    }
    return ''
  }
  return walk(payload)
}

// Mirrors the plain-text body built by api/register-paid-interest.js:
//   Plan: <planLabel> (<plan>)
//   Name: <name>
//   Email: <email>
//   User ID: <id | not signed in>
//   Project: <projectType | not provided>
//   Page: <page>            (omitted entirely when blank)
//   <blank line>
//   <message>
function parseInterestEmail(bodyText) {
  const lines = bodyText.replace(/\r\n/g, '\n').split('\n')
  const fields = { plan: '', planKey: '', name: '', email: '', userId: '', project: '', page: '' }
  let messageStart = lines.length

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let m
    if ((m = /^Plan:\s*(.*)$/.exec(line))) {
      const planMatch = /^(.*?)(?:\s+\(([^)]+)\))?$/.exec(m[1].trim())
      fields.plan = planMatch?.[1] || m[1].trim()
      fields.planKey = planMatch?.[2] || ''
    } else if ((m = /^Name:\s*(.*)$/.exec(line))) {
      fields.name = m[1].trim()
    } else if ((m = /^Email:\s*(.*)$/.exec(line))) {
      fields.email = m[1].trim()
    } else if ((m = /^User ID:\s*(.*)$/.exec(line))) {
      fields.userId = m[1].trim()
    } else if ((m = /^Project:\s*(.*)$/.exec(line))) {
      fields.project = m[1].trim()
    } else if ((m = /^Page:\s*(.*)$/.exec(line))) {
      fields.page = m[1].trim()
    } else if (line.trim() === '' && i > 0) {
      messageStart = i + 1
      break
    }
  }

  fields.message = lines.slice(messageStart).join('\n').trim()
  return fields
}

async function getOrCreateLabel(gmail, name) {
  const { data } = await gmail.users.labels.list({ userId: 'me' })
  const existing = data.labels?.find(l => l.name === name)
  if (existing) return existing.id
  const { data: created } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  })
  return created.id
}

async function fetchNewInterestEmails(auth) {
  const gmail = google.gmail({ version: 'v1', auth })
  const labelId = await getOrCreateLabel(gmail, SYNCED_LABEL)
  // The Gmail search operator above is a helpful pre-filter, but Gmail tokenizes on
  // "[" / "]" so subject:"[YOW Interest]" really matches "YOW" and "Interest" as
  // adjacent words, not the literal bracketed substring. Skipped candidates below get
  // a hard check against the real Subject header so anything without the exact
  // "[YOW Interest]" text is ignored (and left unlabeled, in case it needs review).
  const query = `${GMAIL_QUERY} -label:${SYNCED_LABEL.toLowerCase()}`

  const rows = []
  let pageToken
  do {
    const { data } = await gmail.users.messages.list({ userId: 'me', q: query, pageToken })
    for (const { id } of data.messages || []) {
      const { data: msg } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      const subject = msg.payload.headers?.find(h => h.name === 'Subject')?.value || ''
      if (!subject.includes('[YOW Interest]')) continue

      const bodyText = decodeBody(msg.payload)
      const parsed = parseInterestEmail(bodyText)
      const dateHeader = msg.payload.headers?.find(h => h.name === 'Date')?.value
      const date = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : (dateHeader || '')

      rows.push({
        id,
        row: [
          date,
          parsed.plan,
          parsed.planKey,
          parsed.name,
          parsed.email,
          parsed.userId,
          parsed.project,
          parsed.page,
          parsed.message,
          id,
          `https://mail.google.com/mail/u/0/#all/${id}`,
        ],
      })
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return { gmail, labelId, rows }
}

async function markSynced(gmail, labelId, ids) {
  if (!ids.length) return
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: { ids, addLabelIds: [labelId] },
  })
}

// --- Sheets ---------------------------------------------------------------

// Pin to the tab that was first in the workbook the first time this script ran
// against it (gid 0, Google's stable internal ID for a tab — unaffected by
// renaming or reordering tabs, unlike "the first sheet" or a tab name). Only
// deleting and recreating that exact tab would break this.
const TARGET_GID = 0

async function getSheetTitle(sheets, sheetId) {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: 'sheets.properties' })
  const target = data.sheets?.find(s => s.properties?.sheetId === TARGET_GID) || data.sheets?.[0]
  return target.properties.title
}

async function ensureHeaderRow(sheets, sheetId, sheetTitle) {
  const range = `'${sheetTitle}'!A1:K1`
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range })
  // Only write headers when row 1 is completely empty — never overwrite a header
  // row that's there, even if someone has since renamed/reworded the columns.
  const rowIsEmpty = !data.values?.[0]?.some(cell => String(cell || '').trim())
  if (rowIsEmpty) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${sheetTitle}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    })
  }
}

async function appendRows(sheets, sheetId, sheetTitle, rows) {
  if (!rows.length) return
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `'${sheetTitle}'!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  })
}

// --- Main -------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sheetId = args['sheet-id'] || DEFAULT_SHEET_ID

  const auth = await getAuthedClient()
  const sheets = google.sheets({ version: 'v4', auth })

  console.log('Checking Gmail for new interest emails...')
  const { gmail, labelId, rows } = await fetchNewInterestEmails(auth)

  if (!rows.length) {
    console.log('No new interest emails found.')
    return
  }

  console.log(`Found ${rows.length} new interest email(s). Writing to sheet ${sheetId} ...`)
  const sheetTitle = await getSheetTitle(sheets, sheetId)
  await ensureHeaderRow(sheets, sheetId, sheetTitle)
  await appendRows(sheets, sheetId, sheetTitle, rows.map(r => r.row))
  await markSynced(gmail, labelId, rows.map(r => r.id))

  console.log(`Done — appended ${rows.length} row(s) and labeled the source emails "${SYNCED_LABEL}".`)
}

main().catch(err => {
  console.error('sync-interest-emails failed:', err)
  process.exitCode = 1
})
