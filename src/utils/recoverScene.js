// Re-creates a deleted scene from its last saved version. Reports success only when the recovered
// text was actually written to the new scene; on any failure the half-made empty scene is removed
// again, so the caller never believes a recovery worked when it did not.
export function recoverScene({ addScene, updateScene, deleteScene, saveVersion }, chapterId, { title, content }) {
  if (!chapterId) return false
  const created = addScene(chapterId, title || 'Recovered scene')
  if (!created) return false
  const text = typeof content === 'string' ? content : ''
  const updated = updateScene(created.id, { content: text })
  if (!updated || (text && updated.content !== text)) {
    deleteScene?.(created.id)
    return false
  }
  saveVersion?.({ ...created, content: text }, 'restore')
  return true
}
