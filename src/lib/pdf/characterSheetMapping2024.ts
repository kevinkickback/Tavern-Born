import type { AbilityName } from '@/lib/calculations/abilityScores'
import {
  type CharacterSheetViewModel,
  formatViewModelModifier,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetFieldMap } from '@/lib/pdf/types'

const SKILL_FIELD_MAP: Record<string, { modifier: string; proficiency: string }> = {
  acrobatics: { modifier: 'Text_31', proficiency: 'Checkbox_31' },
  'animal handling': { modifier: 'Text_32', proficiency: 'Checkbox_19' },
  arcana: { modifier: 'Text_33', proficiency: 'Checkbox_20' },
  athletics: { modifier: 'Text_34', proficiency: 'Checkbox_21' },
  deception: { modifier: 'Text_35', proficiency: 'Checkbox_22' },
  history: { modifier: 'Text_36', proficiency: 'Checkbox_23' },
  insight: { modifier: 'Text_47', proficiency: 'Checkbox_30' },
  intimidation: { modifier: 'Text_37', proficiency: 'Checkbox_14' },
  investigation: { modifier: 'Text_38', proficiency: 'Checkbox_15' },
  medicine: { modifier: 'Text_39', proficiency: 'Checkbox_16' },
  nature: { modifier: 'Text_40', proficiency: 'Checkbox_17' },
  perception: { modifier: 'Text_41', proficiency: 'Checkbox_18' },
  performance: { modifier: 'Text_42', proficiency: 'Checkbox_24' },
  persuasion: { modifier: 'Text_43', proficiency: 'Checkbox_25' },
  religion: { modifier: 'Text_44', proficiency: 'Checkbox_26' },
  'sleight of hand': { modifier: 'Text_45', proficiency: 'Checkbox_27' },
  stealth: { modifier: 'Text_46', proficiency: 'Checkbox_28' },
  survival: { modifier: 'Text_52', proficiency: 'Checkbox_29' },
}

const SAVE_FIELD_MAP: Record<AbilityName, { modifier: string; proficiency: string }> = {
  strength: { modifier: 'Text_54', proficiency: 'Checkbox_8' },
  dexterity: { modifier: 'Text_53', proficiency: 'Checkbox_9' },
  constitution: { modifier: 'Text_51', proficiency: 'Checkbox_10' },
  intelligence: { modifier: 'Text_48', proficiency: 'Checkbox_11' },
  wisdom: { modifier: 'Text_49', proficiency: 'Checkbox_12' },
  charisma: { modifier: 'Text_50', proficiency: 'Checkbox_13' },
}

export function mapCharacterSheet2024(viewModel: CharacterSheetViewModel): CharacterSheetFieldMap {
  const { character } = viewModel
  const textFields: Record<string, string> = {
    Text_1: character.name || '',
    Text_2: viewModel.classLevelSummary,
    Text_3: viewModel.raceSummary,
    Text_4: character.background || '',
    Text_5: character.details.alignment || '',
    Text_6: String(viewModel.level),
    Text_22: String(character.abilityScores.strength),
    Text_25: formatViewModelModifier(viewModel.abilityModifiers.strength),
    Text_23: String(character.abilityScores.dexterity),
    Text_26: formatViewModelModifier(viewModel.abilityModifiers.dexterity),
    Text_24: String(character.abilityScores.constitution),
    Text_27: formatViewModelModifier(viewModel.abilityModifiers.constitution),
    Text_15: String(character.abilityScores.intelligence),
    Text_30: formatViewModelModifier(viewModel.abilityModifiers.intelligence),
    Text_20: String(character.abilityScores.wisdom),
    Text_28: formatViewModelModifier(viewModel.abilityModifiers.wisdom),
    Text_21: String(character.abilityScores.charisma),
    Text_29: formatViewModelModifier(viewModel.abilityModifiers.charisma),
    Text_14: String(viewModel.effectiveArmorClass),
    Text_7: formatViewModelModifier(viewModel.proficiencyBonus),
    Text_8: formatViewModelModifier(viewModel.abilityModifiers.dexterity),
    Text_9: `${character.speed || 30} ft`,
    Text_10: String(viewModel.maxHP || ''),
    Text_11: String(character.hitPoints.current || ''),
    Text_12: String(character.hitPoints.temporary || ''),
    Text_13: String(viewModel.remainingHitDice),
    Text_55: viewModel.proficienciesSummary,
    Text_56: viewModel.languagesSummary,
    Text_57: viewModel.featuresSummary,
    Text_58: viewModel.featsSummary,
    Text_59: viewModel.equipmentSummary,
    Text_60:
      character.details.backstory || character.details.lifeEvents || character.details.origin || '',
  }
  const checkboxFields: Record<string, boolean> = {
    Checkbox_1: !!character.inspiration,
    Checkbox_2: (character.deathSaves?.successes ?? 0) >= 1,
    Checkbox_3: (character.deathSaves?.successes ?? 0) >= 2,
    Checkbox_4: (character.deathSaves?.successes ?? 0) >= 3,
    Checkbox_5: (character.deathSaves?.failures ?? 0) >= 1,
    Checkbox_6: (character.deathSaves?.failures ?? 0) >= 2,
    Checkbox_7: (character.deathSaves?.failures ?? 0) >= 3,
  }

  for (const [ability, mapping] of Object.entries(SAVE_FIELD_MAP) as Array<
    [AbilityName, { modifier: string; proficiency: string }]
  >) {
    const save = viewModel.savingThrowByAbility.get(ability)
    textFields[mapping.modifier] = formatViewModelModifier(save?.modifier ?? 0)
    checkboxFields[mapping.proficiency] = !!save?.proficient
  }
  for (const [skillName, mapping] of Object.entries(SKILL_FIELD_MAP)) {
    const skill = viewModel.skillByName.get(skillName)
    textFields[mapping.modifier] = formatViewModelModifier(skill?.modifier ?? 0)
    checkboxFields[mapping.proficiency] = !!skill?.proficient
  }
  return { textFields, checkboxFields }
}
