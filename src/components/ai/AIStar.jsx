export default function AIStar({ size = 16, className = '', style = {}, title = null }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path
        fill="currentColor"
        d="M12 2.5c-1.5 5.1-4.4 8-9.5 9.5 5.1 1.5 8 4.4 9.5 9.5 1.5-5.1 4.4-8 9.5-9.5-5.1-1.5-8-4.4-9.5-9.5Z"
      />
    </svg>
  )
}
