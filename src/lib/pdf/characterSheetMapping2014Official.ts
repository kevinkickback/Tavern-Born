import type { AbilityName } from '@/lib/calculations/abilityScores'
import {
  type CharacterSheetViewModel,
  formatViewModelModifier,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetFieldMap } from '@/lib/pdf/types'

const ABILITY_FIELDS: Record<AbilityName, { score: string; modifier: string; save: string }> = {
  strength: { score: 'STR', modifier: 'STRmod', save: 'ST Strength' },
  dexterity: { score: 'DEX', modifier: 'DEXmod ', save: 'ST Dexterity' },
  constitution: { score: 'CON', modifier: 'CONmod', save: 'ST Constitution' },
  intelligence: { score: 'INT', modifier: 'INTmod', save: 'ST Intelligence' },
  wisdom: { score: 'WIS', modifier: 'WISmod', save: 'ST Wisdom' },
  charisma: { score: 'CHA', modifier: 'CHamod', save: 'ST Charisma' },
}

const SAVE_CHECKBOX_FIELDS: Record<AbilityName, string> = {
  strength: 'Check Box 11',
  dexterity: 'Check Box 18',
  constitution: 'Check Box 19',
  intelligence: 'Check Box 20',
  wisdom: 'Check Box 21',
  charisma: 'Check Box 22',
}

const SKILL_FIELDS: Record<string, { modifier: string; checkbox: string }> = {
  acrobatics: { modifier: 'Acrobatics', checkbox: 'Check Box 23' },
  'animal handling': { modifier: 'Animal', checkbox: 'Check Box 24' },
  arcana: { modifier: 'Arcana', checkbox: 'Check Box 25' },
  athletics: { modifier: 'Athletics', checkbox: 'Check Box 26' },
  deception: { modifier: 'Deception ', checkbox: 'Check Box 27' },
  history: { modifier: 'History ', checkbox: 'Check Box 28' },
  insight: { modifier: 'Insight', checkbox: 'Check Box 29' },
  intimidation: { modifier: 'Intimidation', checkbox: 'Check Box 30' },
  investigation: { modifier: 'Investigation ', checkbox: 'Check Box 31' },
  medicine: { modifier: 'Medicine', checkbox: 'Check Box 32' },
  nature: { modifier: 'Nature', checkbox: 'Check Box 33' },
  perception: { modifier: 'Perception ', checkbox: 'Check Box 34' },
  performance: { modifier: 'Performance', checkbox: 'Check Box 35' },
  persuasion: { modifier: 'Persuasion', checkbox: 'Check Box 36' },
  religion: { modifier: 'Religion', checkbox: 'Check Box 37' },
  'sleight of hand': { modifier: 'SleightofHand', checkbox: 'Check Box 38' },
  stealth: { modifier: 'Stealth ', checkbox: 'Check Box 39' },
  survival: { modifier: 'Survival', checkbox: 'Check Box 40' },
}

const WEAPON_FIELDS = [
  { name: 'Wpn Name', attack: 'Wpn1 AtkBonus', damage: 'Wpn1 Damage' },
  { name: 'Wpn Name 2', attack: 'Wpn2 AtkBonus ', damage: 'Wpn2 Damage ' },
  { name: 'Wpn Name 3', attack: 'Wpn3 AtkBonus  ', damage: 'Wpn3 Damage ' },
] as const

const SPELL_FIELDS_BY_LEVEL: readonly (readonly string[])[] = [
  [
    'Spells 1014',
    'Spells 1016',
    'Spells 1017',
    'Spells 1018',
    'Spells 1019',
    'Spells 1020',
    'Spells 1021',
    'Spells 1022',
  ],
  [
    'Spells 1015',
    'Spells 1023',
    'Spells 1024',
    'Spells 1025',
    'Spells 1026',
    'Spells 1027',
    'Spells 1028',
    'Spells 1029',
    'Spells 1030',
    'Spells 1031',
    'Spells 1032',
    'Spells 1033',
  ],
  [
    'Spells 1046',
    'Spells 1034',
    'Spells 1035',
    'Spells 1036',
    'Spells 1037',
    'Spells 1038',
    'Spells 1039',
    'Spells 1040',
    'Spells 1041',
    'Spells 1042',
    'Spells 1043',
    'Spells 1044',
    'Spells 1045',
  ],
  [
    'Spells 1048',
    'Spells 1047',
    'Spells 1049',
    'Spells 1050',
    'Spells 1051',
    'Spells 1052',
    'Spells 1053',
    'Spells 1054',
    'Spells 1055',
    'Spells 1056',
    'Spells 1057',
    'Spells 1058',
    'Spells 1059',
  ],
  [
    'Spells 1061',
    'Spells 1060',
    'Spells 1062',
    'Spells 1063',
    'Spells 1064',
    'Spells 1065',
    'Spells 1066',
    'Spells 1067',
    'Spells 1068',
    'Spells 1069',
    'Spells 1070',
    'Spells 1071',
    'Spells 1072',
  ],
  [
    'Spells 1074',
    'Spells 1073',
    'Spells 1075',
    'Spells 1076',
    'Spells 1077',
    'Spells 1078',
    'Spells 1079',
    'Spells 1080',
    'Spells 1081',
  ],
  [
    'Spells 1083',
    'Spells 1082',
    'Spells 1084',
    'Spells 1085',
    'Spells 1086',
    'Spells 1087',
    'Spells 1088',
    'Spells 1089',
    'Spells 1090',
  ],
  [
    'Spells 1092',
    'Spells 1091',
    'Spells 1093',
    'Spells 1094',
    'Spells 1095',
    'Spells 1096',
    'Spells 1097',
    'Spells 1098',
    'Spells 1099',
  ],
  [
    'Spells 10101',
    'Spells 10100',
    'Spells 10102',
    'Spells 10103',
    'Spells 10104',
    'Spells 10105',
    'Spells 10106',
  ],
  [
    'Spells 10108',
    'Spells 10107',
    'Spells 10109',
    'Spells 101010',
    'Spells 101011',
    'Spells 101012',
    'Spells 101013',
  ],
]

function titleCaseAbility(ability: string | undefined): string {
  return ability ? ability.charAt(0).toUpperCase() + ability.slice(1) : ''
}

export function mapCharacterSheet2014Official(
  viewModel: CharacterSheetViewModel,
): CharacterSheetFieldMap {
  const { character } = viewModel
  const primarySpellcasting = viewModel.spellcastingDetails[0]
  const passivePerception =
    10 + (viewModel.skillByName.get('perception')?.modifier ?? viewModel.abilityModifiers.wisdom)
  const attackOverflow = viewModel.weaponRows
    .slice(3)
    .map((row) => `${row.name} ${row.attackBonus}; ${row.damage} ${row.damageType}`.trim())
  const textFields: Record<string, string> = {
    ClassLevel: viewModel.classLevelSummary,
    Background: character.background || '',
    PlayerName: character.details.playerName || '',
    CharacterName: character.name || '',
    'Race ': viewModel.raceSummary,
    Alignment: character.details.alignment || '',
    XP: String(character.experiencePoints),
    Inspiration: character.inspiration ? 'X' : '',
    ProfBonus: formatViewModelModifier(viewModel.proficiencyBonus),
    AC: String(viewModel.effectiveArmorClass),
    Initiative: formatViewModelModifier(viewModel.initiativeModifier),
    Speed: `${viewModel.walkingSpeed} ft`,
    'PersonalityTraits ':
      character.details.personalityTraits || character.details.personality || '',
    HPMax: String(viewModel.maxHP),
    HPCurrent: String(character.hitPoints.current),
    HPTemp: String(character.hitPoints.temporary),
    Ideals: character.details.ideals || '',
    Bonds: character.details.bonds || '',
    Flaws: character.details.flaws || '',
    HDTotal: String(viewModel.remainingHitDice),
    HD: viewModel.hitDiceRows
      .map((row) => row.die)
      .filter(Boolean)
      .join(', '),
    AttacksSpellcasting: attackOverflow.join('\n'),
    Passive: String(passivePerception),
    CP: String(character.currency?.cp ?? 0),
    SP: String(character.currency?.sp ?? 0),
    EP: String(character.currency?.ep ?? 0),
    GP: String(character.currency?.gp ?? 0),
    PP: String(character.currency?.pp ?? 0),
    ProficienciesLang: [viewModel.proficienciesSummary, viewModel.languagesSummary]
      .filter(Boolean)
      .join('\n'),
    Equipment: viewModel.equipmentSummary,
    'Features and Traits': viewModel.featuresSummary,
    'CharacterName 2': character.name || '',
    Age: String(character.details.age ?? ''),
    Height: character.details.height || '',
    Weight: character.details.weight || '',
    Eyes: character.details.eyes || '',
    Skin: character.details.skin || '',
    Hair: character.details.hair || '',
    Allies: viewModel.alliesAndOrganizationsSummary,
    FactionName: [character.details.faction, character.details.rank].filter(Boolean).join(' — '),
    Backstory: viewModel.historyAndPersonalitySummary,
    'Feat+Traits': [viewModel.racialTraitsSummary, viewModel.featsSummary]
      .filter(Boolean)
      .join('\n'),
    Treasure: viewModel.magicItems.map((item) => item.name).join(', '),
    'Spellcasting Class 2': primarySpellcasting?.className ?? '',
    'SpellcastingAbility 2': titleCaseAbility(primarySpellcasting?.spellcastingAbility),
    'SpellSaveDC  2':
      primarySpellcasting?.spellSaveDC != null ? String(primarySpellcasting.spellSaveDC) : '',
    'SpellAtkBonus 2':
      primarySpellcasting?.spellAttackBonus != null
        ? formatViewModelModifier(primarySpellcasting.spellAttackBonus)
        : '',
  }
  const checkboxFields: Record<string, boolean> = {
    'Check Box 12': (character.deathSaves?.successes ?? 0) >= 1,
    'Check Box 13': (character.deathSaves?.successes ?? 0) >= 2,
    'Check Box 14': (character.deathSaves?.successes ?? 0) >= 3,
    'Check Box 15': (character.deathSaves?.failures ?? 0) >= 1,
    'Check Box 16': (character.deathSaves?.failures ?? 0) >= 2,
    'Check Box 17': (character.deathSaves?.failures ?? 0) >= 3,
  }

  for (const [ability, fields] of Object.entries(ABILITY_FIELDS) as Array<
    [AbilityName, (typeof ABILITY_FIELDS)[AbilityName]]
  >) {
    textFields[fields.score] = String(viewModel.effectiveAbilityScores[ability])
    textFields[fields.modifier] = formatViewModelModifier(viewModel.abilityModifiers[ability])
    const save = viewModel.savingThrowByAbility.get(ability)
    textFields[fields.save] = formatViewModelModifier(save?.modifier ?? 0)
    checkboxFields[SAVE_CHECKBOX_FIELDS[ability]] = !!save?.proficient
  }

  for (const [skillName, fields] of Object.entries(SKILL_FIELDS)) {
    const skill = viewModel.skillByName.get(skillName)
    textFields[fields.modifier] = formatViewModelModifier(skill?.modifier ?? 0)
    checkboxFields[fields.checkbox] = !!skill?.proficient
  }

  WEAPON_FIELDS.forEach((fields, index) => {
    const row = viewModel.weaponRows[index]
    textFields[fields.name] = row?.name ?? ''
    textFields[fields.attack] = row?.attackBonus ?? ''
    textFields[fields.damage] = row
      ? [row.damage, row.damageType, row.notes].filter(Boolean).join(' ')
      : ''
  })

  SPELL_FIELDS_BY_LEVEL.forEach((fieldNames, level) => {
    const rows = viewModel.spellRows.filter(
      (row) => (row.level === 'C' ? 0 : Number(row.level)) === level,
    )
    fieldNames.forEach((fieldName, index) => {
      textFields[fieldName] = rows[index]?.name ?? ''
    })
    if (level > 0) {
      const slot = character.spells.spellSlots[level]
      textFields[`SlotsTotal ${level + 18}`] = slot?.max ? String(slot.max) : ''
      textFields[`SlotsRemaining ${level + 18}`] = slot?.max
        ? String(Math.max(0, slot.max - (slot.used ?? 0)))
        : ''
    }
  })

  return { textFields, checkboxFields }
}
