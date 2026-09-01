export const sortOutlineItems = (items = []) => (
  [...items].sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0))
)

export const formatOutlineChapterTitle = (chapter, label, number) => {
  const title = String(chapter?.title || '').trim()
  const isDefaultTitle = !title || title.toLowerCase().startsWith(label.toLowerCase())
  return isDefaultTitle ? `${label} ${number}` : `${label} ${number}: ${title}`
}

export const getOutlineSceneTitle = (scene, label, number) => {
  const title = String(scene?.title || '').trim()
  return {
    number: `${label} ${number}`,
    title: title && title !== label ? title : '',
  }
}
