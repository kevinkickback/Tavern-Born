import {
  type EntityLookupSet,
  type ResolvedRaceReference,
  resolveBackgroundReference,
  resolveClassReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'
import type { AbilityName, AbilityScores, Character, Equipment } from '@/types/character'
import {
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  getBackgroundAbilityData,
  getRaceAbilityData,
  makeDefaultAbilityScores,
  type RaceAbilityData,
} from './abilityScores'
import { getAbilityModifier } from './gameRules'
import { type EffectiveMovement, getEffectiveCharacterMovement } from './movement'
import {
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from './originSystem'

type CoreRulesMetadata = (typeof CORE_RULES_METADATA)[keyof typeof CORE_RULES_METADATA] & {
  originSystem: Character['originSystem']
}

export interface EffectiveAbilityScoreData {
  base: AbilityScores
  total: AbilityScores
  modifiers: Record<AbilityName, number>
  normalizedRaceSelection: ReturnType<typeof normalizeRaceSelectionForOriginSystem>
  raceAsiData: RaceAbilityData
  hasDataDrivenRacialBonuses: boolean
  racialBonuses: Partial<Record<AbilityName, number>>
  normalizedBackground: Background5e | undefined
  backgroundAbilityData: BackgroundAbilityData
  backgroundBonuses: Partial<Record<AbilityName, number>>
  asiBonuses: Partial<Record<AbilityName, number>>
}

export interface CharacterEquipmentCalculationState {
  all: readonly Equipment[]
  equipped: readonly Equipment[]
  attuned: readonly Equipment[]
}

export interface CharacterCalculationContext {
  character: Character
  rules: CoreRulesMetadata
  raceResolution: ResolvedRaceReference
  background: Background5e | undefined
  classes: readonly Class5e[]
  abilityScores: EffectiveAbilityScoreData
  equipment: CharacterEquipmentCalculationState
  movement: EffectiveMovement
}

function getProvenanceRacialBonuses(
  character: Character | null | undefined,
): Partial<Record<AbilityName, number>> {
  const bonuses: Partial<Record<AbilityName, number>> = {}
  for (const record of character?.provenance?.abilityBonuses ?? []) {
    const { sourceType, sourceName, sourceRef } = record.sourceTag
    const isCurrentRace =
      sourceType === 'race' &&
      sourceName === character?.race &&
      (sourceRef ?? '') === (character?.raceSource ?? '')
    const isCurrentSubrace =
      sourceType === 'subrace' &&
      sourceName === (character?.subrace ?? '') &&
      (sourceRef ?? '') === (character?.subraceSource ?? '')
    if (!isCurrentRace && !isCurrentSubrace) continue
    const ability = record.ability as AbilityName
    bonuses[ability] = (bonuses[ability] ?? 0) + record.value
  }
  return bonuses
}

function addBonuses(scores: AbilityScores, bonuses: Partial<Record<AbilityName, number>>): void {
  for (const [ability, bonus] of Object.entries(bonuses)) {
    scores[ability as AbilityName] = (scores[ability as AbilityName] ?? 0) + (bonus ?? 0)
  }
}

export function deriveEffectiveAbilityScores(
  character: Character | null | undefined,
  race?: Race5e,
  subrace?: Race5e,
  background?: Background5e,
): EffectiveAbilityScoreData {
  const base = character ? { ...character.abilityScores } : makeDefaultAbilityScores(8)
  const normalizedRaceSelection = normalizeRaceSelectionForOriginSystem(
    race,
    subrace,
    character?.originSystem ?? '2014',
  )
  const raceAsiData = getRaceAbilityData(
    normalizedRaceSelection.race,
    normalizedRaceSelection.subrace,
    (character?.raceAsiBlockIndex ?? 0) as 0 | 1,
  )
  const hasDataDrivenRacialBonuses = raceAsiData.fixed.length > 0 || raceAsiData.choices.length > 0
  const racialBonuses = hasDataDrivenRacialBonuses
    ? buildRacialBonuses(raceAsiData, character?.raceAsiChoices ?? [])
    : getProvenanceRacialBonuses(character)

  const normalizedBackground = normalizeBackgroundForOriginSystem(
    background,
    character?.originSystem ?? '2014',
  )
  const backgroundAbilityData = getBackgroundAbilityData(normalizedBackground)
  const backgroundBonuses = buildBackgroundBonuses(
    backgroundAbilityData,
    character?.backgroundAsiBlockIndex ?? 0,
    character?.backgroundAsiChoices ?? [],
  )
  const asiBonuses: Partial<Record<AbilityName, number>> = {}
  for (const choice of character?.asiChoices ?? []) {
    for (const [abilityName, amount] of Object.entries(choice.abilityChanges)) {
      const ability = abilityName as AbilityName
      asiBonuses[ability] = (asiBonuses[ability] ?? 0) + amount
    }
  }

  const total = { ...base }
  addBonuses(total, racialBonuses)
  addBonuses(total, backgroundBonuses)
  addBonuses(total, asiBonuses)

  return {
    base,
    total,
    modifiers: Object.fromEntries(
      Object.entries(total).map(([ability, score]) => [ability, getAbilityModifier(score)]),
    ) as Record<AbilityName, number>,
    normalizedRaceSelection,
    raceAsiData,
    hasDataDrivenRacialBonuses,
    racialBonuses,
    normalizedBackground,
    backgroundAbilityData,
    backgroundBonuses,
    asiBonuses,
  }
}

export function createCharacterCalculationContext(
  character: Character,
  primaryLookups: EntityLookupSet,
  rawLookups: EntityLookupSet = primaryLookups,
): CharacterCalculationContext {
  const raceResolution = resolveRaceReference(
    {
      name: character.race,
      source: character.raceSource,
      subraceName: character.subrace,
      subraceSource: character.subraceSource,
    },
    primaryLookups,
    rawLookups,
  )
  const background = resolveBackgroundReference(
    { name: character.background, source: character.backgroundSource },
    primaryLookups,
    rawLookups,
  )
  const classes = getCharacterClassEntries(character).flatMap((entry) => {
    const resolved = resolveClassReference(entry, primaryLookups, rawLookups)
    return resolved ? [resolved] : []
  })
  const allEquipment = character.equipment ?? []

  return {
    character,
    rules: {
      originSystem: character.originSystem,
      ...CORE_RULES_METADATA[character.originSystem],
    },
    raceResolution,
    background,
    classes,
    abilityScores: deriveEffectiveAbilityScores(
      character,
      raceResolution.parentRace,
      raceResolution.subraceData,
      background,
    ),
    equipment: {
      all: allEquipment,
      equipped: allEquipment.filter((item) => item.equipped),
      attuned: allEquipment.filter((item) => item.attuned),
    },
    movement: getEffectiveCharacterMovement(character),
  }
}
