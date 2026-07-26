const cx = (...classes) => classes.filter(Boolean).join(' ')

// Shared tab/segmented-toggle control. Always scrolls horizontally instead of
// wrapping when its options don't fit — wrapping is what silently hid the
// active tab behind another row on narrow phone screens.
//
// variant="tabs" — individual outlined pills (Characters editor tabs)
// variant="segmented" — equal-width buttons inside a filled pill container
//   (AI provider picker, faction logo source toggle)
export default function SegmentedControl({ options, value, onChange, variant = 'tabs', ariaLabel }) {
  const isSegmented = variant === 'segmented'
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx(
        'flex gap-1 overflow-x-auto',
        isSegmented ? 'p-1 rounded-lg bg-[var(--bg-main)] border border-[var(--border)]' : 'gap-2 -mx-1 px-1',
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {options.map(opt => {
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cx(
              'shrink-0 whitespace-nowrap text-xs font-bold transition-colors relative',
              isSegmented ? 'flex-1 py-1.5 rounded-md' : 'px-3 py-1.5 rounded border',
              isSegmented
                ? (active ? 'bg-[var(--accent)] text-[var(--bg-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]')
                : (active ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-fade)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)]'),
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
