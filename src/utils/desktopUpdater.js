import { isDesktopAppRuntime } from './runtime.js'

// Desktop auto-update (Phase 6). Checks the GitHub Releases `latest.json`
// manifest configured in src-tauri/tauri.conf.json (plugins.updater),
// verified against the project's own minisign keypair. This is separate from
// — and free regardless of — OS-level code signing/notarization: it proves
// the update came from this project's release process, not that Apple or
// Microsoft vouch for the binary.

export async function checkForDesktopUpdate() {
  if (!isDesktopAppRuntime()) return null
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return null
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      body: update.body || '',
      install: async (onProgress) => {
        await update.downloadAndInstall(onProgress)
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      },
    }
  } catch (err) {
    // Offline or no release published yet — never blocks the app.
    console.warn('[desktopUpdater] check failed', err)
    return null
  }
}
