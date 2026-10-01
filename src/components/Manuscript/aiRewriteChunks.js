export const REWRITE_CHUNK_CHAR_LIMIT = 5000
export const REWRITE_MAX_OUTPUT_TOKENS = 2400

// Keep requests comfortably inside the output allowance while preserving the
// author's paragraph boundaries whenever possible. `joiner` records how the
// source was split so completed chunks can be assembled without inventing a
// paragraph break in the middle of a long paragraph.
export function splitRewriteText(value, limit = REWRITE_CHUNK_CHAR_LIMIT) {
  let remaining = String(value || '').trim()
  if (!remaining) return []

  const chunks = []
  let joiner = ''
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1)
    const paragraphBreak = window.lastIndexOf('\n\n')
    let cut = paragraphBreak >= Math.floor(limit * 0.5) ? paragraphBreak : -1
    let nextJoiner = '\n\n'

    if (cut < 0) {
      const matches = [...window.matchAll(/\s+/g)]
      const boundary = matches.findLast(match => match.index > 0 && match.index <= limit)
      cut = boundary?.index ?? limit
      nextJoiner = boundary ? (boundary[0].includes('\n') ? '\n' : ' ') : ''
    }

    chunks.push({ text: remaining.slice(0, cut).trim(), joiner })
    remaining = remaining.slice(cut).trim()
    joiner = nextJoiner
  }
  if (remaining) chunks.push({ text: remaining, joiner })
  return chunks
}
