// One AI request at a time per panel, with a way to tell a live request from an old one (audit AUD-07).
//
// Before this, Stop only set a shared flag. The provider request kept running and spending tokens, and after the
// writer sent a follow-up the old request's late callbacks could overwrite the newer conversation. Each request now
// gets its own AbortController (passed to the network call) and an `isCurrent()` check every callback must make
// first; starting a new request or calling stop() makes every earlier request stale at once.

export function createRunGuard() {
  let current = null
  return {
    start() {
      current?.controller.abort()
      const run = { controller: new AbortController() }
      current = run
      return { signal: run.controller.signal, isCurrent: () => current === run }
    },
    stop() {
      current?.controller.abort()
      current = null
    },
    get active() { return current !== null },
  }
}
