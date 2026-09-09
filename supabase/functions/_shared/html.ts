// Escapes a string for safe interpolation into HTML markup (not attributes
// with unusual quoting rules — this covers text content and standard
// double-quoted attributes). Used wherever a transactional email template
// interpolates a value that ultimately traces back to user input (e.g. the
// account email address), so a crafted value can't break out of its
// surrounding markup. See docs/YOW_CODE_AUDIT_2026-09-01.md finding #24 —
// send-welcome-email and send-reset-email previously interpolated the
// recipient's email into their HTML templates unescaped.
export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
