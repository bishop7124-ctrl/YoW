import {
  formatBytes,
  formatQuotaLabel,
  getStoragePercent,
  getStorageWarningLevel,
} from '../../utils/storageQuota'

const getWarningMessage = (level, usedBytes, quotaBytes) => {
  if (level === 'warning') return 'You\'re approaching your storage limit. Consider upgrading your plan.'
  if (level === 'critical') return 'You\'re nearly out of storage. Uploads may fail soon.'
  if (level === 'exceeded') return `Storage limit reached — ${formatBytes(usedBytes)} of ${formatQuotaLabel(quotaBytes)} used. Uploads are paused until you free space or upgrade.`
  return null
}

const BAR_COLORS = {
  ok:       'var(--accent)',
  warning:  '#f59e0b',
  critical: '#f97316',
  exceeded: '#ef4444',
}

export default function StorageCard({ usedBytes = 0, quotaBytes, planLabel, limitLabel, onUpgrade }) {
  const pct   = getStoragePercent(usedBytes, quotaBytes)
  const level = getStorageWarningLevel(usedBytes, quotaBytes)
  const barColor = BAR_COLORS[level]
  const message  = getWarningMessage(level, usedBytes, quotaBytes)

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${level === 'exceeded' ? '#ef4444' : level !== 'ok' ? '#f59e0b44' : 'var(--border)'}`,
      background: 'var(--bg-main)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <p style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '.08em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
          }}>
            Storage
          </p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3, margin: 0 }}>
            {formatBytes(usedBytes)}
            <span style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 4 }}>
              of {quotaBytes ? formatQuotaLabel(quotaBytes) : (limitLabel || 'device limit')} used
            </span>
          </p>
        </div>
        {quotaBytes && (
          <span style={{
            fontSize: 12, fontWeight: 800,
            color: barColor,
            flexShrink: 0,
          }}>
            {pct}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      {quotaBytes && (
        <div style={{
          height: 6, borderRadius: 99,
          background: 'var(--border)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: 99,
            transition: 'width .4s ease',
            minWidth: pct > 0 ? 4 : 0,
          }} />
        </div>
      )}

      {/* Plan + remaining */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {planLabel || 'Current plan'}
        </span>
        {quotaBytes && (
          <span style={{ fontSize: 11, color: level !== 'ok' ? barColor : 'var(--text-muted)' }}>
            {formatBytes(Math.max(0, quotaBytes - usedBytes))} remaining
          </span>
        )}
      </div>

      {/* Warning message + upgrade CTA */}
      {message && (
        <div style={{
          borderRadius: 6,
          background: level === 'exceeded' ? '#ef444418' : '#f59e0b14',
          border: `1px solid ${level === 'exceeded' ? '#ef444440' : '#f59e0b40'}`,
          padding: '10px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <p style={{
            margin: 0, fontSize: 12, lineHeight: 1.5,
            color: level === 'exceeded' ? '#ef4444' : '#f59e0b',
            fontWeight: 600,
          }}>
            {message}
          </p>
          {onUpgrade && (
            <button
              type="button"
              onClick={onUpgrade}
              style={{
                flexShrink: 0,
                background: 'var(--accent)',
                color: 'var(--bg-main)',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Upgrade plan
            </button>
          )}
        </div>
      )}
    </div>
  )
}
