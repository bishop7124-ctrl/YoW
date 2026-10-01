const SENTENCE_RE = /[^.!?\n]+(?:[.!?]+|$)/g

const clean = value => String(value || '').replace(/\r/g, '').trim()

function sentenceRecords(text, chapterId, chapterTitle, offsetBase = 0) {
  const records = []
  for (const match of text.matchAll(SENTENCE_RE)) {
    const value = clean(match[0])
    if (!value) continue
    records.push({
      id: `${chapterId}:sentence:${records.length + 1}`,
      text: value,
      start: offsetBase + match.index,
      end: offsetBase + match.index + match[0].length,
      chapterId,
      chapterTitle,
    })
  }
  return records
}

/**
 * Convert the existing DOCX import shape into the local discovery document.
 * @returns {import('./types.js').ManuscriptDocument}
 */
export function buildManuscriptDocument(acts = [], manuscriptId = 'pending-manuscript') {
  let chapterOrder = 0
  const chapters = []
  acts.forEach((act, actIndex) => {
    ;(act.chapters || []).forEach((chapter, chapterIndex) => {
      const id = `${manuscriptId}:chapter:${chapterOrder + 1}`
      let cursor = 0
      const scenes = (chapter.scenes || []).map((scene, sceneIndex) => {
        const text = clean(scene.content)
        const start = cursor
        cursor += text.length + 2
        return {
          id: `${id}:scene:${sceneIndex + 1}`,
          title: clean(scene.title) || `Scene ${sceneIndex + 1}`,
          order: sceneIndex,
          text,
          start,
          end: start + text.length,
        }
      })
      const text = scenes.map(scene => scene.text).filter(Boolean).join('\n\n')
      const paragraphs = []
      for (const match of text.matchAll(/[^\n]+(?:\n+|$)/g)) {
        const value = clean(match[0])
        if (value) paragraphs.push({ text: value, start: match.index, end: match.index + match[0].length })
      }
      chapters.push({
        id,
        manuscriptId,
        actTitle: clean(act.title) || `Act ${actIndex + 1}`,
        sourceActIndex: actIndex,
        sourceChapterIndex: chapterIndex,
        title: clean(chapter.title) || `Chapter ${chapterOrder + 1}`,
        order: chapterOrder++,
        text,
        scenes,
        paragraphs,
        sentences: sentenceRecords(text, id, clean(chapter.title) || `Chapter ${chapterOrder}`),
        wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
      })
    })
  })
  return { id: manuscriptId, chapters, wordCount: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0) }
}

export function evidenceFor(chapter, match, reason) {
  const start = Math.max(0, Number(match.index || 0) - 70)
  const end = Math.min(chapter.text.length, Number(match.index || 0) + String(match[0] || '').length + 90)
  return {
    manuscriptId: chapter.manuscriptId,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    excerpt: chapter.text.slice(start, end).replace(/\s+/g, ' ').trim(),
    start: Number(match.index || 0),
    end: Number(match.index || 0) + String(match[0] || '').length,
    reason,
  }
}
