/**
 * Versioned metadata used only where the upstream 5etools corpus has no
 * structured catalog. Parsed records take precedence everywhere this metadata
 * is consumed, keeping these exceptions isolated at the ingestion boundary.
 */
export const ABILITY_CATALOG_FALLBACK = [
  { abbreviation: 'str', name: 'strength', title: 'Strength' },
  { abbreviation: 'dex', name: 'dexterity', title: 'Dexterity' },
  { abbreviation: 'con', name: 'constitution', title: 'Constitution' },
  { abbreviation: 'int', name: 'intelligence', title: 'Intelligence' },
  { abbreviation: 'wis', name: 'wisdom', title: 'Wisdom' },
  { abbreviation: 'cha', name: 'charisma', title: 'Charisma' },
] as const

export const SKILL_CATALOG_FALLBACK = [
  { name: 'acrobatics', ability: 'dexterity' },
  { name: 'animal handling', ability: 'wisdom' },
  { name: 'arcana', ability: 'intelligence' },
  { name: 'athletics', ability: 'strength' },
  { name: 'deception', ability: 'charisma' },
  { name: 'history', ability: 'intelligence' },
  { name: 'insight', ability: 'wisdom' },
  { name: 'intimidation', ability: 'charisma' },
  { name: 'investigation', ability: 'intelligence' },
  { name: 'medicine', ability: 'wisdom' },
  { name: 'nature', ability: 'intelligence' },
  { name: 'perception', ability: 'wisdom' },
  { name: 'performance', ability: 'charisma' },
  { name: 'persuasion', ability: 'charisma' },
  { name: 'religion', ability: 'intelligence' },
  { name: 'sleight of hand', ability: 'dexterity' },
  { name: 'stealth', ability: 'dexterity' },
  { name: 'survival', ability: 'wisdom' },
] as const

export const ORIGIN_BACKGROUND_FALLBACK = {
  source: 'XPHB origin background contract',
  abilityWeights: [
    [2, 1],
    [1, 1, 1],
  ],
  featCategory: 'O',
  featCount: 1,
} as const

export const ALIGNMENT_OPTIONS_FALLBACK = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
] as const

export const LIFESTYLE_OPTIONS_FALLBACK = [
  'Wretched',
  'Squalid',
  'Poor',
  'Modest',
  'Comfortable',
  'Wealthy',
  'Aristocratic',
] as const

export const SPELL_SCHOOL_LABEL_FALLBACKS: Readonly<Record<string, string>> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
  V: 'Evocation',
}

export const DAMAGE_TYPE_LABEL_FALLBACKS: Readonly<Record<string, string>> = {
  S: 'Slashing',
  P: 'Piercing',
  B: 'Bludgeoning',
  N: 'Necrotic',
  F: 'Fire',
  C: 'Cold',
  L: 'Lightning',
  T: 'Thunder',
  A: 'Acid',
  I: 'Poison',
  Y: 'Psychic',
  R: 'Radiant',
  O: 'Force',
}

export const ITEM_RARITY_ORDER_FALLBACK = [
  'common',
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact',
  'varies',
  'unknown (magic)',
  'unknown',
] as const

export const OPTIONAL_FEATURE_TYPE_LABEL_FALLBACKS: Readonly<Record<string, string>> = {
  AI: 'Artificer Infusion',
  ED: 'Elemental Discipline',
  EI: 'Eldritch Invocation',
  'EI:PB': 'Eldritch Invocation (Pact of the Blade)',
  MM: 'Metamagic',
  MV: 'Maneuver',
  'MV:B': 'Maneuver, Battle Master',
  AS: 'Arcane Shot',
  OTH: 'Other',
  'FS:F': 'Fighting Style; Fighter',
  'FS:B': 'Fighting Style; Bard',
  'FS:P': 'Fighting Style; Paladin',
  'FS:R': 'Fighting Style; Ranger',
  PB: 'Pact Boon',
  OR: 'Onomancy Resonant',
  RN: 'Rune Knight Rune',
  AF: 'Alchemical Formula',
  TT: "Traveler's Trick",
  RP: 'Renown Perk',
}

export const FEAT_CATEGORY_LABEL_FALLBACKS: Readonly<Record<string, string>> = {
  D: 'Dragonmark',
  G: 'General',
  O: 'Origin',
  FS: 'Fighting Style',
  'FS:P': 'Fighting Style Replacement (Paladin)',
  'FS:R': 'Fighting Style Replacement (Ranger)',
  EB: 'Epic Boon',
}

export const NON_STANDARD_FEAT_SELECTION_CATEGORIES = new Set(['O', 'EB', 'FS:P', 'FS:R'])

export const LEGACY_SUBCLASS_PREREQUISITE_FIXUPS = {
  'Wizard|PHB|Bladesinger|SCAG': {
    variantOverride: 'bladesingerAnyRace',
    allowedRaceKeyword: 'elf',
  },
  'Barbarian|PHB|Battlerager|SCAG': {
    variantOverride: 'battleragerAnyRace',
    allowedRaceKeyword: 'dwarf',
  },
} as const

export const RACE_STRUCTURED_ENTRY_FIELDS: Readonly<Record<string, string>> = {
  Size: 'size',
  Speed: 'speed',
  Languages: 'languageProficiencies',
}

export type NormalizedArmorCategory = 'light' | 'medium' | 'heavy' | 'shield' | 'none'
export type NormalizedWeaponRange = 'melee' | 'ranged'

export interface ItemTypeFallback {
  armorCategory?: Exclude<NormalizedArmorCategory, 'none'>
  weapon?: boolean
  weaponRange?: NormalizedWeaponRange
  ammunition?: boolean
  gear?: boolean
  tool?: boolean
  potion?: boolean
  scroll?: boolean
  equippable?: boolean
}

/** Current upstream item-type codes. These are validated against parsed item metadata. */
export const ITEM_TYPE_CATALOG_FALLBACKS: Readonly<Record<string, ItemTypeFallback>> = {
  LA: { armorCategory: 'light', equippable: true },
  MA: { armorCategory: 'medium', equippable: true },
  HA: { armorCategory: 'heavy', equippable: true },
  S: { armorCategory: 'shield', equippable: true },
  M: { weapon: true, weaponRange: 'melee', equippable: true },
  R: { weapon: true, weaponRange: 'ranged', equippable: true },
  A: { ammunition: true },
  G: { gear: true },
  AT: { tool: true },
  GS: { tool: true },
  INS: { tool: true },
  T: { tool: true },
  P: { potion: true },
  SC: { scroll: true },
  WD: { equippable: true },
  RD: { equippable: true },
  RG: { equippable: true },
}

/**
 * Non-canonical codes retained only for existing character files. Their absence
 * from the current upstream catalog is expected, so catalog validation skips them.
 */
export const LEGACY_ITEM_TYPE_FALLBACKS: Readonly<Record<string, ItemTypeFallback>> = {
  SHIELD: { armorCategory: 'shield', equippable: true },
  ST: { equippable: true },
}

export const ARMOR_CATEGORY_LABEL_TO_CODE: Readonly<Record<string, string>> = {
  'light armor': 'LA',
  'medium armor': 'MA',
  'heavy armor': 'HA',
  shield: 'S',
}

export const CORE_RULES_METADATA = {
  '2014': {
    standardArray: [15, 14, 13, 12, 10, 8] as const,
    pointBuyBudget: 27,
    pointBuyMin: 8,
    pointBuyMax: 15,
    pointBuyCosts: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
    defaultAbilityScore: 10,
    abilityScoreMinimum: 1,
    abilityScoreCap: 20,
    abilityScoreAbsoluteMaximum: 30,
    maxCharacterLevel: 20,
    maxAttunedItems: 3,
    carryingCapacityMultiplier: 15,
    exhaustionMaximum: 6,
  },
  '2024': {
    standardArray: [15, 14, 13, 12, 10, 8] as const,
    pointBuyBudget: 27,
    pointBuyMin: 8,
    pointBuyMax: 15,
    pointBuyCosts: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
    defaultAbilityScore: 10,
    abilityScoreMinimum: 1,
    abilityScoreCap: 20,
    abilityScoreAbsoluteMaximum: 30,
    maxCharacterLevel: 20,
    maxAttunedItems: 3,
    carryingCapacityMultiplier: 15,
    exhaustionMaximum: 6,
  },
} as const

export const LANGUAGE_GRANT_FALLBACKS = {
  lineage: {
    source: 'MPMM lineage fallback',
    blocks: [{ common: true, anyStandard: 1 }],
  },
  origin2024: {
    source: '2024 Origin Languages',
    baseLanguage: 'Common',
    choiceCount: 2,
  },
} as const
