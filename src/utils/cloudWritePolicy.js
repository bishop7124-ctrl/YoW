// Single switch for direct Supabase writes that do not go through useStore's
// sync effects (Storage uploads and deletes, AI findings, character
// interviews). App.jsx sets it from the same condition that drives
// `cloudSyncEnabled`, so a desktop account whose hosting has lapsed, a
// Local-first device, or an archived account can never write to the cloud
// behind the store's back. Defaults to allowed so the web app and tests that
// never mount App behave as before.

let cloudWritesAllowed = true

export function setCloudWritesAllowed(allowed) {
  cloudWritesAllowed = Boolean(allowed)
}

export function areCloudWritesAllowed() {
  return cloudWritesAllowed
}

export function assertCloudWritesAllowed(action = 'This action') {
  if (!cloudWritesAllowed) {
    throw new Error(`${action} needs Cloud Mode. Cloud sync is unavailable on this device right now; your work is kept locally.`)
  }
}
