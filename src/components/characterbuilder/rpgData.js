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

// ─── Subclasses ──────────────────────────────────────────────────────────────
// Cleric Domains, Paladin Oaths, and Warlock Patrons grant automatic "always prepared"
// spells at the given class level thresholds (SRD-style domain/oath/expanded spell lists).
// Druid Circle of Land grants terrain-specific bonus spells the same way.
// Other classes list real SRD subclass names without mechanical spell grants.

export const SUBCLASSES = {
  fighter: [
    { id: 'champion', label: 'Champion' },
    { id: 'battle_master', label: 'Battle Master' },
    { id: 'eldritch_knight', label: 'Eldritch Knight' },
  ],
  rogue: [
    { id: 'thief', label: 'Thief' },
    { id: 'assassin', label: 'Assassin' },
    { id: 'arcane_trickster', label: 'Arcane Trickster' },
  ],
  barbarian: [
    { id: 'berserker', label: 'Path of the Berserker' },
    { id: 'totem_warrior', label: 'Path of the Totem Warrior' },
  ],
  monk: [
    { id: 'open_hand', label: 'Way of the Open Hand' },
    { id: 'shadow', label: 'Way of Shadow' },
    { id: 'four_elements', label: 'Way of the Four Elements' },
  ],
  wizard: [
    { id: 'abjuration', label: 'School of Abjuration' },
    { id: 'conjuration', label: 'School of Conjuration' },
    { id: 'divination', label: 'School of Divination' },
    { id: 'enchantment', label: 'School of Enchantment' },
    { id: 'evocation', label: 'School of Evocation' },
    { id: 'illusion', label: 'School of Illusion' },
    { id: 'necromancy', label: 'School of Necromancy' },
    { id: 'transmutation', label: 'School of Transmutation' },
  ],
  bard: [
    { id: 'lore', label: 'College of Lore' },
    { id: 'valor', label: 'College of Valor' },
  ],
  ranger: [
    { id: 'hunter', label: 'Hunter' },
    { id: 'beast_master', label: 'Beast Master' },
  ],
  sorcerer: [
    { id: 'draconic_bloodline', label: 'Draconic Bloodline' },
    { id: 'wild_magic', label: 'Wild Magic' },
  ],
  cleric: [
    { id: 'knowledge', label: 'Knowledge Domain', domainSpells: { 1: ['Command', 'Identify'], 3: ['Nondetection', 'Speak with Dead'], 5: ['Legend Lore', 'Scrying'] } },
    { id: 'life', label: 'Life Domain', domainSpells: { 1: ['Bless', 'Cure Wounds'], 3: ['Beacon of Hope', 'Revivify'], 5: ['Mass Cure Wounds', 'Raise Dead'] } },
    { id: 'light', label: 'Light Domain', domainSpells: { 1: ['Burning Hands', 'Faerie Fire'], 3: ['Daylight', 'Fireball'], 5: ['Flame Strike'] } },
    { id: 'nature', label: 'Nature Domain', domainSpells: { 1: ['Animal Friendship', 'Goodberry'], 3: ['Call Lightning', 'Plant Growth'], 5: ['Insect Plague', 'Tree Stride'] } },
    { id: 'tempest', label: 'Tempest Domain', domainSpells: { 1: ['Fog Cloud', 'Thunderwave'], 3: ['Call Lightning', 'Sleet Storm'], 5: ['Cone of Cold'] } },
    { id: 'trickery', label: 'Trickery Domain', domainSpells: { 1: ['Charm Person', 'Disguise Self'], 3: ['Hypnotic Pattern', 'Major Image'], 5: ['Dream', 'Modify Memory'] } },
    { id: 'war', label: 'War Domain', domainSpells: { 1: ['Shield of Faith', 'Magic Missile'], 3: ['Elemental Weapon', 'Spirit Guardians'], 5: ['Hold Monster'] } },
  ],
  paladin: [
    { id: 'devotion', label: 'Oath of Devotion', domainSpells: { 3: ['Protection from Evil and Good', 'Sanctuary'], 5: ['Lesser Restoration', 'Zone of Truth'], 9: ['Beacon of Hope', 'Dispel Magic'], 13: ['Freedom of Movement', 'Guardian of Faith'], 17: ['Commune', 'Flame Strike'] } },
    { id: 'ancients', label: 'Oath of the Ancients', domainSpells: { 3: ['Entangle', 'Speak with Animals'], 5: ['Misty Step', 'Moonbeam'], 9: ['Plant Growth', 'Protection from Energy'], 13: ['Ice Storm', 'Stoneskin'], 17: ['Commune with Nature', 'Tree Stride'] } },
    { id: 'vengeance', label: 'Oath of Vengeance', domainSpells: { 3: ['Bane', "Hunter's Mark"], 5: ['Hold Person', 'Misty Step'], 9: ['Haste', 'Protection from Energy'], 13: ['Banishment', 'Dimension Door'], 17: ['Hold Monster', 'Scrying'] } },
  ],
  warlock: [
    { id: 'archfey', label: 'The Archfey', domainSpells: { 1: ['Faerie Fire', 'Sleep'], 3: ['Calm Emotions', 'Misty Step'], 5: ['Blink', 'Plant Growth'], 7: ['Dominate Beast', 'Greater Invisibility'], 9: ['Dream', 'Insect Plague'] } },
    { id: 'fiend', label: 'The Fiend', domainSpells: { 1: ['Burning Hands', 'Command'], 3: ['Blindness/Deafness', 'Scorching Ray'], 5: ['Fireball', 'Stinking Cloud'], 7: ['Fire Shield', 'Wall of Fire'], 9: ['Flame Strike', 'Hallow'] } },
    { id: 'great_old_one', label: 'The Great Old One', domainSpells: { 1: ['Charm Person', 'Sleep'], 3: ['Hold Person', 'Invisibility'], 5: ['Clairvoyance', 'Sending'], 7: ['Confusion', 'Dominate Beast'], 9: ['Modify Memory', 'Telekinesis'] } },
  ],
  druid: [
    { id: 'land_arctic', label: 'Circle of the Land (Arctic)', domainSpells: { 3: ['Hold Person', 'Spike Growth'], 5: ['Protection from Energy', 'Sleet Storm'], 7: ['Freedom of Movement', 'Ice Storm'], 9: ['Cone of Cold', 'Wall of Stone'] } },
    { id: 'land_coast', label: 'Circle of the Land (Coast)', domainSpells: { 3: ['Mirror Image', 'Misty Step'], 5: ['Fly', 'Protection from Energy'], 7: ['Control Water', 'Freedom of Movement'], 9: ['Conjure Elemental', 'Wall of Stone'] } },
    { id: 'land_desert', label: 'Circle of the Land (Desert)', domainSpells: { 3: ['Blur', 'Silence'], 5: ['Fly', 'Protection from Energy'], 7: ['Blight', 'Hallucinatory Terrain'], 9: ['Insect Plague', 'Wall of Stone'] } },
    { id: 'land_forest', label: 'Circle of the Land (Forest)', domainSpells: { 3: ['Barkskin', 'Darkvision'], 5: ['Conjure Animals', 'Plant Growth'], 7: ['Conjure Woodland Beings', 'Grasping Vine'], 9: ['Insect Plague', 'Tree Stride'] } },
    { id: 'land_grassland', label: 'Circle of the Land (Grassland)', domainSpells: { 3: ['Invisibility', 'Pass without Trace'], 5: ['Daylight', 'Haste'], 7: ['Confusion', 'Freedom of Movement'], 9: ['Telekinesis', 'Wall of Stone'] } },
    { id: 'land_mountain', label: 'Circle of the Land (Mountain)', domainSpells: { 3: ['Spider Climb', 'Spike Growth'], 5: ['Lightning Bolt', 'Protection from Energy'], 7: ['Stone Shape', 'Stoneskin'], 9: ['Passwall', 'Wall of Stone'] } },
    { id: 'land_swamp', label: 'Circle of the Land (Swamp)', domainSpells: { 3: ['Darkness', 'Ray of Enfeeblement'], 5: ['Stinking Cloud', 'Vampiric Touch'], 7: ['Blight', 'Confusion'], 9: ['Contagion', 'Insect Plague'] } },
    { id: 'land_underdark', label: 'Circle of the Land (Underdark)', domainSpells: { 3: ['Spider Climb', 'Web'], 5: ['Conjure Elemental', 'Stinking Cloud'], 7: ['Greater Invisibility', 'Stoneskin'], 9: ['Cloudkill', 'Insect Plague'] } },
    { id: 'moon', label: 'Circle of the Moon' },
  ],
  custom: [],
}

export const getSubclassOptions = (classId) => SUBCLASSES[classId] || []

// Domain/oath/patron/circle spells the character always has prepared, regardless of normal prepared/known limits
export const getAlwaysPreparedSpells = (classId, subclassId, level) => {
  const sub = (SUBCLASSES[classId] || []).find(s => s.id === subclassId)
  if (!sub?.domainSpells) return []
  const names = []
  Object.entries(sub.domainSpells).forEach(([thresholdLevel, spellNames]) => {
    if (level >= Number(thresholdLevel)) names.push(...spellNames)
  })
  return [...new Set(names)]
}

// ─── Spellcasting progression ────────────────────────────────────────────────

export const SPELLCASTING_ABILITY = {
  wizard: 'int',
  cleric: 'wis', druid: 'wis', ranger: 'wis',
  paladin: 'cha', bard: 'cha', sorcerer: 'cha', warlock: 'cha',
}

export const getSpellcastingAbility = (classId) => SPELLCASTING_ABILITY[classId] || null

export const KNOWN_CASTERS = ['bard', 'sorcerer', 'warlock', 'ranger']
export const PREPARED_CASTERS = ['cleric', 'druid', 'paladin', 'wizard']

export const isSpellcaster = (classId) => KNOWN_CASTERS.includes(classId) || PREPARED_CASTERS.includes(classId)
export const isKnownCaster = (classId) => KNOWN_CASTERS.includes(classId)
export const isPreparedCaster = (classId) => PREPARED_CASTERS.includes(classId)

const CANTRIPS_KNOWN = {
  bard:     [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  cleric:   [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
  druid:    [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  sorcerer: [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
  warlock:  [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
  wizard:   [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
}

export const getCantripsKnown = (classId, level) => CANTRIPS_KNOWN[classId]?.[Math.min(20, Math.max(1, level)) - 1] ?? 0

const SPELLS_KNOWN = {
  bard:     [4,5,6,7,8,9,10,11,12,14,15,15,16,18,19,19,20,22,22,22],
  sorcerer: [2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15],
  warlock:  [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
  ranger:   [0,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11],
}

// Fixed known-spell count for known casters (Bard, Sorcerer, Warlock, Ranger)
export const getKnownSpellCount = (classId, level) => SPELLS_KNOWN[classId]?.[Math.min(20, Math.max(1, level)) - 1] ?? 0

// Prepared-spell count for prepared casters (Cleric, Druid, Paladin, Wizard spellbook)
export const getPreparedSpellCount = (classId, level, abilityMod) => {
  if (classId === 'cleric' || classId === 'druid' || classId === 'wizard') return Math.max(1, level + abilityMod)
  if (classId === 'paladin') return Math.max(1, Math.floor(level / 2) + abilityMod)
  return 0
}

export const ASI_LEVELS = [4, 8, 12, 16, 19]

// ─── Sorcerer Metamagic ───────────────────────────────────────────────────────

export const METAMAGIC_OPTIONS = [
  { id: 'careful',   name: 'Careful Spell',   desc: 'Protect chosen creatures from being affected by your area-of-effect spells.' },
  { id: 'distant',   name: 'Distant Spell',   desc: 'Double the range of a spell, or turn a touch spell into a 30-foot ranged spell.' },
  { id: 'empowered', name: 'Empowered Spell', desc: 'Reroll a number of damage dice from a spell equal to your Charisma modifier.' },
  { id: 'extended',  name: 'Extended Spell',  desc: 'Double the duration of a spell that has a duration, up to 24 hours.' },
  { id: 'heightened', name: 'Heightened Spell', desc: 'Give one target disadvantage on its first save against a spell you cast.' },
  { id: 'quickened', name: 'Quickened Spell', desc: 'Cast a spell that normally takes an action as a bonus action instead.' },
  { id: 'subtle',    name: 'Subtle Spell',    desc: 'Cast a spell without verbal or somatic components.' },
  { id: 'twinned',   name: 'Twinned Spell',   desc: 'Target a second creature with a spell that normally targets only one.' },
]

const METAMAGIC_KNOWN = [0,0,2,2,2,2,2,2,2,3,3,3,3,3,3,3,4,4,4,4]
export const getMetamagicKnownCount = (level) => METAMAGIC_KNOWN[Math.min(20, Math.max(1, level)) - 1] ?? 0

// ─── Warlock Eldritch Invocations ─────────────────────────────────────────────

export const INVOCATIONS = [
  { id: 'agonizing_blast',       name: 'Agonizing Blast',            desc: 'Add your Charisma modifier to the damage of Eldritch Blast.' },
  { id: 'armor_of_shadows',      name: 'Armor of Shadows',           desc: 'Cast Mage Armor on yourself at will, without a spell slot.' },
  { id: 'beast_speech',          name: 'Beast Speech',               desc: 'Cast Speak with Animals at will, without a spell slot.' },
  { id: 'beguiling_influence',   name: 'Beguiling Influence',        desc: 'Gain proficiency in the Deception and Persuasion skills.' },
  { id: 'devils_sight',         name: "Devil's Sight",               desc: 'See normally in darkness, magical or not, out to 120 feet.' },
  { id: 'eldritch_sight',        name: 'Eldritch Sight',             desc: 'Cast Detect Magic at will, without a spell slot.' },
  { id: 'eyes_of_rune_keeper',   name: 'Eyes of the Rune Keeper',    desc: 'You can read all writing, in any language.' },
  { id: 'fiendish_vigor',        name: 'Fiendish Vigor',             desc: 'Cast False Life on yourself at will, without a spell slot.' },
  { id: 'gaze_of_two_minds',     name: 'Gaze of Two Minds',          desc: 'Touch a willing creature to perceive through its senses for a while.' },
  { id: 'mask_of_many_faces',    name: 'Mask of Many Faces',         desc: 'Cast Disguise Self at will, without a spell slot.' },
  { id: 'misty_visions',         name: 'Misty Visions',              desc: 'Cast Silent Image at will, without a spell slot.' },
  { id: 'repelling_blast',       name: 'Repelling Blast',            desc: 'Push a target up to 10 feet away when you hit it with Eldritch Blast.' },
  { id: 'thief_of_five_fates',   name: 'Thief of Five Fates',        desc: 'Cast Bane once per long rest, without a spell slot.' },
  { id: 'voice_of_chain_master', name: 'Voice of the Chain Master',  desc: 'Speak, see, and hear through the senses of your familiar.' },
]

const INVOCATIONS_KNOWN = [0,2,2,2,3,3,4,4,5,5,5,6,6,6,7,7,7,8,8,8]
export const getInvocationsKnownCount = (level) => INVOCATIONS_KNOWN[Math.min(20, Math.max(1, level)) - 1] ?? 0

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
    alwaysPrepared: [],
    metamagic: [],
    invocations: [],
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

// Backfills nested objects (hp, abilityScores, currency, spells) that older
// records — from a previous app version, an incomplete AI import, or a save
// that landed mid-wizard — may be missing entirely. The sheet UI reads e.g.
// character.hp.current directly, so a missing nested object crashes the
// Party page rather than just rendering oddly.
export const normalizeRpgCharacter = (character) => {
  const defaults = makeNewCharacter(character.novelId)
  return {
    ...defaults,
    ...character,
    hp: { ...defaults.hp, ...(character.hp || {}) },
    abilityScores: { ...defaults.abilityScores, ...(character.abilityScores || {}) },
    currency: { ...defaults.currency, ...(character.currency || {}) },
    spells: { ...defaults.spells, ...(character.spells || {}) },
  }
}
