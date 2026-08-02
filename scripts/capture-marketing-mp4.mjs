// Captures a playable H.264 MP4 YoW marketing walkthrough.
//
// Unlike Playwright's native video recorder, this emits an Apple/QuickTime
// friendly .mp4 by capturing paced PNG frames from the app and encoding them
// through macOS AVFoundation.
//
// Usage:
//   PLAYWRIGHT_BROWSERS_PATH=/private/tmp/yow-ms-playwright node scripts/capture-marketing-mp4.mjs

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = Number(process.env.YOW_MARKETING_PORT || 4182)
const BASE_URL = `http://127.0.0.1:${PORT}`
const OUT_DIR = path.join(ROOT, 'output', 'marketing')
const FRAMES_DIR = path.join(OUT_DIR, 'mp4-frames')
const PROFILE_DIR = path.join(OUT_DIR, '.mp4-capture-profile')
const FINAL_MP4 = path.join(OUT_DIR, 'yow-marketing-screen-recording.mp4')
const VIEWPORT = { width: 1280, height: 720 }
const FPS = 5

let frameIndex = 0

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url)
        if (res.ok || res.status === 404) return resolve()
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error('dev server did not start in time'))
      setTimeout(tick, 500)
    }
    tick()
  })
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

async function preparePage(page, { suppressTours = true } = {}) {
  await page.addInitScript(() => {
    if (!document.getElementById('yow-capture-style')) {
      const style = document.createElement('style')
      style.id = 'yow-capture-style'
      style.textContent = `
        .tour-root,
        .tour-backdrop,
        .gs-modal,
        .cookie-banner {
          display: none !important;
          pointer-events: none !important;
        }
      `
      document.documentElement.appendChild(style)
    }
    localStorage.setItem('yow_beta_acknowledged', '1')
    localStorage.setItem('yow_ai_setup_prompt_seen:offline-dev-user', '1')
    if (suppressTours) {
      localStorage.setItem('yow_onboarding', JSON.stringify({
        toursEnabled: false,
        checklistDismissed: true,
        wizard_offline_dev_user: true,
        welcome_offline_dev_user: true,
        'wizard_offline-dev-user': true,
        'welcome_offline-dev-user': true,
        tour_library: true,
        tour_dashboard: true,
        tour_manuscript: true,
        tour_characters: true,
        tour_locations: true,
        tour_lore: true,
        tour_timeline: true,
        tour_worldhistory: true,
        tour_map: true,
        tour_aitools: true,
      }))
    }
    document.cookie = 'yow_consent=essential; max-age=31536000; path=/; SameSite=Lax'
  })
}

async function dismissVisibleOverlays(page) {
  for (const name of ['Skip tour', 'Maybe later', 'Got it']) {
    const button = page.getByRole('button', { name }).first()
    if (await button.isVisible({ timeout: 80 }).catch(() => false)) {
      await button.click({ force: true }).catch(() => {})
      await page.waitForTimeout(100)
    }
  }
}

async function hold(page, seconds) {
  await dismissVisibleOverlays(page)
  const frames = Math.max(1, Math.round(seconds * FPS))
  for (let i = 0; i < frames; i += 1) {
    frameIndex += 1
    const framePath = path.join(FRAMES_DIR, `${String(frameIndex).padStart(5, '0')}.png`)
    await page.screenshot({ path: framePath })
  }
}

async function clickRoom(page, label) {
  await dismissVisibleOverlays(page)
  await page.getByRole('button', { name: `Open ${label}` }).first().click()
  await page.waitForTimeout(700)
  await dismissVisibleOverlays(page)
}

async function clickTab(page, label) {
  await dismissVisibleOverlays(page)
  await page.getByRole('button', { name: label, exact: true }).first().click()
  await page.waitForTimeout(650)
  await dismissVisibleOverlays(page)
}

async function clickOptionalText(page, text, timeout = 500) {
  const item = page.getByText(text).first()
  if (await item.isVisible({ timeout }).catch(() => false)) {
    await item.click().catch(() => {})
    await page.waitForTimeout(700)
    await dismissVisibleOverlays(page)
  }
}

async function selectStudioRecord(page, preferredTexts = []) {
  await dismissVisibleOverlays(page)
  for (const text of preferredTexts) {
    const record = page.locator('.studio-record').filter({ hasText: text }).first()
    if (await record.count()) {
      await record.scrollIntoViewIfNeeded().catch(() => {})
      await record.click().catch(() => {})
      await page.waitForTimeout(450)
      await dismissVisibleOverlays(page)
      return true
    }
  }

  const firstRecord = page.locator('.studio-record').first()
  if (await firstRecord.count()) {
    await firstRecord.scrollIntoViewIfNeeded().catch(() => {})
    await firstRecord.click().catch(() => {})
    await page.waitForTimeout(450)
    await dismissVisibleOverlays(page)
    return true
  }
  return false
}

async function selectTimelineEvent(page, preferredTexts = []) {
  await dismissVisibleOverlays(page)
  for (const text of preferredTexts) {
    const card = page.locator('.tl2-card').filter({ hasText: text }).first()
    if (await card.count()) {
      await card.scrollIntoViewIfNeeded().catch(() => {})
      await card.click().catch(() => {})
      await page.waitForTimeout(450)
      await dismissVisibleOverlays(page)
      return true
    }
  }

  const firstCard = page.locator('.tl2-card').first()
  if (await firstCard.count()) {
    await firstCard.scrollIntoViewIfNeeded().catch(() => {})
    await firstCard.click().catch(() => {})
    await page.waitForTimeout(450)
    await dismissVisibleOverlays(page)
    return true
  }
  return false
}

async function smoothScroll(page, selector, distance = 420) {
  await page.locator(selector).first().evaluate((el, amount) => {
    el.scrollBy({ top: amount, behavior: 'smooth' })
  }, distance).catch(async () => {
    await page.mouse.wheel(0, distance)
  })
  await page.waitForTimeout(700)
}

async function seedSampleProject() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: VIEWPORT,
  })
  const page = context.pages()[0] || await context.newPage()
  await preparePage(page, { suppressTours: false })
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')

  const sampleButton = page.getByRole('button', { name: /Tour with a sample/i }).first()
  if (await sampleButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await sampleButton.evaluate(button => button.click())
  }

  await page.waitForURL(/\/project\//, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('text=The Last Ember', { timeout: 15000 })
  const projectPath = new URL(page.url()).pathname
  await context.close()
  return projectPath
}

async function dismissToursBeforeRecording(projectPath) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: VIEWPORT,
  })
  const page = context.pages()[0] || await context.newPage()
  await preparePage(page)
  await page.goto(`${BASE_URL}${projectPath}`)
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('text=The Last Ember', { timeout: 15000 })
  await dismissVisibleOverlays(page)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await dismissVisibleOverlays(page)

  const visibleTourCount = await page.locator('.tour-root:visible, .tour-backdrop:visible').count()
  if (visibleTourCount > 0) throw new Error('Tours are still visible after preflight dismissal.')
  await context.close()
}

async function injectEndCard(page) {
  await page.evaluate(() => {
    const root = document.createElement('div')
    root.id = 'yow-marketing-end-card'
    root.innerHTML = `
      <style>
        #yow-marketing-end-card {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: grid;
          place-items: center;
          background:
            radial-gradient(circle at 50% 30%, rgba(91, 183, 217, 0.18), transparent 32%),
            linear-gradient(135deg, #111827 0%, #15131d 46%, #1f2933 100%);
          color: #f8fafc;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #yow-marketing-end-card .end-inner {
          display: grid;
          place-items: center;
          gap: 24px;
          text-align: center;
        }
        #yow-marketing-end-card img {
          width: 128px;
          height: 128px;
          object-fit: contain;
          filter: drop-shadow(0 24px 48px rgba(0, 0, 0, 0.35));
        }
        #yow-marketing-end-card h1 {
          margin: 0;
          font-size: 56px;
          line-height: 1;
          font-weight: 850;
          letter-spacing: 0;
        }
        #yow-marketing-end-card p {
          margin: 0;
          color: #9ee7ff;
          font-size: 26px;
          font-weight: 750;
          letter-spacing: 0;
        }
      </style>
      <div class="end-inner">
        <img src="/yow-logo.png" alt="" />
        <h1>Your Own World</h1>
        <p>yourownworld.co.uk</p>
      </div>
    `
    document.body.appendChild(root)
  })
}

async function captureFrames(projectPath) {
  await fs.rm(FRAMES_DIR, { recursive: true, force: true })
  await fs.mkdir(FRAMES_DIR, { recursive: true })
  frameIndex = 0

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: VIEWPORT,
  })
  for (const existingPage of context.pages()) {
    await existingPage.close().catch(() => {})
  }
  const page = await context.newPage()
  await preparePage(page)
  await page.goto(`${BASE_URL}${projectPath}`)
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('text=The Last Ember', { timeout: 15000 })
  await hold(page, 1.1)

  await clickRoom(page, 'Manuscript')
  await hold(page, 1.5)
  await smoothScroll(page, '.studio-surface', 360)
  await hold(page, 0.9)

  await clickRoom(page, 'Characters')
  await selectStudioRecord(page, ['Princess Elia Marent', 'Rowan Vale'])
  await hold(page, 1.5)
  await clickTab(page, 'Relationship Map')
  await selectStudioRecord(page, ['Princess Elia Marent', 'Rowan Vale'])
  await hold(page, 1.2)
  await clickTab(page, 'Family Tree')
  await selectStudioRecord(page, ['Princess Elia Marent', 'Rowan Vale'])
  await hold(page, 1.2)

  await clickRoom(page, 'Atlas')
  await clickTab(page, 'Locations')
  await selectStudioRecord(page, ['Glassmere Observatory', 'Kestrel Market'])
  await hold(page, 1.6)

  await clickRoom(page, 'Lore')
  await selectStudioRecord(page, ['Firekeeper Blood', 'The Hollow Court', 'Ember Magic'])
  await hold(page, 1.5)
  const linkedCharacter = page.getByRole('button', { name: /Rowan Vale/i }).first()
  if (await linkedCharacter.isVisible({ timeout: 500 }).catch(() => false)) {
    await linkedCharacter.click()
    await page.waitForTimeout(450)
    await hold(page, 0.9)
  }
  await clickRoom(page, 'Lore')
  await clickTab(page, 'Timeline')
  await selectTimelineEvent(page, ['Escape through Kestrel Market', 'Rowan discovers the impossible map'])
  await hold(page, 1.3)
  await clickTab(page, 'History')
  await selectStudioRecord(page, ['The Ember Crisis', 'The First Burning', 'First record of the Hollow Court'])
  await hold(page, 1.2)

  await clickRoom(page, 'AI Tools')
  await clickOptionalText(page, 'Plot Hole Detector')
  await hold(page, 1.5)

  await injectEndCard(page)
  await hold(page, 2.2)

  await context.close()
}

async function main() {
  await fs.rm(PROFILE_DIR, { recursive: true, force: true })
  await fs.mkdir(OUT_DIR, { recursive: true })

  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, VITE_OFFLINE_MODE: 'true' },
    stdio: 'inherit',
  })

  try {
    await waitForServer(BASE_URL)
    const projectPath = await seedSampleProject()
    await dismissToursBeforeRecording(projectPath)
    await captureFrames(projectPath)
    await run('/usr/bin/swift', [
      path.join(ROOT, 'scripts', 'png-sequence-to-mp4.swift'),
      FRAMES_DIR,
      FINAL_MP4,
      String(FPS),
    ], { cwd: ROOT })
    await fs.rm(PROFILE_DIR, { recursive: true, force: true })
    await fs.rm(FRAMES_DIR, { recursive: true, force: true })
    console.log(`Captured ${FINAL_MP4}`)
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
