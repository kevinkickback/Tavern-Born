import { buildGameDataLookups } from '@/lib/5etools/lookups'
import type { Class5e, GameData, Raw5ePrereq } from '@/types/5etools'
import type { AbilityName, Character, SpellProfile } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedClassRules } from '@/types/classRules'
import { makeCharacterFixture } from './characterFixtures'
import { makeGameDataFixture, makeSpellFixture } from './gameDataFixtures'

interface ExpectedSpellcastingDetail {
  profileId: string
  spellSaveDC: number
  spellAttackBonus: number
}

export interface RepresentativeCharacterFixture {
  id: string
  label: string
  character: Character
  gameData: GameData
  prerequisite: Raw5ePrereq
  prerequisiteOptions?: { spellcastingClasses?: Set<string>; className?: string }
  expected: {
    abilityScores: Partial<Record<AbilityName, number>>
    armorClass: number
    maxHitPoints: number
    walkingSpeed: number
    carryCapacity: number
    totalWeight: number
    profileIds: string[]
    spellcasting: ExpectedSpellcastingDetail[]
    sharedSlots: Array<{ level: number; max: number; used: number }>
    pactSlots: Array<{ level: number; max: number; used: number }>
    skill?: { name: string; modifier: number }
    savingThrow?: { ability: AbilityName; modifier: number }
    mastery?: { weapon: string; name: string }
  }
}

const EMPTY_RULES: NormalizedClassRules = {
  resources: [],
  asiLevels: [],
  ritualCasting: false,
  choices: [],
  choiceDiagnostics: [],
}

function classChoice(
  id: string,
  label: string,
  className: string,
  level: number,
  options: NormalizedCharacterChoice['options'],
  kind: NormalizedCharacterChoice['kind'] = 'class-feature',
): NormalizedCharacterChoice {
  return {
    id,
    label,
    kind,
    owner: { type: 'class', name: className, source: 'XPHB', featureName: label },
    level,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) => (index + 1 >= level ? 1 : 0)),
    options,
    repeatable: false,
    replacement: { cadence: 'never' },
    source: { kind: 'class-feature-options', field: `${label} test fixture` },
  }
}

function specialProfile(): SpellProfile {
  return {
    id: 'special:unrestricted',
    type: 'special',
    label: 'Special (Unrestricted)',
    cantrips: [],
    spellsKnown: [],
    preparedSpells: [],
    alwaysPrepared: true,
  }
}

function classProfile(
  className: string,
  source: string,
  spells: Partial<Pick<SpellProfile, 'cantrips' | 'spellsKnown' | 'preparedSpells'>> = {},
): SpellProfile {
  return {
    id: `class:${className}|${source}`,
    type: 'class',
    label: className,
    className,
    classSource: source,
    cantrips: spells.cantrips ?? [],
    spellsKnown: spells.spellsKnown ?? [],
    preparedSpells: spells.preparedSpells ?? [],
    alwaysPrepared: false,
  }
}

function withLookups(gameData: GameData): GameData {
  gameData.lookups = buildGameDataLookups(gameData)
  return gameData
}

function standardCharacter(overrides: Partial<Character>): Character {
  return makeCharacterFixture({
    variantRules: { abilityScoreMethod: 'custom', averageHitPoints: true },
    hitPoints: { max: 0, current: 1, temporary: 0 },
    hitPointsInitialized: true,
    ...overrides,
  })
}

const fighter2014 = {
  name: 'Fighter',
  source: 'PHB',
  hd: { faces: 10 },
  normalizedRules: EMPTY_RULES,
} as Class5e
const wizard2014 = {
  name: 'Wizard',
  source: 'PHB',
  hd: { faces: 6 },
  spellcastingAbility: 'int',
  casterProgression: 'full',
  preparedSpells: '<$level$> + <$int_mod$>',
  classTableGroups: [{ rowsSpellProgression: [[2], [3], [4, 2], [4, 3]] }],
  normalizedRules: { ...EMPTY_RULES, asiLevels: [4] },
} as Class5e

const dwarfMartialCharacter = standardCharacter({
  id: 'representative-dwarf-martial',
  name: 'Dwarf Martial Fixture',
  race: 'Dwarf',
  raceSource: 'PHB',
  class: 'Fighter',
  classSource: 'PHB',
  classProgression: [{ name: 'Fighter', source: 'PHB', levels: 4 }],
  level: 4,
  background: 'Soldier',
  backgroundSource: 'PHB',
  allowedSources: ['PHB'],
  abilityScores: {
    strength: 15,
    dexterity: 12,
    constitution: 14,
    intelligence: 8,
    wisdom: 10,
    charisma: 10,
  },
  movement: {
    speeds: { walk: 25 },
    source: { kind: 'race', name: 'Dwarf', source: 'PHB' },
  },
  asiChoices: [
    {
      id: 'fighter|PHB|4',
      level: 4,
      className: 'Fighter',
      classSource: 'PHB',
      abilityChanges: { strength: 1, wisdom: 1 },
    },
  ],
  proficiencies: {
    armor: ['medium armor', 'shields'],
    weapons: ['martial weapons'],
    tools: [],
    skills: ['athletics'],
    languages: ['Common', 'Dwarvish'],
    savingThrows: ['strength', 'constitution'],
  },
  skills: { athletics: { proficient: true, expertise: false, bonus: 0 } },
  equipment: [
    {
      id: 'dwarf-medium-armor',
      name: 'Fixture Medium Armor',
      source: 'PHB',
      type: 'MA',
      armorType: 'medium',
      ac: 14,
      weight: 20,
      quantity: 1,
      equipped: true,
    },
    {
      id: 'dwarf-shield',
      name: 'Fixture Shield',
      source: 'PHB',
      type: 'S',
      armorType: 'shield',
      ac: 2,
      weight: 6,
      quantity: 1,
      equipped: true,
    },
  ],
  spells: {
    ...makeCharacterFixture().spells,
    spellProfiles: [classProfile('Fighter', 'PHB'), specialProfile()],
  },
})

const dwarfMartialData = withLookups(
  makeGameDataFixture({
    races: [
      { name: 'Dwarf', source: 'PHB', ability: [{ con: 2 }], speed: 25, size: ['M'] },
      { name: 'Dwarf', source: 'ALT', ability: [{ con: 8 }], speed: 40 },
    ],
    classes: [fighter2014],
    backgrounds: [{ name: 'Soldier', source: 'PHB' }],
    sources: [{ abbreviation: 'PHB', name: 'Player Handbook', group: 'Core' }],
  }),
)

const elfWizardCharacter = standardCharacter({
  id: 'representative-elf-wizard',
  name: 'Elf Wizard Fixture',
  race: 'Elf',
  raceSource: 'PHB',
  class: 'Wizard',
  classSource: 'PHB',
  classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
  level: 4,
  background: 'Sage',
  backgroundSource: 'PHB',
  allowedSources: ['PHB'],
  abilityScores: {
    strength: 8,
    dexterity: 14,
    constitution: 13,
    intelligence: 15,
    wisdom: 12,
    charisma: 10,
  },
  movement: {
    speeds: { walk: 30 },
    source: { kind: 'race', name: 'Elf', source: 'PHB' },
  },
  asiChoices: [
    {
      id: 'wizard|PHB|4',
      level: 4,
      className: 'Wizard',
      classSource: 'PHB',
      abilityChanges: { intelligence: 1, constitution: 1 },
    },
  ],
  proficiencies: {
    armor: ['light armor'],
    weapons: [],
    tools: [],
    skills: ['arcana'],
    languages: ['Common', 'Elvish'],
    savingThrows: ['intelligence'],
  },
  skills: { arcana: { proficient: true, expertise: false, bonus: 0 } },
  equipment: [
    {
      id: 'elf-light-armor',
      name: 'Fixture Light Armor',
      source: 'PHB',
      type: 'LA',
      armorType: 'light',
      ac: 11,
      weight: 10,
      quantity: 1,
      equipped: true,
    },
  ],
  spells: {
    ...makeCharacterFixture().spells,
    spellProfiles: [
      classProfile('Wizard', 'PHB', { cantrips: ['Mage Hand'], preparedSpells: ['Magic Missile'] }),
      specialProfile(),
    ],
  },
})

const elfWizardData = withLookups(
  makeGameDataFixture({
    races: [
      { name: 'Elf', source: 'PHB', ability: [{ dex: 2 }], speed: 30, size: ['M'] },
      { name: 'Elf', source: 'ALT', ability: [{ int: 7 }], speed: 45 },
    ],
    classes: [wizard2014, { ...wizard2014, source: 'ALT', hd: { faces: 20 } }],
    backgrounds: [{ name: 'Sage', source: 'PHB' }],
    spells: [
      makeSpellFixture({ name: 'Mage Hand', source: 'PHB', level: 0 }),
      makeSpellFixture({ name: 'Magic Missile', source: 'PHB', level: 1 }),
    ],
    sources: [{ abbreviation: 'PHB', name: 'Player Handbook', group: 'Core' }],
  }),
)

const divineOrder = classChoice(
  'class:cleric|xphb|choice:divine-order|1',
  'Divine Order',
  'Cleric',
  1,
  [
    { entityType: 'classFeature', name: 'Protector', source: 'XPHB' },
    { entityType: 'classFeature', name: 'Thaumaturge', source: 'XPHB' },
  ],
)
const cleric2024 = {
  name: 'Cleric',
  source: 'XPHB',
  edition: 'one',
  hd: { faces: 8 },
  spellcastingAbility: 'wis',
  casterProgression: 'full',
  preparedSpellsProgression: [4],
  preparedSpellsChange: 'restLong',
  cantripProgression: [3],
  classTableGroups: [{ rowsSpellProgression: [[2]] }],
  normalizedRules: { ...EMPTY_RULES, choices: [divineOrder] },
} as Class5e

const clericCharacter = standardCharacter({
  id: 'representative-2024-cleric',
  name: '2024 Cleric Fixture',
  originSystem: '2024',
  race: 'Human',
  raceSource: 'XPHB',
  class: 'Cleric',
  classSource: 'XPHB',
  classProgression: [{ name: 'Cleric', source: 'XPHB', levels: 1 }],
  background: 'Acolyte',
  backgroundSource: 'XPHB',
  allowedSources: ['XPHB'],
  abilityScores: {
    strength: 12,
    dexterity: 12,
    constitution: 13,
    intelligence: 10,
    wisdom: 15,
    charisma: 8,
  },
  backgroundAsiChoices: ['wisdom', 'charisma'],
  movement: {
    speeds: { walk: 30 },
    source: { kind: 'race', name: 'Human', source: 'XPHB' },
  },
  classChoiceSelections: [
    {
      choiceId: divineOrder.id,
      label: divineOrder.label,
      kind: 'class-feature',
      className: 'Cleric',
      classSource: 'XPHB',
      classLevel: 1,
      selected: [{ entityType: 'classFeature', name: 'Protector', source: 'XPHB', slotLevel: 1 }],
    },
  ],
  features: [
    { id: 'cleric-protector', name: 'Protector', source: 'XPHB', description: 'Fixture choice.' },
  ],
  proficiencies: {
    armor: ['medium armor', 'shields'],
    weapons: ['simple weapons'],
    tools: [],
    skills: ['religion'],
    languages: ['Common'],
    savingThrows: ['wisdom', 'charisma'],
  },
  skills: { religion: { proficient: true, expertise: false, bonus: 0 } },
  equipment: [
    {
      id: 'cleric-medium-armor',
      name: 'Fixture Medium Armor',
      source: 'XPHB',
      type: 'MA',
      armorType: 'medium',
      ac: 14,
      weight: 20,
      quantity: 1,
      equipped: true,
    },
    {
      id: 'cleric-shield',
      name: 'Fixture Shield',
      source: 'XPHB',
      type: 'S',
      armorType: 'shield',
      ac: 2,
      weight: 6,
      quantity: 1,
      equipped: true,
    },
  ],
  spells: {
    ...makeCharacterFixture().spells,
    spellProfiles: [
      classProfile('Cleric', 'XPHB', {
        cantrips: ['Guidance', 'Light', 'Thaumaturgy'],
        preparedSpells: ['Cure Wounds'],
      }),
      specialProfile(),
    ],
  },
})

const clericData = withLookups(
  makeGameDataFixture({
    races: [{ name: 'Human', source: 'XPHB', speed: 30, size: ['M'] }],
    classes: [cleric2024],
    backgrounds: [
      {
        name: 'Acolyte',
        source: 'XPHB',
        edition: 'one',
        ability: [{ choose: { weighted: { from: ['wis', 'int', 'cha'], weights: [2, 1] } } }],
      },
    ],
    spells: [
      makeSpellFixture({ name: 'Guidance', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'Light', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'Thaumaturgy', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'Cure Wounds', source: 'XPHB', level: 1 }),
    ],
    sources: [{ abbreviation: 'XPHB', name: '2024 Player Handbook', group: 'Core' }],
  }),
)

const primalOrder = classChoice(
  'class:druid|xphb|choice:primal-order|1',
  'Primal Order',
  'Druid',
  1,
  [
    { entityType: 'classFeature', name: 'Magician', source: 'XPHB' },
    { entityType: 'classFeature', name: 'Warden', source: 'XPHB' },
  ],
)
const elementalFury = classChoice(
  'class:druid|xphb|choice:elemental-fury|7',
  'Elemental Fury',
  'Druid',
  7,
  [
    { entityType: 'classFeature', name: 'Potent Spellcasting', source: 'XPHB' },
    { entityType: 'classFeature', name: 'Primal Strike', source: 'XPHB' },
  ],
)
const druid2024 = {
  name: 'Druid',
  source: 'XPHB',
  edition: 'one',
  hd: { faces: 8 },
  spellcastingAbility: 'wis',
  casterProgression: 'full',
  preparedSpellsProgression: [4, 5, 6, 7, 9, 10, 11],
  preparedSpellsChange: 'restLong',
  cantripProgression: [2, 2, 2, 3, 3, 3, 3],
  classTableGroups: [
    { rowsSpellProgression: [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1]] },
  ],
  normalizedRules: { ...EMPTY_RULES, asiLevels: [4], choices: [primalOrder, elementalFury] },
} as Class5e

const druidCharacter = standardCharacter({
  id: 'representative-2024-druid',
  name: '2024 Druid Fixture',
  originSystem: '2024',
  race: 'Human',
  raceSource: 'XPHB',
  class: 'Druid',
  classSource: 'XPHB',
  classProgression: [{ name: 'Druid', source: 'XPHB', levels: 7 }],
  level: 7,
  background: 'Guide',
  backgroundSource: 'XPHB',
  allowedSources: ['XPHB'],
  abilityScores: {
    strength: 10,
    dexterity: 13,
    constitution: 14,
    intelligence: 12,
    wisdom: 15,
    charisma: 8,
  },
  backgroundAsiChoices: ['wisdom', 'dexterity'],
  asiChoices: [
    {
      id: 'druid|XPHB|4',
      level: 4,
      className: 'Druid',
      classSource: 'XPHB',
      abilityChanges: { wisdom: 1, dexterity: 1 },
    },
  ],
  movement: {
    speeds: { walk: 30 },
    source: { kind: 'race', name: 'Human', source: 'XPHB' },
  },
  classChoiceSelections: [
    {
      choiceId: primalOrder.id,
      label: primalOrder.label,
      kind: 'class-feature',
      className: 'Druid',
      classSource: 'XPHB',
      classLevel: 7,
      selected: [{ entityType: 'classFeature', name: 'Warden', source: 'XPHB', slotLevel: 1 }],
    },
    {
      choiceId: elementalFury.id,
      label: elementalFury.label,
      kind: 'class-feature',
      className: 'Druid',
      classSource: 'XPHB',
      classLevel: 7,
      selected: [
        { entityType: 'classFeature', name: 'Potent Spellcasting', source: 'XPHB', slotLevel: 7 },
      ],
    },
  ],
  features: [
    { id: 'druid-warden', name: 'Warden', source: 'XPHB', description: 'Fixture choice.' },
    {
      id: 'druid-potent-spellcasting',
      name: 'Potent Spellcasting',
      source: 'XPHB',
      description: 'Fixture choice.',
    },
  ],
  proficiencies: {
    armor: ['light armor'],
    weapons: ['simple weapons'],
    tools: [],
    skills: ['nature'],
    languages: ['Common'],
    savingThrows: ['intelligence', 'wisdom'],
  },
  skills: { nature: { proficient: true, expertise: false, bonus: 0 } },
  equipment: [
    {
      id: 'druid-light-armor',
      name: 'Fixture Light Armor',
      source: 'XPHB',
      type: 'LA',
      armorType: 'light',
      ac: 11,
      weight: 10,
      quantity: 1,
      equipped: true,
    },
  ],
  spells: {
    ...makeCharacterFixture().spells,
    spellProfiles: [
      classProfile('Druid', 'XPHB', {
        cantrips: ['Guidance', 'Produce Flame', 'Shillelagh'],
        preparedSpells: ['Cure Wounds'],
      }),
      specialProfile(),
    ],
  },
})

const druidData = withLookups(
  makeGameDataFixture({
    races: [{ name: 'Human', source: 'XPHB', speed: 30, size: ['M'] }],
    classes: [druid2024],
    backgrounds: [
      {
        name: 'Guide',
        source: 'XPHB',
        edition: 'one',
        ability: [{ choose: { weighted: { from: ['wis', 'dex', 'con'], weights: [2, 1] } } }],
      },
    ],
    spells: [
      makeSpellFixture({ name: 'Guidance', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'Produce Flame', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'Shillelagh', source: 'XPHB', level: 0 }),
      makeSpellFixture({ name: 'Cure Wounds', source: 'XPHB', level: 1 }),
    ],
    sources: [{ abbreviation: 'XPHB', name: '2024 Player Handbook', group: 'Core' }],
  }),
)

const weaponMastery = classChoice(
  'class:fighter|xphb|choice:weapon-mastery|1',
  'Weapon Mastery',
  'Fighter',
  1,
  [],
  'item',
)
weaponMastery.optionFilter = {
  entityType: 'item',
  itemTypes: ['M', 'R'],
  requiresProficiency: true,
}
const fighter2024 = {
  name: 'Fighter',
  source: 'XPHB',
  edition: 'one',
  hd: { faces: 10 },
  normalizedRules: { ...EMPTY_RULES, choices: [weaponMastery] },
} as Class5e
const masteryWeapon = {
  name: 'Fixture Longblade',
  source: 'XPHB',
  type: 'M',
  weaponCategory: 'martial',
  dmg1: '1d8',
  dmgType: 'S',
  mastery: ['Fixture Sap|XPHB'],
  weight: 3,
}

const weaponMasteryCharacter = standardCharacter({
  id: 'representative-2024-weapon-mastery',
  name: '2024 Weapon Mastery Fixture',
  originSystem: '2024',
  race: 'Human',
  raceSource: 'XPHB',
  class: 'Fighter',
  classSource: 'XPHB',
  classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 1 }],
  background: 'Soldier',
  backgroundSource: 'XPHB',
  allowedSources: ['XPHB'],
  abilityScores: {
    strength: 15,
    dexterity: 12,
    constitution: 13,
    intelligence: 8,
    wisdom: 10,
    charisma: 14,
  },
  backgroundAsiChoices: ['strength', 'constitution'],
  movement: {
    speeds: { walk: 30 },
    source: { kind: 'race', name: 'Human', source: 'XPHB' },
  },
  classChoiceSelections: [
    {
      choiceId: weaponMastery.id,
      label: weaponMastery.label,
      kind: 'item',
      className: 'Fighter',
      classSource: 'XPHB',
      classLevel: 1,
      selected: [{ entityType: 'item', name: masteryWeapon.name, source: 'XPHB', slotLevel: 1 }],
    },
  ],
  proficiencies: {
    armor: ['heavy armor', 'shields'],
    weapons: [masteryWeapon.name],
    tools: [],
    skills: ['athletics'],
    languages: ['Common'],
    savingThrows: ['strength', 'constitution'],
  },
  skills: { athletics: { proficient: true, expertise: false, bonus: 0 } },
  equipment: [
    {
      id: 'mastery-weapon',
      ...masteryWeapon,
      quantity: 1,
      equipped: true,
      properties: [],
    },
    {
      id: 'fighter-heavy-armor',
      name: 'Fixture Heavy Armor',
      source: 'XPHB',
      type: 'HA',
      armorType: 'heavy',
      ac: 16,
      weight: 40,
      quantity: 1,
      equipped: true,
    },
    {
      id: 'fighter-shield',
      name: 'Fixture Shield',
      source: 'XPHB',
      type: 'S',
      armorType: 'shield',
      ac: 2,
      weight: 6,
      quantity: 1,
      equipped: true,
    },
  ],
  spells: {
    ...makeCharacterFixture().spells,
    spellProfiles: [classProfile('Fighter', 'XPHB'), specialProfile()],
  },
})

const weaponMasteryData = withLookups(
  makeGameDataFixture({
    races: [{ name: 'Human', source: 'XPHB', speed: 30, size: ['M'] }],
    classes: [fighter2024],
    backgrounds: [
      {
        name: 'Soldier',
        source: 'XPHB',
        edition: 'one',
        ability: [{ choose: { weighted: { from: ['str', 'dex', 'con'], weights: [2, 1] } } }],
      },
    ],
    items: [masteryWeapon],
    itemProperties: [],
    sources: [{ abbreviation: 'XPHB', name: '2024 Player Handbook', group: 'Core' }],
  }),
)

const warlock2014 = {
  name: 'Warlock',
  source: 'PHB',
  hd: { faces: 8 },
  spellcastingAbility: 'cha',
  casterProgression: 'pact',
  classTableGroups: [
    {
      colLabels: ['Spell Slots', 'Slot Level'],
      rows: [
        [1, 1],
        [2, 1],
      ],
    },
  ],
  normalizedRules: EMPTY_RULES,
} as Class5e
const focusItem = {
  name: 'Fixture Arcane Focus',
  source: 'TEST',
  type: 'W',
  weight: 2,
  wondrous: true,
  reqAttune: true,
  bonusAc: '+1',
  bonusSpellAttack: '+1',
  bonusSpellSaveDc: '+1',
}

const multiclassCharacter = standardCharacter({
  id: 'representative-multiclass-spellcaster',
  name: 'Multiclass Spellcaster Fixture',
  race: 'Human',
  raceSource: 'PHB',
  class: 'Wizard',
  classSource: 'PHB',
  classProgression: [
    { name: 'Wizard', source: 'PHB', levels: 4 },
    { name: 'Warlock', source: 'PHB', levels: 2 },
  ],
  level: 6,
  background: 'Sage',
  backgroundSource: 'PHB',
  allowedSources: ['PHB', 'TEST'],
  abilityScores: {
    strength: 10,
    dexterity: 14,
    constitution: 14,
    intelligence: 15,
    wisdom: 8,
    charisma: 14,
  },
  asiChoices: [
    {
      id: 'wizard|PHB|4',
      level: 4,
      className: 'Wizard',
      classSource: 'PHB',
      abilityChanges: { intelligence: 2 },
    },
  ],
  movement: {
    speeds: { walk: 30 },
    source: { kind: 'race', name: 'Human', source: 'PHB' },
  },
  proficiencies: {
    armor: ['light armor'],
    weapons: [],
    tools: [],
    skills: ['arcana'],
    languages: ['Common'],
    savingThrows: ['intelligence'],
  },
  skills: { arcana: { proficient: true, expertise: false, bonus: 0 } },
  equipment: [
    {
      id: 'multiclass-light-armor',
      name: 'Fixture Studded Armor',
      source: 'PHB',
      type: 'LA',
      armorType: 'light',
      ac: 12,
      weight: 13,
      quantity: 1,
      equipped: true,
    },
    {
      id: 'multiclass-focus',
      ...focusItem,
      quantity: 1,
      equipped: true,
      attuned: true,
    },
  ],
  manualEffects: [
    {
      id: 'multiclass-capacity',
      label: 'Fixture carrying multiplier',
      target: { kind: 'carrying-capacity' },
      operation: { kind: 'multiply', value: 2 },
      source: { kind: 'manual', name: 'Fixture carrying multiplier' },
    },
  ],
  spells: {
    ...makeCharacterFixture().spells,
    spellProfiles: [
      classProfile('Wizard', 'PHB', { preparedSpells: ['Magic Missile'] }),
      classProfile('Warlock', 'PHB', { spellsKnown: ['Hex'] }),
      specialProfile(),
    ],
    spellSlots: { 1: { max: 4, used: 1 }, 2: { max: 3, used: 1 } },
    pactSpellSlots: { 1: { max: 2, used: 1 } },
  },
})

const multiclassData = withLookups(
  makeGameDataFixture({
    races: [
      {
        name: 'Human',
        source: 'PHB',
        ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
        speed: 30,
        size: ['M'],
      },
    ],
    classes: [wizard2014, warlock2014],
    backgrounds: [{ name: 'Sage', source: 'PHB' }],
    items: [focusItem],
    spells: [
      makeSpellFixture({ name: 'Magic Missile', source: 'PHB', level: 1 }),
      makeSpellFixture({ name: 'Hex', source: 'PHB', level: 1 }),
    ],
    sources: [
      { abbreviation: 'PHB', name: 'Player Handbook', group: 'Core' },
      { abbreviation: 'TEST', name: 'Fixture Effects', group: 'Tests' },
    ],
  }),
)

export const REPRESENTATIVE_CHARACTER_FIXTURES: RepresentativeCharacterFixture[] = [
  {
    id: '2014-dwarf-martial',
    label: '2014 dwarf martial with racial Constitution and 25-foot speed',
    character: dwarfMartialCharacter,
    gameData: dwarfMartialData,
    prerequisite: { ability: [{ ability: 'con', score: 16 }] },
    expected: {
      abilityScores: { strength: 16, constitution: 16 },
      armorClass: 17,
      maxHitPoints: 40,
      walkingSpeed: 25,
      carryCapacity: 240,
      totalWeight: 26,
      profileIds: ['class:Fighter|PHB', 'special:unrestricted'],
      spellcasting: [],
      sharedSlots: [],
      pactSlots: [],
    },
  },
  {
    id: '2014-elf-wizard',
    label: '2014 elf wizard with spellcasting, armor, skills, saves, and carrying values',
    character: elfWizardCharacter,
    gameData: elfWizardData,
    prerequisite: { ability: [{ ability: 'dex', score: 16 }], spellcasting: true },
    prerequisiteOptions: { spellcastingClasses: new Set(['Wizard']) },
    expected: {
      abilityScores: { dexterity: 16, constitution: 14, intelligence: 16 },
      armorClass: 14,
      maxHitPoints: 26,
      walkingSpeed: 30,
      carryCapacity: 120,
      totalWeight: 10,
      profileIds: ['class:Wizard|PHB', 'special:unrestricted'],
      spellcasting: [{ profileId: 'class:Wizard|PHB', spellSaveDC: 13, spellAttackBonus: 5 }],
      sharedSlots: [
        { level: 1, max: 4, used: 0 },
        { level: 2, max: 3, used: 0 },
      ],
      pactSlots: [],
      skill: { name: 'arcana', modifier: 5 },
      savingThrow: { ability: 'intelligence', modifier: 5 },
    },
  },
  {
    id: '2024-cleric',
    label: '2024 cleric with background ASIs and Divine Order',
    character: clericCharacter,
    gameData: clericData,
    prerequisite: { ability: [{ ability: 'wis', score: 17 }] },
    expected: {
      abilityScores: { wisdom: 17, charisma: 9 },
      armorClass: 17,
      maxHitPoints: 9,
      walkingSpeed: 30,
      carryCapacity: 180,
      totalWeight: 26,
      profileIds: ['class:Cleric|XPHB', 'special:unrestricted'],
      spellcasting: [{ profileId: 'class:Cleric|XPHB', spellSaveDC: 13, spellAttackBonus: 5 }],
      sharedSlots: [{ level: 1, max: 2, used: 0 }],
      pactSlots: [],
    },
  },
  {
    id: '2024-druid',
    label: '2024 druid with Primal Order and Elemental Fury',
    character: druidCharacter,
    gameData: druidData,
    prerequisite: { level: 7, class: [{ name: 'Druid' }] },
    expected: {
      abilityScores: { dexterity: 15, wisdom: 18 },
      armorClass: 13,
      maxHitPoints: 52,
      walkingSpeed: 30,
      carryCapacity: 150,
      totalWeight: 10,
      profileIds: ['class:Druid|XPHB', 'special:unrestricted'],
      spellcasting: [{ profileId: 'class:Druid|XPHB', spellSaveDC: 15, spellAttackBonus: 7 }],
      sharedSlots: [
        { level: 1, max: 4, used: 0 },
        { level: 2, max: 3, used: 0 },
        { level: 3, max: 3, used: 0 },
        { level: 4, max: 1, used: 0 },
      ],
      pactSlots: [],
    },
  },
  {
    id: '2024-weapon-mastery',
    label: '2024 weapon-using character with a source-qualified mastery choice',
    character: weaponMasteryCharacter,
    gameData: weaponMasteryData,
    prerequisite: { ability: [{ ability: 'str', score: 17 }] },
    expected: {
      abilityScores: { strength: 17, constitution: 14 },
      armorClass: 18,
      maxHitPoints: 12,
      walkingSpeed: 30,
      carryCapacity: 255,
      totalWeight: 49,
      profileIds: ['class:Fighter|XPHB', 'special:unrestricted'],
      spellcasting: [],
      sharedSlots: [],
      pactSlots: [],
      mastery: { weapon: masteryWeapon.name, name: 'Fixture Sap' },
    },
  },
  {
    id: 'multiclass-spellcaster',
    label: 'multiclass spellcaster with ASI, shared and pact slots, and equipment effects',
    character: multiclassCharacter,
    gameData: multiclassData,
    prerequisite: { spellcasting: true, level: 6 },
    prerequisiteOptions: { spellcastingClasses: new Set(['Wizard', 'Warlock']) },
    expected: {
      abilityScores: { intelligence: 18, charisma: 15 },
      armorClass: 15,
      maxHitPoints: 40,
      walkingSpeed: 30,
      carryCapacity: 330,
      totalWeight: 15,
      profileIds: ['class:Wizard|PHB', 'class:Warlock|PHB', 'special:unrestricted'],
      spellcasting: [
        { profileId: 'class:Wizard|PHB', spellSaveDC: 16, spellAttackBonus: 8 },
        { profileId: 'class:Warlock|PHB', spellSaveDC: 14, spellAttackBonus: 6 },
      ],
      sharedSlots: [
        { level: 1, max: 4, used: 1 },
        { level: 2, max: 3, used: 1 },
      ],
      pactSlots: [{ level: 1, max: 2, used: 1 }],
      skill: { name: 'arcana', modifier: 7 },
      savingThrow: { ability: 'intelligence', modifier: 7 },
    },
  },
]
