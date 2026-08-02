// Captures a short, silent YoW product tour for marketing edits.
//
// The script uses the official editable sample project ("The Last Ember") and
// records a browser walkthrough that matches the 18-45s beats in the supplied
// social video script: connected dashboard, manuscript, worldbuilding, timeline,
// AI tools, wiki-style linked navigation, then a simple logo/URL end card.
//
// Usage:
//   node scripts/capture-marketing-video.mjs

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
const VIDEO_DIR = path.join(OUT_DIR, 'raw-video')
const PROFILE_DIR = path.join(OUT_DIR, '.capture-profile')
const FINAL_VIDEO = path.join(OUT_DIR, 'yow-marketing-screen-recording.webm')
const VIEWPORT = { width: 1280, height: 720 }

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
        wizardShown: true,
        wizard_offline_dev_user: true,
        welcome_offline_dev_user: true,
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

async function clickRoom(page, label) {
  await dismissVisibleOverlays(page)
  await page.getByRole('button', { name: `Open ${label}` }).first().click()
  await page.waitForTimeout(900)
  await dismissVisibleOverlays(page)
}

async function clickTab(page, label) {
  await dismissVisibleOverlays(page)
  await page.getByRole('button', { name: label, exact: true }).first().click()
  await page.waitForTimeout(750)
  await dismissVisibleOverlays(page)
}

async function clickOptionalText(page, text, timeout = 500) {
  const item = page.getByText(text).first()
  if (await item.isVisible({ timeout }).catch(() => false)) {
    await item.click().catch(() => {})
    await page.waitForTimeout(900)
    await dismissVisibleOverlays(page)
    return true
  }
  return false
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

async function dismissCaptureOverlays(page) {
  await page.evaluate(() => {
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
  })
  await dismissVisibleOverlays(page)
}

async function smoothScroll(page, selector, distance = 420) {
  await page.locator(selector).first().evaluate((el, amount) => {
    el.scrollBy({ top: amount, behavior: 'smooth' })
  }, distance).catch(async () => {
    await page.mouse.wheel(0, distance)
  })
  await page.waitForTimeout(900)
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
  await dismissCaptureOverlays(page)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await dismissCaptureOverlays(page)

  const visibleTourCount = await page.locator('.tour-root:visible, .tour-backdrop:visible').count()
  if (visibleTourCount > 0) {
    throw new Error('Tours are still visible after preflight dismissal.')
  }

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

async function recordTour(projectPath) {
  await fs.rm(VIDEO_DIR, { recursive: true, force: true })
  await fs.mkdir(VIDEO_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: VIEWPORT,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
  })
  for (const existingPage of context.pages()) {
    await existingPage.close().catch(() => {})
  }
  const page = await context.newPage()
  await preparePage(page)

  await page.goto(`${BASE_URL}${projectPath}`)
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('text=The Last Ember', { timeout: 15000 })
  await dismissCaptureOverlays(page)
  await page.waitForTimeout(1000)

  await clickRoom(page, 'Manuscript')
  await smoothScroll(page, '.studio-surface', 360)

  await clickRoom(page, 'Characters')
  await clickOptionalText(page, 'Princess Elia Marent')
  await clickTab(page, 'Relationship Map')
  await clickTab(page, 'Family Tree')

  await clickRoom(page, 'Atlas')
  await clickTab(page, 'Locations')
  await clickOptionalText(page, 'Glassmere Observatory')

  await clickRoom(page, 'Lore')
  await clickOptionalText(page, 'Firekeeper Bloodline')
  const linkedCharacter = page.getByRole('button', { name: /Rowan Vale/i }).first()
  if (await linkedCharacter.isVisible({ timeout: 500 }).catch(() => false)) {
    await linkedCharacter.click()
    await page.waitForTimeout(1100)
  }
  await clickRoom(page, 'Lore')
  await clickTab(page, 'Timeline')
  await page.waitForTimeout(1400)
  await clickTab(page, 'History')

  await clickRoom(page, 'AI Tools')
  await page.waitForTimeout(1200)

  await injectEndCard(page)
  await page.waitForTimeout(3000)

  const video = page.video()
  await context.close()
  const rawPath = await video.path()
  await fs.copyFile(rawPath, FINAL_VIDEO)
  return FINAL_VIDEO
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
    const videoPath = await recordTour(projectPath)
    await fs.rm(PROFILE_DIR, { recursive: true, force: true })
    console.log(`Captured ${videoPath}`)
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
