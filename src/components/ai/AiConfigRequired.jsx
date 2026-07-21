export const AI_CONFIG_REQUIRED_TEXT = 'An API key or AI configuration is required to use this AI feature.'
export const AI_UPGRADE_REQUIRED_TEXT = 'Upgrade your plan to access AI features.'

export function openAiSettings() {
  window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'ai' } }))
}

export function openAiPlans() {
  window.dispatchEvent(new CustomEvent('open-account-settings', { detail: { tab: 'membership' } }))
}

export function AiSettingsLink({ children = 'AI settings', className = '', style = {} }) {
  return (
    <button
      type="button"
      onClick={openAiSettings}
      className={className}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'var(--accent)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 800,
        textDecoration: 'underline',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function AiUpgradeRequiredNotice({
  title = 'AI is available on paid plans',
  children = 'Upgrade to unlock AI chat, writing suggestions, project analysis, and AI settings.',
  buttonLabel = 'View plans',
  compact = false,
  style = {},
}) {
  return (
    <div
      style={{
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
        borderRadius: 8,
        padding: compact ? '9px 12px' : '14px 16px',
        color: 'var(--text-muted)',
        fontSize: 12,
        lineHeight: 1.5,
        ...style,
      }}
    >
      <p style={{ margin: '0 0 4px', color: 'var(--text-main)', fontWeight: 800, fontSize: compact ? 12 : 13 }}>
        {title}
      </p>
      <p style={{ margin: 0 }}>{children}</p>
      <button
        type="button"
        onClick={openAiPlans}
        style={{
          marginTop: compact ? 6 : 10,
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 7,
          color: 'var(--bg-main)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12,
          fontWeight: 800,
          padding: compact ? '6px 10px' : '8px 14px',
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

export function AiConfigRequiredNotice({ style = {} }) {
  return (
    <div
      style={{
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 24%, transparent)',
        borderRadius: 8,
        padding: '10px 14px',
        color: 'var(--text-muted)',
        fontSize: 12,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {AI_CONFIG_REQUIRED_TEXT}{' '}
      Open <AiSettingsLink />.
    </div>
  )
}
