#!/usr/bin/env node
// Builds latest.json for the Tauri updater (src-tauri/tauri.conf.json ->
// plugins.updater.endpoints). Upload the result alongside the platform
// installers as assets on the GitHub release — GitHub's
// /releases/latest/download/latest.json URL always resolves to the newest
// published release's copy.
//
// Usage:
//   node scripts/generate-updater-manifest.mjs \
//     --version 0.2.0 \
//     --notes "Bug fixes" \
//     --out latest.json \
//     --platform windows-x86_64=https://github.com/OWNER/REPO/releases/download/v0.2.0/YOW_0.2.0_x64-setup.exe=src-tauri/target/release/bundle/nsis/YOW_0.2.0_x64-setup.exe.sig
//
// Repeat --platform for each target. Valid platform keys (Tauri updater
// convention): windows-x86_64, windows-i686, windows-aarch64,
// darwin-x86_64, darwin-aarch64, linux-x86_64.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildUpdaterManifest, validateUpdaterManifest } from './lib/updaterManifest.mjs'

function parseArgs(argv) {
  const args = { platforms: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--version') args.version = argv[++i]
    else if (arg === '--notes') args.notes = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--platform') args.platforms.push(argv[++i])
    else if (arg === '--allow-partial') args.allowPartial = true
    else if (arg === '--verify') args.verify = argv[++i]
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

function appVersion() {
  return JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.verify) {
    // Check an already-published latest.json: node scripts/generate-updater-manifest.mjs --verify latest.json
    const errors = validateUpdaterManifest(JSON.parse(readFileSync(args.verify, 'utf8')), { expectedVersion: appVersion(), repo: 'bishop7124-ctrl/YoW' })
    if (errors.length) throw new Error(`Updater manifest is not releasable:\n - ${errors.join('\n - ')}`)
    console.log(`${args.verify} is complete for version ${appVersion()}.`)
    return
  }
  if (!args.version) throw new Error('--version is required')
  if (!args.out) throw new Error('--out is required')
  if (args.platforms.length === 0) throw new Error('At least one --platform is required')

  const platforms = {}
  for (const entry of args.platforms) {
    const [key, url, sigPath] = entry.split('=')
    if (!key || !url || !sigPath) {
      throw new Error(`--platform must be key=url=sigPath, got: ${entry}`)
    }
    const signature = readFileSync(sigPath, 'utf8').trim()
    platforms[key] = { signature, url }
  }

  const manifest = buildUpdaterManifest({ version: args.version, notes: args.notes || '', platforms })
  const errors = validateUpdaterManifest(manifest, {
    expectedVersion: appVersion(),
    repo: 'bishop7124-ctrl/YoW',
    ...(args.allowPartial ? { requiredPlatforms: [] } : {}),
  })
  if (errors.length) throw new Error(`Refusing to write an incomplete manifest (use --allow-partial only for a dry run):\n - ${errors.join('\n - ')}`)

  writeFileSync(args.out, JSON.stringify(manifest, null, 2))
  console.log(`Wrote ${args.out} for version ${args.version} (${Object.keys(platforms).join(', ')})`)
}

main()
