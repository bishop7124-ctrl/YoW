// Single source of truth for the pre-purchase "unsigned desktop app" disclosure
// (product decision 2026-09-02: OS-level signing/notarization is deferred until
// a revenue threshold covers its cost). Shown on Pricing, the FAQ and the
// Download page so the promise cannot drift between surfaces.
export const DESKTOP_UNSIGNED_SHORT =
  'The desktop app is not yet signed or notarized by Apple or Microsoft, so your computer shows a one-time security warning the first time you open it. Step-by-step instructions are on the Download page after you sign in.'

export const DESKTOP_UNSIGNED_DETAIL =
  'The YOW desktop app is not yet signed or notarized. On a Mac, Gatekeeper blocks the first launch until you open System Settings → Privacy & Security and click Open Anyway. On Windows, SmartScreen shows "Windows protected your PC" until you click More info, then Run anyway. This happens once per computer. Automatic updates are separately signed with YOW’s own key, and your projects are not affected.'
