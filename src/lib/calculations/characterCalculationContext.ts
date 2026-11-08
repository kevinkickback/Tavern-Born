import {
  BEAR_ASPECT_TARGET,
  CLASSIC_ASPECT_TARGET,
  getCurrentBarbarianJourneyFeature,
  hasCurrentBearAspect,
} from '@/lib/5etools/barbarianJourneySources'
import {
  getSavedBarbarianPathOption,
  WILD_HEART_ASPECT,
} from '@/lib/5etools/barbarianPathChoiceIdentity'
import { getCurrentWildHeartAspects } from '@/lib/5etools/barbarianPathChoices'
import { hasCurrentBardDanceDefense } from '@/lib/5etools/bardCollegeFeatures'
import { getCurrentBardJackOfAllTrades } from '@/lib/5etools/bardSpellSources'
import { CLASS_ORDERS } from '@/lib/5etools/classOrderIdentity'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getEarnedDraconicResilience } from '@/lib/5etools/draconicResilience'
import {
  type EntityLookupSet,
  type ResolvedRaceReference,
  resolveBackgroundReference,
  resolveClassReference,
  resolveFeatReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import {
  getCurrentMonkBaseRules,
  getMonkAbilityIncrease,
  getMonkUnarmoredDefense,
  getMonkUnarmoredMovement,
} from '@/lib/5etools/monkBaseRules'
import { deriveMonkSubclassSenses } from '@/lib/5etools/monkSubclassRules'
import { deriveRevisedAffinityEffects } from '@/lib/5etools/revisedElementalAffinity'
import { getScionResistance } from '@/lib/5etools/rogueScion'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import {
  type AtWillInvocationSpellStatus,
  getAtWillInvocationSpellStatuses,
} from '@/lib/character/atWillInvocationSpells'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  getClassChoiceDeclaration,
  getClassChoiceFeatureTarget,
  getFeatureOwnerKey,
} from '@/lib/character/classChoiceIdentity'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { getCurrentClassOrder } from '@/lib/character/classOrder'
import {
  getEffectiveOwnerProficiencyChoices,
  getOwnedSubclassSkillModifiers,
} from '@/lib/character/classProficiencyAuthority'
import {
  getStartingSkillChoiceLedger,
  resolveClassProficiencyState,
} from '@/lib/character/classProficiencySelections'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { retractFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import type { DailyClassSpellStatus } from '@/lib/character/dailyClassSpells'
import {
  type ClassChoicePrerequisiteContext,
  getEffectiveClassChoiceFeatureRoutes,
  projectEffectiveClassChoiceFeatures,
} from '@/lib/character/effectiveClassChoiceFeatures'
import {
  type EpicBoonSlot,
  getEpicBoonSlots,
  isEpicBoonIncreaseWithinCap,
  projectEpicBoonSlots,
  withoutEpicBoonSelection,
} from '@/lib/character/epicBoonSlots'
import { getFighterStylePair } from '@/lib/character/fighterStyleChoices'
import {
  applySpellbookSpecialtyPreparation,
  type ManagedClassSpellContext,
  type ManagedClassSpellStatus,
  projectManagedClassSpellState,
} from '@/lib/character/managedClassSpells'
import type { ClassFixedSpellStatus } from '@/lib/character/optionalClassFixedSpells'
import { refreshRaceAbilityState } from '@/lib/character/raceAbilityState'
import {
  deriveRacialDefenseEffects,
  refreshRacialDefenseState,
} from '@/lib/character/racialDefenseState'
import { refreshSpecialSpellKinds } from '@/lib/character/specialSpellState'
import {
  deriveStormAuraEffects,
  getStormAuraSelectionStates,
} from '@/lib/character/stormAuraSelections'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { getSelectedRaceAbilityChoices, isSelectedRaceOwner } from '@/lib/provenance/raceOwnership'
import type { Background5e, Class5e, Feat5e, Race5e } from '@/types/5etools'
import type { AbilityName, AbilityScores, Character, Equipment } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'
import {
  ABILITY_NAMES,
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  getBackgroundAbilityData,
  getRaceAbilityData,
  makeDefaultAbilityScores,
  normalizeAbilityName,
  type RaceAbilityData,
} from './abilityScores'
import {
  deriveStructuredFeatEffects,
  deriveStructuredItemEffects,
  deriveStructuredRaceEffects,
  getCharacterEffectResolutionContext,
  getCharacterEffects,
} from './characterEffects'
import { deriveCurrentClassCasting } from './currentClassCasting'
import { type EffectResolutionContext, resolveNumericEffect } from './effects'
import { deriveFighterPassiveEffects } from './fighterPassiveEffects'
import { getAbilityModifier, getProficiencyBonus } from './gameRules'
import { getArmorEquipmentSlots, getNormalizedItemTraits } from './itemClassification'
import { type EffectiveMovement, getEffectiveCharacterMovement, getWalkingSpeed } from './movement'
import { refreshNativeRacialSpellState } from './nativeRacialSpells'
import {
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from './originSystem'
import { deriveRangerPassiveEffects } from './rangerPassiveEffects'
import { deriveRoguePassiveEffects } from './roguePassiveEffects'
import { ALL_SKILLS } from './skills'

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
  featBonuses: Partial<Record<AbilityName, number>>
}

interface CharacterEquipmentCalculationState {
  all: readonly Equipment[]
  equipped: readonly Equipment[]
  attuned: readonly Equipment[]
}

export interface CharacterCalculationContext {
  character: Character
  lookups: {
    primary: EntityLookupSet
    raw: EntityLookupSet
    /** Readiness requires an explicitly supplied raw item map to establish absence. */
    rawItemsAuthoritative: boolean
  }
  rules: CoreRulesMetadata
  raceResolution: ResolvedRaceReference
  background: Background5e | undefined
  classes: readonly Class5e[]
  classChoices: {
    classes: readonly Class5e[]
    epicBoonSlots: readonly EpicBoonSlot[]
    catalogs?: ClassChoiceFeatureCatalogs
    feats?: readonly Feat5e[]
    spellContext?: ManagedClassSpellContext
    prerequisites: ClassChoicePrerequisiteContext
  }
  feats: readonly Feat5e[]
  abilityScores: EffectiveAbilityScoreData
  managedClassSpellStatuses: readonly ManagedClassSpellStatus[]
  dailyClassSpellStatuses: readonly DailyClassSpellStatus[]
  fixedClassSpellStatuses: readonly ClassFixedSpellStatus[]
  atWillInvocationSpellStatuses: readonly AtWillInvocationSpellStatus[]
  classCasting: ReturnType<typeof deriveCurrentClassCasting>
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
  if (!character?.race || character.originSystem === '2024') return {}
  const fixed = (character.provenance?.abilityBonuses ?? []).flatMap((record) => {
    const ability = normalizeAbilityName(record.ability)
    return ability && isSelectedRaceOwner(record.sourceTag, character)
      ? [{ ability, value: record.value }]
      : []
  })
  const records = character.provenance
    ? getSelectedRaceAbilityChoices(character.provenance, character)
    : []
  return buildRacialBonuses(
    {
      fixed,
      choices: records.map((record) => ({
        amount: record.amount,
        count: record.chooseCount,
        from:
          record.optionPool.length === 0
            ? [...ABILITY_NAMES]
            : record.optionPool
                .map(normalizeAbilityName)
                .filter((ability): ability is AbilityName => ability !== null),
      })),
    },
    records.map((record) => record.selected),
  )
}

function addBonuses(scores: AbilityScores, bonuses: Partial<Record<AbilityName, number>>): void {
  for (const [ability, bonus] of Object.entries(bonuses)) {
    scores[ability as AbilityName] = (scores[ability as AbilityName] ?? 0) + (bonus ?? 0)
  }
}

export function getIntrinsicAbilityScores({
  base,
  racialBonuses,
  backgroundBonuses,
  asiBonuses,
  featBonuses,
}: Pick<
  EffectiveAbilityScoreData,
  'base' | 'racialBonuses' | 'backgroundBonuses' | 'asiBonuses' | 'featBonuses'
>): AbilityScores {
  const scores = { ...base }
  addBonuses(scores, racialBonuses)
  addBonuses(scores, backgroundBonuses)
  addBonuses(scores, asiBonuses)
  addBonuses(scores, featBonuses)
  return scores
}

function getProvenanceFeatBonuses(
  character: Character | null | undefined,
): Partial<Record<AbilityName, number>> {
  const bonuses: Partial<Record<AbilityName, number>> = {}
  for (const record of character?.provenance?.abilityBonuses ?? []) {
    if (record.sourceTag.sourceType !== 'feat') continue
    const ability = record.ability as AbilityName
    bonuses[ability] = (bonuses[ability] ?? 0) + record.value
  }
  return bonuses
}

export function deriveEffectiveAbilityScores(
  character: Character | null | undefined,
  race?: Race5e,
  subrace?: Race5e,
  background?: Background5e,
  sourceEffects: readonly CharacterEffect[] = [],
  intrinsicIncreases: readonly {
    abilities: readonly AbilityName[]
    amount: number
    maximum: number
  }[] = [],
): EffectiveAbilityScoreData {
  if (character) character = refreshRaceAbilityState(character, race, subrace)
  const base = character ? { ...character.abilityScores } : makeDefaultAbilityScores(8)
  const normalizedRaceSelection = normalizeRaceSelectionForOriginSystem(
    race,
    subrace,
    character?.originSystem ?? '2014',
  )
  const hasResolvedRaceSelection = Boolean(race) && (!character?.subrace || Boolean(subrace))
  const raceAsiData = hasResolvedRaceSelection
    ? getRaceAbilityData(
        normalizedRaceSelection.race,
        normalizedRaceSelection.subrace,
        (character?.raceAsiBlockIndex ?? 0) as 0 | 1,
      )
    : { fixed: [], choices: [] }
  const hasDataDrivenRacialBonuses = raceAsiData.fixed.length > 0 || raceAsiData.choices.length > 0
  const racialBonuses = hasResolvedRaceSelection
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
  const featBonuses = getProvenanceFeatBonuses(character)

  const total = getIntrinsicAbilityScores({
    base,
    racialBonuses,
    backgroundBonuses,
    asiBonuses,
    featBonuses,
  })
  // Earned capstones change intrinsic scores. Item effects still resolve afterwards.
  for (const increase of intrinsicIncreases) {
    for (const ability of increase.abilities) {
      const score = total[ability]
      total[ability] = Math.max(score, Math.min(increase.maximum, score + increase.amount))
    }
  }

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
    featBonuses,
  }
}

export function createCharacterCalculationContext(
  character: Character,
  primaryLookups: EntityLookupSet,
  rawLookups?: EntityLookupSet,
): CharacterCalculationContext {
  const rawItemsAuthoritative = rawLookups?.itemLookup !== undefined
  rawLookups ??= primaryLookups
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
  character = refreshRaceAbilityState(
    character,
    raceResolution.parentRace,
    raceResolution.subraceData,
  )
  character = refreshRacialDefenseState(
    character,
    raceResolution.parentRace,
    raceResolution.subraceData,
  )
  character = refreshSpecialSpellKinds(
    character,
    primaryLookups.spellsByKey,
    rawLookups.spellsByKey,
  )
  character = refreshNativeRacialSpellState(character, raceResolution, {
    spellsByKey: primaryLookups.spellsByKey,
    rawSpellsByKey: rawLookups.spellsByKey,
  })
  const managedSpellContext = {
    catalogs: primaryLookups.classChoiceFeatureCatalogs,
    spellsByKey: primaryLookups.spellsByKey,
    oathSpellSourceByKey: rawLookups.spellsByKey,
    currentRaceResolution: resolveRaceReference(
      {
        name: character.race,
        source: character.raceSource,
        subraceName: character.subrace,
        subraceSource: character.subraceSource,
      },
      primaryLookups,
      primaryLookups,
    ),
  }
  let epicBoonSlots = getEpicBoonSlots(
    character,
    primaryLookups.classChoiceFeatureCatalogs,
    primaryLookups.featExpertiseFeats ??
      primaryLookups.classChoiceFeatureCatalogs?.featExpertiseFeats ??
      Object.values(primaryLookups.featsByKey ?? {}),
    rawLookups.classesByKey,
  )
  character = projectEpicBoonSlots(character, epicBoonSlots)
  const dailyIntentSource = character
  const initialManagedSpells = projectManagedClassSpellState(character, managedSpellContext)
  character = initialManagedSpells.character
  const savedClassFeats = character.classFeatChoices
  character = projectEffectiveClassChoiceFeatures(
    character,
    primaryLookups.classChoiceFeatureCatalogs,
    { knownWarlockCantrips: initialManagedSpells.knownWarlockCantrips },
  )
  if (character.classFeatChoices !== savedClassFeats) {
    for (const saved of savedClassFeats ?? []) {
      if (!getFighterStylePair(saved.id)) continue
      const active = character.classFeatChoices?.find((choice) => choice.id === saved.id)
      for (const feat of saved.feats) {
        if (
          !feat.options ||
          active?.feats.some((row) => getFeatSelectionKey(row) === getFeatSelectionKey(feat))
        )
          continue
        character = applyCharacterCommandResult(
          character,
          retractFeatOptionsCommand(
            { ...character, classFeatChoices: savedClassFeats },
            character.provenance,
            { ...feat, classFeatChoiceId: saved.id },
            feat.options,
          ),
        )
      }
    }
  }
  const proficiencyClasses =
    primaryLookups.classChoiceClasses ?? Object.values(primaryLookups.classesByKey ?? {})
  const startingSkillLedger = getStartingSkillChoiceLedger(
    character,
    character.provenance,
    proficiencyClasses,
  )
  if (startingSkillLedger !== character.provenance)
    character = { ...character, provenance: startingSkillLedger }
  const proficiencyState = resolveClassProficiencyState(character, {
    ...(primaryLookups.classChoiceFeatureCatalogs ?? { classFeatures: [], subclassFeatures: [] }),
    featExpertiseFeats:
      primaryLookups.featExpertiseFeats ?? Object.values(primaryLookups.featsByKey ?? {}),
  })
  character = proficiencyState.character
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
  const choiceClasses =
    primaryLookups.classChoiceClasses ?? Object.values(primaryLookups.classesByKey ?? {})
  const choiceCatalogs = primaryLookups.classChoiceFeatureCatalogs
  const effectResolutionContext = getCharacterEffectResolutionContext(character)
  const baseSourceEffects = [
    ...deriveStructuredRaceEffects(raceResolution.mergedRace),
    ...deriveRacialDefenseEffects(character.racialDefenses),
    ...deriveStructuredFeatEffects(resolvedFeats),
    ...deriveRevisedAffinityEffects(character, choiceCatalogs),
    ...deriveStormAuraEffects(
      getStormAuraSelectionStates(character, choiceClasses, choiceCatalogs),
    ),
    ...deriveStructuredItemEffects(allEquipment, primaryLookups.itemLookup, rawLookups.itemLookup),
  ]
  // Old generic ASI saves could persist +2 from 19. Check the same capped
  // allocation against the actor without that slot before using its benefits.
  for (const slot of epicBoonSlots) {
    if (!slot.asi) continue
    const withoutAsi = withoutEpicBoonSelection(character, slot.owner)
    const before = getIntrinsicAbilityScores(
      deriveEffectiveAbilityScores(
        withoutAsi,
        raceResolution.parentRace,
        raceResolution.subraceData,
        background,
        baseSourceEffects,
      ),
    )
    if (isEpicBoonIncreaseWithinCap(slot.asi.abilityChanges, before)) continue
    character = withoutAsi
    epicBoonSlots = epicBoonSlots.map((row) =>
      row === slot ? { ...row, state: 'unavailable', asi: undefined } : row,
    )
  }
  const champion = getCurrentBarbarianJourneyFeature(character, choiceCatalogs, 'primal champion')
  const monk = getCurrentMonkBaseRules(character, choiceCatalogs)
  const monkIncrease = getMonkAbilityIncrease(monk)
  const abilityScores = deriveEffectiveAbilityScores(
    character,
    raceResolution.parentRace,
    raceResolution.subraceData,
    background,
    baseSourceEffects,
    [
      ...(champion
        ? [
            {
              abilities: ['strength', 'constitution'] as const,
              amount: 4,
              maximum: champion.source === 'phb' ? 24 : 25,
            },
          ]
        : []),
      ...(monkIncrease ? [monkIncrease] : []),
    ],
  )
  const managedSpells = projectManagedClassSpellState(
    character,
    {
      ...managedSpellContext,
      abilityScores: abilityScores.total,
    },
    dailyIntentSource,
  )
  const prerequisites = {
    effectiveAbilityScores: abilityScores.total,
    effectiveSpellProfiles: managedSpells.independentSpellProfiles,
    knownWarlockCantrips: managedSpells.knownWarlockCantrips,
  }
  const classChoices = {
    classes: choiceClasses,
    epicBoonSlots,
    catalogs: choiceCatalogs,
    feats: primaryLookups.featExpertiseFeats,
    prerequisites,
    spellContext: {
      ...managedSpellContext,
      abilityScores: abilityScores.total,
      independentSpellProfiles: managedSpells.independentSpellProfiles,
    },
  }
  const currentSpells = applySpellbookSpecialtyPreparation(
    managedSpells.character,
    managedSpells.statuses,
  )
  const atWillInvocationSpellStatuses = getAtWillInvocationSpellStatuses(
    currentSpells,
    choiceCatalogs,
    prerequisites,
    primaryLookups.spellsByKey,
  )
  character = projectEffectiveClassChoiceFeatures(currentSpells, choiceCatalogs, prerequisites)
  // Skill modifiers and explanatory notes do not feed back into ability or prerequisite calculations.
  const orderSkillEffects = CLASS_ORDERS.flatMap((order): CharacterEffect[] => {
    const current = getCurrentClassOrder(character, order, choiceCatalogs)
    if (current?.branch !== 'caster') return []
    const label = order.caster.name
    return order.caster.skills.map((skill) => ({
      id: `${order.id}:${label.toLowerCase()}:${skill}`,
      label,
      source: { kind: 'class', name: label, source: 'XPHB', provenance: { choiceId: order.id } },
      target: { kind: 'skill-modifier', skill, ability: 'intelligence' },
      operation: { kind: 'add', value: Math.max(1, abilityScores.modifiers.wisdom) },
    }))
  })
  const fighterEffects = deriveFighterPassiveEffects(character, choiceCatalogs?.classes)
  const fighterHalfProficiencySkills = new Set(
    fighterEffects.flatMap(({ target, operation }) =>
      target.kind === 'skill-modifier' && operation.kind === 'add' ? [target.skill] : [],
    ),
  )
  const sourceEffects = [
    ...baseSourceEffects,
    ...deriveDraconicResilienceEffects(character, choiceCatalogs, abilityScores.modifiers),
    ...getOwnedSubclassSkillModifiers(character, abilityScores.modifiers, proficiencyState.fixed),
    ...deriveGeniesSplendorEffects(character, choiceCatalogs, abilityScores.modifiers),
    ...deriveBardDanceEffects(character, choiceCatalogs, abilityScores.modifiers),
    ...deriveBardJackOfAllTradesEffects(character, choiceCatalogs).filter(
      ({ target }) =>
        target.kind !== 'skill-modifier' || !fighterHalfProficiencySkills.has(target.skill),
    ),
    ...fighterEffects,
    ...getScionResistance(character, choiceCatalogs?.classes),
    ...deriveMonkUnarmoredEffects(character, choiceCatalogs, monk, abilityScores.modifiers),
    ...deriveMonkSubclassSenses(character, choiceCatalogs?.classes),
    ...deriveBarbarianPassiveEffects(
      character,
      choiceCatalogs,
      abilityScores.modifiers,
      prerequisites,
    ),
    ...orderSkillEffects,
    ...deriveConditionalProficiencyNotes(
      character,
      choiceCatalogs,
      abilityScores.total,
      character.spells.spellProfiles,
      prerequisites,
    ),
  ]
  sourceEffects.push(
    ...deriveRangerPassiveEffects(
      character,
      choiceCatalogs,
      abilityScores.modifiers.wisdom,
      sourceEffects,
    ),
  )
  const wildHeart = deriveWildHeartAspectEffect(character, choiceCatalogs, sourceEffects)
  if (wildHeart) sourceEffects.push(wildHeart)
  sourceEffects.push(
    ...deriveRoguePassiveEffects(
      character,
      choiceCatalogs?.classes,
      abilityScores.modifiers.charisma,
      sourceEffects,
    ),
  )
  const effects = getCharacterEffects(character, getTotalCharacterLevel(character), sourceEffects)

  return {
    character,
    lookups: { primary: primaryLookups, raw: rawLookups, rawItemsAuthoritative },
    rules: {
      originSystem: character.originSystem,
      ...CORE_RULES_METADATA[character.originSystem],
    },
    raceResolution,
    background,
    classes,
    classChoices,
    feats: resolvedFeats,
    abilityScores,
    managedClassSpellStatuses: managedSpells.statuses,
    dailyClassSpellStatuses: managedSpells.dailyStatuses,
    fixedClassSpellStatuses: managedSpells.fixedClassSpellStatuses,
    atWillInvocationSpellStatuses,
    classCasting: deriveCurrentClassCasting(
      character,
      choiceCatalogs,
      abilityScores.total,
      effects,
      effectResolutionContext,
      dailyIntentSource,
    ),
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

function deriveDraconicResilienceEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  { dexterity, charisma }: AbilityScores,
): CharacterEffect[] {
  const resilience = getEarnedDraconicResilience(character, catalogs)
  if (!resilience) return []
  const { name, source, target, levels, revised } = resilience
  const origin = { kind: 'subclass' as const, name, source, entityId: target }
  const effects: CharacterEffect[] = [
    {
      id: `${target}:hp`,
      label: name,
      source: origin,
      target: { kind: 'hit-point-maximum' },
      operation: { kind: 'add', value: levels },
    },
  ]
  const ac = unarmoredBaseEffect(
    character.equipment,
    target,
    origin,
    dexterity + (revised ? 10 + charisma : 13),
  )
  if (ac) effects.push(ac)
  return effects
}

const GENIES_SPLENDOR_TARGET =
  "subclass-feature|genie's splendor|paladin|xphb|noble genies|frhof|3|frhof"

function deriveGeniesSplendorEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  { dexterity, charisma }: AbilityScores,
): CharacterEffect[] {
  const owners = character.classProgression.filter(
    (entry) => entry.name.toLowerCase() === 'paladin' && entry.source.toLowerCase() === 'xphb',
  )
  const owner = owners[0]
  if (
    owners.length !== 1 ||
    owner.levels < 3 ||
    owner.subclass?.toLowerCase() !== 'oath of the noble genies' ||
    owner.subclassSource?.toLowerCase() !== 'frhof'
  )
    return []
  const benefit = getEffectiveOwnerProficiencyChoices(character, owner, catalogs).find(
    (choice) => decodeClassProficiencyChoiceId(choice.id)?.target === GENIES_SPLENDOR_TARGET,
  )
  if (!benefit) return []
  const effect = unarmoredBaseEffect(
    character.equipment,
    GENIES_SPLENDOR_TARGET,
    {
      kind: 'subclass',
      name: benefit.owner.featureName ?? "Genie's Splendor",
      source: benefit.owner.featureSource ?? 'FRHoF',
      entityId: GENIES_SPLENDOR_TARGET,
    },
    10 + dexterity + charisma,
  )
  return effect ? [effect] : []
}

function deriveBardJackOfAllTradesEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): CharacterEffect[] {
  if (!catalogs) return []
  const bards = character.classProgression.filter(
    (row) => normalizeOwnerIdentity(row.name) === 'bard',
  )
  if (bards.length !== 1 || bards[0].levels < 2) return []
  const classes = catalogs.classes?.filter((row) => findClassReference(bards[0], [row]))
  if (classes?.length !== 1) return []
  const feature = getCurrentBardJackOfAllTrades(classes[0], catalogs)
  if (!feature) return []
  const proficient = new Set(character.proficiencies.skills.map(normalizeOwnerIdentity))
  const value = Math.floor(getProficiencyBonus(getTotalCharacterLevel(character)) / 2)
  return ALL_SKILLS.filter((skill) => !proficient.has(skill)).map((skill) => ({
    id: `bard:${feature.source}:jack-of-all-trades:${skill}`,
    label: feature.name,
    source: { kind: 'class', name: feature.name, source: feature.source },
    target: { kind: 'skill-modifier', skill },
    operation: { kind: 'add', value },
  }))
}

function deriveBardDanceEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  { dexterity, charisma }: AbilityScores,
): CharacterEffect[] {
  const printing = { name: 'Bard', source: 'XPHB' }
  const owners = character.classProgression.filter((row) => findClassReference(printing, [row]))
  const classes = catalogs?.classes?.filter((row) => findClassReference(printing, [row]))
  const owner = owners[0]
  if (
    owners.length !== 1 ||
    owner.levels < 3 ||
    normalizeOwnerIdentity(owner.subclass) !== 'college of dance' ||
    normalizeOwnerIdentity(owner.subclassSource) !== 'xphb' ||
    classes?.length !== 1
  )
    return []
  const cls = classes[0]
  const colleges = cls.subclasses?.filter((row) =>
    findClassReference({ name: owner.subclass, source: owner.subclassSource }, [row]),
  )
  if (colleges?.length !== 1 || !hasCurrentBardDanceDefense(cls, colleges[0])) return []
  const target = 'subclass-feature|unarmored defense|bard|xphb|dance|xphb|3|xphb'
  const effect = unarmoredBaseEffect(
    character.equipment,
    target,
    { kind: 'subclass', name: 'Dazzling Footwork', source: 'XPHB', entityId: target },
    10 + dexterity + charisma,
    false,
  )
  return effect ? [effect] : []
}

function deriveWildHeartAspectEffect(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  sourceEffects: readonly CharacterEffect[],
): CharacterEffect | undefined {
  const owners = character.classProgression.filter(
    (row) => normalizeOwnerIdentity(row.name) === 'barbarian',
  )
  const owner = owners[0]
  if (
    character.originSystem !== '2024' ||
    owners.length !== 1 ||
    owner.levels < 6 ||
    normalizeOwnerIdentity(owner.source) !== 'xphb' ||
    normalizeOwnerIdentity(owner.subclass) !== 'path of the wild heart' ||
    normalizeOwnerIdentity(owner.subclassSource) !== 'xphb'
  )
    return undefined
  const saved = character.classChoiceSelections?.filter(
    (row) => row.choiceId === WILD_HEART_ASPECT.id,
  )
  const aspect = saved?.length === 1 && !saved[0].inactive && getSavedBarbarianPathOption(saved[0])
  if (!aspect || !getCurrentWildHeartAspects(catalogs).some((row) => row.name === aspect))
    return undefined
  const label = `Aspect of the Wilds: ${aspect}`
  const effect = {
    id: WILD_HEART_ASPECT.target,
    label,
    source: {
      kind: 'subclass' as const,
      name: label,
      source: 'XPHB',
      entityId: WILD_HEART_ASPECT.target,
    },
  }
  if (aspect === 'Owl') {
    return {
      ...effect,
      target: { kind: 'sense', sense: 'darkvision' },
      operation: { kind: 'add', value: 60 },
    }
  }
  const walk = getWalkingSpeed(getEffectiveCharacterMovement(character, sourceEffects))
  return {
    ...effect,
    target: { kind: 'speed', mode: aspect === 'Panther' ? 'climb' : 'swim' },
    operation: { kind: 'minimum', value: walk },
  }
}

function deriveBarbarianPassiveEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  { constitution, dexterity }: AbilityScores,
  prerequisites: ClassChoicePrerequisiteContext,
): CharacterEffect[] {
  const results: CharacterEffect[] = []
  const defense = getCurrentBarbarianJourneyFeature(character, catalogs, 'unarmored defense')
  if (defense) {
    const effect = unarmoredBaseEffect(
      character.equipment,
      defense.target,
      {
        kind: 'class',
        name: defense.feature.name,
        source: defense.feature.source,
        entityId: defense.target,
      },
      10 + dexterity + constitution,
    )
    if (effect) results.push(effect)
  }
  const movement = getCurrentBarbarianJourneyFeature(character, catalogs, 'fast movement')
  const wearsHeavyArmor = character.equipment?.some(
    (item) => item.equipped && getNormalizedItemTraits(item).armorCategory === 'heavy',
  )
  if (movement && !wearsHeavyArmor) {
    results.push({
      id: `${movement.target}:speed`,
      label: movement.feature.name,
      source: {
        kind: 'class',
        name: movement.feature.name,
        source: movement.feature.source,
        entityId: movement.target,
      },
      target: { kind: 'speed', mode: 'walk' },
      operation: { kind: 'add', value: 10 },
    })
  }
  if (
    character.originSystem === '2014' &&
    character.classProgression.some(
      (owner) =>
        findClassReference({ name: 'Barbarian', source: 'PHB' }, [owner]) &&
        owner.levels >= 6 &&
        normalizeOwnerIdentity(owner.subclass) === 'path of the totem warrior' &&
        normalizeOwnerIdentity(owner.subclassSource) === 'phb',
    ) &&
    catalogs &&
    hasCurrentBearAspect(
      scopeClassChoiceFeatureCatalogs(
        catalogs,
        getFeatureOwnerKey('Barbarian', 'PHB', 'Path of the Totem Warrior', 'PHB'),
      ).subclassFeatureCandidates,
    ) &&
    getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites).selectedOptions.some(
      ({ choice, option }) =>
        choice.level === 6 &&
        getClassChoiceDeclaration(choice)?.target === CLASSIC_ASPECT_TARGET &&
        getClassChoiceFeatureTarget(option) === BEAR_ASPECT_TARGET,
    )
  )
    results.push({
      id: BEAR_ASPECT_TARGET,
      label: 'Aspect of the Beast: Bear',
      source: {
        kind: 'subclass',
        name: 'Aspect of the Beast: Bear',
        source: 'PHB',
        entityId: BEAR_ASPECT_TARGET,
      },
      target: { kind: 'carrying-capacity' },
      operation: { kind: 'multiply', value: 2 },
    })
  return results
}

function deriveMonkUnarmoredEffects(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  monk: ReturnType<typeof getCurrentMonkBaseRules>,
  modifiers: AbilityScores,
): CharacterEffect[] {
  if (!monk) return []
  const { bodyArmor, shield } = getArmorEquipmentSlots(character.equipment ?? [])
  if (bodyArmor || shield) return []
  const defense = getMonkUnarmoredDefense(monk)
  const earlierBarbarian =
    monk.cls.source === 'PHB' &&
    character.classProgression
      .slice(0, character.classProgression.indexOf(monk.owner))
      .some((entry) => findClassReference({ name: 'Barbarian', source: 'PHB' }, [entry])) &&
    getCurrentBarbarianJourneyFeature(character, catalogs, 'unarmored defense')
  const ac =
    defense && !earlierBarbarian
      ? unarmoredBaseEffect(
          character.equipment,
          defense.target,
          {
            kind: 'class',
            name: defense.feature.name,
            source: defense.feature.source,
            entityId: defense.target,
          },
          defense.base + modifiers[defense.firstAbility] + modifiers[defense.secondAbility],
          false,
        )
      : undefined
  const movement = getMonkUnarmoredMovement(monk)
  return [
    ...(ac ? [ac] : []),
    ...(movement
      ? [
          {
            id: `${movement.target}:speed`,
            label: movement.feature.name,
            source: {
              kind: 'class' as const,
              name: movement.feature.name,
              source: movement.feature.source,
              entityId: movement.target,
            },
            target: { kind: 'speed' as const, mode: 'walk' },
            operation: { kind: 'add' as const, value: movement.bonus },
          },
        ]
      : []),
  ]
}

function unarmoredBaseEffect(
  equipment: readonly Equipment[] | undefined,
  target: string,
  origin: CharacterEffect['source'],
  base: number,
  allowsShield = true,
): CharacterEffect | undefined {
  const { bodyArmor, shield } = getArmorEquipmentSlots(equipment ?? [])
  if (bodyArmor || (!allowsShield && shield)) return undefined
  return {
    id: `${target}:ac`,
    label: origin.name,
    source: origin,
    target: { kind: 'armor-class' },
    operation: { kind: 'base', value: base + (shield ? (shield.ac ?? 2) : 0) },
  }
}
