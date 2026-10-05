import { isDesktopAppRuntime } from './runtime.js'
import { supabase } from '../supabase'

// Desktop licence activation and offline grace (PRD Phase 4).
//
// The desktop app activates each device once against api/desktop-devices and
// caches the returned signed entitlement record on this device. Live account
// metadata is the primary entitlement source; the cached record covers
// offline sessions. Staleness past the grace window only drives a nag banner
// — editing and export are never gated client-side.

export const DESKTOP_GRACE_DAYS = 30

const DEVICE_ID_KEY = 'nf_desktop_device_id'
const ENTITLEMENT_CACHE_KEY = 'nf_desktop_entitlement'
const DAY_MS = 24 * 60 * 60 * 1000

// The desktop app is served from the tauri:// origin, so relative /api paths
// don't exist there — desktop calls go to the production site.
const apiEndpoint = () => {
  const base = import.meta.env.VITE_DESKTOP_API_BASE_URL
    || (isDesktopAppRuntime() ? 'https://www.yourownworld.co.uk' : '')
  return `${base}/api/desktop-devices`
}

// Device identity is a device-level secret, not vault data: it must not
// travel with vault copies or cloud sync, so it lives in webview localStorage.
export function getOrCreateDesktopDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .replace(/[^a-zA-Z0-9-]/g, '')
      .slice(0, 64)
    localStorage.setItem(DEVICE_ID_KEY, id)
    return id
  } catch {
    return null
  }
}

export function loadCachedDesktopEntitlement() {
  try {
    const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && parsed.record ? parsed : null
  } catch {
    return null
  }
}

function saveCachedDesktopEntitlement(payload) {
  try {
    localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(payload))
  } catch { /* storage unavailable */ }
}

export function clearCachedDesktopEntitlement() {
  try { localStorage.removeItem(ENTITLEMENT_CACHE_KEY) } catch { /* storage unavailable */ }
}

// Pure evaluation used by the app shell. `membership` reflects the live (or
// session-cached) account; `cached` is the stored activation record.
// The cached record lives in webview localStorage, so anyone can edit it. It can
// never be proven genuine on the client (the HMAC secret is server-only); it can
// only be rejected when it is malformed or not issued to this account and device.
// A forged cache therefore grants nothing a signed-out local vault does not already
// have: editing, export and the local vault stay available, while cloud sync,
// downloads and device activation are decided server-side from app_metadata.
const CACHEABLE_DESKTOP_PLANS = new Set(['premium_lifetime', 'premium_plus_lifetime', 'founder', 'beta_tester'])

export function isCachedEntitlementTrusted(cached, { userId, deviceId, now = new Date() } = {}) {
  const record = cached?.record
  if (!record || typeof record !== 'object') return false
  if (!CACHEABLE_DESKTOP_PLANS.has(record.plan)) return false
  if (userId !== undefined && record.userId !== userId) return false
  if (deviceId !== undefined && record.deviceId !== deviceId) return false
  const verified = cached?.verifiedAt ? new Date(cached.verifiedAt).getTime() : NaN
  if (!Number.isFinite(verified) || verified > now.getTime() + DAY_MS) return false   // missing or future-dated
  return true
}

export function evaluateDesktopEntitlement({ membership, cached, userId, deviceId, now = new Date() } = {}) {
  const verifiedAt = cached?.verifiedAt ? new Date(cached.verifiedAt) : null
  const daysSinceVerified = verifiedAt && !Number.isNaN(verifiedAt.getTime())
    ? Math.floor((now.getTime() - verifiedAt.getTime()) / DAY_MS)
    : null
  const stale = daysSinceVerified !== null && daysSinceVerified > DESKTOP_GRACE_DAYS

  if (membership?.isDesktopEntitled) {
    return { entitled: true, source: 'account', stale, daysSinceVerified }
  }
  const checkIdentity = userId !== undefined || deviceId !== undefined
  const trusted = checkIdentity
    ? isCachedEntitlementTrusted(cached, { userId, deviceId, now })
    : Boolean(cached?.record?.plan)
  if (trusted) {
    return { entitled: true, source: 'cache', stale, daysSinceVerified }
  }
  return { entitled: false, source: null, stale: false, daysSinceVerified }
}

function detectPlatform() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS/i.test(ua)) return 'macos'
  return 'desktop'
}

async function authorizedFetch(method, body) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { ok: false, status: 0, offline: true }
  let response
  try {
    response = await fetch(apiEndpoint(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    // Network unreachable — the offline-grace path, never an error state.
    return { ok: false, status: 0, offline: true }
  }
  const payload = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, offline: false, payload }
}

// Activate this device (or re-verify an existing activation). Safe to call
// opportunistically at startup; failures are non-fatal by design.
export async function verifyDesktopEntitlement({ deviceName } = {}) {
  const deviceId = getOrCreateDesktopDeviceId()
  if (!deviceId) return { ok: false, status: 0, offline: false }

  const result = await authorizedFetch('POST', {
    deviceId,
    deviceName: deviceName || `${detectPlatform() === 'macos' ? 'Mac' : 'PC'} — YOW desktop`,
    platform: detectPlatform(),
  })
  if (result.ok && result.payload?.record) {
    saveCachedDesktopEntitlement({
      record: result.payload.record,
      signature: result.payload.signature || null,
      verifiedAt: new Date().toISOString(),
    })
  }
  return { ...result, devices: result.payload?.devices, cap: result.payload?.cap }
}

export async function listDesktopDevices() {
  const result = await authorizedFetch('GET')
  return result.ok ? { ...result.payload, currentDeviceId: getOrCreateDesktopDeviceId() } : null
}

export async function deactivateDesktopDevice(deviceId) {
  const result = await authorizedFetch('DELETE', { deviceId })
  if (!result.ok) {
    throw new Error(result.payload?.error || 'Could not deactivate the device.')
  }
  return result.payload
}
