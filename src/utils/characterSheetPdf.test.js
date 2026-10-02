import { describe, expect, it } from 'vitest'
import { buildCharacterSheetModel, createCharacterSheetPdfBlob, getCharacterSheetFilename } from './characterSheetPdf.js'

const makeCharacter = () => ({
  id: 'c1',
  name: 'Thessaly Vane',
  race: 'elf',
  class: 'wizard',
  subclass: 'School of Evocation',
  background: 'sage',
  alignment: 'Chaotic Good',
  level: 5,
  xp: 6500,
  abilityScores: { str: 8, dex: 14, con: 12, int: 18, wis: 13, cha: 10 },
  savingThrows: { int: true, wis: true },
  skills: { arcana: 'expert', history: 'proficient', perception: 'proficient' },
  ac: 12,
  speed: 30,
  hp: { current: 24, max: 31 },
  features: [{ id: 'f1', name: 'Arcane Recovery', source: 'Wizard', description: 'FEATURE_TEXT_ARCANE recover spell slots on a short rest.' }],
  equipment: [{ id: 'e1', name: 'Quarterstaff', type: 'weapon', quantity: 1, description: 'EQUIP_NOTE' }],
  currency: { gp: 42 },
  backstory: 'BACKSTORY_TEXT raised in a library.',
  secrets: 'SECRET_NEVER_EXPORTED',
  journal: 'JOURNAL_NEVER_EXPORTED',
  sessionNotes: 'SESSION_NOTES_NEVER_EXPORTED',
  spells: {
    cantrips: [{ id: 's0', name: 'Fire Bolt', level: 0, school: 'Evocation' }],
    prepared: [{ id: 's1', name: 'Magic Missile', level: 1, school: 'Evocation' }],
    slots: { 1: { max: 4, used: 1 }, 2: { max: 3, used: 0 }, 3: { max: 2, used: 0 } },
  },
})

const latin1 = async (blob) => new TextDecoder('latin1').decode(await blob.arrayBuffer())

describe('character sheet PDF', () => {
  it('calculates the standard sheet numbers', () => {
    const model = buildCharacterSheetModel(makeCharacter())
    expect(model.prof).toBe(3)
    expect(model.mods.int).toBe(4)
    expect(model.initiative).toBe(2)
    expect(model.saves.find(save => save.key === 'int').bonus).toBe(7)
    expect(model.skills.find(skill => skill.id === 'arcana').bonus).toBe(10)
    expect(model.passivePerception).toBe(10 + 1 + 3)
    expect(model.spellSaveDc).toBe(8 + 3 + 4)
    expect(model.spellAttack).toBe(7)
    expect(model.className).toBe('Wizard')
  })

  it('produces a portrait PDF with sheet content and no private notes', async () => {
    const blob = await createCharacterSheetPdfBlob(makeCharacter())
    expect(blob.type).toBe('application/pdf')
    const raw = await latin1(blob)
    expect(raw.startsWith('%PDF')).toBe(true)
    expect(raw).toContain('/MediaBox [0 0 612 792]')
    ;['Thessaly Vane', 'Arcane Recovery', 'FEATURE_TEXT_ARCANE', 'Quarterstaff', 'BACKSTORY_TEXT', 'Magic Missile', 'Fire Bolt', 'SPELL SAVE DC', 'PASSIVE WISDOM', 'ATTACKS & SPELLCASTING']
      .forEach(text => expect(raw).toContain(text))
    ;['SECRET_NEVER_EXPORTED', 'JOURNAL_NEVER_EXPORTED', 'SESSION_NOTES_NEVER_EXPORTED']
      .forEach(text => expect(raw).not.toContain(text))
  })

  it('handles a bare character and many features without throwing', async () => {
    const bare = await createCharacterSheetPdfBlob({ name: 'Nobody' })
    expect(bare.size).toBeGreaterThan(500)
    const many = makeCharacter()
    many.features = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, name: `Feature ${i}`, description: 'word '.repeat(60) }))
    const raw = await latin1(await createCharacterSheetPdfBlob(many))
    expect((raw.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(3)
  })

  it('names the download after the character', () => {
    expect(getCharacterSheetFilename({ name: 'Thessaly Vane' })).toBe('Thessaly-Vane-character-sheet.pdf')
  })
})
