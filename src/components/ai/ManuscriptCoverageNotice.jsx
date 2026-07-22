// Surfaces the silent scene-count/content truncation in aiToolPrompts.js's
// summariseScenes — without this, a long manuscript is quietly analysed
// only in part with no indication to the user of what was left out.
export function ManuscriptCoverageNotice({ coverage, style = {} }) {
  if (!coverage) return null
  const { totalScenes, includedScenes, omittedScenes, contentTruncated } = coverage
  if (omittedScenes <= 0 && !contentTruncated) return null

  const parts = []
  if (omittedScenes > 0) {
    parts.push(`analysing the first ${includedScenes} of ${totalScenes} scenes — ${omittedScenes} scene${omittedScenes === 1 ? '' : 's'} will be skipped`)
  } else {
    parts.push(`analysing all ${totalScenes} scenes`)
  }
  if (contentTruncated) {
    parts.push('some scene text has been shortened to fit')
  }

  return (
    <div
      style={{
        background: 'color-mix(in srgb, #f59e0b 12%, transparent)',
        border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)',
        borderRadius: 8,
        padding: '8px 12px',
        color: '#f59e0b',
        fontSize: 11,
        lineHeight: 1.5,
        ...style,
      }}
    >
      Manuscript is large: {parts.join('; ')}. Results only reflect the included content.
    </div>
  )
}
