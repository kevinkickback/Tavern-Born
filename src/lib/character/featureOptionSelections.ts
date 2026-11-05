import { BLESSED_STRIKES_ID, getSavedBlessedStrikes } from '@/lib/5etools/blessedStrikesSource'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  decodeSubclassFeatureReference,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { DIVINE_ORDER_ID, getSavedDivineOrder } from '@/lib/5etools/divineOrderIdentity'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import {
  ELEMENTAL_AFFINITY_REF,
  featureOptionRulesSignature,
} from '@/lib/5etools/featureTableOptions'
import {
  getRevisedHunterRule,
  isValidRevisedHunterSelection,
  revisedHunterOwner,
} from '@/lib/5etools/revisedHunterIdentity'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import { renderEntriesToText } from '@/lib/entryText'
import type { Class5e, ClassFeature, Subclass5e } from '@/types/5etools'
import type {
  Character,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
} from '@/types/character'
import type {
  ClassChoiceDiagnostic,
  ClassProficiencyDomain,
  NormalizedCharacterChoice,
} from '@/types/classRules'
import { getFeatureOwnerKey } from './classChoiceIdentity'
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
import { getClassProficiencySelectionStates } from './classProficiencySelections'
import { getCurrentDivineOrder } from './divineOrder'
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
  storm?: StormAuraRules
  literalGroup?: { family: string; group: string; gain: number; title?: string }
  enemy?: { complete: boolean; languageAvailable: boolean }
  proficiency?: { domain: ClassProficiencyDomain }
  optionalPool?: boolean
  psionic?: boolean
  legacySubclass?: boolean
  companion?: boolean
  divineOrder?: boolean
  blessedStrikes?: boolean
}

function getBlessedStrikesRecovery(
  character: Character,
  classes: readonly Class5e[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): FeatureOptionSelectionState[] {
  const selection = getSavedBlessedStrikes(character.classChoiceSelections ?? [])
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
    ).find((row) => row.id === BLESSED_STRIKES_ID)
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
      blessedStrikes: true,
      details: [
        {
          name: selected.name,
          entries: ['Restore the exact Blessed Strikes source or remove the saved choice.'],
          available: false,
        },
      ],
    },
  ]
}

export function hasBlessedStrikesRecovery(
  diagnostic: ClassChoiceDiagnostic,
  states: readonly FeatureOptionSelectionState[],
): boolean {
  return (
    diagnostic.featureName === 'Blessed Strikes' &&
    !diagnostic.subclassName &&
    states.some(
      (state) =>
        state.blessedStrikes &&
        state.recovery &&
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
): FeatureOptionSelectionState[] {
  const literal = (character.classChoiceSelections ?? [])
    .filter(
      (selection) =>
        selection.kind === 'feature-option' &&
        !selection.inactive &&
        (!isFeatureLiteralChoiceId(selection.choiceId) ||
          !!getRevisedHunterRule(selection.choiceId)),
    )
    .map((selection) => {
      const hunter = getRevisedHunterRule(selection.choiceId)
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
            (!hunter ||
              selection.selected.some(
                (row) => getClassChoiceOptionKey(row) === getClassChoiceOptionKey(option.reference),
              )),
        )
      const affinity =
        !hunter && !recovery && owner && subclass
          ? affinityRules(owner, subclass, catalogs)
          : undefined
      const details = selection.selected.map((selected) => {
        const option = options.find(
          (view) => getClassChoiceOptionKey(view.reference) === getClassChoiceOptionKey(selected),
        )
        const available =
          !recovery &&
          !!option &&
          isClassChoiceOptionEligible(option) &&
          !!(hunter ? option.sourceGroup : option.featureOption)
        const damageType = available ? option.featureOption?.damageType : undefined
        const entries: unknown[] = available
          ? [...option.entries]
          : [
              hunter
                ? 'Restore the exact Hunter feature source or remove the saved choice.'
                : 'Current ancestry and damage rules are unavailable. Restore the exact source or remove the saved choice.',
            ]
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
  const savedOrder = getCurrentDivineOrder(character, catalogs)
    ? undefined
    : getSavedDivineOrder(character)
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
    ).some((choice) => choice.id === DIVINE_ORDER_ID && choice.level <= orderOwner.levels)
  const orderRecovery: FeatureOptionSelectionState[] =
    savedOrder && orderOwner && !orderHasEditor
      ? [
          {
            selection: savedOrder.selection,
            owner: orderOwner,
            options: [],
            recovery: true,
            details: savedOrder.selection.selected.map((option) => ({
              name: option.name,
              entries: ['Restore the exact Divine Order source or remove the saved choice.'],
              available: false,
            })),
            divineOrder: true,
          },
        ]
      : []
  return [
    ...literal,
    ...orderRecovery,
    ...getBlessedStrikesRecovery(character, classes, catalogs),
    ...getLegacySubclassSelectionStates(character, classes, catalogs),
    ...getPsionicRecoveryStates(character, classes, catalogs),
    ...getStormAuraSelectionStates(character, classes, catalogs),
    ...getNaturalExplorerSelectionStates(character, classes, catalogs),
    ...getFavoredEnemySelectionStates(character, classes, catalogs),
    ...getClassProficiencySelectionStates(character, classes, catalogs),
    ...getOptionalClassPoolSelectionStates(character, classes, catalogs),
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
    return (
      title +
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
