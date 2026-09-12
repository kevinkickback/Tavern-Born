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
  const equippedArmor = character.equipment.find(
    (item) => item.equipped && item.armorType && item.armorType !== 'shield',
  )
  const equippedShield = character.equipment.find(
    (item) => item.equipped && (item.armorType === 'shield' || item.type === 'S'),
  )
  const armorAdjustments = character.armorClassAdjustments ?? []
  const spellcastingOne = viewModel.spellcastingDetails[0]
  const spellcastingTwo = viewModel.spellcastingDetails[1]
  const strengthScore = character.abilityScores.strength
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
    'Total Experience': String(character.experiencePoints),
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
    Background_History: viewModel.historyAndPersonalitySummary,
    'Class Features': viewModel.classFeaturesSummary2014,
    'Racial Traits': viewModel.racialTraitsSummary,
    'Background Feature': viewModel.backgroundFeature.name,
    'Background Feature Description': viewModel.backgroundFeature.description,
    'Background_Organisation.Left': usesCustomOrganization(viewModel)
      ? viewModel.customOrganizationSummary || viewModel.alliesAndOrganizationsSummary
      : viewModel.alliesAndOrganizationsSummary,
    'Background_Organisation.Right': viewModel.organizationDetailsSummary,
    'Background_Faction.Text': character.details.faction || '',
    'Background_FactionRank.Text': character.details.rank || '',
    Background_Appearance: viewModel.appearanceSummary,
    Background_Enemies: character.details.nemesis || '',
    'Faith/Deity': character.details.faith || '',
    Lifestyle: character.details.lifestyle || '',
    Vision: viewModel.visionSummary,
    'Size Category': normalizeSize(viewModel.mergedRace?.size?.[0]),
    'AC Armor Bonus': equippedArmor?.ac != null ? String(equippedArmor.ac) : '',
    'AC Armor Description': equippedArmor?.name ?? '',
    'AC Armor Weight': equippedArmor?.weight != null ? String(equippedArmor.weight) : '',
    'AC Shield Bonus': equippedShield?.ac != null ? String(equippedShield.ac) : '',
    'AC Shield Bonus Description': equippedShield?.name ?? '',
    'AC Shield Weight': equippedShield?.weight != null ? String(equippedShield.weight) : '',
    'AC Dexterity Modifier': formatViewModelModifier(viewModel.abilityModifiers.dexterity),
    'AC Misc Mod 1':
      armorAdjustments[0]?.amount != null
        ? formatViewModelModifier(armorAdjustments[0].amount)
        : '',
    'AC Misc Mod 1 Description': armorAdjustments[0]?.label ?? '',
    'AC Misc Mod 2':
      armorAdjustments[1]?.amount != null
        ? formatViewModelModifier(armorAdjustments[1].amount)
        : '',
    'AC Misc Mod 2 Description': armorAdjustments[1]?.label ?? '',
    'Weight Carrying Capacity.Field': String(strengthScore * 15),
    'Weight Encumbered': String(strengthScore * 5),
    'Weight Heavily Encumbered': String(strengthScore * 10),
    'Weight Push/Drag/Lift': String(strengthScore * 30),
    'Speed encumbered': `${Math.max(0, (character.speed || 30) - 10)} ft`,
    'Spell save DC 1':
      spellcastingOne?.spellSaveDC != null ? String(spellcastingOne.spellSaveDC) : '',
    'Spell save DC 2':
      spellcastingTwo?.spellSaveDC != null ? String(spellcastingTwo.spellSaveDC) : '',
    'Spell DC 1 Mod':
      spellcastingOne?.spellcastingAbility != null
        ? formatViewModelModifier(viewModel.abilityModifiers[spellcastingOne.spellcastingAbility])
        : '',
    'Spell DC 2 Mod':
      spellcastingTwo?.spellcastingAbility != null
        ? formatViewModelModifier(viewModel.abilityModifiers[spellcastingTwo.spellcastingAbility])
        : '',
    'Spell DC 1 Bonus': spellcastingOne ? formatViewModelModifier(viewModel.proficiencyBonus) : '',
    'Spell DC 2 Bonus': spellcastingTwo ? formatViewModelModifier(viewModel.proficiencyBonus) : '',
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
    'Extra.Notes': viewModel.defensiveTraits.slice(6).join('\n'),
  }

  for (let index = 0; index < Math.min(character.equipment.length, 90); index += 1) {
    const item = character.equipment[index]
    if (!item) continue
    if (index < 54) {
      const row = index + 1
      textFields[`Adventuring Gear Row ${row}`] = item.name
      textFields[`Adventuring Gear Amount ${row}`] = String(item.quantity)
      textFields[`Adventuring Gear Weight ${row}`] = item.weight != null ? String(item.weight) : ''
    } else {
      const row = index - 53
      textFields[`Extra.Gear Row ${row}`] = item.name
      textFields[`Extra.Gear Amount ${row}`] = String(item.quantity)
      textFields[`Extra.Gear Weight ${row}`] = item.weight != null ? String(item.weight) : ''
    }
  }

  for (let index = 0; index < 5; index += 1) {
    const item = viewModel.magicItems[index]
    const row = index + 1
    textFields[`Extra.Magic Item ${row}`] = item?.name ?? ''
    textFields[`Extra.Magic Item Description ${row}`] = item?.description ?? ''
    textFields[`Extra.Magic Item Note ${row}`] = item?.rarity ?? ''
    textFields[`Extra.Magic Item Weight ${row}`] = item?.weight != null ? String(item.weight) : ''
  }

  for (let index = 0; index < 6; index += 1) {
    textFields[`Resistance Damage Type ${index + 1}`] = viewModel.defensiveTraits[index] ?? ''
  }

  for (let index = 0; index < 3; index += 1) {
    const row = viewModel.hitDiceRows[index]
    textFields[`HD${index + 1} Level`] = row ? String(row.level) : ''
    textFields[`HD${index + 1} Die`] = row?.die ?? ''
    textFields[`HD${index + 1} Used`] = row?.used != null ? String(row.used) : ''
  }

  for (let index = 0; index < 8; index += 1) {
    const row = viewModel.classResourceRows[index]
    textFields[`Limited Feature ${index + 1}`] = row?.label ?? ''
    textFields[`Limited Feature Max Usages ${index + 1}`] = row ? String(row.max) : ''
    textFields[`Limited Feature Recovery ${index + 1}`] = row?.recovery ?? ''
    textFields[`Limited Feature Used ${index + 1}`] = row ? String(row.used) : ''
  }

  for (let index = 0; index < 5; index += 1) {
    const row = viewModel.weaponRows[index]
    const fieldNumber = index + 1
    textFields[`Attack.${fieldNumber}.Weapon Selection`] = row?.name ?? ''
    textFields[`Attack.${fieldNumber}.Range`] = row?.range ?? ''
    textFields[`Attack.${fieldNumber}.To Hit`] = row?.attackBonus ?? ''
    textFields[`Attack.${fieldNumber}.Damage`] = row?.damage ?? ''
    textFields[`Attack.${fieldNumber}.Damage Type`] = row?.damageType ?? ''
    textFields[`Attack.${fieldNumber}.Description`] = row
      ? [row.notes, row.description].filter(Boolean).join('\n')
      : ''
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
  for (let index = 0; index < 5; index += 1) {
    checkboxFields[`Extra.Magic Item Attuned ${index + 1}`] = !!viewModel.magicItems[index]?.attuned
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
