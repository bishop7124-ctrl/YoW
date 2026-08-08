#!/usr/bin/env node
// One-off data migration — converts legacy base64-embedded character portrait
// images (data:image/...;base64,... stored directly in characters.data.image)
// into Supabase Storage objects, replacing the JSONB field with a
// `yow-media:{path}` reference — matching what src/utils/uploadUserMedia.js
// already does for new uploads through the app UI.
//
// Why this exists: uploadUserMedia.js has stored new images in Storage since
// supabase/migrations/20260727_user_media_storage.sql shipped, but that only
// covers uploads made through the in-app file picker. Anything imported via
// importData() (project JSON import/restore) is saved through the normal
// sync/save path as-is, including any base64 data URLs already in the JSON —
// it never routes through uploadUserMedia. So any account that (a) uploaded
// images before 2026-07-27, or (b) imported/restored an export containing
// embedded images, still has raw base64 sitting in the DB and is exposed to
// the same login-timeout failure mode documented in this session.
//
// This script fixes existing rows. It does NOT change app behavior going
// forward — see the accompanying note about the importData() gap.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_embedded_images_to_storage.mjs [--user=<uuid>] [--dry-run]
//
// Defaults to scanning ALL users' characters rows for embedded base64 images
// if --user is omitted. Always run with --dry-run first to see the report.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API -> service_role
// in the Supabase dashboard). Never commit this key or put it in a file in
// this repo — pass it as an env var on the command line only.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET_NAME = 'user-media'
const PRIVATE_MEDIA_PREFIX = 'yow-media:'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const userArg = args.find(a => a.startsWith('--user='))
const targetUserId = userArg ? userArg.split('=')[1] : null

if (!SUPABASE_URL) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_URL env var.')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var. Get it from')
  console.error('Supabase dashboard -> Project Settings -> API -> service_role,')
  console.error('and pass it inline, e.g.:')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate_embedded_images_to_storage.mjs --dry-run')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function extensionForMimeType(type) {
  if (type === 'image/webp') return 'webp'
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  return 'bin'
}

function parseDataUrl(value) {
  if (typeof value !== 'string') return null
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(value)
  if (!match) return null
  return { mimeType: match[1], base64: match[2] }
}

const TABLES_WITH_IMAGE_FIELD = [
  { table: 'characters', field: 'image', category: 'characters' },
  { table: 'factions', field: 'image', category: 'factions' },
  { table: 'locations', field: 'image', category: 'locations' },
]

async function migrateRow(table, category, row, backupLog) {
  const parsed = parseDataUrl(row.data?.[FIELD_BY_TABLE[table]])
  if (!parsed) return { skipped: true }

  const field = FIELD_BY_TABLE[table]
  const bytes = Buffer.from(parsed.base64, 'base64')
  const path = `${row.user_id}/${category}/${crypto.randomUUID()}.${extensionForMimeType(parsed.mimeType)}`

  backupLog.push({ table, id: row.id, user_id: row.user_id, field, original_value_length: row.data[field].length })

  if (dryRun) {
    return { wouldMigrate: true, bytes: bytes.length, path }
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(path, bytes, {
    contentType: parsed.mimeType,
    upsert: false,
  })
  if (uploadError) throw new Error(`upload failed for ${table}/${row.id}: ${uploadError.message}`)

  const newData = { ...row.data, [field]: `${PRIVATE_MEDIA_PREFIX}${path}` }
  const { error: updateError } = await supabase.from(table).update({ data: newData }).eq('id', row.id)
  if (updateError) throw new Error(`db update failed for ${table}/${row.id}: ${updateError.message}`)

  return { migrated: true, bytes: bytes.length, path }
}

const FIELD_BY_TABLE = Object.fromEntries(TABLES_WITH_IMAGE_FIELD.map(t => [t.table, t.field]))

async function run() {
  const backupLog = []
  let totalBytesMoved = 0
  let totalRowsMigrated = 0

  for (const { table, category } of TABLES_WITH_IMAGE_FIELD) {
    let query = supabase.from(table).select('id, user_id, data')
    if (targetUserId) query = query.eq('user_id', targetUserId)
    const { data: rows, error } = await query
    if (error) {
      console.error(`Failed to read ${table}: ${error.message}`)
      continue
    }

    for (const row of rows) {
      try {
        const result = await migrateRow(table, category, row, backupLog)
        if (result.migrated || result.wouldMigrate) {
          totalBytesMoved += result.bytes
          totalRowsMigrated += 1
          console.log(`${dryRun ? '[dry-run] would migrate' : 'migrated'} ${table}/${row.id} (user ${row.user_id}) — ${(result.bytes / 1024 / 1024).toFixed(2)} MB -> ${result.path}`)
        }
      } catch (err) {
        console.error(`ERROR ${table}/${row.id}: ${err.message}`)
      }
    }
  }

  if (backupLog.length) {
    mkdirSync('scripts/.migration-backups', { recursive: true })
    const backupPath = `scripts/.migration-backups/embedded_images_${Date.now()}.json`
    writeFileSync(backupPath, JSON.stringify(backupLog, null, 2))
    console.log(`\nBackup log (original field lengths, not the image bytes themselves) written to ${backupPath}`)
  }

  console.log(`\n${dryRun ? 'Would move' : 'Moved'} ${totalRowsMigrated} rows, ${(totalBytesMoved / 1024 / 1024).toFixed(1)} MB total.`)
  if (dryRun) console.log('Re-run without --dry-run to apply.')
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
