import {
  cleanText, formatDate, sortByOrder, sortByTitle, valueList,
  isCampaignProject, isComicProject, sessionExportRows,
  getEnabled, buildOutline, wordCount, buildSummaryStats,
  getProjectExportLabel, getProjectDocxFilename, downloadBlob,
} from './projectExportHelpers.js'

const addDocParagraphs = (children, { Paragraph, TextRun }, text, options = {}) => {
  const blocks = cleanText(text).split(/\n{2,}/).map(block => block.trim()).filter(Boolean)
  blocks.forEach(block => {
    children.push(new Paragraph({
      children: [new TextRun({ text: block.replace(/\n/g, ' '), size: 22 })],
      spacing: { after: 160 },
      ...options,
    }))
  })
}

const addDocHeading = (children, docx, text, level = docx.HeadingLevel.HEADING_1) => {
  children.push(new docx.Paragraph({
    text,
    heading: level,
    spacing: { before: 260, after: 160 },
  }))
}

const addDocFields = (children, docx, fields) => {
  fields.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '').forEach(([label, value]) => {
    children.push(new docx.Paragraph({
      children: [
        new docx.TextRun({ text: `${label}: `, bold: true, size: 20 }),
        new docx.TextRun({ text: String(value), size: 20 }),
      ],
      spacing: { after: 80 },
    }))
  })
}

export const createProjectDocxBlob = async (projectData) => {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } = docx
  const enabled = getEnabled(projectData)
  const children = []
  const project = projectData.project ?? {}

  children.push(new Paragraph({
    children: [new TextRun({ text: project.title || 'Untitled Project', bold: true, size: 54 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  }))
  children.push(new Paragraph({
    children: [new TextRun({ text: getProjectExportLabel(project), italics: true, size: 26 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 420 },
  }))
  addDocFields(children, docx, [
    ['Description', project.description],
    ['Exported', formatDate(new Date().toISOString())],
    ...buildSummaryStats(projectData),
  ])

  if (enabled.has('outline') && isComicProject(project)) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Comic Script')
    const { acts = [], chapters = [], comicPages = [], comicPanels = [] } = projectData
    sortByOrder(acts).forEach(volume => {
      addDocHeading(children, docx, volume.title || 'Untitled Volume', HeadingLevel.HEADING_2)
      addDocParagraphs(children, docx, volume.synopsis)
      sortByOrder(chapters.filter(c => c.actId === volume.id)).forEach((issue, issueIndex) => {
        addDocHeading(children, docx, issue.title || `Issue ${issueIndex + 1}`, HeadingLevel.HEADING_3)
        addDocParagraphs(children, docx, issue.synopsis)
        const issuePages = sortByOrder(comicPages.filter(p => p.issueId === issue.id))
        issuePages.forEach((page, pageIndex) => {
          const pageNum = pageIndex + 1
          const pageLabel = page.title ? `Page ${pageNum} — ${page.title}` : `Page ${pageNum}`
          const pageMeta = [page.pageType, page.status, page.pageTurn !== 'none' && page.pageTurn ? `page turn: ${page.pageTurn}` : null].filter(Boolean).join(' · ')
          children.push(new Paragraph({
            children: [
              new TextRun({ text: pageLabel, bold: true, size: 22 }),
              ...(pageMeta ? [new TextRun({ text: `  ${pageMeta}`, italics: true, size: 18 })] : []),
            ],
            spacing: { before: 160, after: 60 },
          }))
          if (page.summary) addDocParagraphs(children, docx, page.summary, { indent: { left: 180 } })
          if (page.visualDirection) addDocFields(children, docx, [['Visual direction', page.visualDirection]])
          if (page.productionNotes) addDocFields(children, docx, [['Production notes', page.productionNotes]])

          const panels = sortByOrder(comicPanels.filter(p => p.pageId === page.id))
          if (!panels.length) {
            children.push(new Paragraph({ children: [new TextRun({ text: '(no panels)', italics: true, size: 18, color: '888888' })], indent: { left: 360 }, spacing: { after: 60 } }))
          }
          panels.forEach((panel, panelIndex) => {
            const panelLabel = `Panel ${panelIndex + 1}`
            const panelMeta = [panel.shotType, panel.layoutHint].filter(Boolean).join(', ')
            children.push(new Paragraph({
              children: [
                new TextRun({ text: panelLabel, bold: true, size: 20 }),
                ...(panelMeta ? [new TextRun({ text: `  ${panelMeta}`, italics: true, size: 18 })] : []),
              ],
              indent: { left: 360 },
              spacing: { before: 100, after: 40 },
            }))
            if (panel.description) addDocParagraphs(children, docx, panel.description, { indent: { left: 540 } })
            if (panel.artNotes) addDocFields(children, docx, [['Art notes', panel.artNotes]])
            ;(panel.captions ?? []).forEach(cap => {
              const capLabel = cap.type ? `Caption (${cap.type})` : 'Caption'
              addDocFields(children, docx, [[capLabel, cap.text]])
            })
            ;(panel.dialogue ?? []).forEach(line => {
              const speaker = line.speaker ? `${line.speaker}:` : 'Balloon:'
              addDocFields(children, docx, [[speaker, line.text]])
            })
            ;(panel.sfx ?? []).forEach(fx => {
              addDocFields(children, docx, [['SFX', fx.text]])
            })
            if (panel.continuityNotes) addDocFields(children, docx, [['Continuity', panel.continuityNotes]])
          })
        })
        if (!issuePages.length) {
          children.push(new Paragraph({ children: [new TextRun({ text: '(no pages)', italics: true, size: 18, color: '888888' })], indent: { left: 360 }, spacing: { after: 60 } }))
        }
      })
    })
  } else if (enabled.has('outline')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, isCampaignProject(project) ? 'Campaign Sessions' : 'Story Outline')
    buildOutline(projectData).forEach(({ act, chapters }) => {
      addDocHeading(children, docx, act.title || 'Untitled Act', HeadingLevel.HEADING_2)
      addDocParagraphs(children, docx, act.synopsis)
      chapters.forEach(({ chapter, scenes }, chapterIndex) => {
        addDocHeading(children, docx, chapter.title || `Chapter ${chapterIndex + 1}`, HeadingLevel.HEADING_3)
        addDocParagraphs(children, docx, chapter.synopsis)
        if (isCampaignProject(project)) {
          addDocFields(children, docx, sessionExportRows(chapter))
        }
        scenes.forEach(scene => {
          const title = scene.title && scene.title !== 'Scene' ? scene.title : 'Scene'
          children.push(new Paragraph({
            children: [
              new TextRun({ text: title, bold: true, size: 20 }),
              new TextRun({ text: ` (${wordCount(scene.content)} words)`, italics: true, size: 18 }),
            ],
            spacing: { before: 80, after: 80 },
          }))
          addDocParagraphs(children, docx, scene.synopsis || scene.summary || scene.content, { indent: { left: 360 } })
        })
      })
    })
  }

  if (enabled.has('characters')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Characters')
    sortByTitle(projectData.characters, 'name').forEach(character => {
      addDocHeading(children, docx, character.name || 'Unnamed Character', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Role', character.role],
        ['Alias', character.keywords?.join(', ')],
        ['Age', character.age],
        ['Birth', character.birthDate],
        ['Death', character.deathDate],
        ['Family', character.familyGroup],
        ['External goal', character.externalGoal],
        ['Internal goal', character.internalGoal],
      ])
      addDocParagraphs(children, docx, character.bio || character.description || character.notes)
      if (character.journey) {
        const journey = character.journey
        addDocHeading(children, docx, 'Character Journey', HeadingLevel.HEADING_3)
        addDocFields(children, docx, [
          ['Arc type', journey.arcType],
          ['Scope', journey.scope === 'series' ? 'Across the series' : 'This project'],
          ['Starting state', journey.startingState],
          ['Ending state', journey.endingState],
          ['Core wound', journey.coreWound],
          ['Core fear', journey.fear],
          ['Lie believed', journey.lieBelieved],
          ['Truth to learn', journey.truthLearned],
          ['Want', journey.want],
          ['Need', journey.need],
          ['Fatal flaw', journey.fatalFlaw],
          ['Strength', journey.strength],
          ['Internal conflict', journey.internalConflict],
          ['External conflict', journey.externalConflict],
          ['Beginning belief', journey.beginningBelief],
          ['Ending belief', journey.endingBelief],
          ['Beginning goal', journey.beginningGoal],
          ['Ending goal', journey.endingGoal],
          ['Beginning fear', journey.beginningFear],
          ['Ending fear', journey.endingFear],
          ['Beginning relationships', journey.beginningRelationships],
          ['Ending relationships', journey.endingRelationships],
        ])
        addDocParagraphs(children, docx, journey.notes)
        ;[...(journey.beats || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).forEach((beat, index) => {
          addDocHeading(children, docx, `${index + 1}. ${beat.title || 'Untitled beat'}`, HeadingLevel.HEADING_3)
          addDocFields(children, docx, [
            ['Story phase', beat.storyPhase === 'Custom' ? beat.customPhase : beat.storyPhase],
            ['Major turning point', beat.isMajorTurningPoint ? 'Yes' : ''],
            ['Emotional state', beat.emotionalState],
            ['Belief', beat.belief],
            ['Goal', beat.goal],
            ['Conflict', beat.conflict],
            ['Choice made', beat.choiceMade],
            ['Consequence', beat.consequence],
          ])
          addDocParagraphs(children, docx, beat.description)
        })
      }
    })
  }

  if (enabled.has('locations')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Locations')
    sortByTitle(projectData.locations, 'name').forEach(location => {
      addDocHeading(children, docx, location.name || 'Unnamed Location', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Type', location.type],
        ['Region', location.region],
        ['Tags', location.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, location.description || location.notes || location.content)
    })
  }

  if (enabled.has('factions')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Factions')
    sortByTitle(projectData.factions, 'name').forEach(faction => {
      addDocHeading(children, docx, faction.name || 'Unnamed Faction', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Type', faction.type],
        ['Leader', faction.leader],
        ['Status', faction.status],
      ])
      addDocParagraphs(children, docx, faction.description || faction.notes)
    })
  }

  if (enabled.has('lore')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Lore')
    sortByTitle(projectData.loreEntries).forEach(entry => {
      addDocHeading(children, docx, entry.title || 'Untitled Lore Entry', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Category', entry.category || 'Uncategorized'],
        ['Tags', entry.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, entry.content)
    })
  }

  if (enabled.has('ideas')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Notes')
    sortByTitle(projectData.ideaEntries).forEach(entry => {
      addDocHeading(children, docx, entry.title || 'Untitled Note', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [['Tags', entry.tags?.join(', ')]])
      addDocParagraphs(children, docx, entry.content || entry.text || entry.body)
    })
  }

  if (enabled.has('timeline')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'Timeline')
    sortByOrder(projectData.timeline).forEach(event => {
      addDocHeading(children, docx, event.title || 'Untitled Event', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Date', valueList(event.date, event.year).join(' ')],
        ['Tags', event.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, event.description || event.content || event.notes)
    })
  }

  if (enabled.has('worldhistory')) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
    addDocHeading(children, docx, 'World History')
    sortByOrder(projectData.worldHistory).forEach(entry => {
      addDocHeading(children, docx, entry.title || 'Untitled History Entry', HeadingLevel.HEADING_2)
      addDocFields(children, docx, [
        ['Era', entry.era],
        ['Date', valueList(entry.date, entry.year).join(' ')],
        ['Tags', entry.tags?.join(', ')],
      ])
      addDocParagraphs(children, docx, entry.content || entry.description || entry.notes)
    })
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  return Packer.toBlob(doc)
}

export const downloadProjectDocx = async (projectData) => {
  const blob = await createProjectDocxBlob(projectData)
  downloadBlob(blob, getProjectDocxFilename(projectData.project))
}
