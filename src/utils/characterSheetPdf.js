// D&D party-character sheet PDF: a printable, portrait, D&D Beyond-style
// sheet (stat strip, ability scores, saves, skills, features, equipment,
// background, spellcasting) built from a Character Builder entry. Reuses the
// project PDF writer so no extra dependency is needed. Private "secrets",
// journal and session notes are never included.
import {
  makePdfCanvas, createPdfBytes, convertImageToJpegResource, measureText, wrapPdfText,
} from './projectExportPdf.js'
import { sanitizeFilename, downloadBlob } from './projectExportHelpers.js'
import {
  RACES, CLASSES, BACKGROUNDS, ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT, SKILLS,
  getModifier, formatMod, getProficiencyBonus, isSpellcaster, getSpellcastingAbility,
} from '../components/characterbuilder/rpgData.js'

const PAGE = { width: 595.28, height: 841.89 }
const M = 36
const INK = '#1a1a1a'
const MUTED = '#666666'
const LINE = '#9a9a9a'
const ACCENT = '#8a1c1c'
const SOFT = '#f4efe6'
const THEME = { palette: { text: INK, muted: MUTED, border: LINE, accent: ACCENT, page: '#ffffff', panel: SOFT, panelSoft: SOFT } }

const str = (value) => (value == null ? '' : String(value).trim())
const arr = (value) => (Array.isArray(value) ? value : [])
const SECTION = 'Character Sheet'

export const getCharacterSheetFilename = (character) =>
  `${sanitizeFilename(character?.name, 'character')}-character-sheet.pdf`

const labelFor = (list, id, custom) => {
  if (id === 'custom') return str(custom) || 'Custom'
  return list.find(entry => entry.id === id)?.label || str(id)
}

export const buildCharacterSheetModel = (character = {}) => {
  const level = Math.max(1, Number(character.level) || 1)
  const prof = getProficiencyBonus(level)
  const scores = character.abilityScores || {}
  const mods = Object.fromEntries(ABILITY_KEYS.map(key => [key, getModifier(Number(scores[key]) || 10)]))
  const cls = CLASSES.find(entry => entry.id === character.class)
  const saves = ABILITY_KEYS.map(key => {
    const proficient = Boolean(character.savingThrows?.[key])
    return { key, label: ABILITY_LABELS[key], proficient, bonus: mods[key] + (proficient ? prof : 0) }
  })
  const skills = SKILLS.map(skill => {
    const level2 = character.skills?.[skill.id] || 'none'
    const multiplier = level2 === 'expert' ? 2 : level2 === 'proficient' ? 1 : 0
    return {
      id: skill.id, label: skill.label, ability: ABILITY_SHORT[skill.ability],
      state: level2, bonus: mods[skill.ability] + prof * multiplier,
    }
  })
  const perception = skills.find(skill => skill.id === 'perception')
  const casterAbility = isSpellcaster(character.class)
    ? (character.spells?.spellcastingAbility || getSpellcastingAbility(character.class) || 'int')
    : null
  return {
    name: str(character.name) || 'Unnamed Character',
    level, prof, mods, scores, saves, skills,
    race: labelFor(RACES, character.race, character.customRace),
    className: labelFor(CLASSES, character.class, character.customClass),
    subclass: str(character.subclass),
    background: labelFor(BACKGROUNDS, character.background, character.customBackground),
    alignment: str(character.alignment),
    hitDie: cls?.hitDie || '',
    armorProf: cls?.armorProf || '',
    weaponProf: cls?.weaponProf || '',
    ac: character.ac ?? 10,
    speed: character.speed ?? 30,
    initiative: mods.dex,
    hpMax: character.hp?.max ?? 0,
    hpCurrent: character.hp?.current ?? character.hp?.max ?? 0,
    passivePerception: 10 + (perception?.bonus ?? mods.wis),
    inspiration: Boolean(character.inspiration),
    xp: character.xp,
    features: arr(character.features).filter(feature => str(feature?.name)),
    equipment: arr(character.equipment).filter(item => str(item?.name)),
    currency: character.currency || {},
    backstory: str(character.backstory),
    casterAbility,
    spellSaveDc: casterAbility ? 8 + prof + mods[casterAbility] : null,
    spellAttack: casterAbility ? prof + mods[casterAbility] : null,
    spells: character.spells || {},
  }
}

const createSheetWriter = () => {
  const pages = []
  let pdf = null
  let y = 0
  const startPage = (title) => {
    pdf = makePdfCanvas(THEME)
    pdf.line(M, PAGE.height - M + 6, PAGE.width - M, PAGE.height - M + 6, ACCENT, 1.4)
    pdf.text(title.toUpperCase(), M, PAGE.height - M + 12, 8, { bold: true, color: MUTED, tracking: 1.2, maxWidth: PAGE.width - M * 2 })
    pages.push({ pdf, title })
    y = PAGE.height - M - 8
  }
  const ensure = (needed, title) => {
    if (!pdf || y - needed < M + 14) startPage(title)
  }
  const heading = (label, title) => {
    ensure(40, title)
    pdf.text(label.toUpperCase(), M, y, 10, { bold: true, color: ACCENT, tracking: 1.1, maxWidth: PAGE.width - M * 2 })
    pdf.line(M, y - 5, PAGE.width - M, y - 5, ACCENT, 0.8)
    y -= 20
  }
  const paragraph = (value, title, options = {}) => {
    const size = options.size || 9.5
    const lineHeight = size * 1.4
    const width = options.width || PAGE.width - M * 2 - (options.indent || 0)
    wrapPdfText(value, width, size).forEach(lineText => {
      ensure(lineHeight, title)
      if (lineText) pdf.text(lineText, M + (options.indent || 0), y, size, { color: options.color || INK, bold: options.bold, maxWidth: width })
      y -= lineHeight
    })
  }
  return {
    pages, startPage, ensure, heading, paragraph,
    get pdf() { return pdf },
    get y() { return y },
    set y(value) { y = value },
  }
}

const statBox = (pdf, label, value, x, top, w, h) => {
  pdf.rect(x, top - h, w, h, SOFT, LINE, 0.8)
  pdf.text(String(value), x + w / 2 - measureText(String(value), 16) / 2, top - 24, 16, { bold: true, color: INK, maxWidth: w - 8 })
  pdf.text(label.toUpperCase(), x + w / 2 - measureText(label, 6.5, 0.5) / 2, top - h + 8, 6.5, { bold: true, color: MUTED, tracking: 0.5, maxWidth: w - 6 })
}

const drawFirstPage = (writer, model, portrait) => {
  writer.startPage(`${model.name} - ${SECTION}`)
  const { pdf } = writer
  const full = PAGE.width - M * 2
  let top = PAGE.height - M - 10

  // Header: name, identity line, optional portrait
  const textWidth = portrait ? full - 84 : full
  pdf.text(model.name, M, top - 18, 24, { bold: true, color: INK, maxWidth: textWidth })
  const identity = [`Level ${model.level}`, model.race, [model.className, model.subclass && `(${model.subclass})`].filter(Boolean).join(' ')].filter(Boolean).join(' - ')
  pdf.text(identity, M, top - 36, 11, { color: MUTED, maxWidth: textWidth })
  const detail = [model.background && `Background: ${model.background}`, model.alignment && `Alignment: ${model.alignment}`, model.xp != null && model.xp !== '' && `XP: ${model.xp}`].filter(Boolean).join('   -   ')
  if (detail) pdf.text(detail, M, top - 52, 9, { color: MUTED, maxWidth: textWidth })
  if (portrait) {
    pdf.rect(PAGE.width - M - 72, top - 72, 72, 72, SOFT, LINE, 0.8)
    pdf.imageCover(portrait, PAGE.width - M - 72, top, 72, 72, { fit: 'cover' })
    pdf.rect(PAGE.width - M - 72, top - 72, 72, 72, null, LINE, 0.8)
  }
  top -= 84

  // Stat strip
  const stats = [
    ['AC', model.ac],
    ['Initiative', formatMod(model.initiative)],
    ['Speed', `${model.speed} ft`],
    ['Prof. Bonus', formatMod(model.prof)],
    ['Hit Points', `${model.hpCurrent}/${model.hpMax}`],
    ['Hit Dice', `${model.level}${model.hitDie}`],
    ['Passive Perc', model.passivePerception],
    ['Inspiration', model.inspiration ? 'Yes' : '—'],
  ]
  const gap = 6
  const boxW = (full - gap * (stats.length - 1)) / stats.length
  stats.forEach(([label, value], index) => statBox(pdf, label, value, M + index * (boxW + gap), top, boxW, 46))
  top -= 62

  // Left column: ability scores, saving throws, skills
  const leftW = 168
  const rightX = M + leftW + 16
  const rightW = PAGE.width - M - rightX
  let ly = top
  ABILITY_KEYS.forEach((key, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const bx = M + col * (leftW / 2 + 2)
    const by = ly - row * 62
    const bw = leftW / 2 - 2
    pdf.rect(bx, by - 56, bw, 56, SOFT, LINE, 0.8)
    pdf.text(ABILITY_LABELS[key].toUpperCase(), bx + bw / 2 - measureText(ABILITY_LABELS[key], 6.5, 0.4) / 2, by - 11, 6.5, { bold: true, color: MUTED, tracking: 0.4, maxWidth: bw - 4 })
    const mod = formatMod(model.mods[key])
    pdf.text(mod, bx + bw / 2 - measureText(mod, 18) / 2, by - 33, 18, { bold: true, color: INK, maxWidth: bw - 4 })
    const score = String(model.scores[key] ?? 10)
    pdf.text(score, bx + bw / 2 - measureText(score, 9) / 2, by - 49, 9, { color: MUTED, maxWidth: bw - 4 })
  })
  ly -= 3 * 62 + 8

  const listRow = (label, bonus, marker, x, rowY, width) => {
    pdf.rect(x, rowY - 1, 7, 7, marker ? ACCENT : null, LINE, 0.8)
    pdf.text(formatMod(bonus), x + 12, rowY, 8.5, { bold: true, color: INK, maxWidth: 24 })
    pdf.text(label, x + 40, rowY, 8.5, { color: INK, maxWidth: width - 40 })
  }
  pdf.text('SAVING THROWS', M, ly, 8, { bold: true, color: ACCENT, tracking: 1, maxWidth: leftW })
  pdf.line(M, ly - 4, M + leftW, ly - 4, ACCENT, 0.7)
  ly -= 17
  model.saves.forEach(save => {
    listRow(save.label, save.bonus, save.proficient, M, ly, leftW)
    ly -= 12.5
  })
  ly -= 8
  pdf.text('SKILLS', M, ly, 8, { bold: true, color: ACCENT, tracking: 1, maxWidth: leftW })
  pdf.line(M, ly - 4, M + leftW, ly - 4, ACCENT, 0.7)
  ly -= 17
  model.skills.forEach(skill => {
    listRow(`${skill.label} (${skill.ability})${skill.state === 'expert' ? ' *' : ''}`, skill.bonus, skill.state !== 'none', M, ly, leftW)
    ly -= 12.5
  })
  pdf.text('filled box = proficient   * = expertise', M, ly - 2, 7, { color: MUTED, maxWidth: leftW })

  // Right column: proficiencies, features (flows to continuation pages)
  let ry = top
  const rightBlock = (label) => {
    pdf.text(label.toUpperCase(), rightX, ry, 8, { bold: true, color: ACCENT, tracking: 1, maxWidth: rightW })
    pdf.line(rightX, ry - 4, rightX + rightW, ry - 4, ACCENT, 0.7)
    ry -= 17
  }
  const profs = [model.armorProf && `Armor: ${model.armorProf}`, model.weaponProf && `Weapons: ${model.weaponProf}`].filter(Boolean)
  if (profs.length) {
    rightBlock('Proficiencies')
    profs.forEach(line => {
      wrapPdfText(line, rightW, 8.5).forEach(lineText => {
        pdf.text(lineText, rightX, ry, 8.5, { color: INK, maxWidth: rightW })
        ry -= 12
      })
    })
    ry -= 8
  }
  const pending = []
  rightBlock('Features & Traits')
  const floor = M + 14
  for (let index = 0; index < model.features.length; index += 1) {
    const feature = model.features[index]
    if (ry - 24 < floor) { pending.push(...model.features.slice(index)); break }
    const header = [str(feature.name), str(feature.source) && `(${str(feature.source)})`].filter(Boolean).join(' ')
    const lines = wrapPdfText(feature.description, rightW, 8.5)
    pdf.text(header, rightX, ry, 9, { bold: true, color: INK, maxWidth: rightW })
    ry -= 12
    let spilled = false
    for (let n = 0; n < lines.length; n += 1) {
      if (ry - 11.5 < floor) {
        pending.push({ ...feature, name: `${str(feature.name)} (cont.)`, description: lines.slice(n).join(' ') })
        pending.push(...model.features.slice(index + 1))
        spilled = true
        break
      }
      pdf.text(lines[n], rightX, ry, 8.5, { color: MUTED, maxWidth: rightW })
      ry -= 11.5
    }
    if (spilled) break
    ry -= 6
  }
  return pending
}

const SCHOOL_ORDINAL = ['Cantrips', '1st Level', '2nd Level', '3rd Level', '4th Level', '5th Level', '6th Level', '7th Level', '8th Level', '9th Level']

const spellLines = (spells) => {
  const levelMap = new Map()
  arr(spells.cantrips).forEach(spell => levelMap.set(0, [...(levelMap.get(0) || []), spell]))
  ;[...arr(spells.known), ...arr(spells.prepared)].forEach(spell => {
    const lvl = Number(spell.level) || 1
    levelMap.set(lvl, [...(levelMap.get(lvl) || []), spell])
  })
  return [...levelMap.entries()].sort((a, b) => a[0] - b[0])
}

export const buildCharacterSheetPages = (model, portrait = null) => {
  const writer = createSheetWriter()
  const title = `${model.name} - ${SECTION}`
  const overflowFeatures = drawFirstPage(writer, model, portrait)

  if (overflowFeatures.length) {
    writer.startPage(title)
    writer.heading('Features & Traits (continued)', title)
    overflowFeatures.forEach(feature => {
      writer.paragraph([str(feature.name), str(feature.source) && `(${str(feature.source)})`].filter(Boolean).join(' '), title, { bold: true, size: 10 })
      writer.paragraph(feature.description, title, { indent: 8, color: MUTED })
      writer.y -= 4
    })
  }

  if (model.equipment.length || Object.values(model.currency).some(Boolean)) {
    writer.ensure(60, title)
    writer.heading('Equipment', title)
    const coins = Object.entries(model.currency).filter(([, amount]) => Number(amount) > 0).map(([coin, amount]) => `${amount} ${coin.toUpperCase()}`)
    if (coins.length) writer.paragraph(`Currency: ${coins.join('   ')}`, title, { bold: true })
    model.equipment.forEach(item => {
      const qty = Number(item.quantity) > 1 ? ` x${item.quantity}` : ''
      writer.paragraph(`${str(item.name)}${qty}${str(item.type) ? ` (${str(item.type)})` : ''}${str(item.description) ? ` — ${str(item.description)}` : ''}`, title, { indent: 6 })
    })
    writer.y -= 8
  }

  if (model.backstory) {
    writer.ensure(60, title)
    writer.heading('Backstory', title)
    writer.paragraph(model.backstory, title)
    writer.y -= 8
  }

  const spellGroups = spellLines(model.spells)
  const slots = Object.entries(model.spells.slots || {}).filter(([, slot]) => Number(slot?.max) > 0)
  if (model.casterAbility && (spellGroups.length || slots.length)) {
    writer.startPage(title)
    writer.heading('Spellcasting', title)
    writer.paragraph(
      `Spellcasting ability: ${ABILITY_LABELS[model.casterAbility]}   -   Spell save DC ${model.spellSaveDc}   -   Spell attack ${formatMod(model.spellAttack)}`,
      title, { bold: true },
    )
    if (slots.length) {
      writer.y -= 4
      writer.paragraph(`Spell slots: ${slots.map(([lvl, slot]) => `L${lvl} ${Math.max(0, Number(slot.max) - Number(slot.used || 0))}/${slot.max}`).join('   ')}`, title)
    }
    writer.y -= 6
    spellGroups.forEach(([lvl, list]) => {
      writer.ensure(30, title)
      writer.paragraph(SCHOOL_ORDINAL[lvl] || `Level ${lvl}`, title, { bold: true, color: ACCENT, size: 10 })
      list.forEach(spell => {
        writer.paragraph(`${str(spell.name)}${str(spell.school) ? ` - ${str(spell.school)}` : ''}${str(spell.description) ? ` — ${str(spell.description)}` : ''}`, title, { indent: 8, size: 8.5 })
      })
      writer.y -= 4
    })
  }
  return writer.pages.map(({ pdf }) => ({
    section: SECTION,
    title,
    content: pdf.content(),
    images: pdf.images(),
    size: PAGE,
  }))
}

export const createCharacterSheetPdfBlob = async (character) => {
  const model = buildCharacterSheetModel(character)
  let portrait = null
  if (character?.portrait) {
    try {
      portrait = await convertImageToJpegResource(character.portrait, { maxSize: 400, quality: 0.85 })
    } catch {
      portrait = null
    }
  }
  const bytes = createPdfBytes(buildCharacterSheetPages(model, portrait), `${model.name} — Character Sheet`)
  return new Blob([bytes], { type: 'application/pdf' })
}

export const downloadCharacterSheetPdf = async (character) => {
  const blob = await createCharacterSheetPdfBlob(character)
  return downloadBlob(blob, getCharacterSheetFilename(character))
}
