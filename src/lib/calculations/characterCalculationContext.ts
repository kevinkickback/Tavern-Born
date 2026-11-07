import { CLASS_ORDERS } from '@/lib/5etools/classOrderIdentity'
import { getEarnedDraconicResilience } from '@/lib/5etools/draconicResilience'
import {
  type EntityLookupSet,
  type ResolvedRaceReference,
  resolveBackgroundReference,
  resolveClassReference,
  resolveFeatReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import { deriveRevisedAffinityEffects } from '@/lib/5etools/revisedElementalAffinity'
import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import {
  type AtWillInvocationSpellStatus,
  getAtWillInvocationSpellStatuses,
} from '@/lib/character/atWillInvocationSpells'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { getCurrentClassOrder } from '@/lib/character/classOrder'
import { getOwnedSubclassSkillModifiers } from '@/lib/character/classProficiencyAuthority'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { retractFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { deriveConditionalProficiencyNotes } from '@/lib/character/conditionalProficiencyNotes'
import type { DailyClassSpellStatus } from '@/lib/character/dailyClassSpells'
import {
  type ClassChoicePrerequisiteContext,
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
import { getAbilityModifier } from './gameRules'
import { getArmorEquipmentSlots } from './itemClassification'
import { type EffectiveMovement, getEffectiveCharacterMovement } from './movement'
import { refreshNativeRacialSpellState } from './nativeRacialSpells'
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
  character = refreshClassProficiencyState(
    character,
    primaryLookups.classChoiceClasses ?? Object.values(primaryLookups.classesByKey ?? {}),
    {
      ...(primaryLookups.classChoiceFeatureCatalogs ?? { classFeatures: [], subclassFeatures: [] }),
      featExpertiseFeats:
        primaryLookups.featExpertiseFeats ?? Object.values(primaryLookups.featsByKey ?? {}),
    },
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
  const abilityScores = deriveEffectiveAbilityScores(
    character,
    raceResolution.parentRace,
    raceResolution.subraceData,
    background,
    baseSourceEffects,
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
  const sourceEffects = [
    ...baseSourceEffects,
    ...deriveDraconicResilienceEffects(character, choiceCatalogs, abilityScores.modifiers),
    ...getOwnedSubclassSkillModifiers(character, abilityScores.modifiers),
    ...orderSkillEffects,
    ...deriveConditionalProficiencyNotes(
      character,
      choiceCatalogs,
      abilityScores.total,
      character.spells.spellProfiles,
      prerequisites,
    ),
  ]
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
  const { bodyArmor, shield } = getArmorEquipmentSlots(character.equipment ?? [])
  if (!bodyArmor) {
    effects.push({
      id: `${target}:ac`,
      label: name,
      source: origin,
      target: { kind: 'armor-class' },
      operation: {
        kind: 'base',
        value: dexterity + (revised ? 10 + charisma : 13) + (shield ? (shield.ac ?? 2) : 0),
      },
    })
  }
  return effects
}
