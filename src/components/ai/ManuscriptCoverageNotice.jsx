// Surfaces the silent scene-count/content truncation in aiToolPrompts.js's
// summariseScenes. This can happen because either there are more scenes than
// the prompt includes, or individual scene excerpts are longer than the
// per-scene prompt cap.
export function ManuscriptCoverageNotice({ coverage, style = {} }) {
  if (!coverage) return null
  const { totalScenes, includedScenes, omittedScenes, contentTruncated } = coverage
  if (omittedScenes <= 0 && !contentTruncated) return null

  const parts = []
  const lead = omittedScenes > 0 ? 'Manuscript is large' : 'AI context is limited'
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
      {lead}: {parts.join('; ')}. Results only reflect the included content.
    </div>
  )
}
