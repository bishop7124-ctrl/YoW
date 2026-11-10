// Which scene the Version history panel shows. It shows the scene it was opened for (`pick.sceneId`) until the
// writer clicks into a different scene (the active scene moves off `pick.anchor`), then it follows the active one.
// An active scene that no longer exists is ignored.
export function resolveHistorySceneId(activeSceneId, pick, scenes) {
  const follow = activeSceneId && activeSceneId !== pick?.anchor && Array.isArray(scenes) && scenes.some(s => s.id === activeSceneId)
  return follow ? activeSceneId : (pick?.sceneId ?? null)
}
