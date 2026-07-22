// One-off tool: captures real in-app screenshots (Map/Atlas, Timeline/History,
// Character dossier) for the public marketing landing pages. Runs against the
// offline dev server (no Supabase account touched) with a small seeded demo
// project. Re-run after a visual redesign of these views to refresh the PNGs
// in public/screenshots/.
//
// Usage: node scripts/capture-marketing-screenshots.mjs
// The Atlas capture is a busy full-colour parchment texture, so it is much
// smaller as a JPEG than a PNG — after running this, convert it by hand:
//   sips -s format jpeg -s formatOptions 82 public/screenshots/map-builder-atlas.png \
//     --out public/screenshots/map-builder-atlas.jpg && rm public/screenshots/map-builder-atlas.png

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PORT = 4180
const BASE_URL = `http://127.0.0.1:${PORT}`
const OUT_DIR = path.join(ROOT, 'public', 'screenshots')

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

async function main() {
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, VITE_OFFLINE_MODE: 'true' },
    stdio: 'inherit',
  })

  try {
    await waitForServer(BASE_URL)

    const browser = await chromium.launch()
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

    await page.addInitScript(() => {
      localStorage.setItem('yow_beta_acknowledged', '1')
      localStorage.setItem('yow_onboarding', JSON.stringify({ wizardShown: true, checklistDismissed: true, toursEnabled: false }))
      document.cookie = 'yow_consent=essential; max-age=31536000; path=/; SameSite=Lax'
    })

    await page.goto(BASE_URL)
    await page.waitForLoadState('networkidle')

    // --- Create the demo project ---
    await page.getByRole('button', { name: 'New Project' }).first().click()
    await page.getByPlaceholder('Title *').fill('The Ashmere Chronicles')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL(/\/project\//)

    // --- Characters: add two characters for the worldbuilding screenshot ---
    async function addCharacter(name, title, bio) {
      await page.getByRole('button', { name: 'New', exact: true }).first().click()
      const dlg = page.getByRole('dialog')
      await dlg.getByRole('textbox').first().fill(name)
      await dlg.getByPlaceholder('Queen, detective, cartographer...').fill(title)
      await dlg.getByPlaceholder('Describe their history...').fill(bio)
      await dlg.getByRole('button', { name: 'Save Character' }).click()
      await page.waitForTimeout(500)
    }

    await page.getByRole('button', { name: 'Open Characters' }).first().click()
    await addCharacter(
      'Kira Vance',
      'Cartographer of the Ashmere Reach',
      'Kira charts the shifting coastlines of the Ashmere Reach, trading maps for passage between the floating trade-holds.'
    )
    await addCharacter(
      'Orin Half-Light',
      'Smuggler-priest of the Drowned Chapel',
      'Once a temple scribe, Orin now ferries relics between the coastal shrines the tide has half-swallowed.'
    )

    await page.screenshot({ path: path.join(OUT_DIR, 'worldbuilding-characters.png') })
    console.log('captured worldbuilding-characters.png')

    // --- Timeline: add a couple of era-grouped events ---
    await page.getByRole('button', { name: 'Open Overview' }).first().click()
    await page.getByRole('button', { name: 'Open History' }).first().click()
    await page.waitForTimeout(300)

    async function addTimelineEvent(title, era, dateLabel, description) {
      await page.getByRole('button', { name: 'New Event', exact: true }).first().click()
      await page.waitForTimeout(400)
      await page.locator('form input:not([placeholder])').first().fill(title)
      await page.getByPlaceholder('e.g. The Second Age').fill(era)
      await page.getByPlaceholder('e.g. Year 312, First Month').fill(dateLabel)
      await page.locator('textarea').fill(description)
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await page.waitForTimeout(500)
    }

    await addTimelineEvent(
      'The Reach Floods',
      'The Drowning',
      'Year 98',
      'The coastal lowlands vanish beneath the tide, forcing the trade-holds onto stilts and rafts.'
    )
    await addTimelineEvent(
      'The Chapel Goes Dark',
      'The Drowning',
      'Year 112',
      'The Drowned Chapel stops answering pilgrims. Orin is the last scribe to leave.'
    )

    await page.screenshot({ path: path.join(OUT_DIR, 'timeline-history.png') })
    console.log('captured timeline-history.png')

    // --- Atlas/Map: create a world map and paint a small landmass + pins ---
    await page.getByRole('button', { name: 'Open Overview' }).first().click()
    await page.getByRole('button', { name: 'Open Atlas' }).first().click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Map', exact: true }).first().click()
    await page.waitForTimeout(300)

    await page.getByRole('button', { name: /^Create map$/i }).first().click()
    const mapForm = page.locator('form')
    await mapForm.getByPlaceholder('Untitled Map').fill('The Ashmere Reach')
    await mapForm.getByRole('button', { name: 'Create map' }).click()
    await page.waitForTimeout(600)

    // Draw a simple landmass polygon by clicking points, closing back on the origin.
    await page.getByRole('button', { name: 'Landmass', exact: true }).click()
    const canvas = page.locator('canvas').first()
    const box = await canvas.boundingBox()
    if (box) {
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      const points = [
        [cx - 220, cy - 60], [cx - 120, cy - 150], [cx + 40, cy - 130],
        [cx + 210, cy - 30], [cx + 180, cy + 100], [cx + 10, cy + 160],
        [cx - 170, cy + 120], [cx - 250, cy + 10],
      ]
      for (const [x, y] of points) {
        await page.mouse.click(x, y)
        await page.waitForTimeout(100)
      }
      // Close the polygon by clicking back on the origin point.
      await page.mouse.click(points[0][0], points[0][1])
      await page.waitForTimeout(400)

      // Drop two location pins on the landmass.
      await page.getByRole('button', { name: 'Location', exact: true }).click()
      await page.mouse.click(cx - 60, cy - 10)
      await page.waitForTimeout(300)
      await page.getByPlaceholder('Location name').fill('Ashmere Landing')
      await page.getByRole('button', { name: 'Place', exact: true }).click()
      await page.waitForTimeout(400)

      await page.getByRole('button', { name: 'Location', exact: true }).click()
      await page.mouse.click(cx + 60, cy + 50)
      await page.waitForTimeout(300)
      await page.getByPlaceholder('Location name').fill('The Drowned Chapel')
      await page.getByRole('button', { name: 'Place', exact: true }).click()
      await page.waitForTimeout(400)
    }

    // Switch to the select tool and click empty water to deselect, so the
    // screenshot shows the clean map instead of an object property panel.
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.waitForTimeout(200)
    if (box) {
      await page.mouse.click(box.x + 40, box.y + 40)
    }
    await page.waitForTimeout(300)

    await page.screenshot({ path: path.join(OUT_DIR, 'map-builder-atlas.png') })
    console.log('captured map-builder-atlas.png')

    await browser.close()
  } finally {
    server.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
