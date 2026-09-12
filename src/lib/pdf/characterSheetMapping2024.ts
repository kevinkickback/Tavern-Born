import type { AbilityName } from '@/lib/calculations/abilityScores'
import {
  type CharacterSheetViewModel,
  formatViewModelModifier,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetFieldMap } from '@/lib/pdf/types'

const SKILL_FIELD_MAP: Record<string, { modifier: string; proficiency: string }> = {
  acrobatics: { modifier: 'Text_48', proficiency: 'Checkbox_11' },
  'animal handling': { modifier: 'Text_37', proficiency: 'Checkbox_14' },
  arcana: { modifier: 'Text_32', proficiency: 'Checkbox_19' },
  athletics: { modifier: 'Text_53', proficiency: 'Checkbox_9' },
  deception: { modifier: 'Text_43', proficiency: 'Checkbox_25' },
  history: { modifier: 'Text_33', proficiency: 'Checkbox_20' },
  insight: { modifier: 'Text_38', proficiency: 'Checkbox_15' },
  intimidation: { modifier: 'Text_44', proficiency: 'Checkbox_26' },
  investigation: { modifier: 'Text_34', proficiency: 'Checkbox_21' },
  medicine: { modifier: 'Text_39', proficiency: 'Checkbox_16' },
  nature: { modifier: 'Text_35', proficiency: 'Checkbox_22' },
  perception: { modifier: 'Text_40', proficiency: 'Checkbox_17' },
  performance: { modifier: 'Text_45', proficiency: 'Checkbox_27' },
  persuasion: { modifier: 'Text_46', proficiency: 'Checkbox_28' },
  religion: { modifier: 'Text_36', proficiency: 'Checkbox_23' },
  'sleight of hand': { modifier: 'Text_49', proficiency: 'Checkbox_12' },
  stealth: { modifier: 'Text_50', proficiency: 'Checkbox_13' },
  survival: { modifier: 'Text_41', proficiency: 'Checkbox_18' },
}

const SAVE_FIELD_MAP: Record<AbilityName, { modifier: string; proficiency: string }> = {
  strength: { modifier: 'Text_54', proficiency: 'Checkbox_8' },
  dexterity: { modifier: 'Text_51', proficiency: 'Checkbox_10' },
  constitution: { modifier: 'Text_52', proficiency: 'Checkbox_29' },
  intelligence: { modifier: 'Text_31', proficiency: 'Checkbox_31' },
  wisdom: { modifier: 'Text_47', proficiency: 'Checkbox_30' },
  charisma: { modifier: 'Text_42', proficiency: 'Checkbox_24' },
}

const ABILITY_FIELD_MAP: Record<AbilityName, { modifier: string; score: string }> = {
  strength: { modifier: 'Text_22', score: 'Text_25' },
  dexterity: { modifier: 'Text_23', score: 'Text_26' },
  constitution: { modifier: 'Text_24', score: 'Text_27' },
  intelligence: { modifier: 'Text_15', score: 'Text_30' },
  wisdom: { modifier: 'Text_20', score: 'Text_28' },
  charisma: { modifier: 'Text_21', score: 'Text_29' },
}

const SLOT_FIELDS = [
  { total: 'Text_220', used: ['Checkbox_37', 'Checkbox_38', 'Checkbox_39', 'Checkbox_40'] },
  { total: 'Text_221', used: ['Checkbox_41', 'Checkbox_42', 'Checkbox_43'] },
  { total: 'Text_222', used: ['Checkbox_44', 'Checkbox_45', 'Checkbox_46'] },
  { total: 'Text_223', used: ['Checkbox_47', 'Checkbox_48', 'Checkbox_49'] },
  { total: 'Text_224', used: ['Checkbox_50', 'Checkbox_51', 'Checkbox_52'] },
  { total: 'Text_225', used: ['Checkbox_53', 'Checkbox_54'] },
  { total: 'Text_226', used: ['Checkbox_55', 'Checkbox_56'] },
  { total: 'Text_227', used: ['Checkbox_57'] },
  { total: 'Text_228', used: ['Checkbox_58'] },
] as const

const SIZE_CODE_TO_FULL: Record<string, string> = {
  G: 'Gargantuan',
  H: 'Huge',
  L: 'Large',
  M: 'Medium',
  S: 'Small',
  T: 'Tiny',
}

function normalizeSize(code: string | undefined): string {
  if (!code) return ''
  return SIZE_CODE_TO_FULL[code.toUpperCase()] ?? code
}

function splitIntoColumns(value: string): [string, string] {
  const paragraphs = value.split(/\n\n+/).filter(Boolean)
  if (paragraphs.length < 2) return [value, '']
  const target = Math.ceil(value.length / 2)
  let length = 0
  let splitIndex = 1
  for (let index = 0; index < paragraphs.length - 1; index += 1) {
    length += paragraphs[index].length + 2
    splitIndex = index + 1
    if (length >= target) break
  }
  return [paragraphs.slice(0, splitIndex).join('\n\n'), paragraphs.slice(splitIndex).join('\n\n')]
}

function titleCaseAbility(ability: string | undefined): string {
  if (!ability) return ''
  return ability.charAt(0).toUpperCase() + ability.slice(1)
}

export function mapCharacterSheet2024(viewModel: CharacterSheetViewModel): CharacterSheetFieldMap {
  const { character } = viewModel
  const armorLower = character.proficiencies.armor.map((armor) => armor.toLowerCase())
  const [classFeaturesLeft, classFeaturesRight] = splitIntoColumns(
    viewModel.classFeaturesSummary2014,
  )
  const primarySpellcasting = viewModel.spellcastingDetails[0]
  const attunedItems = viewModel.magicItems.filter((item) => item.attuned).slice(0, 3)
  const hasEquippedShield = character.equipment.some(
    (item) => item.equipped && (item.armorType === 'shield' || item.type === 'S'),
  )
  const passivePerception =
    10 + (viewModel.skillByName.get('perception')?.modifier ?? viewModel.abilityModifiers.wisdom)

  const textFields: Record<string, string> = {
    Text_1: character.name || '',
    Text_2: character.background || '',
    Text_3: viewModel.raceSummary,
    Text_4: viewModel.classSummary,
    Text_5: viewModel.subclassSummary,
    Text_6: String(viewModel.level),
    Text_7: String(character.experiencePoints),
    Text_8: String(viewModel.effectiveArmorClass),
    Text_9: String(character.hitPoints.current),
    Text_10: String(character.hitPoints.temporary),
    Text_11: String(viewModel.maxHP),
    Text_12: String(Math.max(0, character.hitDiceUsed ?? 0)),
    Text_13: String(viewModel.level),
    Text_14: formatViewModelModifier(viewModel.proficiencyBonus),
    Text_16: formatViewModelModifier(viewModel.abilityModifiers.dexterity),
    Text_17: `${character.speed || 30} ft`,
    Text_18: normalizeSize(viewModel.sizeSummary),
    Text_19: String(passivePerception),
    Text_55: character.proficiencies.weapons.join(', '),
    Text_56: character.proficiencies.tools.join(', '),
    Text_57: classFeaturesLeft,
    Text_58: classFeaturesRight,
    Text_59: viewModel.racialTraitsSummary,
    Text_60: viewModel.featsSummary,
    Text_85:
      primarySpellcasting?.spellcastingAbility != null
        ? formatViewModelModifier(
            viewModel.abilityModifiers[primarySpellcasting.spellcastingAbility],
          )
        : '',
    Text_86:
      primarySpellcasting?.spellSaveDC != null ? String(primarySpellcasting.spellSaveDC) : '',
    Text_87:
      primarySpellcasting?.spellAttackBonus != null
        ? formatViewModelModifier(primarySpellcasting.spellAttackBonus)
        : '',
    Text_88: viewModel.appearanceSummary,
    Text_89: viewModel.historyAndPersonalitySummary,
    Text_90: viewModel.equipmentSummary,
    Text_91: viewModel.languagesSummary,
    Text_212: attunedItems[0]?.name ?? '',
    Text_213: attunedItems[1]?.name ?? '',
    Text_214: attunedItems[2]?.name ?? '',
    Text_215: String(character.currency?.cp ?? 0),
    Text_216: String(character.currency?.sp ?? 0),
    Text_217: String(character.currency?.ep ?? 0),
    Text_218: String(character.currency?.gp ?? 0),
    Text_219: String(character.currency?.pp ?? 0),
    Text_229: character.details.alignment || '',
    Text_230: titleCaseAbility(primarySpellcasting?.spellcastingAbility),
  }

  const checkboxFields: Record<string, boolean> = {
    Checkbox_1: hasEquippedShield,
    Checkbox_2: (character.deathSaves?.successes ?? 0) >= 1,
    Checkbox_3: (character.deathSaves?.successes ?? 0) >= 2,
    Checkbox_4: (character.deathSaves?.successes ?? 0) >= 3,
    Checkbox_5: (character.deathSaves?.failures ?? 0) >= 1,
    Checkbox_6: (character.deathSaves?.failures ?? 0) >= 2,
    Checkbox_7: (character.deathSaves?.failures ?? 0) >= 3,
    Checkbox_32: !!character.inspiration,
    Checkbox_33: armorLower.some((armor) => armor.includes('light')),
    Checkbox_34: armorLower.some((armor) => armor.includes('medium')),
    Checkbox_35: armorLower.some((armor) => armor.includes('heavy')),
    Checkbox_36: armorLower.some((armor) => armor.includes('shield')),
    Checkbox_149: !!attunedItems[2],
    Checkbox_150: !!attunedItems[1],
    Checkbox_151: !!attunedItems[0],
  }

  for (const [ability, mapping] of Object.entries(ABILITY_FIELD_MAP) as Array<
    [AbilityName, { modifier: string; score: string }]
  >) {
    textFields[mapping.modifier] = formatViewModelModifier(viewModel.abilityModifiers[ability])
    textFields[mapping.score] = String(character.abilityScores[ability])
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

  for (let index = 0; index < 6; index += 1) {
    const row = viewModel.weaponRows[index]
    textFields[`Text_${61 + index}`] = row?.name ?? ''
    textFields[`Text_${67 + index}`] = row?.attackBonus ?? ''
    textFields[`Text_${73 + index}`] = row
      ? [row.damage, row.damageType].filter(Boolean).join(' ')
      : ''
    textFields[`Text_${79 + index}`] = row?.notes ?? ''
  }

  for (let index = 0; index < 30; index += 1) {
    const row = viewModel.spellRows[index]
    textFields[`Text_${92 + index}`] = row?.level ?? ''
    textFields[`Text_${122 + index}`] = row?.name ?? ''
    textFields[`Text_${152 + index}`] = row?.castingTimeAndDuration ?? ''
    textFields[`Text_${182 + index}`] = row?.notes ?? ''
    checkboxFields[`Checkbox_${59 + index * 3}`] = row?.concentration ?? false
    checkboxFields[`Checkbox_${60 + index * 3}`] = row?.ritual ?? false
    checkboxFields[`Checkbox_${61 + index * 3}`] = row?.material ?? false
  }

  for (let level = 1; level <= 9; level += 1) {
    const slot = character.spells.spellSlots[level]
    const fields = SLOT_FIELDS[level - 1]
    textFields[fields.total] = slot?.max ? String(slot.max) : ''
    fields.used.forEach((field, index) => {
      checkboxFields[field] = (slot?.used ?? 0) > index
    })
  }

  return { textFields, checkboxFields }
}
