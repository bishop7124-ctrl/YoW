// Account-load generations. A cloud load started for account A can settle after
// the user signed out or account B signed in; its continuation must then do
// nothing, or A's data lands in B's workspace. `begin` returns the same token
// for repeated effect runs of one signed-in account (so its own load is not
// cancelled by an unrelated re-render) and a fresh token whenever the account
// changes or `invalidate` (sign-out) was called in between.
export function createAccountLoadGuard() {
  let generation = 0
  let activeUserId = null
  return {
    begin(userId) {
      if (activeUserId !== userId) {
        generation += 1
        activeUserId = userId
      }
      return generation
    },
    invalidate() {
      generation += 1
      activeUserId = null
    },
    isCurrent(token) {
      return token === generation
    },
  }
}
