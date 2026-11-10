import {
  getBarbarianPathChoice,
  getSavedBarbarianPathOption,
} from '@/lib/5etools/barbarianPathChoiceIdentity'
import { getSavedBlessedStrikes } from '@/lib/5etools/blessedStrikesSource'
import {
  getLandChoiceRule,
  getLandWardResistance,
  hasLandSanctuary,
} from '@/lib/5etools/circleOfTheLand'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { CLASS_ORDERS, getSavedClassOrder } from '@/lib/5etools/classOrderIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getSavedElementalFury } from '@/lib/5etools/elementalFurySource'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import {
  ELEMENTAL_AFFINITY_REF,
  featureOptionRulesSignature,
} from '@/lib/5etools/featureTableOptions'
import {
  getSavedAffinityDamageType,
  isRevisedAffinitySourceEnabled,
  REVISED_AFFINITY_ID,
} from '@/lib/5etools/revisedElementalAffinity'
import {
  getRevisedHunterRule,
  isValidRevisedHunterSelection,
  revisedHunterOwner,
} from '@/lib/5etools/revisedHunterIdentity'
import {
  getSubclassFeatureConfigurationRule,
  isValidSubclassFeatureConfigurationSelection,
} from '@/lib/5etools/subclassFeatureConfiguration'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import {
  type InvocationCantripsByOwner,
  isCurrentRevisedInvocationCantripPool,
  isRevisedInvocationSelection,
  isRevisedTargetedInvocation,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { renderEntriesToText } from '@/lib/entryText'
import type { Class5e, ClassFeature, Subclass5e } from '@/types/5etools'
import type {
  Character,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
} from '@/types/character'
import type {
  ClassChoiceDiagnostic,
  ClassProficiencyChoiceDomain,
  NormalizedCharacterChoice,
} from '@/types/classRules'
import { getFeatureOwnerKey, getInvocationCantripLabel } from './classChoiceIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  type ClassChoiceOptionView,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  createClassChoiceCatalogs as literalCatalogs,
  resolveClassChoiceOptions,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceOptions'
import { getCurrentClassOrder } from './classOrder'
import { getClassProficiencySelectionStates } from './classProficiencySelections'
import {
  describeFavoredEnemyLanguage,
  getFavoredEnemySelectionStates,
} from './favoredEnemySelections'
import { getLegacySubclassSelectionStates } from './legacySubclassSelections'
import { getNaturalExplorerSelectionStates } from './naturalExplorerSelections'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { getOptionalClassPoolSelectionStates } from './optionalClassPoolRecovery'
import { getPsionicRecoveryStates } from './psionicSelections'

import { getStormAuraSelectionStates, type StormAuraRules } from './stormAuraSelections'
import {
  getSavedRevisedInvocationOwner,
  hasEarnedRevisedInvocationSlots,
} from './warlockInvocationChoices'
import { isBladeDependentInvocation } from './warlockInvocationSource'

const AFFINITY_TARGET = getSubclassFeatureIdentity(
  decodeSubclassFeatureReference(ELEMENTAL_AFFINITY_REF),
)!

export interface FeatureOptionSelectionState {
  selection: CharacterClassChoiceSelection
  owner?: CharacterClassEntry
  classData?: Class5e
  subclass?: Subclass5e
  choice?: NormalizedCharacterChoice
  options: ClassChoiceOptionView[]
  recovery: boolean
  details: Array<{ name: string; damageType?: string; entries: unknown[]; available: boolean }>
  affinity?: { available: boolean; entries: unknown[] }
  landWard?: string
  storm?: StormAuraRules
  literalGroup?: { family: string; group: string; gain: number; title?: string }
  enemy?: { complete: boolean; languageAvailable: boolean }
  proficiency?: { domain: ClassProficiencyChoiceDomain }
  optionalPool?: boolean
  psionic?: boolean
  legacySubclass?: boolean
  companion?: boolean
  classOrder?: boolean
  projectedBranch?: boolean
  revisedInvocations?: 'cantrip-targets' | 'blade-prerequisites'
}

function getRevisedInvocationState(
  character: Character,
  selection: CharacterClassChoiceSelection,
  classes: readonly Class5e[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  known: InvocationCantripsByOwner | undefined,
): FeatureOptionSelectionState | undefined {
  if (
    !known ||
    !isRevisedInvocationSelection(selection) ||
    !selection.selected.some(
      (row) =>
        isRevisedTargetedInvocation(row) || isBladeDependentInvocation(selection.choiceId, row),
    )
  )
    return undefined
  const owner = getSavedRevisedInvocationOwner(character, selection)
  if (!owner) return undefined
  const matches = classes.filter((cls) => findClassReference(owner, [cls]))
  const classData =
    matches.length === 1 && !matches[0].sourceIdentityConflict && !('_copy' in matches[0])
      ? matches[0]
      : undefined
  const choices =
    classData && catalogs
      ? getCharacterClassChoices(
          classData,
          getSelectedSubclassData(classData, owner),
          createOptionalClassFeatureActivity(character, catalogs),
          catalogs,
        ).filter((row) => row.id === selection.choiceId)
      : []
  const choice =
    choices.length === 1 &&
    isCurrentRevisedInvocationCantripPool(choices[0], catalogs) &&
    hasEarnedRevisedInvocationSlots(choices[0], selection.selected, owner.levels)
      ? choices[0]
      : undefined
  const options = choice
    ? resolveClassChoiceOptions(
        choice,
        literalCatalogs(catalogs),
        selection.selected,
        owner.levels,
        character,
        known,
      )
    : []
  const views = new Map(options.map((row) => [getClassChoiceOptionKey(row.reference), row]))
  const details = selection.selected.map((row) => {
    const current = views.get(getClassChoiceOptionKey(row))
    const available = !!current && isClassChoiceOptionEligible(current)
    const name = getInvocationCantripLabel(row) ?? row.name
    return {
      name,
      available,
      entries: available
        ? current.entries
        : [
            current?.unavailableReason ??
              (row.invocationCantrip
                ? 'Restore the current known Warlock cantrip or choose another eligible target.'
                : isRevisedTargetedInvocation(row)
                  ? 'Choose an eligible known Warlock cantrip for this Invocation.'
                  : 'Restore the exact Invocation source or remove the saved choice.'),
          ],
    }
  })
  return {
    selection,
    owner,
    classData,
    choice,
    options,
    details,
    recovery: details.some((row) => !row.available),
    revisedInvocations: selection.selected.some(
      (option, index) =>
        !details[index].available && isBladeDependentInvocation(selection.choiceId, option),
    )
      ? 'blade-prerequisites'
      : 'cantrip-targets',
  }
}

function getProjectedBranchRecovery(
  character: Character,
  classes: readonly Class5e[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  selection: CharacterClassChoiceSelection | undefined,
): FeatureOptionSelectionState[] {
  if (!selection || selection.inactive) return []
  const owner = findClassReference(
    { name: selection.className, source: selection.classSource },
    character.classProgression,
  )
  if (!owner || owner.levels < selection.classLevel) return []
  const classData = findClassReference(owner, classes)
  const choice =
    classData &&
    getCharacterClassChoices(
      classData,
      getSelectedSubclassData(classData, owner),
      createOptionalClassFeatureActivity(character, catalogs),
      catalogs,
    ).find((row) => row.id === selection.choiceId)
  const options = choice
    ? resolveClassChoiceOptions(choice, literalCatalogs(catalogs), selection.selected, owner.levels)
    : []
  const [selected] = selection.selected
  if (
    options.some(
      (row) =>
        isClassChoiceOptionEligible(row) &&
        getClassChoiceOptionKey(row.reference) === getClassChoiceOptionKey(selected),
    )
  )
    return []
  return [
    {
      selection,
      owner,
      classData,
      choice,
      options,
      recovery: true,
      projectedBranch: true,
      details: [
        {
          name: selected.name,
          entries: [`Restore the exact ${selection.label} source or remove the saved choice.`],
          available: false,
        },
      ],
    },
  ]
}

export function hasProjectedBranchRecovery(
  diagnostic: ClassChoiceDiagnostic,
  states: readonly FeatureOptionSelectionState[],
): boolean {
  return (
    !diagnostic.subclassName &&
    states.some(
      (state) =>
        state.projectedBranch &&
        state.recovery &&
        state.selection.label === diagnostic.featureName &&
        getFeatureOwnerKey(state.selection.className, state.selection.classSource) ===
          getFeatureOwnerKey(diagnostic.className, diagnostic.classSource) &&
        state.selection.classLevel === diagnostic.level,
    )
  )
}

export function hasRevisedHunterRecovery(
  diagnostic: ClassChoiceDiagnostic,
  states: readonly FeatureOptionSelectionState[],
): boolean {
  return (
    diagnostic.className === revisedHunterOwner.name &&
    diagnostic.classSource === revisedHunterOwner.source &&
    diagnostic.subclassName === revisedHunterOwner.subclassName &&
    diagnostic.subclassSource === revisedHunterOwner.subclassSource &&
    states.some((state) => {
      const rule = getRevisedHunterRule(state.selection.choiceId)
      return (
        state.owner &&
        state.recovery &&
        rule?.name === diagnostic.featureName &&
        rule.level === diagnostic.level
      )
    })
  )
}

function affinityRules(
  owner: CharacterClassEntry,
  subclass: Subclass5e,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): FeatureOptionSelectionState['affinity'] {
  const declarations = collectUnconditionalFeatureReferences(
    subclass.subclassFeatureRefs ?? [],
    'subclassFeature',
  ).filter((entry) => entry.target === AFFINITY_TARGET)
  const earned = declarations.length > 0 ? Math.min(...declarations.map((entry) => entry.level)) : 6
  if (owner.levels < earned) return undefined
  const scoped = catalogs
    ? scopeClassChoiceFeatureCatalogs(
        catalogs,
        getFeatureOwnerKey(owner.name, owner.source, owner.subclass, owner.subclassSource),
      )
    : undefined
  const candidates =
    scoped?.subclassFeatureCandidates !== undefined
      ? (scoped.subclassFeatureCandidates.get(AFFINITY_TARGET) ?? [])
      : (scoped?.subclassFeatures.filter(
          (feature) => getSubclassFeatureIdentity(feature) === AFFINITY_TARGET,
        ) ?? [])
  const entries = candidates[0]?.entries
  const signature = Array.isArray(entries) ? featureOptionRulesSignature(entries) : undefined
  const agrees = (feature: ClassFeature | undefined) =>
    feature &&
    !feature.featureOptionSourceConflict &&
    getSubclassFeatureIdentity(feature) === AFFINITY_TARGET &&
    Array.isArray(feature.entries) &&
    featureOptionRulesSignature(feature.entries) === signature
  const text = signature?.toLowerCase() ?? ''
  const verified =
    signature &&
    declarations.length > 0 &&
    candidates.length > 0 &&
    declarations.every((entry) => agrees(entry.reference.feature)) &&
    candidates.every(agrees) &&
    [
      'damage of the type associated with your draconic ancestry',
      'charisma modifier to one damage roll',
      'spend 1 sorcery point',
      'resistance to that damage type for 1 hour',
    ].every((marker) => text.includes(marker))
  return verified
    ? { available: true, entries: entries! }
    : {
        available: false,
        entries: [
          'Elemental Affinity rules are unavailable or changed. Restore the exact PHB feature to verify this context.',
        ],
      }
}

/** Saved intent becomes current only through the matching earned declaration and filtered row. */
export function getFeatureOptionSelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
  knownWarlockCantrips?: InvocationCantripsByOwner,
): FeatureOptionSelectionState[] {
  const literal = (character.classChoiceSelections ?? [])
    .filter(
      (selection) =>
        selection.kind === 'feature-option' &&
        !selection.inactive &&
        (!isFeatureLiteralChoiceId(selection.choiceId) ||
          selection.choiceId === REVISED_AFFINITY_ID ||
          !!getBarbarianPathChoice(selection.choiceId) ||
          !!getRevisedHunterRule(selection.choiceId) ||
          !!getSubclassFeatureConfigurationRule(selection.choiceId)),
    )
    .map((selection) => {
      const hunter = getRevisedHunterRule(selection.choiceId)
      const land = getLandChoiceRule(selection.choiceId)
      const configuration = getSubclassFeatureConfigurationRule(selection.choiceId)
      const revisedAffinity = selection.choiceId === REVISED_AFFINITY_ID
      const barbarianPathChoice = !!getBarbarianPathChoice(selection.choiceId)
      const usesSourceGroup = !!(hunter || configuration || revisedAffinity || barbarianPathChoice)
      const owner = findClassReference(
        { name: selection.className, source: selection.classSource },
        character.classProgression,
      )
      const classData = owner ? findClassReference(owner, classes) : undefined
      const subclass = classData && owner ? getSelectedSubclassData(classData, owner) : undefined
      const sameOwner =
        owner &&
        getFeatureOwnerKey(
          owner.name,
          owner.source,
          selection.subclassName ? owner.subclass : undefined,
          selection.subclassName ? owner.subclassSource : undefined,
        ) ===
          getFeatureOwnerKey(
            selection.className,
            selection.classSource,
            selection.subclassName,
            selection.subclassSource,
          )
      const choice =
        classData && owner && sameOwner
          ? getCharacterClassChoices(
              classData,
              subclass,
              createOptionalClassFeatureActivity(character, catalogs),
              catalogs,
            ).find(
              (candidate) =>
                candidate.kind === 'feature-option' &&
                candidate.id === selection.choiceId &&
                candidate.level === selection.classLevel &&
                candidate.level <= owner.levels &&
                (!hunter || isValidRevisedHunterSelection(selection)) &&
                (!barbarianPathChoice || getSavedBarbarianPathOption(selection)) &&
                (!configuration || isValidSubclassFeatureConfigurationSelection(selection)) &&
                (!revisedAffinity ||
                  (getSavedAffinityDamageType(selection, character.classProgression) &&
                    isRevisedAffinitySourceEnabled(character))) &&
                selection.selected.every(
                  (row) => row.slotLevel >= candidate.level && row.slotLevel <= owner.levels,
                ),
            )
          : undefined
      const options: ClassChoiceOptionView[] =
        choice && owner
          ? resolveClassChoiceOptions(
              choice,
              literalCatalogs(catalogs),
              selection.selected,
              owner.levels,
            )
          : selection.selected.map((reference) => ({
              reference,
              availability: 'retained' as const,
              entries: [],
            }))
      const recovery =
        !choice ||
        !options.some(
          (option) =>
            isClassChoiceOptionEligible(option) &&
            (!usesSourceGroup ||
              selection.selected.some(
                (row) => getClassChoiceOptionKey(row) === getClassChoiceOptionKey(option.reference),
              )),
        )
      const affinity =
        !usesSourceGroup && !recovery && owner && subclass
          ? affinityRules(owner, subclass, catalogs)
          : undefined
      const landWard =
        land?.source === 'XPHB' && !recovery && subclass && owner && owner.levels >= 10
          ? getLandWardResistance(subclass, selection.selected[0].name)
          : undefined
      const wardText =
        landWard && owner && subclass
          ? `Nature’s Ward grants ${landWard.toLowerCase()} resistance.${owner.levels >= 14 && hasLandSanctuary(subclass) ? ' Nature’s Sanctuary shares it with allies in the area.' : ''}`
          : undefined
      const details = selection.selected.map((selected) => {
        const option = options.find(
          (view) => getClassChoiceOptionKey(view.reference) === getClassChoiceOptionKey(selected),
        )
        const available =
          !recovery &&
          !!option &&
          isClassChoiceOptionEligible(option) &&
          !!(usesSourceGroup ? option.sourceGroup : option.featureOption)
        const damageType = available ? option.featureOption?.damageType : undefined
        const entries: unknown[] = available
          ? [...option.entries]
          : [
              land
                ? 'Restore the exact Circle of the Land source or remove the saved terrain.'
                : hunter
                  ? 'Restore the exact Hunter feature source or remove the saved choice.'
                  : revisedAffinity
                    ? 'Restore the exact Elemental Affinity source or remove the saved choice.'
                    : configuration || barbarianPathChoice
                      ? 'Restore the exact subclass feature source or remove the saved choice.'
                      : 'Current ancestry and damage rules are unavailable. Restore the exact source or remove the saved choice.',
            ]
        if (available && wardText) entries.push(wardText)
        if (available && affinity) {
          entries.push({
            type: 'entries',
            name: affinity.available
              ? `Elemental Affinity — ${damageType}`
              : 'Elemental Affinity — unverified rules',
            entries: affinity.entries,
          })
        }
        return { name: selected.name, damageType, entries, available }
      })
      return {
        selection,
        owner,
        classData,
        subclass,
        choice,
        options,
        recovery,
        details,
        affinity,
        landWard: wardText,
        ...(hunter && {
          literalGroup: {
            family: hunter.id,
            group: hunter.name,
            gain: hunter.level,
            title: hunter.name,
          },
        }),
      }
    })
  const orderRecovery = CLASS_ORDERS.flatMap((order): FeatureOptionSelectionState[] => {
    const savedOrder = getCurrentClassOrder(character, order, catalogs)
      ? undefined
      : getSavedClassOrder(character, order)
    const orderOwner =
      savedOrder &&
      findClassReference(
        { name: savedOrder.selection.className, source: savedOrder.selection.classSource },
        character.classProgression,
      )
    const orderClass = orderOwner && findClassReference(orderOwner, classes)
    const orderHasEditor =
      orderClass &&
      orderOwner &&
      getCharacterClassChoices(
        orderClass,
        getSelectedSubclassData(orderClass, orderOwner),
        createOptionalClassFeatureActivity(character, catalogs),
        catalogs,
      ).some((choice) => choice.id === order.id && choice.level <= orderOwner.levels)
    return savedOrder && orderOwner && !orderHasEditor
      ? [
          {
            selection: savedOrder.selection,
            owner: orderOwner,
            options: [],
            recovery: true,
            details: savedOrder.selection.selected.map((option) => ({
              name: option.name,
              entries: [`Restore the exact ${order.name} source or remove the saved choice.`],
              available: false,
            })),
            classOrder: true,
          },
        ]
      : []
  })
  const revisedInvocations = (character.classChoiceSelections ?? []).flatMap((selection) => {
    const state = getRevisedInvocationState(
      character,
      selection,
      classes,
      catalogs,
      knownWarlockCantrips,
    )
    return state ? [state] : []
  })
  return [
    ...literal,
    ...orderRecovery,
    ...getProjectedBranchRecovery(
      character,
      classes,
      catalogs,
      getSavedBlessedStrikes(character.classChoiceSelections ?? []),
    ),
    ...getProjectedBranchRecovery(
      character,
      classes,
      catalogs,
      getSavedElementalFury(character.classChoiceSelections ?? []),
    ),
    ...getLegacySubclassSelectionStates(character, classes, catalogs),
    ...getPsionicRecoveryStates(character, classes, catalogs),
    ...getStormAuraSelectionStates(character, classes, catalogs),
    ...getNaturalExplorerSelectionStates(character, classes, catalogs),
    ...getFavoredEnemySelectionStates(character, classes, catalogs),
    ...getClassProficiencySelectionStates(character, classes, catalogs),
    ...getOptionalClassPoolSelectionStates(character, classes, catalogs),
    ...revisedInvocations,
  ]
}

/** View-only text shared by both sheet families and their description-off projections. */
export function summarizeFeatureOptionSelection(
  state: FeatureOptionSelectionState,
  descriptions = true,
): string {
  const selected = state.details
    .map(
      (row) =>
        row.name +
        (state.selection.inactive
          ? ' (Inactive)'
          : row.available
            ? row.damageType
              ? ` — ${row.damageType}`
              : ''
            : ' (rules unavailable)'),
    )
    .join(', ')
  const title = `${state.selection.label}${state.literalGroup ? ` (level ${state.literalGroup.gain})` : ''}: ${selected}`
  if (!descriptions) {
    if (state.selection.choiceId === REVISED_AFFINITY_ID && state.details[0]?.available)
      return `${title} · ${renderEntriesToText(state.details[0].entries)}`
    return (
      title +
      (state.landWard ? ` · ${state.landWard}` : '') +
      (state.storm
        ? '; ' +
          state.storm.stages
            .map(
              (stage) =>
                `${stage.name}${stage.available ? (stage.name === 'Storm Soul' && state.storm?.fixedBenefits ? ` — ${state.storm.fixedBenefits.damageType} resistance${state.storm.fixedBenefits.swimSpeed !== undefined ? `; swim ${state.storm.fixedBenefits.swimSpeed} ft.` : ''}` : '') : ' (rules unavailable)'}`,
            )
            .join('; ')
        : '') +
      (state.affinity && state.details.some((row) => row.available)
        ? state.affinity.available
          ? '; Elemental Affinity — ' +
            state.details
              .filter((row) => row.available)
              .map((row) => row.damageType)
              .join(', ')
          : '; Elemental Affinity rules unavailable'
        : '')
    )
  }
  const entries = state.details.flatMap((row) => row.entries)
  return title + (entries.length ? `\n${renderEntriesToText(entries)}` : '')
}

/** A literal family prints its selected gains together, retaining conditional context only once. */
export function summarizeFeatureOptionSelectionGroups(
  states: readonly FeatureOptionSelectionState[],
): Array<{ text: string; compactText: string }> {
  const summaries: Array<{ text: string; compactText: string }> = []
  const seen = new Set<string>()
  for (const state of states) {
    if (!state.literalGroup) {
      summaries.push({
        text: summarizeFeatureOptionSelection(state),
        compactText: summarizeFeatureOptionSelection(state, false),
      })
      continue
    }
    if (seen.has(state.literalGroup.family)) continue
    seen.add(state.literalGroup.family)
    const group = states.filter((row) => row.literalGroup?.family === state.literalGroup?.family)
    const selected = group
      .flatMap((row) =>
        row.enemy
          ? [
              row.details.map((d) => d.name).join(', ') +
                ` (level ${row.selection.classLevel}${row.selection.inactive ? '; Inactive' : row.recovery ? '; rules unavailable' : row.enemy.complete ? '' : '; setup pending'}) — ${describeFavoredEnemyLanguage(row.selection)}`,
            ]
          : row.details.map(
              (detail) =>
                `${detail.name} (level ${row.selection.classLevel}${row.selection.inactive ? '; Inactive' : detail.available ? '' : row.enemy && !row.recovery ? '; setup pending' : '; rules unavailable'})`,
            ),
      )
      .join('; ')
    const compactText = `${state.literalGroup.title ?? 'Natural Explorer favored terrains'}: ${selected}`
    const entries = group.flatMap((row) =>
      (row.enemy ? row.details : row.details.filter((detail) => detail.available)).flatMap(
        (detail) => detail.entries,
      ),
    )
    summaries.push({
      compactText,
      text: compactText + (entries.length ? `\n${renderEntriesToText(entries)}` : ''),
    })
  }
  return summaries
}
