import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createDesktopVaultAutoSnapshot, initializeDesktopVaultStorage } from './storage/tauriVaultAdapter.js'

async function boot() {
  try {
    await initializeDesktopVaultStorage({
      onWriteError: error => {
        console.error('[YOW] Desktop vault write failed', error)
      },
    })
    createDesktopVaultAutoSnapshot().catch(error => {
      console.error('[YOW] Desktop automatic vault snapshot failed', error)
    })
  } catch (error) {
    console.error('[YOW] Desktop vault initialization failed', error)
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
