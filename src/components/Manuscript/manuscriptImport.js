const normalizedTitle = value => String(value || '')
  .trim()
  .toLocaleLowerCase()
  .replace(/[\u2018\u2019'"“”]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const GENERIC_ACT = /^(?:act|part|book)(?:\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten))?$/i
const GENERIC_CHAPTER = /^(?:chapter|session|episode)(?:\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten))?$/i

const findStructuralMatch = (items, importedTitle, importedIndex, genericPattern, usedIds = new Set()) => {
  const title = normalizedTitle(importedTitle)
  const exact = items.find(item => !usedIds.has(item.id) && normalizedTitle(item.title) === title)
  if (exact) return exact
  const positional = items[importedIndex]
  if (positional && !usedIds.has(positional.id) && genericPattern.test(title) && genericPattern.test(normalizedTitle(positional.title))) return positional
  return null
}

/**
 * Import a parsed DOCX without duplicating an existing matching outline.
 * Existing prose is never overwritten: imported scenes fill empty scene slots,
 * then any remainder is appended inside the matched chapter.
 */
export function mergeImportedManuscript({
  importedActs,
  acts,
  chapters,
  scenes,
  labels,
  addAct,
  addChapter,
  addScene,
  updateScene,
  updateSceneContent,
}) {
  const workingActs = [...acts].sort((a, b) => a.order - b.order)
  const workingChapters = [...chapters]
  const workingScenes = [...scenes]
  const usedActIds = new Set()
  const usedChapterIds = new Set()
  const summary = { actsCreated: 0, chaptersCreated: 0, scenesCreated: 0, scenesFilled: 0 }

  importedActs.forEach((importedAct, actIndex) => {
    let targetAct = findStructuralMatch(workingActs, importedAct.title, actIndex, GENERIC_ACT, usedActIds)
    if (!targetAct) {
      targetAct = addAct(importedAct.title)
      if (!targetAct) throw new Error(`Could not create ${labels.level1.toLowerCase()} “${importedAct.title}”.`)
      workingActs.push(targetAct)
      summary.actsCreated += 1
    }
    usedActIds.add(targetAct.id)

    const actChapters = workingChapters
      .filter(chapter => chapter.actId === targetAct.id)
      .sort((a, b) => a.order - b.order)

    importedAct.chapters.forEach((importedChapter, chapterIndex) => {
      let targetChapter = findStructuralMatch(actChapters, importedChapter.title, chapterIndex, GENERIC_CHAPTER, usedChapterIds)
      if (!targetChapter) {
        targetChapter = addChapter(targetAct.id, importedChapter.title)
        if (!targetChapter) throw new Error(`Could not create ${labels.level2.toLowerCase()} “${importedChapter.title}”.`)
        actChapters.push(targetChapter)
        workingChapters.push(targetChapter)
        summary.chaptersCreated += 1
      }
      usedChapterIds.add(targetChapter.id)

      const emptySlots = workingScenes
        .filter(scene => scene.chapterId === targetChapter.id && !String(scene.content || '').trim())
        .sort((a, b) => a.order - b.order)

      importedChapter.scenes.forEach(importedScene => {
        const emptyScene = emptySlots.shift()
        if (emptyScene) {
          if (importedScene.title && importedScene.title !== labels.level3) {
            updateScene?.(emptyScene.id, { title: importedScene.title })
          }
          if (importedScene.content?.trim()) updateSceneContent(emptyScene.id, importedScene.content)
          summary.scenesFilled += 1
          return
        }

        const created = addScene(targetChapter.id, importedScene.title || labels.level3)
        if (!created) throw new Error(`Could not create an imported ${labels.level3.toLowerCase()}.`)
        workingScenes.push(created)
        if (importedScene.content?.trim()) updateSceneContent(created.id, importedScene.content)
        summary.scenesCreated += 1
      })

      if (importedChapter.scenes.length === 0 && !workingScenes.some(scene => scene.chapterId === targetChapter.id)) {
        const created = addScene(targetChapter.id, labels.level3)
        if (!created) throw new Error(`Could not create an empty ${labels.level3.toLowerCase()}.`)
        workingScenes.push(created)
        summary.scenesCreated += 1
      }
    })
  })

  return summary
}
