import {
  type EntityLookupSet,
  type ResolvedRaceReference,
  resolveBackgroundReference,
  resolveClassReference,
  resolveFeatReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import type { Background5e, Class5e, Feat5e, Race5e } from '@/types/5etools'
import type { AbilityName, AbilityScores, Character, Equipment } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import {
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  getBackgroundAbilityData,
  getRaceAbilityData,
  makeDefaultAbilityScores,
  type RaceAbilityData,
} from './abilityScores'
import {
  deriveStructuredFeatEffects,
  deriveStructuredItemEffects,
  deriveStructuredRaceEffects,
  getCharacterEffectResolutionContext,
  getCharacterEffects,
} from './characterEffects'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'
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

interface CharacterEquipmentCalculationState {
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
  feats: readonly Feat5e[]
  abilityScores: EffectiveAbilityScoreData
  initiativeModifier: number
  senses: readonly EffectiveSense[]
  equipment: CharacterEquipmentCalculationState
  movement: EffectiveMovement
  effects: {
    sourceDeclarations: readonly CharacterEffect[]
    declarations: readonly CharacterEffect[]
    resolutionContext: EffectResolutionContext
  }
}

interface EffectiveSense {
  type: string
  range?: number
}

function deriveEffectiveSenses(
  character: Character,
  effects: readonly CharacterEffect[],
  context: EffectResolutionContext,
): EffectiveSense[] {
  const senses = new Map<string, EffectiveSense>()
  const storedSenseKeys = new Set<string>()
  for (const vision of character.visions ?? []) {
    const key = vision.type.trim().toLowerCase()
    if (key) {
      senses.set(key, { ...vision })
      storedSenseKeys.add(key)
    }
  }
  for (const effect of effects) {
    if (effect.target.kind !== 'sense') continue
    const key = effect.target.sense.trim().toLowerCase()
    if (key && !senses.has(key)) senses.set(key, { type: effect.target.sense })
  }

  return [...senses.entries()].flatMap(([key, sense]) => {
    const resolved = resolveNumericEffect(
      sense.range ?? 0,
      { kind: 'sense', sense: key },
      effects,
      context,
    )
    if (resolved.steps.length === 0 && sense.range === undefined) {
      return storedSenseKeys.has(key) ? [sense] : []
    }
    const range = Math.max(0, Math.trunc(resolved.value))
    return range > 0 ? [{ ...sense, range }] : []
  })
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
  sourceEffects: readonly CharacterEffect[] = [],
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

  if (character) {
    const effects = getCharacterEffects(character, getTotalCharacterLevel(character), sourceEffects)
    const effectContext = getCharacterEffectResolutionContext(character)
    for (const ability of Object.keys(total) as AbilityName[]) {
      total[ability] = Math.max(
        1,
        Math.min(
          CORE_RULES_METADATA[character.originSystem].abilityScoreAbsoluteMaximum,
          Math.trunc(
            resolveNumericEffect(
              total[ability],
              { kind: 'ability-score', ability },
              effects,
              effectContext,
            ).value,
          ),
        ),
      )
    }
  }

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
  const selectedFeats = [
    ...(character.feats ?? []),
    ...(character.specialFeats ?? []),
    ...(character.classFeatChoices ?? []).flatMap((choice) => choice.feats),
  ]
  const resolvedFeats = selectedFeats.flatMap((feat) => {
    const resolved = resolveFeatReference(feat, primaryLookups, rawLookups)
    return resolved ? [resolved] : []
  })
  const effectResolutionContext = getCharacterEffectResolutionContext(character)
  const sourceEffects = [
    ...deriveStructuredRaceEffects(raceResolution.mergedRace),
    ...deriveStructuredFeatEffects(resolvedFeats),
    ...deriveStructuredItemEffects(allEquipment, primaryLookups.itemLookup, rawLookups.itemLookup),
  ]
  const effects = getCharacterEffects(character, getTotalCharacterLevel(character), sourceEffects)
  const abilityScores = deriveEffectiveAbilityScores(
    character,
    raceResolution.parentRace,
    raceResolution.subraceData,
    background,
    sourceEffects,
  )

  return {
    character,
    rules: {
      originSystem: character.originSystem,
      ...CORE_RULES_METADATA[character.originSystem],
    },
    raceResolution,
    background,
    classes,
    feats: resolvedFeats,
    abilityScores,
    initiativeModifier: Math.trunc(
      resolveNumericEffect(
        abilityScores.modifiers.dexterity,
        { kind: 'initiative' },
        effects,
        effectResolutionContext,
      ).value,
    ),
    senses: deriveEffectiveSenses(character, effects, effectResolutionContext),
    equipment: {
      all: allEquipment,
      equipped: allEquipment.filter((item) => item.equipped),
      attuned: allEquipment.filter((item) => item.attuned),
    },
    movement: getEffectiveCharacterMovement(character, sourceEffects),
    effects: {
      sourceDeclarations: sourceEffects,
      declarations: effects,
      resolutionContext: effectResolutionContext,
    },
  }
}
