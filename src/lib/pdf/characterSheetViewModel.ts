import { getClassResourceDefs } from '@/lib/5etools/classData'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
} from '@/lib/5etools/classRuleNormalization'
import { DAMAGE_TYPE_LABELS } from '@/lib/5etools/constants'
import { type EntityLookupSet, resolveClassReference } from '@/lib/5etools/entityResolvers'
import { type AbilityName, formatModifier } from '@/lib/calculations/abilityScores'
import { deriveWeaponActions } from '@/lib/calculations/actions'
import { computeEffectiveCharacterArmorClass } from '@/lib/calculations/armorClass'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getAbilityModifier, getProficiencyBonus } from '@/lib/calculations/gameRules'
import {
  type EffectiveMovement,
  formatEffectiveMovement,
  getAdditionalMovementSummary,
  getWalkingSpeed,
} from '@/lib/calculations/movement'
import { getRaceTraits } from '@/lib/calculations/raceUtils'
import { deriveAllSavingThrows, deriveAllSkills } from '@/lib/calculations/skills'
import { buildSpellcastingClassDetails } from '@/lib/calculations/spellProfiles.casting'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import {
  formatCastingTime,
  formatComponents,
  formatDuration,
  formatRange,
  isRitualSpell,
} from '@/lib/calculations/spellUtils'
import { CUSTOM_ORGANIZATION_KEY, getOrganizationKey } from '@/lib/character/organizationConstants'
import {
  getCharacterClassEntries,
  getEffectiveMaxHP,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import { renderEntry } from '@/lib/renderer'
import type { Background5e, Class5e, Organization5e, Race5e, Spell5e } from '@/types/5etools'
import type { CharacterAction } from '@/types/actions'
import type { AbilityScores, Character, Equipment } from '@/types/character'

type ModifierResult = { modifier: number; proficient: boolean }

export interface CharacterSheetLookupSet extends EntityLookupSet {
  spellsByKey?: Readonly<Record<string, Spell5e>>
  itemPropertyByAbbr?: Readonly<Record<string, string>>
  organizations?: readonly Organization5e[]
}

interface CharacterSheetWeaponRow {
  name: string
  attackBonus: string
  damage: string
  damageType: string
  range: string
  notes: string
  description: string
}

interface CharacterSheetSpellRow {
  name: string
  level: string
  castingTimeAndDuration: string
  notes: string
  concentration: boolean
  ritual: boolean
  material: boolean
}

interface CharacterSheetClassResourceRow {
  label: string
  max: number
  used: number
  recovery: string
}

interface CharacterSheetHitDieRow {
  level: number
  die: string
  used: number | null
}

export interface CharacterSheetViewModel {
  character: Character
  level: number
  classSummary: string
  subclassSummary: string
  classLevelSummary: string
  raceSummary: string
  proficiencyBonus: number
  effectiveAbilityScores: AbilityScores
  abilityModifiers: Record<AbilityName, number>
  skillByName: ReadonlyMap<string, ModifierResult>
  savingThrowByAbility: ReadonlyMap<AbilityName, ModifierResult>
  effectiveArmorClass: number
  maxHP: number
  movement: EffectiveMovement
  movementSummary: string
  additionalMovementSummary: string
  walkingSpeed: number
  remainingHitDice: number
  hitDiceRows: CharacterSheetHitDieRow[]
  classResourceRows: CharacterSheetClassResourceRow[]
  weaponRows: CharacterSheetWeaponRow[]
  actions: CharacterAction[]
  spellRows: CharacterSheetSpellRow[]
  magicItems: Equipment[]
  resolvedClasses: readonly Class5e[]
  mergedRace: Race5e | undefined
  background: Background5e | undefined
  spellcastingDetails: ReturnType<typeof buildSpellcastingClassDetails>
  visionSummary: string
  racialTraitsSummary: string
  backgroundFeature: { name: string; description: string }
  classFeaturesSummary2014: string
  featuresSummary: string
  equipmentSummary: string
  proficienciesSummary: string
  languagesSummary: string
  featsSummary: string
  customOrganizationSummary: string
  carriedWeight: string
  sizeSummary: string
  appearanceSummary: string
  historyAndPersonalitySummary: string
  alliesAndOrganizationsSummary: string
  organizationDetailsSummary: string
  organizationImage?: string
  defensiveTraits: string[]
}

function getClassSummary(character: Character): string {
  const entries = getCharacterClassEntries(character)
  return (
    entries
      .map((entry) => entry.name)
      .filter(Boolean)
      .join(' / ') ||
    character.class ||
    ''
  )
}

function getSubclassSummary(character: Character): string {
  return getCharacterClassEntries(character)
    .map((entry) => entry.subclass)
    .filter((subclass): subclass is string => !!subclass)
    .join(' / ')
}

function getClassLevelSummary(character: Character): string {
  if (!Array.isArray(character.classProgression) || character.classProgression.length === 0) {
    return character.class || ''
  }
  return character.classProgression
    .filter((entry) => entry.name)
    .map((entry) => {
      const subclass = entry.subclass ? ` (${entry.subclass})` : ''
      return `${entry.name} ${entry.levels}${subclass}`
    })
    .join(' / ')
}

function getRaceSummary(character: Character): string {
  if (!character.subrace) return character.race || ''
  return `${character.subrace} ${character.race}`.trim()
}

function renderEntriesToText(entries: unknown[]): string {
  return entries
    .map((entry) =>
      (renderEntry(entry) ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join(' ')
}

function extractBackgroundFeatureBlock(
  entries: unknown[],
): { name: string; entries: unknown[] } | null {
  const featureBlock = entries.find((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const record = entry as { name?: unknown; entries?: unknown[] }
    return (
      typeof record.name === 'string' &&
      /^feature\b/i.test(record.name) &&
      Array.isArray(record.entries)
    )
  })
  if (!featureBlock || typeof featureBlock !== 'object') return null
  const featureName = (featureBlock as { name?: unknown }).name
  const featureEntries = (featureBlock as { entries?: unknown[] }).entries
  return {
    name:
      typeof featureName === 'string' && featureName.trim().length > 0
        ? featureName.replace(/^feature\s*:?\s*/i, '').trim()
        : 'Unnamed Feature',
    entries: Array.isArray(featureEntries) ? featureEntries : [],
  }
}

function buildVisionSummary(character: Character, mergedRace?: Race5e): string {
  if (character.visions?.length) {
    return character.visions
      .map((vision) => {
        const label = vision.type.charAt(0).toUpperCase() + vision.type.slice(1)
        return vision.range != null ? `${label} ${vision.range} ft.` : label
      })
      .join(', ')
  }
  return mergedRace?.darkvision ? `Darkvision ${mergedRace.darkvision} ft.` : ''
}

function buildRacialTraitsSummary(character: Character, mergedRace?: Race5e): string {
  const provenanceFeatures = character.provenance?.features ?? {}
  const racialFeatureNames = new Set(
    Object.entries(provenanceFeatures)
      .filter(([, tags]) =>
        tags.some((tag) => tag.sourceType === 'race' || tag.sourceType === 'subrace'),
      )
      .map(([name]) => name),
  )
  const racialFeatures = character.features.filter((feature) =>
    racialFeatureNames.has(feature.name),
  )
  if (racialFeatures.length > 0) {
    return racialFeatures
      .map((feature) => {
        const body = feature.description?.trim()
        return body ? `${feature.name}: ${body}` : feature.name
      })
      .join('\n\n')
  }
  if (mergedRace) {
    const traits = getRaceTraits(mergedRace)
    if (traits.length > 0) {
      return traits
        .map((trait) => {
          const text = renderEntriesToText(trait.entries)
          return text ? `${trait.name}: ${text}` : trait.name
        })
        .join('\n\n')
    }
  }
  return character.race || ''
}

function getBackgroundFeature(
  character: Character,
  background?: Background5e,
): { name: string; description: string } {
  const provenanceFeatures = character.provenance?.features ?? {}
  const provenanceName =
    Object.entries(provenanceFeatures).find(([, tags]) =>
      tags.some((tag) => tag.sourceType === 'background'),
    )?.[0] ?? ''
  if (provenanceName) {
    const feature = character.features.find((entry) => entry.name === provenanceName)
    return { name: provenanceName, description: feature?.description?.trim() ?? '' }
  }
  if (!background?.entries) return { name: '', description: '' }
  const featureBlock = extractBackgroundFeatureBlock(background.entries)
  if (!featureBlock) return { name: '', description: '' }
  return {
    name: featureBlock.name,
    description: renderEntriesToText(featureBlock.entries),
  }
}

function buildFeaturesSummary(character: Character): string {
  return character.features
    .map((feature) => {
      const body = feature.description?.trim()
      return body ? `${feature.name}: ${body}` : feature.name
    })
    .join('\n\n')
}

function buildClassFeaturesSummary(character: Character): string {
  const provenanceFeatures = character.provenance?.features ?? {}
  if (Object.keys(provenanceFeatures).length === 0) return buildFeaturesSummary(character)
  const classFeatureNames = new Set(
    Object.entries(provenanceFeatures)
      .filter(([, tags]) =>
        tags.some(
          (tag) =>
            tag.sourceType === 'class' ||
            tag.sourceType === 'subclass' ||
            tag.sourceType === 'optionalFeature',
        ),
      )
      .map(([name]) => name),
  )
  const knownNames = new Set(Object.keys(provenanceFeatures))
  return character.features
    .filter((feature) => classFeatureNames.has(feature.name) || !knownNames.has(feature.name))
    .map((feature) => {
      const body = feature.description?.trim()
      return body ? `${feature.name}: ${body}` : feature.name
    })
    .join('\n\n')
}

function buildProficienciesSummary(character: Character): string {
  const rows: string[] = []
  if (character.proficiencies.armor.length)
    rows.push(`Armor: ${character.proficiencies.armor.join(', ')}`)
  if (character.proficiencies.weapons.length)
    rows.push(`Weapons: ${character.proficiencies.weapons.join(', ')}`)
  if (character.proficiencies.tools.length)
    rows.push(`Tools: ${character.proficiencies.tools.join(', ')}`)
  if (character.proficiencies.languages.length)
    rows.push(`Languages: ${character.proficiencies.languages.join(', ')}`)
  return rows.join('\n')
}

function buildLabeledSummary(
  rows: Array<[label: string, value: string | number | undefined]>,
): string {
  return rows
    .filter(([, value]) => value !== undefined && String(value).trim().length > 0)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n\n')
}

function buildAppearanceSummary(character: Character): string {
  const details = character.details
  const description = details.appearance || details.physicalDescription
  return [
    description,
    buildLabeledSummary([
      ['Distinguishing marks', details.distinguishingMarks],
      ['Clothing', details.clothingStyle],
      ['Mannerisms', details.mannerisms],
    ]),
  ]
    .filter(Boolean)
    .join('\n\n')
}

function buildHistoryAndPersonalitySummary(character: Character): string {
  const details = character.details
  return buildLabeledSummary([
    ['Personality', details.personalityTraits || details.personality],
    ['Ideals', details.ideals],
    ['Bonds', details.bonds],
    ['Flaws', details.flaws],
    ['Backstory', details.backstory],
    ['Origin', details.origin],
    ['Family', details.family],
    ['Defining moment', details.definingMoment],
    ['Life events', details.lifeEvents],
    ['Goals', details.goals],
    ['Fears', details.fears],
  ])
}

function buildAlliesAndOrganizationsSummary(character: Character): string {
  const allies = character.details.allies ?? []
  const allySummary = allies
    .map((ally) => {
      const relationship = ally.relationship ? ` (${ally.relationship})` : ''
      const description = ally.description ? `: ${ally.description}` : ''
      return `${ally.name}${relationship}${description}`
    })
    .join('\n')
  return [character.details.alliesAndOrganizations, allySummary].filter(Boolean).join('\n\n')
}

function buildOrganizationDetailsSummary(character: Character): string {
  const details = character.details
  return buildLabeledSummary([
    ['Faction', details.faction],
    ['Rank', details.rank],
    ['Faction notes', details.factionNotes],
    ['Patron', details.patron],
    ['Patron details', details.patronDetails],
  ])
}

function resolveOrganizationImage(
  character: Character,
  organizations: readonly Organization5e[],
): string | undefined {
  const selectionKey = character.details.organizationSelectionKey
  if (selectionKey === CUSTOM_ORGANIZATION_KEY) {
    return character.details.organizationCustomImage?.trim() || undefined
  }
  return organizations.find(
    (organization) => getOrganizationKey(organization.name, organization.source) === selectionKey,
  )?.imagePath
}

function buildWeaponRows(actions: readonly CharacterAction[]): CharacterSheetWeaponRow[] {
  return actions
    .filter((action) => action.kind === 'attack')
    .map((action) => {
      const damage = action.damage?.[0]
      const damageBonus = damage?.bonus ?? 0
      const formattedDamageBonus =
        damageBonus > 0 ? ` + ${damageBonus}` : damageBonus < 0 ? ` - ${Math.abs(damageBonus)}` : ''
      const masteryLabels = (action.mastery ?? []).map((mastery) => mastery.name)
      return {
        name: action.name,
        attackBonus: action.attackBonus == null ? '' : formatModifier(action.attackBonus),
        damage: damage?.dice ? `${damage.dice}${formattedDamageBonus}` : '',
        damageType: damage?.damageType
          ? (DAMAGE_TYPE_LABELS[damage.damageType.toUpperCase()] ?? damage.damageType)
          : '',
        range: action.range ?? '',
        notes: [...(action.properties ?? []), ...masteryLabels].join(', '),
        description: action.description,
      }
    })
}

function resolveSpellReference(
  reference: string,
  spellsByKey: Readonly<Record<string, Spell5e>>,
): Spell5e | undefined {
  const direct = spellsByKey[reference]
  if (direct) return direct
  const separator = reference.lastIndexOf('|')
  const name = (separator >= 0 ? reference.slice(0, separator) : reference).trim()
  const source = separator >= 0 ? reference.slice(separator + 1).trim() : ''
  const candidates = Object.values(spellsByKey)
    .filter((spell) => spell.name === name && (!source || spell.source === source))
    .sort((left, right) => left.source.localeCompare(right.source))
  return candidates[0]
}

function buildSpellRows(
  character: Character,
  spellsByKey: Readonly<Record<string, Spell5e>>,
): CharacterSheetSpellRow[] {
  const references = character.spells.spellProfiles.flatMap((profile) => [
    ...(profile.cantrips ?? []),
    ...(profile.spellsKnown ?? []),
    ...(profile.preparedSpells ?? []),
    ...(profile.fixedSpells ?? []),
    ...(profile.alwaysPreparedSpells ?? []),
  ])
  const uniqueReferences = [...new Set(references)]
  return uniqueReferences
    .map((reference) => {
      const spell = resolveSpellReference(reference, spellsByKey)
      const separator = reference.lastIndexOf('|')
      const fallbackName = (separator >= 0 ? reference.slice(0, separator) : reference).trim()
      return {
        name: spell?.name ?? fallbackName,
        level: spell ? (spell.level === 0 ? 'C' : String(spell.level)) : '',
        castingTimeAndDuration: spell
          ? `${formatCastingTime(spell.time)}; ${formatDuration(spell.duration)}`
          : '',
        notes: spell
          ? `Range: ${formatRange(spell.range)}; ${formatComponents(spell.components)}`
          : '',
        concentration: spell?.duration.some((duration) => duration.concentration) ?? false,
        ritual: isRitualSpell(spell),
        material: !!spell?.components?.m,
      }
    })
    .sort((left, right) => {
      const leftLevel = left.level === 'C' ? 0 : Number(left.level || 99)
      const rightLevel = right.level === 'C' ? 0 : Number(right.level || 99)
      return leftLevel - rightLevel || left.name.localeCompare(right.name)
    })
}

function buildHitDiceRows(
  character: Character,
  rawLookups: CharacterSheetLookupSet,
): CharacterSheetHitDieRow[] {
  const entries = getCharacterClassEntries(character)
  return entries.slice(0, 3).map((entry) => {
    const classData = resolveClassReference(entry, rawLookups)
    return {
      level: entry.levels,
      die: classData?.hd?.faces ? `d${classData.hd.faces}` : '',
      used:
        entries.length === 1
          ? Math.min(entry.levels, Math.max(0, character.hitDiceUsed ?? 0))
          : null,
    }
  })
}

function buildClassResourceRows(
  character: Character,
  rawLookups: CharacterSheetLookupSet,
  effectiveAbilityScores: AbilityScores,
): CharacterSheetClassResourceRow[] {
  const stored = character.classResources ?? {}
  const charismaModifier = Math.max(1, getAbilityModifier(effectiveAbilityScores.charisma))
  return getCharacterClassEntries(character).flatMap((entry) => {
    const classData = resolveClassReference(entry, rawLookups)
    const levelIndex = Math.max(0, Math.min(19, entry.levels - 1))
    return getClassResourceDefs(classData, entry.levels).map((definition) => {
      const max =
        definition.maxFormula === 'cha-mod'
          ? charismaModifier
          : (definition.maxPerLevel[levelIndex] ?? 0)
      const current = stored[definition.id] ?? max
      const recovery = getClassResourceRecoveryAtLevel(definition, levelIndex)
      return {
        label: definition.label,
        max,
        used: Math.max(0, max - current),
        recovery: formatClassResourceRecovery(recovery),
      }
    })
  })
}

function buildDefensiveTraits(character: Character): string[] {
  return [
    ...(character.damageResistances ?? []).map((value) => `${value} resistance`),
    ...(character.damageImmunities ?? []).map((value) => `${value} immunity`),
    ...(character.conditionImmunities ?? []).map((value) => `${value} condition immunity`),
  ]
}

function isMagicItem(item: Equipment): boolean {
  return (
    !!item.attuned ||
    !!item.reqAttune ||
    !!item.wondrous ||
    !!item.tattoo ||
    (!!item.rarity && item.rarity.toLowerCase() !== 'none')
  )
}

export function createCharacterSheetViewModel(
  character: Character,
  rawLookups: CharacterSheetLookupSet,
): CharacterSheetViewModel {
  const calculationContext = createCharacterCalculationContext(character, rawLookups)
  const effectiveAbilityScores = calculationContext.abilityScores.total
  const level = getTotalCharacterLevel(character) || 1
  const proficiencyBonus = getProficiencyBonus(level)
  const abilityModifiers = calculationContext.abilityScores.modifiers
  const expertiseSkills = Object.entries(character.skills)
    .filter(([, value]) => value?.expertise)
    .map(([name]) => name.toLowerCase())
  const skillByName = new Map(
    deriveAllSkills(
      abilityModifiers,
      character.proficiencies.skills,
      expertiseSkills,
      proficiencyBonus,
      undefined,
      undefined,
      calculationContext.effects.declarations,
      calculationContext.effects.resolutionContext,
    ).map((skill) => [skill.name, skill] as const),
  )
  const savingThrowByAbility = new Map(
    deriveAllSavingThrows(
      abilityModifiers,
      character.proficiencies.savingThrows,
      proficiencyBonus,
      calculationContext.effects.declarations,
      calculationContext.effects.resolutionContext,
    ).map((save) => [save.ability, save] as const),
  )
  const resolvedClasses = calculationContext.classes
  const raceResolution = calculationContext.raceResolution
  const background = calculationContext.background
  const classesById = new Map(
    resolvedClasses.map((classData) => [
      toClassProfileId(classData.name, classData.source),
      classData,
    ]),
  )
  const actions = deriveWeaponActions(character, {
    abilityModifiers,
    proficiencyBonus,
    itemLookup: rawLookups.itemLookup,
    propertyLookup: rawLookups.itemPropertyByAbbr,
    effects: calculationContext.effects.declarations,
    effectContext: calculationContext.effects.resolutionContext,
  })

  return {
    character,
    level,
    classSummary: getClassSummary(character),
    subclassSummary: getSubclassSummary(character),
    classLevelSummary: getClassLevelSummary(character),
    raceSummary: getRaceSummary(character),
    proficiencyBonus,
    effectiveAbilityScores,
    abilityModifiers,
    skillByName,
    savingThrowByAbility,
    effectiveArmorClass: computeEffectiveCharacterArmorClass(
      character,
      effectiveAbilityScores,
      calculationContext.effects.declarations,
    ),
    maxHP: getEffectiveMaxHP(
      character,
      resolvedClasses,
      effectiveAbilityScores,
      calculationContext.effects.declarations,
    ),
    movement: calculationContext.movement,
    movementSummary: formatEffectiveMovement(calculationContext.movement),
    additionalMovementSummary: getAdditionalMovementSummary(calculationContext.movement),
    walkingSpeed: getWalkingSpeed(calculationContext.movement),
    remainingHitDice: Math.max(0, level - Math.max(0, character.hitDiceUsed ?? 0)),
    hitDiceRows: buildHitDiceRows(character, rawLookups),
    classResourceRows: buildClassResourceRows(character, rawLookups, effectiveAbilityScores),
    weaponRows: buildWeaponRows(actions),
    actions,
    spellRows: buildSpellRows(character, rawLookups.spellsByKey ?? {}),
    magicItems: character.equipment.filter(isMagicItem),
    resolvedClasses,
    mergedRace: raceResolution.mergedRace,
    background,
    spellcastingDetails: buildSpellcastingClassDetails(
      character,
      classesById,
      effectiveAbilityScores,
      calculationContext.effects.declarations,
      calculationContext.effects.resolutionContext,
    ),
    visionSummary: buildVisionSummary(character, raceResolution.mergedRace),
    racialTraitsSummary: buildRacialTraitsSummary(character, raceResolution.mergedRace),
    backgroundFeature: getBackgroundFeature(character, background),
    classFeaturesSummary2014: buildClassFeaturesSummary(character),
    featuresSummary: buildFeaturesSummary(character),
    equipmentSummary: character.equipment
      .map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
      .join('\n'),
    proficienciesSummary: buildProficienciesSummary(character),
    languagesSummary: character.proficiencies.languages.join(', '),
    featsSummary: character.feats
      .map((feat) => {
        const body = feat.description?.trim()
        return body ? `${feat.name}: ${body}` : feat.name
      })
      .join('\n\n'),
    customOrganizationSummary: [
      character.details.organizationCustomName,
      character.details.organizationCustomDescription,
    ]
      .filter((part) => !!part && part.trim().length > 0)
      .join('\n'),
    carriedWeight: character.equipment
      .reduce((sum, item) => sum + (item.weight ?? 0) * (item.quantity ?? 1), 0)
      .toFixed(1),
    sizeSummary: raceResolution.mergedRace?.size?.[0] ?? '',
    appearanceSummary: buildAppearanceSummary(character),
    historyAndPersonalitySummary: buildHistoryAndPersonalitySummary(character),
    alliesAndOrganizationsSummary: buildAlliesAndOrganizationsSummary(character),
    organizationDetailsSummary: buildOrganizationDetailsSummary(character),
    organizationImage: resolveOrganizationImage(character, rawLookups.organizations ?? []),
    defensiveTraits: buildDefensiveTraits(character),
  }
}

export function formatViewModelModifier(value: number): string {
  return formatModifier(value)
}

export function usesCustomOrganization(viewModel: CharacterSheetViewModel): boolean {
  return viewModel.character.details.organizationSelectionKey === CUSTOM_ORGANIZATION_KEY
}
