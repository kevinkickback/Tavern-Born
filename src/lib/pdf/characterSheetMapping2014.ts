import type { AbilityName } from '@/lib/calculations/abilityScores'
import {
  type CharacterSheetViewModel,
  formatViewModelModifier,
  usesCustomOrganization,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetFieldMap } from '@/lib/pdf/types'

const SKILL_FIELD_MAP: Record<string, { modifier: string; proficiency: string }> = {
  acrobatics: { modifier: 'Acr', proficiency: 'Acr Prof' },
  'animal handling': { modifier: 'Ani', proficiency: 'Ani Prof' },
  arcana: { modifier: 'Arc', proficiency: 'Arc Prof' },
  athletics: { modifier: 'Ath', proficiency: 'Ath Prof' },
  deception: { modifier: 'Dec', proficiency: 'Dec Prof' },
  history: { modifier: 'His', proficiency: 'His Prof' },
  insight: { modifier: 'Ins', proficiency: 'Ins Prof' },
  intimidation: { modifier: 'Inti', proficiency: 'Inti Prof' },
  investigation: { modifier: 'Inv', proficiency: 'Inv Prof' },
  medicine: { modifier: 'Med', proficiency: 'Med Prof' },
  nature: { modifier: 'Nat', proficiency: 'Nat Prof' },
  perception: { modifier: 'Perc', proficiency: 'Perc Prof' },
  performance: { modifier: 'Perf', proficiency: 'Perf Prof' },
  persuasion: { modifier: 'Pers', proficiency: 'Pers Prof' },
  religion: { modifier: 'Rel', proficiency: 'Rel Prof' },
  'sleight of hand': { modifier: 'Sle', proficiency: 'Sle Prof' },
  stealth: { modifier: 'Ste', proficiency: 'Ste Prof' },
  survival: { modifier: 'Sur', proficiency: 'Sur Prof' },
}

const SAVE_FIELD_MAP: Record<AbilityName, { modifier: string; proficiency: string }> = {
  strength: { modifier: 'Str ST Mod', proficiency: 'Str ST Prof' },
  dexterity: { modifier: 'Dex ST Mod', proficiency: 'Dex ST Prof' },
  constitution: { modifier: 'Con ST Mod', proficiency: 'Con ST Prof' },
  intelligence: { modifier: 'Int ST Mod', proficiency: 'Int ST Prof' },
  wisdom: { modifier: 'Wis ST Mod', proficiency: 'Wis ST Prof' },
  charisma: { modifier: 'Cha ST Mod', proficiency: 'Cha ST Prof' },
}

const ABILITY_FIELD_MAP: Record<AbilityName, { score: string; modifier: string }> = {
  strength: { score: 'Str', modifier: 'Str Mod' },
  dexterity: { score: 'Dex', modifier: 'Dex Mod' },
  constitution: { score: 'Con', modifier: 'Con Mod' },
  intelligence: { score: 'Int', modifier: 'Int Mod' },
  wisdom: { score: 'Wis', modifier: 'Wis Mod' },
  charisma: { score: 'Cha', modifier: 'Cha Mod' },
}

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

export function mapCharacterSheet2014(viewModel: CharacterSheetViewModel): CharacterSheetFieldMap {
  const { character } = viewModel
  const languages = character.proficiencies.languages
  const tools = character.proficiencies.tools
  const armorLower = character.proficiencies.armor.map((armor) => armor.toLowerCase())
  const weaponsLower = character.proficiencies.weapons.map((weapon) => weapon.toLowerCase())
  const otherWeapons = character.proficiencies.weapons.filter(
    (weapon) =>
      !weapon.toLowerCase().includes('simple') && !weapon.toLowerCase().includes('martial'),
  )
  const textFields: Record<string, string> = {
    'PC Name': character.name || '',
    'Player Name': character.details.playerName || '',
    'Class and Levels': viewModel.classLevelSummary,
    'Character Level': String(viewModel.level),
    Race: viewModel.raceSummary,
    Background: character.background || '',
    'Proficiency Bonus': formatViewModelModifier(viewModel.proficiencyBonus),
    'Passive Perception': String(
      10 + (viewModel.skillByName.get('perception')?.modifier ?? viewModel.abilityModifiers.wisdom),
    ),
    'Initiative bonus': formatViewModelModifier(viewModel.abilityModifiers.dexterity),
    Speed: `${character.speed || 30} ft`,
    AC: String(viewModel.effectiveArmorClass),
    'HP Max': String(viewModel.maxHP),
    'HP Current': String(character.hitPoints.current),
    'HP Temp': String(character.hitPoints.temporary),
    'Total Experience': String(character.experiencePoints || ''),
    'Copper Pieces': character.currency?.cp != null ? String(character.currency.cp) : '',
    'Silver Pieces': character.currency?.sp != null ? String(character.currency.sp) : '',
    'Electrum Pieces': character.currency?.ep != null ? String(character.currency.ep) : '',
    'Gold Pieces': character.currency?.gp != null ? String(character.currency.gp) : '',
    'Platinum Pieces': character.currency?.pp != null ? String(character.currency.pp) : '',
    'Weight Carried': viewModel.carriedWeight,
    Sex: character.details.gender || '',
    Height: character.details.height || '',
    Weight: character.details.weight || '',
    Alignment: character.details.alignment || '',
    Age: String(character.details.age ?? ''),
    'Eyes colour': character.details.eyes || '',
    'Skin colour': character.details.skin || '',
    'Hair colour': character.details.hair || '',
    'Personality Trait': character.details.personalityTraits || character.details.personality || '',
    Ideal: character.details.ideals || '',
    Bond: character.details.bonds || '',
    Flaw: character.details.flaws || '',
    Background_History:
      character.details.backstory || character.details.lifeEvents || character.details.origin || '',
    'Class Features': viewModel.classFeaturesSummary2014,
    'Racial Traits': viewModel.racialTraitsSummary,
    'Background Feature': viewModel.backgroundFeature.name,
    'Background Feature Description': viewModel.backgroundFeature.description,
    'Background_Organisation.Left': usesCustomOrganization(viewModel)
      ? viewModel.customOrganizationSummary || character.details.alliesAndOrganizations || ''
      : character.details.alliesAndOrganizations || '',
    Background_Appearance:
      character.details.appearance || character.details.physicalDescription || '',
    Background_Enemies: character.details.nemesis || '',
    Vision: viewModel.visionSummary,
    'Size Category': normalizeSize(viewModel.mergedRace?.size?.[0]),
    'Spell save DC 1':
      viewModel.spellcastingDetails[0]?.spellSaveDC != null
        ? String(viewModel.spellcastingDetails[0].spellSaveDC)
        : '',
    'Spell save DC 2':
      viewModel.spellcastingDetails[1]?.spellSaveDC != null
        ? String(viewModel.spellcastingDetails[1].spellSaveDC)
        : '',
    'Language 1': languages[0] ?? '',
    'Language 2': languages[1] ?? '',
    'Language 3': languages[2] ?? '',
    'Language 4': languages[3] ?? '',
    'Language 5': languages[4] ?? '',
    'Language 6': languages[5] ?? '',
    'Tool 1': tools[0] ?? '',
    'Tool 2': tools[1] ?? '',
    'Tool 3': tools[2] ?? '',
    'Tool 4': tools[3] ?? '',
    'Tool 5': tools[4] ?? '',
    'Tool 6': tools[5] ?? '',
    'Proficiency Weapon Other Description': otherWeapons.join(', '),
    'Feat Name 1': character.feats[0]?.name ?? '',
    'Feat Name 2': character.feats[1]?.name ?? '',
    'Feat Name 3': character.feats[2]?.name ?? '',
    'Feat Name 4': character.feats[3]?.name ?? '',
    'Feat Description 1': character.feats[0]?.description ?? '',
    'Feat Description 2': character.feats[1]?.description ?? '',
    'Feat Description 3': character.feats[2]?.description ?? '',
    'Feat Description 4': character.feats[3]?.description ?? '',
    'Feat Note 1': character.feats[0]?.prerequisites ?? '',
    'Feat Note 2': character.feats[1]?.prerequisites ?? '',
    'Feat Note 3': character.feats[2]?.prerequisites ?? '',
    'Feat Note 4': character.feats[3]?.prerequisites ?? '',
  }

  for (let index = 0; index < Math.min(character.equipment.length, 54); index += 1) {
    const item = character.equipment[index]
    if (!item) continue
    const row = index + 1
    textFields[`Adventuring Gear Row ${row}`] = item.name
    textFields[`Adventuring Gear Amount ${row}`] = String(item.quantity)
    textFields[`Adventuring Gear Weight ${row}`] = item.weight != null ? String(item.weight) : ''
  }
  for (const [ability, mapping] of Object.entries(ABILITY_FIELD_MAP) as Array<
    [AbilityName, { score: string; modifier: string }]
  >) {
    textFields[mapping.score] = String(character.abilityScores[ability])
    textFields[mapping.modifier] = formatViewModelModifier(viewModel.abilityModifiers[ability])
  }

  const checkboxFields: Record<string, boolean> = {
    Inspiration: !!character.inspiration,
    'Death Save Success1': (character.deathSaves?.successes ?? 0) >= 1,
    'Death Save Success2': (character.deathSaves?.successes ?? 0) >= 2,
    'Death Save Success3': (character.deathSaves?.successes ?? 0) >= 3,
    'Death Save Fail1': (character.deathSaves?.failures ?? 0) >= 1,
    'Death Save Fail2': (character.deathSaves?.failures ?? 0) >= 2,
    'Death Save Fail3': (character.deathSaves?.failures ?? 0) >= 3,
    'Proficiency Armor Light': armorLower.some((armor) => armor.includes('light')),
    'Proficiency Armor Medium': armorLower.some((armor) => armor.includes('medium')),
    'Proficiency Armor Heavy': armorLower.some((armor) => armor.includes('heavy')),
    'Proficiency Shields': armorLower.some((armor) => armor.includes('shield')),
    'Proficiency Weapon Simple': weaponsLower.some((weapon) => weapon.includes('simple')),
    'Proficiency Weapon Martial': weaponsLower.some((weapon) => weapon.includes('martial')),
    'Proficiency Weapon Other': otherWeapons.length > 0,
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
