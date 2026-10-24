// Account transitions are serialized even if authentication changes twice
// while disk is busy. A failed archive stays at the head: retrying must never
// skip it and purge the only durable copy in a later transition.
export function createAccountStorageQueue() {
  const pending = []
  let running = null
  const flush = () => {
    if (running) return running
    running = (async () => {
      while (pending.length) {
        await pending[0]()
        pending.shift()
      }
    })()
    const operation = running
    operation.then(() => { running = null }, () => { running = null })
    return operation
  }
  return { flush, enqueue: task => { pending.push(task); return flush() } }
}
