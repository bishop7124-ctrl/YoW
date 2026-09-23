const tokenise = value => String(value || '').match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) || []

const compact = segments => segments.reduce((out, segment) => {
  if (!segment.text) return out
  const previous = out[out.length - 1]
  if (previous?.type === segment.type) previous.text += segment.text
  else out.push({ ...segment })
  return out
}, [])

const normaliseReplacementRuns = segments => {
  const bridged = []
  segments.forEach((segment, index) => {
    const previous = segments[index - 1]
    const next = segments[index + 1]
    // Token diffs naturally preserve the spaces between replaced words. For
    // presentation that creates "delete word / insert word" stripes. Treat a
    // horizontal-whitespace-only bridge inside a replacement as belonging to
    // both sides, but never bridge a newline or substantive unchanged prose.
    if (
      segment.type === 'equal'
      && /^[\t \u00a0]+$/.test(segment.text)
      && previous?.type !== 'equal'
      && next?.type !== 'equal'
    ) {
      bridged.push({ type: 'delete', text: segment.text }, { type: 'insert', text: segment.text })
      return
    }
    bridged.push(segment)
  })

  const ordered = []
  for (let index = 0; index < bridged.length;) {
    if (bridged[index].type === 'equal') {
      ordered.push(bridged[index++])
      continue
    }
    const deleted = []
    const inserted = []
    while (index < bridged.length && bridged[index].type !== 'equal') {
      const segment = bridged[index++]
      if (segment.type === 'delete') deleted.push(segment.text)
      else inserted.push(segment.text)
    }
    if (deleted.length) ordered.push({ type: 'delete', text: deleted.join('') })
    if (inserted.length) ordered.push({ type: 'insert', text: inserted.join('') })
  }
  return compact(ordered)
}

const prefixSuffixDiff = (before, after) => {
  let prefix = 0
  const limit = Math.min(before.length, after.length)
  while (prefix < limit && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (
    suffix < limit - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++
  return compact([
    { type: 'equal', text: before.slice(0, prefix) },
    { type: 'delete', text: before.slice(prefix, before.length - suffix) },
    { type: 'insert', text: after.slice(prefix, after.length - suffix) },
    { type: 'equal', text: before.slice(before.length - suffix) },
  ])
}

function myersTokenDiff(left, right) {
  const total = left.length + right.length
  // Bound trace memory for genuine rewrites. Ordinary tracked editing has a
  // small edit distance even in a 20k-word scene; once 512 token operations
  // differ, presenting the anchored middle as a broader replacement is both
  // more readable and safer than allocating an unbounded backtrack trace.
  const maxEditDistance = Math.min(total, 512)
  let frontier = new Map([[1, 0]])
  const trace = []

  for (let distance = 0; distance <= maxEditDistance; distance++) {
    trace.push(new Map(frontier))
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? -1
      const rightward = frontier.get(diagonal - 1) ?? -1
      let x = diagonal === -distance || (diagonal !== distance && rightward < down)
        ? Math.max(0, down)
        : Math.max(0, rightward + 1)
      let y = x - diagonal
      while (x < left.length && y < right.length && left[x] === right[y]) {
        x++
        y++
      }
      frontier.set(diagonal, x)
      if (x < left.length || y < right.length) continue

      const segments = []
      let cursorX = left.length
      let cursorY = right.length
      for (let step = distance; step >= 0; step--) {
        const previous = trace[step]
        const currentDiagonal = cursorX - cursorY
        const previousDown = previous.get(currentDiagonal + 1) ?? -1
        const previousRightward = previous.get(currentDiagonal - 1) ?? -1
        const previousDiagonal = currentDiagonal === -step || (currentDiagonal !== step && previousRightward < previousDown)
          ? currentDiagonal + 1
          : currentDiagonal - 1
        const previousX = Math.max(0, previous.get(previousDiagonal) ?? 0)
        const previousY = previousX - previousDiagonal

        while (cursorX > previousX && cursorY > previousY) {
          segments.push({ type: 'equal', text: left[cursorX - 1] })
          cursorX--
          cursorY--
        }
        if (step === 0) break
        if (cursorX === previousX) {
          segments.push({ type: 'insert', text: right[cursorY - 1] })
          cursorY--
        } else {
          segments.push({ type: 'delete', text: left[cursorX - 1] })
          cursorX--
        }
      }
      return compact(segments.reverse())
    }
  }
  return null
}

function tokenDiff(before, after) {
  const left = tokenise(before)
  const right = tokenise(after)
  // Large scenes use Myers' edit-distance algorithm. Its cost follows the
  // number of actual edits rather than multiplying the lengths of both texts,
  // so two small edits far apart stay separate instead of the old fallback
  // falsely replacing everything between them.
  if (left.length * right.length > 1_500_000) {
    return myersTokenDiff(left, right) || prefixSuffixDiff(before, after)
  }

  const rows = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1))
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      rows[i][j] = left[i] === right[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1])
    }
  }

  const segments = []
  let i = 0
  let j = 0
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      segments.push({ type: 'equal', text: left[i++] })
      j++
    } else if (j < right.length && (i === left.length || rows[i][j + 1] > rows[i + 1][j])) {
      segments.push({ type: 'insert', text: right[j++] })
    } else {
      segments.push({ type: 'delete', text: left[i++] })
    }
  }
  return compact(segments)
}

function lcsDiff(before, after) {
  // Lock exact unchanged text at both ends before asking the token LCS to
  // align the edited middle. Without these anchors, repeated words can give
  // the LCS several equally long answers; it may then match an appended
  // sentence to an earlier occurrence and present an untouched paragraph as
  // deleted/reinserted. Prefix/suffix anchoring makes simple insertions and
  // deletions deterministic and also reduces the matrix for long scenes.
  let prefixLength = 0
  const commonLimit = Math.min(before.length, after.length)
  while (prefixLength < commonLimit && before[prefixLength] === after[prefixLength]) prefixLength++

  let suffixLength = 0
  while (
    suffixLength < commonLimit - prefixLength
    && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) suffixLength++

  const beforeMiddle = before.slice(prefixLength, before.length - suffixLength)
  const afterMiddle = after.slice(prefixLength, after.length - suffixLength)
  const middle = beforeMiddle || afterMiddle ? tokenDiff(beforeMiddle, afterMiddle) : []
  return compact([
    { type: 'equal', text: before.slice(0, prefixLength) },
    ...middle,
    { type: 'equal', text: before.slice(before.length - suffixLength) },
  ])
}

const stripSegmentPositions = segments => compact((segments || [])
  .filter(segment => ['equal', 'delete', 'insert'].includes(segment?.type) && typeof segment.text === 'string')
  .map(segment => ({ type: segment.type, text: segment.text })))

export const trackedSegmentsToContent = (segments = []) => ({
  baseContent: stripSegmentPositions(segments)
    .filter(segment => segment.type !== 'insert')
    .map(segment => segment.text)
    .join(''),
  proposedContent: stripSegmentPositions(segments)
    .filter(segment => segment.type !== 'delete')
    .map(segment => segment.text)
    .join(''),
})

export function createTrackedSegments(baseContent = '', proposedContent = '') {
  return normaliseReplacementRuns(lcsDiff(String(baseContent), String(proposedContent)))
}

function deleteProposedRange(segments, start, end) {
  if (end <= start) return stripSegmentPositions(segments)
  const next = []
  let proposedOffset = 0
  stripSegmentPositions(segments).forEach(segment => {
    if (segment.type === 'delete') {
      next.push(segment)
      return
    }
    const segmentStart = proposedOffset
    const segmentEnd = proposedOffset + segment.text.length
    proposedOffset = segmentEnd
    if (segmentEnd <= start || segmentStart >= end) {
      next.push(segment)
      return
    }
    const beforeLength = Math.max(0, start - segmentStart)
    const afterStart = Math.min(segment.text.length, Math.max(0, end - segmentStart))
    if (beforeLength) next.push({ type: segment.type, text: segment.text.slice(0, beforeLength) })
    const removed = segment.text.slice(beforeLength, afterStart)
    if (removed && segment.type === 'equal') next.push({ type: 'delete', text: removed })
    if (afterStart < segment.text.length) next.push({ type: segment.type, text: segment.text.slice(afterStart) })
  })
  return compact(next)
}

function insertAtProposedOffset(segments, offset, text) {
  if (!text) return stripSegmentPositions(segments)
  const next = []
  let proposedOffset = 0
  let inserted = false
  for (const segment of stripSegmentPositions(segments)) {
    if (segment.type === 'delete') {
      next.push(segment)
      continue
    }
    const segmentEnd = proposedOffset + segment.text.length
    if (!inserted && offset >= proposedOffset && offset <= segmentEnd) {
      const local = Math.max(0, Math.min(segment.text.length, offset - proposedOffset))
      if (local) next.push({ type: segment.type, text: segment.text.slice(0, local) })
      next.push({ type: 'insert', text })
      if (local < segment.text.length) next.push({ type: segment.type, text: segment.text.slice(local) })
      inserted = true
    } else {
      next.push(segment)
    }
    proposedOffset = segmentEnd
  }
  if (!inserted) next.push({ type: 'insert', text })
  return compact(next)
}

export function applyTrackedEdit(segments, proposedStart, proposedEnd, insertedText = '') {
  const current = trackedSegmentsToContent(segments).proposedContent
  const start = Math.max(0, Math.min(Number(proposedStart) || 0, current.length))
  const end = Math.max(start, Math.min(Number(proposedEnd) || start, current.length))
  return normaliseReplacementRuns(
    insertAtProposedOffset(deleteProposedRange(segments, start, end), start, String(insertedText)),
  )
}

export function applyTrackedContentChange(segments, nextContent = '') {
  const previous = trackedSegmentsToContent(segments).proposedContent
  const next = String(nextContent)
  if (previous === next) return stripSegmentPositions(segments)
  let prefix = 0
  const limit = Math.min(previous.length, next.length)
  while (prefix < limit && previous[prefix] === next[prefix]) prefix++
  let suffix = 0
  while (
    suffix < limit - prefix
    && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) suffix++
  return applyTrackedEdit(
    segments,
    prefix,
    previous.length - suffix,
    next.slice(prefix, next.length - suffix),
  )
}

export function buildTrackedDiff(baseContent = '', proposedContent = '', storedSegments = null) {
  const base = String(baseContent)
  const proposed = String(proposedContent)
  const candidate = stripSegmentPositions(storedSegments)
  const candidateContent = trackedSegmentsToContent(candidate)
  const segments = candidate.length
    && candidateContent.baseContent === base
    && candidateContent.proposedContent === proposed
    ? candidate
    : createTrackedSegments(base, proposed)
  const positionedSegments = []
  const changes = []
  let baseOffset = 0
  let proposedOffset = 0
  let active = null

  const finish = () => {
    if (!active) return
    changes.push({
      ...active,
      before: active.beforeParts.join(''),
      after: active.afterParts.join(''),
    })
    active = null
  }

  segments.forEach(segment => {
    const segmentBaseStart = baseOffset
    const segmentProposedStart = proposedOffset
    if (segment.type === 'equal') {
      finish()
      baseOffset += segment.text.length
      proposedOffset += segment.text.length
      positionedSegments.push({
        ...segment,
        baseStart: segmentBaseStart,
        baseEnd: baseOffset,
        proposedStart: segmentProposedStart,
        proposedEnd: proposedOffset,
      })
      return
    }
    if (!active) {
      active = {
        baseStart: baseOffset,
        baseEnd: baseOffset,
        proposedStart: proposedOffset,
        proposedEnd: proposedOffset,
        beforeParts: [],
        afterParts: [],
      }
    }
    if (segment.type === 'delete') {
      active.beforeParts.push(segment.text)
      baseOffset += segment.text.length
      active.baseEnd = baseOffset
    } else {
      active.afterParts.push(segment.text)
      proposedOffset += segment.text.length
      active.proposedEnd = proposedOffset
    }
    positionedSegments.push({
      ...segment,
      baseStart: segmentBaseStart,
      baseEnd: baseOffset,
      proposedStart: segmentProposedStart,
      proposedEnd: proposedOffset,
    })
  })
  finish()
  const indexedSegments = []
  let changeIndex = -1
  let insideChange = false
  for (const segment of positionedSegments) {
    if (segment.type === 'equal') {
      indexedSegments.push(segment)
      insideChange = false
      continue
    }
    if (!insideChange) changeIndex += 1
    indexedSegments.push({ ...segment, changeIndex })
    insideChange = true
  }
  return { segments: indexedSegments, changes }
}

export const hasTrackedChanges = tracked => Boolean(
  tracked && String(tracked.baseContent ?? '') !== String(tracked.proposedContent ?? '')
)

export function acceptTrackedChange(tracked, index) {
  const baseContent = String(tracked?.baseContent ?? '')
  const proposedContent = String(tracked?.proposedContent ?? '')
  const diff = buildTrackedDiff(baseContent, proposedContent, tracked?.segments)
  const change = diff.changes[index]
  if (!change) return { baseContent, proposedContent, acceptedChange: null }
  const segments = compact(diff.segments.map(segment => {
    if (segment.changeIndex !== index) return { type: segment.type, text: segment.text }
    if (segment.type === 'delete') return null
    if (segment.type === 'insert') return { type: 'equal', text: segment.text }
    return { type: segment.type, text: segment.text }
  }).filter(Boolean))
  const content = trackedSegmentsToContent(segments)
  return {
    ...content,
    segments,
    acceptedChange: change,
  }
}

export function rejectTrackedChange(tracked, index) {
  const baseContent = String(tracked?.baseContent ?? '')
  const proposedContent = String(tracked?.proposedContent ?? '')
  const diff = buildTrackedDiff(baseContent, proposedContent, tracked?.segments)
  const change = diff.changes[index]
  if (!change) return { baseContent, proposedContent }
  const segments = compact(diff.segments.map(segment => {
    if (segment.changeIndex !== index) return { type: segment.type, text: segment.text }
    if (segment.type === 'insert') return null
    if (segment.type === 'delete') return { type: 'equal', text: segment.text }
    return { type: segment.type, text: segment.text }
  }).filter(Boolean))
  return { ...trackedSegmentsToContent(segments), segments }
}

const shiftOffsetForChange = (offset, change) => {
  const value = Number(offset)
  if (!Number.isFinite(value)) return offset
  const removedLength = change.baseEnd - change.baseStart
  const delta = change.after.length - removedLength
  if (value >= change.baseEnd) {
    return Math.max(0, value + delta)
  }
  if (value > change.baseStart && value < change.baseEnd) return change.baseStart
  return value
}

export function shiftNotesForAcceptedChange(notes = [], change) {
  if (!change) return notes
  return notes.map(note => {
    const anchorOffset = shiftOffsetForChange(note.anchorOffset, change)
    const anchorEndOffset = shiftOffsetForChange(note.anchorEndOffset, change)
    return {
      ...note,
      anchorOffset,
      anchorEndOffset: Math.max(anchorOffset ?? 0, anchorEndOffset ?? anchorOffset ?? 0),
    }
  })
}

export function shiftNotesForAcceptedDraft(notes = [], tracked) {
  let shifted = notes
  let accumulatedDelta = 0
  buildTrackedDiff(tracked?.baseContent, tracked?.proposedContent, tracked?.segments).changes.forEach(change => {
    const adjusted = {
      ...change,
      baseStart: change.baseStart + accumulatedDelta,
      baseEnd: change.baseEnd + accumulatedDelta,
    }
    shifted = shiftNotesForAcceptedChange(shifted, adjusted)
    accumulatedDelta += change.after.length - (change.baseEnd - change.baseStart)
  })
  return shifted
}
