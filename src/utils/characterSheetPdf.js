// Printable party-character sheet (US Letter, portrait) in the familiar
// three-page arrangement of a tabletop RPG sheet: page 1 core stats, page 2
// personal details and backstory, page 3 spellcasting. Only the functional
// arrangement (which box goes where) follows the usual convention; every
// graphic, border, typeface and caption here is YOW's own plain styling, with
// no publisher artwork, logos or trademarks. Built on the project PDF writer,
// so no extra dependency. Private "secrets", journal and session notes are
// never included. Anything that does not fit its box continues on extra pages.
import {
  makePdfCanvas, createPdfBytes, convertImageToJpegResource, measureText, wrapPdfText,
} from './projectExportPdf.js'
import { sanitizeFilename, downloadBlob } from './projectExportHelpers.js'
import {
  RACES, CLASSES, BACKGROUNDS, ABILITY_KEYS, ABILITY_LABELS, ABILITY_SHORT, SKILLS,
  getModifier, formatMod, getProficiencyBonus, isSpellcaster, getSpellcastingAbility,
} from '../components/characterbuilder/rpgData.js'

const PAGE = { width: 612, height: 792 }
const M = 28
const INK = '#1c1c1c'
const MUTED = '#6b6b6b'
const RULE = '#b5b5b5'
const FRAME = '#2b2b2b'
const TINT = '#efede8'
const THEME = { palette: { text: INK, muted: MUTED, border: RULE, accent: FRAME, page: '#ffffff', panel: TINT, panelSoft: TINT } }
const SECTION = 'Character Sheet'

const str = (value) => (value == null ? '' : String(value).trim())
const arr = (value) => (Array.isArray(value) ? value : [])

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
    const state = character.skills?.[skill.id] || 'none'
    const multiplier = state === 'expert' ? 2 : state === 'proficient' ? 1 : 0
    return { id: skill.id, label: skill.label, ability: ABILITY_SHORT[skill.ability], state, bonus: mods[skill.ability] + prof * multiplier }
  })
  const perception = skills.find(skill => skill.id === 'perception')
  const casterAbility = isSpellcaster(character.class)
    ? (character.spells?.spellcastingAbility || getSpellcastingAbility(character.class) || 'int')
    : null
  const className = labelFor(CLASSES, character.class, character.customClass)
  return {
    name: str(character.name) || 'Unnamed Character',
    level, prof, mods, scores, saves, skills,
    race: labelFor(RACES, character.race, character.customRace),
    className,
    subclass: str(character.subclass),
    classAndLevel: `${className} ${level}`,
    background: labelFor(BACKGROUNDS, character.background, character.customBackground),
    alignment: str(character.alignment),
    playerName: str(character.playerName),
    xp: character.xp == null ? '' : String(character.xp),
    hitDie: cls?.hitDie || '',
    armorProf: cls?.armorProf || '',
    weaponProf: cls?.weaponProf || '',
    ac: character.ac ?? 10,
    speed: character.speed ?? 30,
    initiative: mods.dex,
    hpMax: character.hp?.max ?? 0,
    hpCurrent: character.hp?.current ?? character.hp?.max ?? 0,
    hpTemp: character.hp?.temp ?? '',
    passivePerception: 10 + (perception?.bonus ?? mods.wis),
    inspiration: Boolean(character.inspiration),
    personality: { traits: str(character.personalityTraits), ideals: str(character.ideals), bonds: str(character.bonds), flaws: str(character.flaws) },
    appearance: {
      age: str(character.age), height: str(character.height), weight: str(character.weight),
      eyes: str(character.eyes), skin: str(character.skin), hair: str(character.hair), text: str(character.appearance),
    },
    features: arr(character.features).filter(feature => str(feature?.name)),
    equipment: arr(character.equipment).filter(item => str(item?.name)),
    currency: character.currency || {},
    backstory: str(character.backstory),
    pronouns: str(character.pronouns),
    casterAbility,
    spellSaveDc: casterAbility ? 8 + prof + mods[casterAbility] : null,
    spellAttack: casterAbility ? prof + mods[casterAbility] : null,
    spells: character.spells || {},
  }
}

// ── drawing helpers ─────────────────────────────────────────────────────────

const centered = (pdf, value, cx, y, size, options = {}) => {
  const text = String(value ?? '')
  pdf.text(text, cx - measureText(text, size, options.tracking || 0) / 2, y, size, { maxWidth: options.maxWidth ?? 200, ...options })
}

const frame = (pdf, x, top, w, h, options = {}) => {
  pdf.rect(x, top - h, w, h, options.fill ?? null, FRAME, options.weight ?? 1.1)
}

// A framed box with a small centred caption along its bottom edge.
const panel = (pdf, x, top, w, h, caption) => {
  frame(pdf, x, top, w, h)
  if (caption) centered(pdf, caption.toUpperCase(), x + w / 2, top - h + 6, 6.2, { bold: true, color: MUTED, tracking: 0.6, maxWidth: w - 8 })
}

// Wraps text into a box; returns whatever did not fit, as one string.
const fillText = (pdf, value, x, top, w, bottom, size = 8.5, color = INK) => {
  const lines = wrapPdfText(value, w, size)
  const lineHeight = size * 1.38
  let y = top - size
  let used = 0
  for (; used < lines.length; used += 1) {
    if (y < bottom) break
    if (lines[used]) pdf.text(lines[used], x, y, size, { color, maxWidth: w })
    y -= lineHeight
  }
  return lines.slice(used).join(' ').trim()
}

const pageHeader = (pdf, leftLabel, leftValue) => {
  const top = PAGE.height - M
  pdf.text(leftValue, M + 4, top - 36, 17, { bold: true, color: INK, maxWidth: 220 })
  pdf.line(M, top - 42, M + 224, top - 42, FRAME, 1)
  pdf.text(leftLabel.toUpperCase(), M + 4, top - 52, 6.4, { bold: true, color: MUTED, tracking: 0.6, maxWidth: 220 })
  return top
}

const infoStrip = (pdf, rows, x, top, w) => {
  const h = 70
  frame(pdf, x, top, w, h, { weight: 1.3 })
  const colW = w / 3
  rows.forEach((row, rowIndex) => {
    const baseline = top - 28 - rowIndex * 30
    row.forEach(([label, value], col) => {
      const cx = x + 8 + col * colW
      if (value) pdf.text(String(value), cx, baseline + 6, 8.5, { color: INK, maxWidth: colW - 14 })
      pdf.line(cx, baseline + 2, cx + colW - 14, baseline + 2, RULE, 0.7)
      pdf.text(label.toUpperCase(), cx, baseline - 6, 5.8, { bold: true, color: MUTED, tracking: 0.5, maxWidth: colW - 14 })
    })
  })
  return top - h
}

const checkBox = (pdf, x, y, filled) => {
  pdf.rect(x, y, 6.5, 6.5, filled ? FRAME : '#ffffff', FRAME, 0.8)
}

// ── page 1 ──────────────────────────────────────────────────────────────────

const drawPageOne = (model) => {
  const pdf = makePdfCanvas(THEME)
  const top = pageHeader(pdf, 'Character name', model.name)
  infoStrip(pdf, [
    [['Class & level', model.classAndLevel], ['Background', model.background], ['Player name', model.playerName]],
    [['Race', model.race], ['Alignment', model.alignment], ['Experience points', model.xp]],
  ], 262, top, 322)

  const bodyTop = top - 82

  // Ability scores (left column)
  const abilityW = 70
  const abilityH = 70
  ABILITY_KEYS.forEach((key, index) => {
    const y = bodyTop - index * (abilityH + 6)
    frame(pdf, M, y, abilityW, abilityH, { fill: TINT })
    centered(pdf, ABILITY_LABELS[key].toUpperCase(), M + abilityW / 2, y - 12, 6.2, { bold: true, color: MUTED, tracking: 0.5, maxWidth: abilityW - 6 })
    centered(pdf, formatMod(model.mods[key]), M + abilityW / 2, y - 38, 22, { bold: true, color: INK, maxWidth: abilityW - 6 })
    pdf.rect(M + 17, y - abilityH + 8, abilityW - 34, 16, '#ffffff', FRAME, 0.9)
    centered(pdf, model.scores[key] ?? 10, M + abilityW / 2, y - abilityH + 13, 9, { bold: true, color: INK, maxWidth: 30 })
  })

  // Column B: inspiration, proficiency, saves, skills
  const bx = M + abilityW + 10
  const bw = 128
  frame(pdf, bx, bodyTop, bw, 30)
  if (model.inspiration) pdf.rect(bx + bw - 22, bodyTop - 22, 14, 14, FRAME, FRAME, 1)
  else pdf.rect(bx + bw - 22, bodyTop - 22, 14, 14, '#ffffff', FRAME, 0.9)
  pdf.text('INSPIRATION', bx + 7, bodyTop - 18, 6.4, { bold: true, color: MUTED, tracking: 0.6, maxWidth: 70 })
  frame(pdf, bx, bodyTop - 36, bw, 30)
  pdf.text(formatMod(model.prof), bx + bw - 28, bodyTop - 58, 13, { bold: true, color: INK, maxWidth: 26 })
  pdf.text('PROFICIENCY BONUS', bx + 7, bodyTop - 54, 5.8, { bold: true, color: MUTED, tracking: 0.4, maxWidth: 84 })

  const listRow = (x, y, w, label, bonus, marked) => {
    checkBox(pdf, x + 6, y - 1, marked)
    pdf.text(formatMod(bonus), x + 17, y, 8, { bold: true, color: INK, maxWidth: 20 })
    pdf.line(x + 17, y - 2, x + 36, y - 2, RULE, 0.6)
    pdf.text(label, x + 38, y, 6.9, { color: INK, maxWidth: w - 40 })
  }
  const savesTop = bodyTop - 72
  const savesH = 6 * 14 + 22
  panel(pdf, bx, savesTop, bw, savesH, 'Saving throws')
  model.saves.forEach((save, index) => listRow(bx, savesTop - 15 - index * 14, bw, save.label, save.bonus, save.proficient))
  const skillsTop = savesTop - savesH - 8
  const skillsH = 18 * 14 + 22
  panel(pdf, bx, skillsTop, bw, skillsH, 'Skills')
  model.skills.forEach((skill, index) => {
    const label = `${skill.label} (${skill.ability.charAt(0)}${skill.ability.slice(1).toLowerCase()})${skill.state === 'expert' ? ' *' : ''}`
    listRow(bx, skillsTop - 15 - index * 14, bw, label, skill.bonus, skill.state !== 'none')
  })

  // Passive perception and other proficiencies (bottom-left)
  const passiveTop = skillsTop - skillsH - 8
  frame(pdf, M, passiveTop, abilityW + 10 + bw, 26)
  pdf.rect(M + 6, passiveTop - 21, 28, 16, TINT, FRAME, 0.9)
  centered(pdf, model.passivePerception, M + 20, passiveTop - 17, 9.5, { bold: true, color: INK, maxWidth: 24 })
  pdf.text('PASSIVE WISDOM (PERCEPTION)', M + 42, passiveTop - 16, 6, { bold: true, color: MUTED, tracking: 0.4, maxWidth: 125 })
  const profTop = passiveTop - 32
  const profH = profTop - M
  panel(pdf, M, profTop, abilityW + 10 + bw, profH, 'Other proficiencies & languages')
  const profText = [
    model.armorProf && `Armor: ${model.armorProf}`,
    model.weaponProf && `Weapons: ${model.weaponProf}`,
  ].filter(Boolean).join('\n\n')
  fillText(pdf, profText, M + 7, profTop - 6, abilityW + 10 + bw - 14, M + 16, 7.8)

  // Middle column: AC / initiative / speed, hit points, attacks, equipment
  const mx = bx + bw + 10
  const mw = 150
  const smallW = (mw - 12) / 3
  ;[['AC', model.ac], ['Initiative', formatMod(model.initiative)], ['Speed (ft)', model.speed]].forEach(([label, value], index) => {
    const x = mx + index * (smallW + 6)
    frame(pdf, x, bodyTop, smallW, 58, { fill: index === 0 ? TINT : null })
    centered(pdf, value, x + smallW / 2, bodyTop - 28, 16, { bold: true, color: INK, maxWidth: smallW - 6 })
    centered(pdf, label.toUpperCase(), x + smallW / 2, bodyTop - 51, 5.6, { bold: true, color: MUTED, tracking: 0.3, maxWidth: smallW - 2 })
  })
  const hpTop = bodyTop - 64
  panel(pdf, mx, hpTop, mw, 76, 'Current hit points')
  pdf.text(`Hit point maximum  ${model.hpMax}`, mx + 8, hpTop - 12, 7.2, { color: MUTED, maxWidth: mw - 16 })
  centered(pdf, model.hpCurrent, mx + mw / 2, hpTop - 42, 22, { bold: true, color: INK, maxWidth: mw - 16 })
  const tempTop = hpTop - 82
  panel(pdf, mx, tempTop, mw, 48, 'Temporary hit points')
  if (model.hpTemp !== '') centered(pdf, model.hpTemp, mx + mw / 2, tempTop - 24, 14, { bold: true, color: INK, maxWidth: mw - 16 })
  const diceTop = tempTop - 54
  const halfW = (mw - 6) / 2
  panel(pdf, mx, diceTop, halfW, 52, 'Hit dice')
  pdf.text(`Total ${model.level}${model.hitDie}`, mx + 7, diceTop - 13, 7.4, { color: MUTED, maxWidth: halfW - 10 })
  panel(pdf, mx + halfW + 6, diceTop, halfW, 52, 'Death saves')
  ;[['Successes', 14], ['Failures', 28]].forEach(([label, offset]) => {
    pdf.text(label, mx + halfW + 12, diceTop - offset, 6.2, { color: MUTED, maxWidth: 38 })
    for (let n = 0; n < 3; n += 1) checkBox(pdf, mx + halfW + 12 + 36 + n * 8.5, diceTop - offset - 1.5, false)
  })
  const attackTop = diceTop - 58
  const attackH = 140
  panel(pdf, mx, attackTop, mw, attackH, 'Attacks & spellcasting')
  pdf.text('NAME', mx + 7, attackTop - 11, 5.6, { bold: true, color: MUTED, maxWidth: 60 })
  pdf.text('ATK', mx + 80, attackTop - 11, 5.6, { bold: true, color: MUTED, maxWidth: 30 })
  pdf.text('DAMAGE', mx + 120, attackTop - 11, 5.6, { bold: true, color: MUTED, maxWidth: 28 })
  const weapons = model.equipment.filter(item => /weapon/i.test(str(item.type))).slice(0, 5)
  for (let row = 0; row < 6; row += 1) {
    const y = attackTop - 28 - row * 17
    pdf.rect(mx + 6, y - 4, 70, 13, TINT, null)
    pdf.rect(mx + 78, y - 4, 38, 13, TINT, null)
    pdf.rect(mx + 120, y - 4, mw - 126, 13, TINT, null)
    if (weapons[row]) pdf.text(str(weapons[row].name), mx + 9, y, 7.2, { color: INK, maxWidth: 64 })
  }
  const equipTop = attackTop - attackH - 6
  const equipH = equipTop - M
  panel(pdf, mx, equipTop, mw, equipH, 'Equipment')
  const coins = ['cp', 'sp', 'ep', 'gp', 'pp']
  coins.forEach((coin, index) => {
    const y = equipTop - 14 - index * 28
    frame(pdf, mx + 6, y + 4, 26, 24)
    centered(pdf, model.currency[coin] || 0, mx + 19, y - 6, 8, { bold: true, color: INK, maxWidth: 22 })
    centered(pdf, coin.toUpperCase(), mx + 19, y - 16, 5.4, { bold: true, color: MUTED, maxWidth: 22 })
  })
  const itemText = model.equipment.map(item => `${str(item.name)}${Number(item.quantity) > 1 ? ` x${item.quantity}` : ''}`).join('\n\n')
  const equipOverflow = fillText(pdf, itemText.split('\n\n').join('\n\n'), mx + 40, equipTop - 6, mw - 46, M + 16, 7.8)

  // Right column: personality boxes, features & traits
  const rx = mx + mw + 10
  const rw = PAGE.width - M - rx
  let rtop = bodyTop
  ;[['Personality traits', model.personality.traits], ['Ideals', model.personality.ideals], ['Bonds', model.personality.bonds], ['Flaws', model.personality.flaws]].forEach(([label, value]) => {
    panel(pdf, rx, rtop, rw, 62, label)
    if (value) fillText(pdf, value, rx + 6, rtop - 5, rw - 12, rtop - 52, 7.4)
    rtop -= 68
  })
  const featTop = rtop
  const featH = featTop - M
  panel(pdf, rx, featTop, rw, featH, 'Features & traits')
  const featureText = [model.subclass && `Subclass: ${model.subclass}`, ...model.features.map(feature => {
    const head = [str(feature.name), str(feature.source) && `(${str(feature.source)})`].filter(Boolean).join(' ')
    return `${head}${str(feature.description) ? `: ${str(feature.description)}` : ''}`
  })].filter(Boolean).join('\n\n')
  const featureOverflow = fillText(pdf, featureText, rx + 6, featTop - 6, rw - 12, M + 16, 7.6)

  return { page: toPage(pdf), featureOverflow, equipOverflow }
}

const toPage = (pdf) => ({ section: SECTION, title: SECTION, content: pdf.content(), images: pdf.images(), size: PAGE })

// ── page 2 ──────────────────────────────────────────────────────────────────

const drawPageTwo = (model, portrait, overflow) => {
  const pdf = makePdfCanvas(THEME)
  const top = pageHeader(pdf, 'Character name', model.name)
  const a = model.appearance
  infoStrip(pdf, [
    [['Age', a.age], ['Height', a.height], ['Weight', a.weight]],
    [['Eyes', a.eyes], ['Skin', a.skin], ['Hair', a.hair]],
  ], 262, top, 322)
  const bodyTop = top - 82
  const leftW = 172
  const rightX = M + leftW + 10
  const rightW = PAGE.width - M - rightX

  const appearanceH = 236
  panel(pdf, M, bodyTop, leftW, appearanceH, 'Character appearance')
  if (a.text) fillText(pdf, a.text, M + 7, bodyTop - 6, leftW - 14, bodyTop - appearanceH + 16, 8)

  const backTop = bodyTop - appearanceH - 8
  panel(pdf, M, backTop, leftW, backTop - M, 'Character backstory')
  overflow.backstory = fillText(pdf, model.backstory, M + 7, backTop - 6, leftW - 14, M + 16, 8)

  const alliesH = 236
  panel(pdf, rightX, bodyTop, rightW, alliesH, 'Allies & organizations')
  const symbolW = 118
  const symbolH = 118
  frame(pdf, rightX + rightW - symbolW - 8, bodyTop - 8, symbolW, symbolH, { fill: TINT })
  if (portrait) pdf.imageCover(portrait, rightX + rightW - symbolW - 8, bodyTop - 8, symbolW, symbolH, { fit: 'cover' })
  else centered(pdf, 'PORTRAIT / SYMBOL', rightX + rightW - symbolW / 2 - 8, bodyTop - 8 - symbolH / 2, 6.4, { bold: true, color: MUTED, tracking: 0.6, maxWidth: symbolW - 8 })

  const addTop = bodyTop - alliesH - 8
  const addH = 200
  panel(pdf, rightX, addTop, rightW, addH, 'Additional features & traits')
  overflow.features = fillText(pdf, overflow.features, rightX + 7, addTop - 6, rightW - 14, addTop - addH + 16, 8)

  const treasureTop = addTop - addH - 8
  panel(pdf, rightX, treasureTop, rightW, treasureTop - M, 'Treasure')
  overflow.equipment = fillText(pdf, overflow.equipment, rightX + 7, treasureTop - 6, rightW - 14, M + 16, 8)
  return toPage(pdf)
}

// ── page 3 ──────────────────────────────────────────────────────────────────

const spellsByLevel = (spells) => {
  const byLevel = new Map()
  const add = (spell, prepared) => {
    const level = Number(spell?.level) || 0
    if (!str(spell?.name)) return
    byLevel.set(level, [...(byLevel.get(level) || []), { name: str(spell.name), prepared }])
  }
  arr(spells.cantrips).forEach(spell => add({ ...spell, level: 0 }, false))
  arr(spells.known).forEach(spell => add({ ...spell, level: Number(spell.level) || 1 }, false))
  arr(spells.prepared).forEach(spell => add({ ...spell, level: Number(spell.level) || 1 }, true))
  return byLevel
}

const drawPageThree = (model) => {
  const pdf = makePdfCanvas(THEME)
  const top = pageHeader(pdf, 'Spellcasting class', model.casterAbility ? model.className : '')
  const stripX = 262
  const stripW = 322
  frame(pdf, stripX, top, stripW, 70, { weight: 1.3 })
  const cellW = stripW / 3
  ;[
    ['Spellcasting ability', model.casterAbility ? ABILITY_SHORT[model.casterAbility] : ''],
    ['Spell save DC', model.spellSaveDc ?? ''],
    ['Spell attack bonus', model.spellAttack == null ? '' : formatMod(model.spellAttack)],
  ].forEach(([label, value], index) => {
    const cx = stripX + cellW * index + cellW / 2
    centered(pdf, value, cx, top - 34, 16, { bold: true, color: INK, maxWidth: cellW - 12 })
    centered(pdf, label.toUpperCase(), cx, top - 58, 5.8, { bold: true, color: MUTED, tracking: 0.5, maxWidth: cellW - 10 })
  })

  const byLevel = spellsByLevel(model.spells)
  const slots = model.spells.slots || {}
  const colW = (PAGE.width - M * 2 - 20) / 3
  const colX = [0, 1, 2].map(i => M + i * (colW + 10))
  const bodyTop = top - 82
  const rowH = 14.4
  const overflow = []
  // Column layout: cantrips/1/2, then 3/4/5, then 6/7/8/9.
  const columns = [[0, 1, 2], [3, 4, 5], [6, 7, 8, 9]]
  const rowsFor = (level) => (level === 0 ? 9 : level === 1 ? 12 : level === 2 ? 11 : level <= 5 ? 11 : 8)
  columns.forEach((levels, columnIndex) => {
    let y = bodyTop
    levels.forEach(level => {
      const list = byLevel.get(level) || []
      const rows = Math.max(rowsFor(level), 0)
      const boxH = 36 + rows * rowH
      frame(pdf, colX[columnIndex], y, colW, boxH)
      pdf.rect(colX[columnIndex] + 6, y - 26, 18, 18, TINT, FRAME, 0.9)
      centered(pdf, level === 0 ? 'C' : level, colX[columnIndex] + 15, y - 21, 9, { bold: true, color: INK, maxWidth: 14 })
      if (level === 0) {
        pdf.text('CANTRIPS', colX[columnIndex] + 32, y - 20, 6.8, { bold: true, color: MUTED, tracking: 0.6, maxWidth: 80 })
      } else {
        const slot = slots[level] || {}
        pdf.text('TOTAL', colX[columnIndex] + 32, y - 11, 5.4, { bold: true, color: MUTED, maxWidth: 46 })
        pdf.rect(colX[columnIndex] + 32, y - 31, 36, 14, '#ffffff', FRAME, 0.8)
        centered(pdf, slot.max ?? '', colX[columnIndex] + 50, y - 27, 8.5, { bold: true, color: INK, maxWidth: 30 })
        pdf.text('EXPENDED', colX[columnIndex] + 82, y - 11, 5.4, { bold: true, color: MUTED, maxWidth: 70 })
        pdf.rect(colX[columnIndex] + 82, y - 31, 36, 14, '#ffffff', FRAME, 0.8)
        centered(pdf, slot.max ? (slot.used ?? 0) : '', colX[columnIndex] + 100, y - 27, 8.5, { bold: true, color: INK, maxWidth: 30 })
      }
      for (let row = 0; row < rows; row += 1) {
        const ry = y - 44 - row * rowH
        pdf.line(colX[columnIndex] + 8, ry - 3.5, colX[columnIndex] + colW - 8, ry - 3.5, RULE, 0.6)
        const spell = list[row]
        if (spell) {
          if (level > 0) checkBox(pdf, colX[columnIndex] + 8, ry - 2.5, spell.prepared)
          pdf.text(spell.name, colX[columnIndex] + (level > 0 ? 19 : 10), ry, 7.8, { color: INK, maxWidth: colW - (level > 0 ? 28 : 20) })
        } else if (level > 0) {
          checkBox(pdf, colX[columnIndex] + 8, ry - 2.5, false)
        }
      }
      if (list.length > rows) overflow.push(...list.slice(rows).map(spell => ({ ...spell, level })))
      y -= boxH + 8
    })
  })
  pdf.text('Filled box = prepared', M, M - 10, 6.4, { color: MUTED, maxWidth: 150 })
  return { page: toPage(pdf), overflow }
}

// ── overflow pages ──────────────────────────────────────────────────────────

const continuationPages = (blocks) => {
  const pages = []
  blocks.filter(block => block.text).forEach(block => {
    let remaining = block.text
    let part = 1
    while (remaining) {
      const pdf = makePdfCanvas(THEME)
      const top = pageHeader(pdf, `${block.title}${part > 1 ? ' (continued)' : ''}`, block.owner)
      const boxTop = top - 56
      panel(pdf, M, boxTop, PAGE.width - M * 2, boxTop - M, block.title)
      const next = fillText(pdf, remaining, M + 10, boxTop - 8, PAGE.width - M * 2 - 20, M + 18, 9)
      pages.push(toPage(pdf))
      if (next === remaining) break
      remaining = next
      part += 1
    }
  })
  return pages
}

export const buildCharacterSheetPages = (model, portrait = null) => {
  const one = drawPageOne(model)
  const overflow = { features: one.featureOverflow, equipment: one.equipOverflow, backstory: '' }
  const pageTwo = drawPageTwo(model, portrait, overflow)
  const three = drawPageThree(model)
  const spellOverflow = three.overflow.map(spell => `${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}: ${spell.name}`).join('\n\n')
  return [
    one.page,
    pageTwo,
    three.page,
    ...continuationPages([
      { title: 'Features & traits', text: overflow.features, owner: model.name },
      { title: 'Equipment', text: overflow.equipment, owner: model.name },
      { title: 'Backstory', text: overflow.backstory, owner: model.name },
      { title: 'Additional spells', text: spellOverflow, owner: model.name },
    ]),
  ]
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
  const bytes = createPdfBytes(buildCharacterSheetPages(model, portrait), `${model.name} - Character Sheet`)
  return new Blob([bytes], { type: 'application/pdf' })
}

export const downloadCharacterSheetPdf = async (character) => {
  const blob = await createCharacterSheetPdfBlob(character)
  return downloadBlob(blob, getCharacterSheetFilename(character))
}
