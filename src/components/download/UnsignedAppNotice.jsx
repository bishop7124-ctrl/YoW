import { UNSIGNED_APP_HEADLINE, UNSIGNED_APP_SUMMARY } from '../../utils/unsignedAppDisclosure'

// Pre-purchase disclosure that the desktop beta build is unsigned. Rendered on
// the Pricing and Download pages (see src/utils/unsignedAppDisclosure.js).
export default function UnsignedAppNotice({ className = '', style }) {
  return (
    <aside
      className={`unsigned-app-notice ${className}`.trim()}
      role="note"
      aria-label="Desktop app signing notice"
      style={{
        margin: '24px auto', maxWidth: 760, padding: '16px 20px', textAlign: 'left',
        border: '1px solid var(--border)', borderLeft: '4px solid var(--accent)', borderRadius: 12,
        background: 'var(--bg-card)', color: 'var(--text-main)', ...style,
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700 }}>{UNSIGNED_APP_HEADLINE}</p>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>{UNSIGNED_APP_SUMMARY}</p>
    </aside>
  )
}
