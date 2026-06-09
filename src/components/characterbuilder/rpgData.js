// Static RPG data for the Character Builder

export const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
]

export const RACES = [
  { id: 'human',      label: 'Human',      traits: ['Extra Skill', '+1 to all ability scores'], abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30 },
  { id: 'elf',        label: 'Elf',         traits: ['Darkvision', 'Fey Ancestry', 'Trance', 'Keen Senses'], abilityBonuses: { dex: 2 }, speed: 30 },
  { id: 'dwarf',      label: 'Dwarf',       traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning', 'Dwarven Combat Training'], abilityBonuses: { con: 2 }, speed: 25 },
  { id: 'halfling',   label: 'Halfling',    traits: ['Lucky', 'Brave', 'Halfling Nimbleness'], abilityBonuses: { dex: 2 }, speed: 25 },
  { id: 'orc',        label: 'Orc',         traits: ['Darkvision', 'Aggressive', 'Powerful Build', 'Menacing'], abilityBonuses: { str: 2, con: 1 }, speed: 30 },
  { id: 'tiefling',   label: 'Tiefling',    traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'], abilityBonuses: { int: 1, cha: 2 }, speed: 30 },
  { id: 'dragonborn', label: 'Dragonborn',  traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'], abilityBonuses: { str: 2, cha: 1 }, speed: 30 },
  { id: 'gnome',      label: 'Gnome',       traits: ['Darkvision', 'Gnome Cunning'], abilityBonuses: { int: 2 }, speed: 25 },
  { id: 'custom',     label: 'Custom Race', traits: [], abilityBonuses: {}, speed: 30 },
]

export const CLASSES = [
  { id: 'fighter',   label: 'Fighter',   hitDie: 'd10', primaryAbility: 'str', savingThrows: ['str', 'con'], armorProf: 'All armor, shields', weaponProf: 'Simple, martial', features: ['Fighting Style', 'Second Wind'] },
  { id: 'rogue',     label: 'Rogue',     hitDie: 'd8',  primaryAbility: 'dex', savingThrows: ['dex', 'int'], armorProf: 'Light armor', weaponProf: 'Simple, hand crossbows, longswords, rapiers, shortswords', features: ['Expertise', 'Sneak Attack', "Thieves' Cant"] },
  { id: 'wizard',    label: 'Wizard',    hitDie: 'd6',  primaryAbility: 'int', savingThrows: ['int', 'wis'], armorProf: 'None', weaponProf: 'Daggers, darts, slings, quarterstaffs, light crossbows', features: ['Spellcasting', 'Arcane Recovery'] },
  { id: 'cleric',    label: 'Cleric',    hitDie: 'd8',  primaryAbility: 'wis', savingThrows: ['wis', 'cha'], armorProf: 'Light, medium armor, shields', weaponProf: 'Simple weapons', features: ['Spellcasting', 'Divine Domain', 'Channel Divinity'] },
  { id: 'ranger',    label: 'Ranger',    hitDie: 'd10', primaryAbility: 'dex', savingThrows: ['str', 'dex'], armorProf: 'Light, medium armor, shields', weaponProf: 'Simple, martial', features: ['Favored Enemy', 'Natural Explorer'] },
  { id: 'paladin',   label: 'Paladin',   hitDie: 'd10', primaryAbility: 'str', savingThrows: ['wis', 'cha'], armorProf: 'All armor, shields', weaponProf: 'Simple, martial', features: ['Divine Sense', 'Lay on Hands'] },
  { id: 'bard',      label: 'Bard',      hitDie: 'd8',  primaryAbility: 'cha', savingThrows: ['dex', 'cha'], armorProf: 'Light armor', weaponProf: 'Simple, hand crossbows, longswords, rapiers, shortswords', features: ['Spellcasting', 'Bardic Inspiration'] },
  { id: 'warlock',   label: 'Warlock',   hitDie: 'd8',  primaryAbility: 'cha', savingThrows: ['wis', 'cha'], armorProf: 'Light armor', weaponProf: 'Simple weapons', features: ['Otherworldly Patron', 'Pact Magic'] },
  { id: 'barbarian', label: 'Barbarian', hitDie: 'd12', primaryAbility: 'str', savingThrows: ['str', 'con'], armorProf: 'Light, medium armor, shields', weaponProf: 'Simple, martial', features: ['Rage', 'Unarmored Defense'] },
  { id: 'druid',     label: 'Druid',     hitDie: 'd8',  primaryAbility: 'wis', savingThrows: ['int', 'wis'], armorProf: 'Light, medium armor (non-metal), shields (non-metal)', weaponProf: 'Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears', features: ['Druidic', 'Spellcasting', 'Wild Shape'] },
  { id: 'monk',      label: 'Monk',      hitDie: 'd8',  primaryAbility: 'dex', savingThrows: ['str', 'dex'], armorProf: 'None', weaponProf: 'Simple, shortswords', features: ['Unarmored Defense', 'Martial Arts'] },
  { id: 'sorcerer',  label: 'Sorcerer',  hitDie: 'd6',  primaryAbility: 'cha', savingThrows: ['con', 'cha'], armorProf: 'None', weaponProf: 'Daggers, darts, slings, quarterstaffs, light crossbows', features: ['Spellcasting', 'Sorcerous Origin', 'Font of Magic'] },
  { id: 'custom',    label: 'Custom Class', hitDie: 'd8', primaryAbility: 'str', savingThrows: [], armorProf: '', weaponProf: '', features: [] },
]

export const BACKGROUNDS = [
  { id: 'acolyte',        label: 'Acolyte',        skills: ['Insight', 'Religion'],            feature: 'Shelter of the Faithful' },
  { id: 'charlatan',      label: 'Charlatan',      skills: ['Deception', 'Sleight of Hand'],   feature: 'False Identity' },
  { id: 'criminal',       label: 'Criminal',       skills: ['Deception', 'Stealth'],           feature: 'Criminal Contact' },
  { id: 'entertainer',    label: 'Entertainer',    skills: ['Acrobatics', 'Performance'],      feature: 'By Popular Demand' },
  { id: 'folk_hero',      label: 'Folk Hero',      skills: ['Animal Handling', 'Survival'],    feature: 'Rustic Hospitality' },
  { id: 'guild_artisan',  label: 'Guild Artisan',  skills: ['Insight', 'Persuasion'],          feature: 'Guild Membership' },
  { id: 'hermit',         label: 'Hermit',         skills: ['Medicine', 'Religion'],           feature: 'Discovery' },
  { id: 'noble',          label: 'Noble',          skills: ['History', 'Persuasion'],          feature: 'Position of Privilege' },
  { id: 'outlander',      label: 'Outlander',      skills: ['Athletics', 'Survival'],          feature: 'Wanderer' },
  { id: 'sage',           label: 'Sage',           skills: ['Arcana', 'History'],              feature: 'Researcher' },
  { id: 'sailor',         label: 'Sailor',         skills: ['Athletics', 'Perception'],        feature: "Ship's Passage" },
  { id: 'soldier',        label: 'Soldier',        skills: ['Athletics', 'Intimidation'],      feature: 'Military Rank' },
  { id: 'urchin',         label: 'Urchin',         skills: ['Sleight of Hand', 'Stealth'],     feature: 'City Secrets' },
  { id: 'custom',         label: 'Custom Background', skills: [],                              feature: '' },
]

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']
export const ABILITY_LABELS = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' }
export const ABILITY_SHORT = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]

export const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }
export const POINT_BUY_BUDGET = 27

export const SKILLS = [
  { id: 'acrobatics',      label: 'Acrobatics',      ability: 'dex' },
  { id: 'animal_handling', label: 'Animal Handling',  ability: 'wis' },
  { id: 'arcana',          label: 'Arcana',           ability: 'int' },
  { id: 'athletics',       label: 'Athletics',        ability: 'str' },
  { id: 'deception',       label: 'Deception',        ability: 'cha' },
  { id: 'history',         label: 'History',          ability: 'int' },
  { id: 'insight',         label: 'Insight',          ability: 'wis' },
  { id: 'intimidation',    label: 'Intimidation',     ability: 'cha' },
  { id: 'investigation',   label: 'Investigation',    ability: 'int' },
  { id: 'medicine',        label: 'Medicine',         ability: 'wis' },
  { id: 'nature',          label: 'Nature',           ability: 'int' },
  { id: 'perception',      label: 'Perception',       ability: 'wis' },
  { id: 'performance',     label: 'Performance',      ability: 'cha' },
  { id: 'persuasion',      label: 'Persuasion',       ability: 'cha' },
  { id: 'religion',        label: 'Religion',         ability: 'int' },
  { id: 'sleight_of_hand', label: 'Sleight of Hand',  ability: 'dex' },
  { id: 'stealth',         label: 'Stealth',          ability: 'dex' },
  { id: 'survival',        label: 'Survival',         ability: 'wis' },
]

export const CONDITIONS = [
  { id: 'blinded',       label: 'Blinded',       color: '#64748b' },
  { id: 'charmed',       label: 'Charmed',       color: '#ec4899' },
  { id: 'concentration', label: 'Concentration', color: '#8b5cf6' },
  { id: 'deafened',      label: 'Deafened',      color: '#64748b' },
  { id: 'exhaustion',    label: 'Exhaustion',    color: '#f59e0b' },
  { id: 'frightened',    label: 'Frightened',    color: '#f97316' },
  { id: 'grappled',      label: 'Grappled',      color: '#84cc16' },
  { id: 'incapacitated', label: 'Incapacitated', color: '#ef4444' },
  { id: 'invisible',     label: 'Invisible',     color: '#94a3b8' },
  { id: 'paralyzed',     label: 'Paralyzed',     color: '#dc2626' },
  { id: 'petrified',     label: 'Petrified',     color: '#78716c' },
  { id: 'poisoned',      label: 'Poisoned',      color: '#22c55e' },
  { id: 'prone',         label: 'Prone',         color: '#a78bfa' },
  { id: 'restrained',    label: 'Restrained',    color: '#fb923c' },
  { id: 'stunned',       label: 'Stunned',       color: '#fbbf24' },
  { id: 'unconscious',   label: 'Unconscious',   color: '#1e293b' },
]

export const SPELL_SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
]

export const STARTING_EQUIPMENT = {
  fighter:   ['Chain mail', 'Shield', 'Longsword', 'Light crossbow', '20 bolts', "Explorer's pack"],
  rogue:     ['Leather armor', 'Two daggers', 'Shortbow', '20 arrows', "Burglar's pack", "Thieves' tools"],
  wizard:    ['Quarterstaff', 'Arcane focus', "Scholar's pack", 'Spellbook'],
  cleric:    ['Chain mail', 'Shield', 'Mace', 'Holy symbol', "Priest's pack"],
  ranger:    ['Scale mail', 'Two shortswords', 'Longbow', '20 arrows', "Dungeoneer's pack"],
  paladin:   ['Chain mail', 'Shield', 'Longsword', 'Holy symbol', "Priest's pack"],
  bard:      ['Leather armor', 'Rapier', 'Lute', "Entertainer's pack", 'Dagger'],
  warlock:   ['Light crossbow', '20 bolts', 'Leather armor', 'Arcane focus', "Scholar's pack", 'Two daggers'],
  barbarian: ['Greataxe', 'Two handaxes', "Explorer's pack", '4 javelins'],
  druid:     ['Wooden shield', 'Scimitar', 'Leather armor', "Explorer's pack", 'Druidic focus'],
  monk:      ['Shortsword', "Dungeoneer's pack", '10 darts'],
  sorcerer:  ['Light crossbow', '20 bolts', 'Arcane focus', "Dungeoneer's pack", 'Two daggers'],
  custom:    [],
}

export const NPC_RELATIONSHIP_TYPES = [
  'Friend', 'Family', 'Rival', 'Enemy', 'Ally', 'Mentor',
  'Romance', 'Employer', 'Contact', 'Neutral',
]

export const CHARACTER_STATUSES = [
  { id: 'active',   label: 'Active',   color: '#22c55e' },
  { id: 'inactive', label: 'Inactive', color: '#94a3b8' },
  { id: 'deceased', label: 'Deceased', color: '#ef4444' },
]

// Proficiency bonus lookup by level
export const getProficiencyBonus = (level) => {
  if (level <= 4)  return 2
  if (level <= 8)  return 3
  if (level <= 12) return 4
  if (level <= 16) return 5
  return 6
}

// Ability modifier calculation
export const getModifier = (score) => Math.floor((score - 10) / 2)

// Format modifier as +2 / -1 etc.
export const formatMod = (mod) => mod >= 0 ? `+${mod}` : `${mod}`

// XP thresholds per level (standard D&D 5e)
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

export const getLevel = (xp) => {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) return i + 1
  }
  return 1
}

export const xpForNextLevel = (level) => XP_THRESHOLDS[level] ?? null

// Spell slots by class level (simplified for Fighter/Rogue half-casters and full casters)
export const getSpellSlots = (classId, level) => {
  const fullCasters = ['wizard', 'cleric', 'bard', 'druid', 'sorcerer', 'warlock']
  const halfCasters = ['paladin', 'ranger']
  if (!fullCasters.includes(classId) && !halfCasters.includes(classId)) return null

  if (classId === 'warlock') {
    const slots = [1,1,2,2,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4][level - 1] || 0
    const slotLevel = Math.min(5, Math.ceil(level / 2))
    const result = {}
    if (slots > 0) result[slotLevel] = { max: slots, used: 0 }
    return result
  }

  const fullSlots = [
    [2,0,0,0,0,0,0,0,0],
    [3,0,0,0,0,0,0,0,0],
    [4,2,0,0,0,0,0,0,0],
    [4,3,0,0,0,0,0,0,0],
    [4,3,2,0,0,0,0,0,0],
    [4,3,3,0,0,0,0,0,0],
    [4,3,3,1,0,0,0,0,0],
    [4,3,3,2,0,0,0,0,0],
    [4,3,3,3,1,0,0,0,0],
    [4,3,3,3,2,0,0,0,0],
    [4,3,3,3,2,1,0,0,0],
    [4,3,3,3,2,1,0,0,0],
    [4,3,3,3,2,1,1,0,0],
    [4,3,3,3,2,1,1,0,0],
    [4,3,3,3,2,1,1,1,0],
    [4,3,3,3,2,1,1,1,0],
    [4,3,3,3,2,1,1,1,1],
    [4,3,3,3,3,1,1,1,1],
    [4,3,3,3,3,2,1,1,1],
    [4,3,3,3,3,2,2,1,1],
  ]

  const effectiveLevel = halfCasters.includes(classId) ? Math.floor(level / 2) : level
  const row = fullSlots[Math.min(effectiveLevel, fullSlots.length) - 1] || []
  const result = {}
  row.forEach((count, i) => { if (count > 0) result[i + 1] = { max: count, used: 0 } })
  return result
}

// Create a fresh RPG character skeleton
export const makeNewCharacter = (novelId, overrides = {}) => ({
  id: null,
  novelId,
  name: 'New Adventurer',
  portrait: null,
  age: '',
  gender: '',
  pronouns: '',
  alignment: 'True Neutral',
  background: 'acolyte',
  customBackground: '',
  race: 'human',
  customRace: '',
  class: 'fighter',
  customClass: '',
  subclass: '',
  level: 1,
  xp: 0,
  inspiration: false,
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  hp: { max: 10, current: 10, temp: 0 },
  ac: 10,
  speed: 30,
  skills: {},
  savingThrows: {},
  equipment: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  spells: {
    spellcastingAbility: 'int',
    slots: {},
    known: [],
    prepared: [],
    cantrips: [],
  },
  currentLocation: '',
  homeLocation: '',
  factionIds: [],
  npcRelationships: [],
  journal: '',
  sessionNotes: '',
  backstory: '',
  secrets: '',
  status: 'active',
  conditions: [],
  isPartyMember: true,
  partyOrder: 0,
  timeline: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})
