import { useRef, useState, useCallback, useEffect } from 'react'

// If no new data arrives for this long, treat the run as stalled and surface an error
// instead of leaving the spinner running forever.
const STALL_MS = 90000

// Shared progress/cancel/timeout controls for long-running AI tool streams.
// Each tool keeps its own run()/onDone/onError parsing logic; this just tracks
// how much has streamed back so far and guards against a hung request.
export function useAiRunControls() {
  const [progressChars, setProgressChars] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const controllerRef = useRef(null)
  const timerRef = useRef(null)
  const elapsedTimerRef = useRef(null)

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }
  const clearElapsedTimer = () => {
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
  }

  useEffect(() => () => { clearTimer(); clearElapsedTimer(); controllerRef.current?.abort() }, [])

  const begin = useCallback((onStall) => {
    clearTimer()
    clearElapsedTimer()
    const controller = new AbortController()
    controllerRef.current = controller
    setProgressChars(0)
    setElapsedMs(0)
    const startedAt = Date.now()
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    const arm = () => {
      clearTimer()
      timerRef.current = setTimeout(() => { controller.abort(); onStall() }, STALL_MS)
    }
    arm()
    return {
      signal: controller.signal,
      onChunkLength: (len) => { setProgressChars(len); arm() },
      finish: () => { clearTimer(); clearElapsedTimer() },
    }
  }, [])

  const cancel = useCallback(() => {
    clearTimer()
    clearElapsedTimer()
    controllerRef.current?.abort()
  }, [])

  return { progressChars, elapsedMs, begin, cancel }
}

export const STALL_ERROR_TEXT = 'This is taking longer than expected. The request was cancelled — check your connection and try again.'
