import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import registerPaidInterest from './api/register-paid-interest.js'
import { BILLING } from './src/utils/billingConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Routes handled by the React SPA — do not serve static files for these
const SPA_ROUTES = new Set(['/features', '/features/', '/pricing', '/pricing/', '/faq', '/faq/', '/founders', '/founders/'])

// Google recommends that canonical URLs in the original HTML agree with any
// value set by JavaScript. These public pages are rendered by the SPA, but the
// production build still needs route-specific metadata before React runs.
const SPA_SEO_PAGES = {
  'features/index.html': {
    path: '/features/',
    title: 'Features — Your Own World | Worldbuilding & Writing Software',
    description: 'Every tool your story needs: AI Import, manuscript editor, characters, lore, maps, timelines, family trees, and AI assistance — built for novelists, comic writers, and D&D dungeon masters.',
  },
  'pricing/index.html': {
    path: '/pricing/',
    title: 'Pricing — Your Own World | Worldbuilding & Writing Software',
    description: `Start Your Own World free. Review planned paid-launch terms for Monthly at £${BILLING.monthlyPrice}/month, Lifetime at £${BILLING.lifetimePrice}, and Founder.`,
  },
  'faq/index.html': {
    path: '/faq/',
    title: 'FAQ — Your Own World | Worldbuilding & Writing Software',
    description: 'Answers to common questions about Your Own World: plans and pricing, storage, Cloud Mode, Founder slots, AI features, exports, and data ownership.',
  },
  'founders/index.html': {
    path: '/founders/',
    title: 'Founders — Your Own World | Worldbuilding & Writing Software',
    description: 'Meet the Founder members of Your Own World and review the planned Founder terms, including a badge and an optional YOW-managed profile.',
  },
  'founders/morgan-bishop/index.html': {
    path: '/founders/morgan-bishop/',
    title: 'Morgan Bishop — Founder | Your Own World',
    description: 'Morgan Bishop, Fantasy · World-builder — a Founder member of Your Own World. A three-part fantasy series. Details forthcoming — worlds take time.',
  },
}

function replaceHeadValue(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`Unable to generate SEO page: missing ${pattern}`)
  return html.replace(pattern, replacement)
}

function renderSeoHtml(source, page) {
  const url = `https://www.yourownworld.co.uk${page.path}`
  let html = source
  html = replaceHeadValue(html, /<title>[\s\S]*?<\/title>/, `<title>${page.title}</title>`)
  html = replaceHeadValue(html, /<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${page.description}" />`)
  html = replaceHeadValue(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`)
  html = replaceHeadValue(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${page.title}" />`)
  html = replaceHeadValue(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${page.description}" />`)
  html = replaceHeadValue(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`)
  html = replaceHeadValue(html, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${page.title}" />`)
  html = replaceHeadValue(html, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${page.description}" />`)
  return html
}

function generateSpaSeoPages() {
  let mode
  let outDir
  return {
    name: 'generate-spa-seo-pages',
    apply: 'build',
    configResolved(config) {
      mode = config.mode
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      if (mode === 'desktop') return
      const indexPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(indexPath)) {
        throw new Error('Unable to generate SEO pages: built index.html was not found')
      }
      const source = fs.readFileSync(indexPath, 'utf8')
      for (const [fileName, page] of Object.entries(SPA_SEO_PAGES)) {
        const targetPath = path.join(outDir, fileName)
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.writeFileSync(targetPath, renderSeoHtml(source, page))
      }
    },
  }
}

// Serve static marketing HTML pages from public/ in dev (e.g. /about/ and the SEO landing pages)
function staticHtmlMiddleware() {
  return {
    name: 'static-html-middleware',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '/'
        if (url === '/' || !url.startsWith('/')) return next()
        if (SPA_ROUTES.has(url)) return next()
        const filePath = path.resolve(__dirname, 'public', url.replace(/^\//, ''), 'index.html')
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'text/html')
          res.end(fs.readFileSync(filePath))
        } else {
          next()
        }
      })
    },
  }
}

// The desktop app doesn't track users with Google Analytics — strip the gtag
// block (marked by ga:start/ga:end comments) from index.html in that build.
function stripAnalyticsForDesktop() {
  let mode
  return {
    name: 'strip-analytics-for-desktop',
    configResolved(config) {
      mode = config.mode
    },
    transformIndexHtml(html) {
      if (mode !== 'desktop') return html
      return html.replace(/<!-- ga:start[\s\S]*?<!-- ga:end -->\n?/, '')
    },
  }
}

function installLocalApiEnv(mode) {
  const env = loadEnv(mode, __dirname, '')
  const keys = [
    'FEEDBACK_EMAIL',
    'FEEDBACK_EMAIL_PASSWORD',
    'SITE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ]
  for (const key of keys) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }
  if (!process.env.SUPABASE_URL && env.VITE_SUPABASE_URL) {
    process.env.SUPABASE_URL = env.VITE_SUPABASE_URL
  }
}

function localApiMiddleware(mode) {
  return {
    name: 'local-api-middleware',
    configureServer(server) {
      installLocalApiEnv(mode)
      server.middlewares.use('/api/register-paid-interest', async (req, res) => {
        try {
          let rawBody = ''
          for await (const chunk of req) rawBody += chunk
          req.body = rawBody ? JSON.parse(rawBody) : {}
          res.status = (statusCode) => {
            res.statusCode = statusCode
            return res
          }
          res.json = (payload) => {
            if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          }
          await registerPaidInterest(req, res)
        } catch (err) {
          server.config.logger.error(`[local-api] register-paid-interest failed: ${err.message}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'Local API failed.' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'tests/api/**/*.test.js'],
  },
  plugins: [react(), staticHtmlMiddleware(), stripAnalyticsForDesktop(), generateSpaSeoPages(), localApiMiddleware(mode)],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    watch: {
      ignored: (path) => path.includes('backup-before-app-launch-route-fix') ||
        path.includes('backup-before-launch-fix') ||
        path.includes('/.claude/') ||
        path.includes('broken-files') ||
        path.includes('/dist/') ||
        path.includes('dist-test') ||
        path.includes('/functions/') ||
        path.includes('node_modules.broken-20260505'),
    },
  },
}))
