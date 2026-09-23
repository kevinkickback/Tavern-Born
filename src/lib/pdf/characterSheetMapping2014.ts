import { buildCreatureChoiceSummary, buildCreatureStatBlock } from '@/lib/5etools/creatureStatBlock'
import type { AbilityName } from '@/lib/calculations/abilityScores'
import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import { renderEntriesToText } from '@/lib/entryText'
import { CHARACTER_SHEET_CAPACITIES } from '@/lib/pdf/characterSheetCapacities'
import {
  type CharacterSheetViewModel,
  formatViewModelModifier,
  usesCustomOrganization,
} from '@/lib/pdf/characterSheetViewModel'
import type { CharacterSheetFieldMap } from '@/lib/pdf/types'
import type { CharacterAction } from '@/types/actions'

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

const ACTION_FIELD_MAX_LENGTH = 72
export const MPMB_CARD_DESCRIPTION_LIMIT = 260
const CAPACITY = CHARACTER_SHEET_CAPACITIES['2014-custom']

function limitMpmbCardDescription(description: string): string {
  if (description.length <= MPMB_CARD_DESCRIPTION_LIMIT) return description
  return `${description.slice(0, MPMB_CARD_DESCRIPTION_LIMIT - 1).trimEnd()}…`
}

function titleCase(value: string): string {
  return value.replace(/^\p{L}/u, (letter) => letter.toUpperCase())
}

function formatActionDamage(action: CharacterAction): string {
  return (action.damage ?? [])
    .map((damage) => {
      const amount = [
        damage.dice,
        damage.bonus === 0
          ? undefined
          : damage.dice
            ? formatViewModelModifier(damage.bonus)
            : String(damage.bonus),
      ]
        .filter(Boolean)
        .join(' ')
      return [amount, damage.damageType].filter(Boolean).join(' ')
    })
    .filter(Boolean)
    .join(', ')
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.,;:]+$/u, '')
}

function truncateActionEntry(value: string): string {
  if (value.length <= ACTION_FIELD_MAX_LENGTH) return value
  return `${value.slice(0, ACTION_FIELD_MAX_LENGTH - 3).trimEnd()}...`
}

function formatActionEntry(action: CharacterAction): string {
  const mechanics = [
    action.attackBonus != null
      ? `${formatViewModelModifier(action.attackBonus)} to hit`
      : undefined,
    action.save
      ? `DC ${action.save.dc}${action.save.ability ? ` ${titleCase(action.save.ability)}` : ''}`
      : undefined,
    action.range,
    formatActionDamage(action) || undefined,
    action.resourceCost
      ? `${action.resourceCost.amount} ${action.resourceCost.resourceId}`
      : undefined,
    action.recharge?.rest ? `${titleCase(action.recharge.rest)} rest` : undefined,
    action.recharge?.note,
  ]
    .filter((detail): detail is string => Boolean(detail))
    .map(withoutTerminalPunctuation)
  const description = action.description ? withoutTerminalPunctuation(action.description) : ''
  const core = mechanics.length > 0 ? `${action.name}: ${mechanics.join('; ')}` : action.name
  if (!description) return truncateActionEntry(core)

  const withDescription = `${core}: ${description}`
  return truncateActionEntry(
    mechanics.length > 0 && withDescription.length > ACTION_FIELD_MAX_LENGTH
      ? core
      : withDescription,
  )
}

function actionsForField(
  actions: readonly CharacterAction[],
  kind: 'action' | 'bonus-action' | 'reaction',
): CharacterAction[] {
  const eligible = actions.filter((action) => action.active && action.kind === kind)
  return [
    ...eligible.filter((action) => action.source.kind === 'manual'),
    ...eligible.filter((action) => action.source.kind !== 'manual'),
  ].slice(0, CAPACITY.actions)
}

export function getAmmunitionRows(viewModel: CharacterSheetViewModel) {
  const rows = new Map<string, { name: string; amount: number }>()
  for (const item of viewModel.character.equipment) {
    if (!getNormalizedItemTraits(item).isAmmunition) continue
    const packSize = Number(item.name.match(/\((\d+)\)/u)?.[1] ?? 1)
    const name = item.name.replace(/\s*\(\d+\)/u, '').replace(/\b(Arrow|Bolt|Needle)$/iu, '$1s')
    const key = name.toLocaleLowerCase()
    const prior = rows.get(key)
    rows.set(key, {
      name,
      amount: (prior?.amount ?? 0) + Math.max(0, item.quantity) * packSize,
    })
  }
  return [...rows.values()]
}

function splitRuledSection(value: string, visibleCharacters: number): [string, string] {
  if (value.length <= visibleCharacters) return [value, '']
  const first = value.slice(0, visibleCharacters)
  const boundary = Math.max(first.lastIndexOf(' '), first.lastIndexOf('\n'))
  const cut = boundary > visibleCharacters * 0.65 ? boundary : visibleCharacters
  return [value.slice(0, cut).trimEnd(), value.slice(cut).trimStart()]
}

function renderCompanionEntries(entries: readonly unknown[] | undefined): string {
  return renderEntriesToText(entries)
    .replace(/\{@hitYourSpellAttack\}/gu, 'your spell attack modifier')
    .replace(/\bmw\b(?=\s+(?:\(|your|to hit))/gu, 'Melee Weapon Attack:')
    .replace(/\brw\b(?=\s+(?:\(|your|to hit))/gu, 'Ranged Weapon Attack:')
}

export function mapCharacterSheet2014(viewModel: CharacterSheetViewModel): CharacterSheetFieldMap {
  const { character } = viewModel
  const additionalMovement =
    viewModel.additionalMovementSummary === '—'
      ? ''
      : `Additional movement: ${viewModel.additionalMovementSummary}`
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
  const strengthScore = viewModel.effectiveAbilityScores.strength
  const ammoRows = getAmmunitionRows(viewModel)
  const companion = viewModel.companions[0]
  const companionStat = companion?.creature ? buildCreatureStatBlock(companion.creature) : undefined
  const companionSummary = companion?.creature
    ? buildCreatureChoiceSummary(companion.creature)
    : undefined
  const companionArmorClass = companionSummary?.armorClass.match(/^13\s*\+\s*PB\b/iu)
    ? String(13 + viewModel.proficiencyBonus)
    : (companionSummary?.armorClass.match(/^\d+$/u)?.[0] ?? '')
  const companionClassLevel = character.classProgression.find(
    (entry) => entry.name === companion?.className,
  )?.levels
  const companionMaxHp =
    companion?.creature?.hp?.average != null
      ? String(companion.creature.hp.average)
      : companion?.className === 'Ranger' &&
          companionClassLevel != null &&
          /^5\s*\+\s*five times your ranger level\b/iu.test(companion.creature?.hp?.special ?? '')
        ? String(5 + 5 * companionClassLevel)
        : ''
  const companionWalkSpeed = companion?.creature?.speed?.walk
  const companionSpeed =
    typeof companionWalkSpeed === 'number'
      ? `${companionWalkSpeed} ft.`
      : (companionSummary?.speed ?? '')
  const [racialTraits, racialOverflow] = splitRuledSection(
    [viewModel.racialTraitsSummary, additionalMovement].filter(Boolean).join('\n'),
    310,
  )
  const organizationLines = viewModel.organizationDetailsSummary.split(/\n+/u).filter(Boolean)
  const organizationDetails = organizationLines.slice(0, 2).join('\n')
  const organizationOverflow = organizationLines.slice(2).join('\n')
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
    'Initiative bonus': formatViewModelModifier(viewModel.initiativeModifier),
    Speed: `${viewModel.walkingSpeed} ft`,
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
    'Racial Traits': racialTraits,
    'Background Feature': viewModel.backgroundFeature.name,
    'Background Feature Description': viewModel.backgroundFeature.description,
    'Background_Organisation.Left': usesCustomOrganization(viewModel)
      ? viewModel.customOrganizationSummary || viewModel.alliesAndOrganizationsSummary
      : viewModel.alliesAndOrganizationsSummary,
    'Background_Organisation.Right': organizationDetails,
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
    'AmmoLeftDisplay.Name': ammoRows[0]?.name ?? '',
    'AmmoLeftDisplay.Amount': ammoRows[0] ? String(ammoRows[0].amount) : '',
    'AmmoRightDisplay.Name': ammoRows[1]?.name ?? '',
    'AmmoRightDisplay.Amount': ammoRows[1] ? String(ammoRows[1].amount) : '',
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
    'Weight Carrying Capacity.Field': String(viewModel.carryingCapacity),
    'Weight Encumbered': String(strengthScore * 5),
    'Weight Heavily Encumbered': String(strengthScore * 10),
    'Weight Push/Drag/Lift': String(strengthScore * 30),
    'Speed encumbered': `${Math.max(0, viewModel.walkingSpeed - 10)} ft`,
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
    'Feat Name 1': viewModel.feats[0]?.name ?? '',
    'Feat Name 2': viewModel.feats[1]?.name ?? '',
    'Feat Name 3': viewModel.feats[2]?.name ?? '',
    'Feat Name 4': viewModel.feats[3]?.name ?? '',
    'Feat Description 1': limitMpmbCardDescription(viewModel.feats[0]?.description ?? ''),
    'Feat Description 2': limitMpmbCardDescription(viewModel.feats[1]?.description ?? ''),
    'Feat Description 3': limitMpmbCardDescription(viewModel.feats[2]?.description ?? ''),
    'Feat Description 4': limitMpmbCardDescription(viewModel.feats[3]?.description ?? ''),
    'Feat Note 1': viewModel.feats[0]?.prerequisites ?? '',
    'Feat Note 2': viewModel.feats[1]?.prerequisites ?? '',
    'Feat Note 3': viewModel.feats[2]?.prerequisites ?? '',
    'Feat Note 4': viewModel.feats[3]?.prerequisites ?? '',
    'Extra.Notes': viewModel.defensiveTraits.slice(6).join('\n'),
    'P4.AScomp.Comp.Desc.Name': companion?.name ?? '',
    'P4.AScomp.Comp.Desc.Size': companionSummary?.sizes[0] ?? '',
    'P4.AScomp.Comp.Desc.MonsterType': companionSummary?.creatureType ?? '',
    'P4.AScomp.Comp.Use.Speed': companionSpeed,
    'P4.AScomp.Comp.Use.AC': companionArmorClass,
    'P4.AScomp.Comp.Use.HP.Max': companionMaxHp,
    'P4.AScomp.Comp.Use.Proficiency Bonus':
      companion?.creature?.pbNote === 'equals your bonus'
        ? formatViewModelModifier(viewModel.proficiencyBonus)
        : (companionStat?.proficiencyBonus ?? ''),
    'P4.AScomp.Comp.Use.Senses':
      companionStat?.details.find((line) => line.label === 'Senses')?.value ?? '',
    'P4.AScomp.Comp.Use.Features':
      companionStat?.sections
        .filter((section) => section.id !== 'traits' && section.id !== 'actions')
        .map((section) => `${section.title}\n${renderCompanionEntries(section.entries)}`)
        .join('\n\n') ?? '',
    'P4.AScomp.Comp.Use.Traits': (companion?.creature?.trait ?? [])
      .map((trait) =>
        [trait.name, renderCompanionEntries(trait.entries)].filter(Boolean).join(': '),
      )
      .join('\n\n'),
    'P4.AScomp.Cnote.Left': companionStat
      ? [
          `${companion?.name} (${companion?.source ?? 'unknown source'})`,
          ...(companionSummary?.armorClass && companionArmorClass !== companionSummary.armorClass
            ? [`Armor Class: ${companionSummary.armorClass}`]
            : []),
          ...(companionSummary?.speed && companionSummary.speed !== companionSpeed
            ? [`Speed: ${companionSummary.speed}`]
            : []),
          ...companionStat.core
            .filter(
              (line) => line.label === 'Hit Points' && companion?.creature?.hp?.average == null,
            )
            .map((line) => `${line.label}: ${line.value}`),
          ...companionStat.details
            .filter((line) => line.label !== 'Senses')
            .map((line) => `${line.label}: ${line.value}`),
        ].join('\n')
      : '',
    'P5.ASnotes.Notes.Left': [
      racialOverflow ? `RACIAL TRAITS (CONTINUED)\n${racialOverflow}` : '',
      organizationOverflow ? `ORGANIZATION (CONTINUED)\n${organizationOverflow}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  }

  for (const ability of companionStat?.abilities ?? []) {
    const prefix = `P4.AScomp.Comp.Use.Ability.${ability.label.charAt(0)}${ability.label.slice(1).toLowerCase()}`
    textFields[`${prefix}.Score`] = ability.score == null ? '' : String(ability.score)
    textFields[`${prefix}.Mod`] = ability.score == null ? '' : ability.modifier
  }

  for (const [index, action] of (companion?.creature?.action ?? []).slice(0, 3).entries()) {
    const prefix = `P4.AScomp.Comp.Use.Attack.${index + 1}`
    textFields[`${prefix}.Weapon Selection`] = action.name ?? ''
    textFields[`${prefix}.Description`] = renderCompanionEntries(action.entries)
  }

  for (
    let index = 0;
    index < Math.min(character.equipment.length, CAPACITY.equipment);
    index += 1
  ) {
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

  for (let index = 0; index < CAPACITY.magicItems; index += 1) {
    const item = viewModel.magicItems[index]
    const row = index + 1
    textFields[`Extra.Magic Item ${row}`] = item?.name ?? ''
    textFields[`Extra.Magic Item Description ${row}`] = limitMpmbCardDescription(
      item?.description ?? '',
    )
    textFields[`Extra.Magic Item Note ${row}`] = item?.rarity ?? ''
    textFields[`Extra.Magic Item Weight ${row}`] = item?.weight != null ? String(item.weight) : ''
  }

  for (let index = 0; index < 6; index += 1) {
    textFields[`Resistance Damage Type ${index + 1}`] = viewModel.defensiveTraits[index] ?? ''
  }

  for (let index = 0; index < CAPACITY.hitDice; index += 1) {
    const row = viewModel.hitDiceRows[index]
    textFields[`HD${index + 1} Level`] = row ? String(row.level) : ''
    textFields[`HD${index + 1} Die`] = row?.die ?? ''
    textFields[`HD${index + 1} Used`] = row?.used != null ? String(row.used) : ''
  }

  for (let index = 0; index < CAPACITY.classResources; index += 1) {
    const row = viewModel.classResourceRows[index]
    textFields[`Limited Feature ${index + 1}`] = row?.label ?? ''
    textFields[`Limited Feature Max Usages ${index + 1}`] = row ? String(row.max) : ''
    textFields[`Limited Feature Recovery ${index + 1}`] = row?.recovery ?? ''
    textFields[`Limited Feature Used ${index + 1}`] = row ? String(row.used) : ''
  }

  for (let index = 0; index < CAPACITY.weapons; index += 1) {
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

  const actionFields = [
    { label: 'Action', actions: actionsForField(viewModel.actions, 'action') },
    { label: 'Bonus Action', actions: actionsForField(viewModel.actions, 'bonus-action') },
    { label: 'Reaction', actions: actionsForField(viewModel.actions, 'reaction') },
  ] as const
  for (const group of actionFields) {
    for (let index = 0; index < CAPACITY.actions; index += 1) {
      const action = group.actions[index]
      textFields[`${group.label} ${index + 1}`] = action ? formatActionEntry(action) : ''
    }
  }

  for (const [ability, mapping] of Object.entries(ABILITY_FIELD_MAP) as Array<
    [AbilityName, { score: string; modifier: string }]
  >) {
    textFields[mapping.score] = String(viewModel.effectiveAbilityScores[ability])
    textFields[mapping.modifier] = formatViewModelModifier(viewModel.abilityModifiers[ability])
  }

  const checkboxFields: Record<string, boolean> = {
    Inspiration: !!character.inspiration,
    'Medium Armor': equippedArmor?.armorType === 'medium',
    'Heavy Armor': equippedArmor?.armorType === 'heavy',
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
  for (let index = 0; index < CAPACITY.magicItems; index += 1) {
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
