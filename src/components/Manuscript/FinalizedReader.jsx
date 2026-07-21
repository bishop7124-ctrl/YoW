import { useMemo } from 'react'
import { getProjectType } from '../../constants/projectTypes'
import {
  formatFinalizedDate, paginateFinalizedDraft,
  buildScriptBlocks, SCRIPT_TYPES, decodeHtmlEntities,
} from './manuscriptUtils.js'
import { downloadBlob } from '../../utils/projectExportHelpers.js'

function renderInlineMarkdown(text, keyPrefix = '') {
  if (!text) return []
  const parts = []
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  let last = 0, m, idx = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[0].startsWith('**')) parts.push(<strong key={`${keyPrefix}-b${idx}`}>{m[2]}</strong>)
    else if (m[0].startsWith('*')) parts.push(<em key={`${keyPrefix}-i${idx}`}>{m[3]}</em>)
    else parts.push(<u key={`${keyPrefix}-u${idx}`}>{m[4]}</u>)
    last = m.index + m[0].length
    idx++
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function FinalPage({ page, draft, pageNumber }) {
  if (!page) return <div className="ms-final-page ms-final-page-blank" aria-hidden="true" />

  return (
    <section className="ms-final-page" aria-label={`Page ${pageNumber}`}>
      <div className="ms-final-page-content">
        {page.blocks.map(block => {
          if (block.type === 'cover') return (
            <div key={block.id} className="ms-final-page-cover">
              <p className="ms-final-kicker">Finalized draft</p>
              <h1>{decodeHtmlEntities(draft.projectTitle) || 'Untitled'}</h1>
              <p>{decodeHtmlEntities(draft.title)}</p>
              <span>{formatFinalizedDate(draft.finalizedAt)}</span>
            </div>
          )
          if (block.type === 'act') return <h2 key={block.id}>{block.text}</h2>
          if (block.type === 'chapter') return <h3 key={block.id}>{block.text}</h3>
          if (block.type === 'break') return <div key={block.id} className="ms-final-break" aria-hidden="true">* * *</div>
          if (block.type === 'empty') return <div key={block.id} className="ms-final-empty">This finalized draft does not contain any manuscript text.</div>
          return <p key={block.id}>{renderInlineMarkdown(block.text, block.id)}</p>
        })}
      </div>
      <footer>{pageNumber}</footer>
    </section>
  )
}

function FinalizedPageReader({ draft, pageIndex, onPageIndexChange }) {
  const pages = useMemo(() => paginateFinalizedDraft(draft), [draft])
  const maxIndex = Math.max(0, pages.length - 1)
  const currentIndex = Math.min(Math.max(0, pageIndex), maxIndex)
  const leftPage = pages[currentIndex]
  const rightPage = pages[currentIndex + 1] || null
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex + 2 < pages.length
  const currentLabel = rightPage
    ? `${currentIndex + 1}-${currentIndex + 2}`
    : `${currentIndex + 1}`

  return (
    <main className="manuscript-page ms-final-reader ms-final-reader-paged workspace-page flex-1 overflow-y-auto min-w-0">
      <div className="ms-final-page-shell">
        <div className="ms-final-page-controls font-sans">
          <button
            className="ms-final-page-btn"
            onClick={() => onPageIndexChange(Math.max(0, currentIndex - 2))}
            disabled={!canGoPrev}
            aria-label="Previous pages"
          >
            Previous
          </button>
          <span>Pages {currentLabel} of {pages.length}</span>
          <button
            className="ms-final-page-btn"
            onClick={() => onPageIndexChange(Math.min(maxIndex, currentIndex + 2))}
            disabled={!canGoNext}
            aria-label="Next pages"
          >
            Next
          </button>
        </div>

        <div className="ms-final-book-spread">
          <FinalPage page={leftPage} draft={draft} pageNumber={currentIndex + 1} />
          <FinalPage page={rightPage} draft={draft} pageNumber={currentIndex + 2} />
        </div>
      </div>
    </main>
  )
}

export default function FinalizedReader({ draft, viewMode, pageIndex, onPageIndexChange }) {
  if (!draft) return null

  if (viewMode === 'pages') {
    return (
      <FinalizedPageReader
        draft={draft}
        pageIndex={pageIndex}
        onPageIndexChange={onPageIndexChange}
      />
    )
  }

  const visibleActs = (draft.acts || []).filter(act =>
    (act.chapters || []).some(chapter => (chapter.scenes || []).some(scene => scene.content?.trim()))
  )

  return (
    <main className="manuscript-page ms-final-reader workspace-page flex-1 overflow-y-auto scroll-smooth min-w-0">
      <article className="ms-final-book" aria-label="Finalized manuscript">
        <header className="ms-final-title-page">
          <p className="ms-final-kicker">Finalized draft</p>
          <h1>{decodeHtmlEntities(draft.projectTitle) || 'Untitled'}</h1>
          <p>{decodeHtmlEntities(draft.title)}</p>
          <span>{formatFinalizedDate(draft.finalizedAt)}</span>
        </header>

        {visibleActs.length === 0 && (
          <div className="ms-final-empty">This finalized draft does not contain any manuscript text.</div>
        )}

        {visibleActs.map((act, actIndex) => (
          <section key={act.id || actIndex} className="ms-final-act">
            {visibleActs.length > 1 && <h2>{decodeHtmlEntities(act.title)}</h2>}
            {(act.chapters || []).map((chapter, chapterIndex) => {
              const scenesWithText = (chapter.scenes || []).filter(scene => scene.content?.trim())
              if (!scenesWithText.length) return null
              return (
                <section key={chapter.id || chapterIndex} className="ms-final-chapter">
                  <h3>{decodeHtmlEntities(chapter.title)}</h3>
                  {scenesWithText.map((scene, sceneIndex) => (
                    <div key={scene.id || sceneIndex} className="ms-final-scene">
                      {sceneIndex > 0 && <div className="ms-final-break" aria-hidden="true">* * *</div>}
                      {decodeHtmlEntities(scene.content).trim().split(/\n{2,}/).map((block, blockIndex) => {
                        const text = block.split('\n').map(line => line.trim()).filter(Boolean).join(' ')
                        if (!text) return null
                        return <p key={blockIndex}>{renderInlineMarkdown(text, `${scene.id}-${blockIndex}`)}</p>
                      })}
                    </div>
                  ))}
                </section>
              )
            })}
          </section>
        ))}
      </article>
    </main>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export async function exportToDocx(novel, acts, chapters, scenes, chapterGlobalNumbers) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType, PageBreak } = await import('docx')
  const labels = getProjectType(novel?.type).structure || {}
  const isScriptProject = SCRIPT_TYPES.has(novel?.type)
  const children = []

  children.push(
    new Paragraph({
      children: [new TextRun({ text: decodeHtmlEntities(novel?.title) || 'Untitled', bold: true, size: 56, font: 'Times New Roman' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  )

  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  let firstAct = true

  sortedActs.forEach(act => {
    const actChapters = chapters.filter(c => c.actId === act.id).sort((a, b) => a.order - b.order)
    if (!actChapters.length) return

    if (!firstAct) children.push(new Paragraph({ children: [new PageBreak()] }))
    firstAct = false

    children.push(new Paragraph({ text: decodeHtmlEntities(act.title), heading: HeadingLevel.HEADING_1, spacing: { before: 0, after: 240 } }))

    actChapters.forEach((chap, chapIndex) => {
      const num = chapterGlobalNumbers[chap.id]
      const l2 = (labels.level2 || 'Chapter').toLowerCase()
      const isDefault = !chap.title || chap.title.toLowerCase().startsWith(l2)
      const chapTitle = isDefault ? `${labels.level2 || 'Chapter'} ${num}` : `${labels.level2 || 'Chapter'} ${num}: ${decodeHtmlEntities(chap.title)}`

      if (chapIndex > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
      children.push(new Paragraph({ text: chapTitle, heading: HeadingLevel.HEADING_2, spacing: { before: 0, after: 360 } }))

      const chapScenes = scenes.filter(s => s.chapterId === chap.id).sort((a, b) => a.order - b.order)

      chapScenes.forEach((scene, sceneIndex) => {
        if (sceneIndex > 0) {
          children.push(new Paragraph({
            children: [new TextRun({ text: '* * *' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
          }))
        }

        const content = decodeHtmlEntities(scene.content)?.trim()
        if (!content) return

        if (isScriptProject) {
          const blocks = scene.scriptBlocks?.length
            ? scene.scriptBlocks
            : buildScriptBlocks(content, scene.scriptElement || 'action')
          blocks.forEach(block => {
            if (!block.text?.trim()) return
            const type = block.type || scene.scriptElement || 'action'
            const text = block.text.split('\n').map(l => l.trim()).filter(Boolean).join(' ')
            const isCentered = type === 'character' || type === 'transition'
            children.push(new Paragraph({
              children: [new TextRun({ text, font: 'Courier New', size: 24, bold: type === 'character' || type === 'scene_heading' || type === 'transition' })],
              alignment: isCentered ? AlignmentType.CENTER : AlignmentType.LEFT,
              indent: type === 'dialogue' ? { left: 1800, right: 1440 } : type === 'parenthetical' ? { left: 2160, right: 1800 } : { left: 720, right: 720 },
              spacing: { before: type === 'scene_heading' ? 260 : 80, after: 80, line: 300 },
            }))
          })
          return
        }

        content.split(/\n{2,}/).forEach(block => {
          const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
          if (!lines.length) return
          children.push(new Paragraph({
            children: [new TextRun({ text: lines.join(' '), font: 'Times New Roman', size: 24 })],
            indent: { firstLine: 720 },
            spacing: { after: 0, line: 360 },
          }))
        })
      })
    })
  })

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  const exportName = getProjectType(novel?.type).workspaceLabel || 'manuscript'
  await downloadBlob(blob, `${(novel?.title || exportName).replace(/[^a-z0-9 ]/gi, '_')}.docx`)
}
