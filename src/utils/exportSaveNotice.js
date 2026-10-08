// Shows a visible message when the desktop app could not save an export.
// downloadBlob() dispatches `yow-export-save-error`; without a listener the
// failure was only a console line, so the customer saw nothing happen.
export const EXPORT_SAVE_ERROR_EVENT = 'yow-export-save-error'

export function installExportSaveNotice() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  const handler = (event) => {
    const filename = event?.detail?.filename || 'your file'
    document.getElementById('yow-export-save-notice')?.remove()
    const box = document.createElement('div')
    box.id = 'yow-export-save-notice'
    box.setAttribute('role', 'alert')
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;max-width:90vw;padding:12px 16px;border-radius:8px;background:#7f1d1d;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)'
    box.textContent = `Could not save ${filename}. Try a different folder, or try the export again.`
    document.body.appendChild(box)
    setTimeout(() => box.remove(), 8000)
  }
  window.addEventListener(EXPORT_SAVE_ERROR_EVENT, handler)
  return () => window.removeEventListener(EXPORT_SAVE_ERROR_EVENT, handler)
}
