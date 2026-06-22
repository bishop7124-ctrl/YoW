import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Routes handled by the React SPA — do not serve static files for these
const SPA_ROUTES = new Set(['/features', '/features/', '/pricing', '/pricing/', '/faq', '/faq/', '/founders', '/founders/'])

// Serve static marketing HTML pages from public/ in dev (e.g. /founders/, /about/)
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

// https://vite.dev/config/
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'api/**/*.test.js'],
  },
  plugins: [react(), staticHtmlMiddleware()],
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
})
