import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createDesktopVaultAutoSnapshot, initializeDesktopVaultStorage } from './storage/tauriVaultAdapter.js'
import { initializeIndexedDbStorage } from './storage/browserVaultAdapter.js'

async function boot() {
  try {
    const desktopVault = await initializeDesktopVaultStorage({
      onWriteError: error => {
        console.error('[YOW] Desktop vault write failed', error)
      },
    })
    if (desktopVault) {
      createDesktopVaultAutoSnapshot().catch(error => {
        console.error('[YOW] Desktop automatic vault snapshot failed', error)
      })
    } else {
      await initializeIndexedDbStorage({
        onWriteError: error => {
          console.error('[YOW] Browser storage (IndexedDB) write failed', error)
        },
      })
    }
  } catch (error) {
    console.error('[YOW] Local storage initialization failed', error)
  }

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
