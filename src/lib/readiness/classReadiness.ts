import {
  getClassChoiceSlotLevels,
  getProgressiveChoiceGainCount,
  getProgressiveChoiceReviewLevel,
  getRequiredChoiceSelectionCount,
} from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData, getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { CLASS_ORDERS, PRIMAL_ORDER } from '@/lib/5etools/classOrderIdentity'
import { getCurrentClassOrderOption } from '@/lib/5etools/classOrderSource'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import { decodeFavoredEnemyChoiceId } from '@/lib/5etools/favoredEnemyIdentity'
import { isRevisedAffinityChoiceId } from '@/lib/5etools/revisedElementalAffinity'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getEffectiveClassChoiceSelections } from '@/lib/character/classChoiceActivity'
import { getClassChoiceFeatureId } from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoiceCatalogs,
  collectSubclassFeatures,
  getCharacterClassChoiceDiagnostics,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  getEarnedFixedClassChoiceOptions,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { getCurrentClassOrder } from '@/lib/character/classOrder'
import { hasClassProficiencyRecovery } from '@/lib/character/classProficiencySelections'
import { getCompanionSelectionStates } from '@/lib/character/companionSelections'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import { EPIC_BOON_LEVEL } from '@/lib/character/epicBoonSlots'
import {
  hasFavoredEnemyRecovery,
  isFavoredEnemySetupComplete,
} from '@/lib/character/favoredEnemySelections'
import {
  getFeatureOptionSelectionStates,
  hasProjectedBranchRecovery,
  hasRevisedHunterRecovery,
} from '@/lib/character/featureOptionSelections'
import { getFighterStylePair } from '@/lib/character/fighterStyleChoices'
import {
  getHistoricalProficiencyRule,
  resolveHistoricalProficiencyChoice,
} from '@/lib/character/historicalProficiencyChoices'
import { hasNaturalExplorerRecovery } from '@/lib/character/naturalExplorerSelections'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalClassAdoptionKey } from '@/lib/character/optionalClassFeatureIdentity'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  classAsiReadinessId,
  classChoiceDiagnosticReadinessId,
  classChoiceReadinessId,
  classSubclassReadinessId,
} from '@/lib/navigation/readinessFocus'
import type { Character, CharacterClassEntry } from '@/types/character'
import { readinessClassKey, readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

function classChoiceTarget(
  entry: CharacterClassEntry,
  level: number | undefined,
  choiceId?: string,
): string {
  const params = new URLSearchParams({
    class: `${entry.name}|${entry.source}`,
  })
  if (level !== undefined) params.set('level', String(level))
  if (choiceId) params.set('choice', choiceId)
  return `/build/class?${params.toString()}`
}

function isOwnedByClass(
  value: { className?: string; classSource?: string; level?: number; classLevel?: number },
  entry: CharacterClassEntry,
  level: number,
): boolean {
  return (
    value.className === entry.name &&
    value.classSource === entry.source &&
    (value.level ?? value.classLevel) === level
  )
}

export function validateClassChoices(
  character: Character,
  calculation: CharacterCalculationContext,
  catalogs?: ClassChoiceCatalogs,
): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  const entries = getCharacterClassEntries(character)
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const unavailable = activity.states.filter((row) => row.state === 'unavailable')
  for (const row of unavailable) {
    const owner = entries.find(
      (entry) =>
        entry.name.trim().toLowerCase() === row.root.owner[1] &&
        entry.source.trim().toLowerCase() === row.root.owner[2],
    )
    if (owner)
      issues.push(
        readinessIssue(
          getOptionalClassAdoptionKey(row.adoption),
          'blocking',
          'class',
          `Restore or clear ${row.root.name}`,
          row.root.replaces.length
            ? 'The adopted optional feature is unavailable. Its standard replacement remains reserved until you restore its source, clear it, or turn optional features off.'
            : 'The adopted optional feature is unavailable. Restore its source or clear the saved adoption.',
          classChoiceTarget(owner, row.root.level),
        ),
      )
  }
  const selections = new Map(
    getEffectiveClassChoiceSelections(character, calculation.classChoices.classes, catalogs)
      .filter((selection) => !selection.inactive)
      .map((selection) => [selection.choiceId, selection]),
  )
  const companionStates = getCompanionSelectionStates(
    character,
    calculation.classChoices.classes,
    catalogs,
  )
  const featureOptionStates = [
    ...getFeatureOptionSelectionStates(
      character,
      calculation.classChoices.classes,
      catalogs,
      calculation.classChoices.prerequisites.knownWarlockCantrips,
    ),
    ...companionStates,
  ]
  for (const state of featureOptionStates.filter(
    (row) =>
      (row.storm ||
        row.literalGroup ||
        isRevisedAffinityChoiceId(row.selection.choiceId) ||
        row.proficiency ||
        row.optionalPool ||
        row.psionic ||
        row.legacySubclass ||
        row.companion ||
        row.projectedBranch ||
        row.revisedInvocations) &&
      row.owner &&
      row.recovery,
  )) {
    if (
      state.proficiency &&
      unavailable.some(
        (row) =>
          row.root.target === decodeClassProficiencyChoiceId(state.selection.choiceId)?.target &&
          row.root.owner[1] === state.selection.className.trim().toLowerCase() &&
          row.root.owner[2] === state.selection.classSource.trim().toLowerCase(),
      )
    )
      continue
    issues.push(
      readinessIssue(
        classChoiceReadinessId(state.selection.choiceId),
        'blocking',
        'class',
        state.revisedInvocations === 'blade-prerequisites'
          ? 'Review Pact of the Blade requirements'
          : state.revisedInvocations === 'prerequisites'
            ? 'Review Eldritch Invocation prerequisites'
            : state.revisedInvocations
              ? 'Review Eldritch Invocation cantrip targets'
              : state.enemy?.complete && !state.enemy.languageAvailable
                ? 'Restore or change Favored Enemy language'
                : `Restore or remove ${state.selection.label}`,
        state.revisedInvocations === 'blade-prerequisites'
          ? 'Restore the earned Warlock level and current Pact of the Blade, or remove the unavailable Invocation.'
          : state.revisedInvocations === 'prerequisites'
            ? 'Meet the saved Invocation’s class level and prerequisite choices, or remove it.'
            : state.revisedInvocations
              ? 'Choose a current eligible known Warlock cantrip for each saved Invocation, or remove the unavailable choice.'
              : state.enemy?.complete && !state.enemy.languageAvailable
                ? 'The confirmed language is unavailable. Restore its source, change the language confirmation, or clear this allocation. The enemy selection remains current.'
                : 'The saved choice cannot be matched to current source rules. Restore its source or remove the saved choice.',
        classChoiceTarget(state.owner!, state.selection.classLevel, state.selection.choiceId),
      ),
    )
  }
  const availableSubclassTargets = new Set(
    (catalogs?.subclassFeatures ?? []).flatMap(
      (feature) => getSubclassFeatureIdentity(feature) ?? [],
    ),
  )

  for (const entry of entries) {
    const epicBoon = calculation.classChoices.epicBoonSlots.find((slot) =>
      findClassReference(slot.owner, [entry]),
    )
    if (epicBoon && epicBoon.state !== 'selected') {
      const conflict = epicBoon.state === 'conflict'
      const unavailable = epicBoon.state === 'unavailable'
      issues.push(
        readinessIssue(
          classAsiReadinessId(readinessClassKey(entry), EPIC_BOON_LEVEL),
          'blocking',
          'class',
          conflict
            ? 'Resolve Epic Boon choices'
            : unavailable
              ? 'Restore or remove Epic Boon'
              : 'Choose an Epic Boon or feat',
          conflict
            ? 'More than one saved choice claims this advancement. Choose one feat or clear the saved choices.'
            : unavailable
              ? 'The advancement or saved selection cannot be verified. Restore its source or clear the saved choice.'
              : `${entry.name} has one advancement choice at class level ${EPIC_BOON_LEVEL}.`,
          classChoiceTarget(entry, EPIC_BOON_LEVEL),
        ),
      )
    }
    const classData = findClassReference(entry, calculation.classes)
    if (!classData) continue
    const subclassInfo = getSubclassSelectionInfo(classData)
    if (
      (classData.subclasses?.length ?? 0) > 0 &&
      subclassInfo.subclassLevel !== undefined &&
      entry.levels >= subclassInfo.subclassLevel &&
      !entry.subclass
    ) {
      issues.push(
        readinessIssue(
          classSubclassReadinessId(readinessClassKey(entry)),
          'blocking',
          'class',
          'Choose a subclass',
          `${entry.name} offers a subclass choice at class level ${subclassInfo.subclassLevel}.`,
          classChoiceTarget(entry, subclassInfo.subclassLevel),
        ),
      )
    }
    const subclassData = getSelectedSubclassData(classData, entry)
    const subclassCatalogs = catalogs
      ? {
          ...catalogs,
          subclassFeatures: collectSubclassFeatures(
            getSelectedSubclassData(
              resolveClassReference(entry, calculation.lookups.primary),
              entry,
            ),
          ).filter((feature) => {
            const target = getSubclassFeatureIdentity(feature)
            return target !== undefined && availableSubclassTargets.has(target)
          }),
        }
      : undefined
    if (entry.subclass && !subclassData) {
      issues.push(
        readinessIssue(
          classSubclassReadinessId(readinessClassKey(entry)),
          'blocking',
          'class',
          `Restore ${entry.subclass}`,
          'The selected subclass cannot be resolved from its exact sourcebook printing.',
          classChoiceTarget(entry, subclassInfo.subclassLevel),
        ),
      )
    }

    const order = CLASS_ORDERS.find(
      (rule) =>
        entry.name.trim().toLowerCase() === rule.owner &&
        entry.source.trim().toLowerCase() === 'xphb',
    )
    const choices = getCharacterClassChoices(classData, subclassData, activity, catalogs)
    const orderNeedsRecovery =
      order &&
      character.classChoiceSelections?.some(
        (row) => row.choiceId === order.id && row.selected.length > 0,
      ) &&
      !getCurrentClassOrder(character, order, calculation.classChoices.catalogs)
    const orderRulesUnavailable =
      order === PRIMAL_ORDER &&
      !!calculation.classChoices.catalogs &&
      (!choices.some((choice) => choice.id === order.id) ||
        (!getCurrentClassOrderOption(calculation.classChoices.catalogs, order, 'training') &&
          !getCurrentClassOrderOption(calculation.classChoices.catalogs, order, 'caster')))
    if (order && (orderNeedsRecovery || orderRulesUnavailable))
      issues.push(
        readinessIssue(
          classChoiceReadinessId(order.id),
          'blocking',
          'class',
          `Review ${order.name}`,
          orderNeedsRecovery
            ? `Restore the exact ${order.name} and selected option sources or change the selection.`
            : `Restore the exact ${order.name} source to make this required choice.`,
          classChoiceTarget(entry, 1, order.id),
        ),
      )

    for (const original of choices) {
      if (original.id === epicBoon?.choiceId) continue
      if ((orderNeedsRecovery || orderRulesUnavailable) && original.id === order?.id) continue
      const choice = resolveHistoricalProficiencyChoice(character, original)
      if (
        choice.level <= entry.levels &&
        getHistoricalProficiencyRule(choice.id) &&
        !selections.get(choice.id)?.proficiencyAtGain
      ) {
        issues.push(
          readinessIssue(
            classChoiceReadinessId(choice.id),
            'blocking',
            'class',
            `Confirm ${choice.owner.featureName} proficiency setup`,
            'Confirm whether you already had the proficiency when you gained this feature.',
            classChoiceTarget(entry, choice.level, choice.id),
          ),
        )
        continue
      }
      if (
        featureOptionStates.some(
          (state) => state.recovery && state.selection.choiceId === choice.id,
        )
      )
        continue
      const required = getRequiredChoiceSelectionCount(choice, entry.levels)
      if (required <= 0) continue
      const storedSelection = selections.get(choice.id)?.selected ?? []
      const choiceCatalogs =
        choice.owner.type === 'subclass' && !catalogs?.subclassTargets ? subclassCatalogs : catalogs
      if (choiceCatalogs && choice.fixedOptions?.length) {
        const earned = getEarnedFixedClassChoiceOptions(choice, choiceCatalogs, entry.levels)
        const missing = choice.fixedOptions.find(
          ({ level, option }) =>
            level <= entry.levels &&
            !earned.some((row) => row.option === option && row.level === level),
        )
        if (missing)
          issues.push(
            readinessIssue(
              `class-choice-fixed:${choice.id}`,
              'blocking',
              'class',
              `Restore ${missing.option.name}`,
              'Restore the exact source for the discipline this feature grants automatically.',
              classChoiceTarget(entry, missing.level, choice.id),
            ),
          )
      }
      const fighterStyle = getFighterStylePair(choice.id)
      const calculationCatalogs = calculation.classChoices.catalogs
      const routeCatalogs =
        fighterStyle && !choiceCatalogs?.classes && calculationCatalogs?.classes
          ? choiceCatalogs
            ? { ...choiceCatalogs, classes: calculationCatalogs.classes }
            : calculationCatalogs
          : choiceCatalogs
      const eligibleOptionKeys =
        choiceCatalogs &&
        choice.kind !== 'creature' &&
        !choice.optionFilter?.requiresMastery &&
        !fighterStyle
          ? new Set(
              resolveClassChoiceOptions(
                choice,
                choiceCatalogs,
                choice.kind === 'proficiency' ? storedSelection : [],
                entry.levels,
                character,
                calculation.classChoices.prerequisites.knownWarlockCantrips,
              )
                .filter(isClassChoiceOptionEligible)
                .map((option) => getClassChoiceOptionKey(option.reference)),
            )
          : undefined
      const effectiveRoutes = getEffectiveClassChoiceFeatureRoutes(
        character,
        routeCatalogs,
        calculation.classChoices.prerequisites,
      )
      const savedChoice = selections.get(choice.id)
      const countedSelections =
        choice.kind === 'psionic' && character.mysticDisciplineReplacements?.length
          ? effectiveRoutes.selectedOptions
              .filter((row) => row.choice.id === choice.id)
              .map((row) => row.option)
          : eligibleOptionKeys
            ? storedSelection.filter(
                (option) =>
                  eligibleOptionKeys.has(getClassChoiceOptionKey(option)) &&
                  (!['classFeature', 'subclassFeature', 'optionalFeature', 'psionic'].includes(
                    option.entityType,
                  ) ||
                    (!!savedChoice &&
                      effectiveRoutes.featureIds.has(
                        getClassChoiceFeatureId(savedChoice, option),
                      ))),
              )
            : storedSelection
      const count =
        choice.kind === 'creature'
          ? Number(
              companionStates.some(
                (state) => state.selection.choiceId === choice.id && state.creature,
              ),
            )
          : decodeFavoredEnemyChoiceId(choice.id)
            ? isFavoredEnemySetupComplete(
                featureOptionStates.find((s) => s.selection.choiceId === choice.id),
              )
              ? 1
              : 0
            : choice.optionFilter?.requiresMastery
              ? (effectiveRoutes.masteredWeapons.get(choice.id)?.size ?? 0) +
                (effectiveRoutes.masteredCompanionFamilies.get(choice.id)?.size ?? 0)
              : fighterStyle && routeCatalogs?.classes
                ? effectiveRoutes.selectedOptions.filter(
                    ({ selection }) => selection.choiceId === choice.id,
                  ).length
                : countedSelections.length
      const gainLevels =
        getProgressiveChoiceGainCount(choice, choice.level) === undefined
          ? []
          : [...new Set(getClassChoiceSlotLevels(choice))].filter((level) => level <= entry.levels)
      const misplacedGain = gainLevels.find((level) => {
        const stored = storedSelection.filter(
          (option) =>
            getProgressiveChoiceReviewLevel(choice, option.slotLevel, entry.levels) === level,
        )
        return (
          stored.length > (getProgressiveChoiceGainCount(choice, level) ?? 0) ||
          stored.some((option) => option.slotLevel !== level)
        )
      })
      const pendingGain =
        misplacedGain ??
        gainLevels.find(
          (level) =>
            countedSelections.filter((option) => option.slotLevel === level).length <
            (getProgressiveChoiceGainCount(choice, level) ?? 0),
        )
      if (count !== required || pendingGain !== undefined) {
        issues.push(
          readinessIssue(
            classChoiceReadinessId(choice.id),
            'blocking',
            'class',
            `Finish ${choice.label}`,
            decodeFavoredEnemyChoiceId(choice.id)
              ? 'Complete the enemy allocation and confirm its associated spoken language, or explicitly confirm that these enemies speak none.'
              : misplacedGain !== undefined
                ? `Review saved choices at class level ${misplacedGain}. Remove choices that exceed or do not match the earned slots.`
                : `${entry.name}: choose ${required} ${required === 1 ? 'selection' : 'selections'}; ${count} chosen.`,
            classChoiceTarget(entry, pendingGain ?? choice.level, choice.id),
          ),
        )
      }
    }
    for (const diagnostic of getCharacterClassChoiceDiagnostics(
      classData,
      subclassData,
      activity,
      catalogs,
    )) {
      if (
        (diagnostic.level ?? 1) > entry.levels ||
        hasFavoredEnemyRecovery(diagnostic, featureOptionStates) ||
        hasNaturalExplorerRecovery(diagnostic, featureOptionStates) ||
        hasClassProficiencyRecovery(diagnostic, featureOptionStates) ||
        hasRevisedHunterRecovery(diagnostic, featureOptionStates) ||
        hasProjectedBranchRecovery(diagnostic, featureOptionStates) ||
        (diagnostic.featureName === 'Elemental Affinity' &&
          featureOptionStates.some(
            (state) =>
              isRevisedAffinityChoiceId(state.selection.choiceId) &&
              state.recovery &&
              state.selection.className === entry.name &&
              state.selection.classSource === entry.source,
          )) ||
        (diagnostic.featureName === 'Deft Explorer' &&
          featureOptionStates.some(
            (state) =>
              state.proficiency &&
              state.recovery &&
              state.selection.className === entry.name &&
              state.selection.classSource === entry.source,
          ))
      )
        continue
      issues.push(
        readinessIssue(
          classChoiceDiagnosticReadinessId(
            readinessClassKey(entry),
            diagnostic.featureName,
            diagnostic.code,
            ['Natural Explorer', 'Favored Enemy'].includes(diagnostic.featureName) &&
              diagnostic.requiredChoice?.target.ref
              ? { ref: diagnostic.requiredChoice.target.ref, level: diagnostic.level ?? 1 }
              : undefined,
          ),
          'blocking',
          'class',
          `Review unresolved ${diagnostic.featureName} choice`,
          diagnostic.message,
          classChoiceTarget(entry, diagnostic.level ?? 1),
        ),
      )
    }

    for (const state of featureOptionStates) {
      if (state.selection.inactive) continue
      if (
        !state.owner ||
        state.owner.name !== entry.name ||
        state.owner.source !== entry.source ||
        !state.classData ||
        (state.selection.subclassName && !state.subclass)
      )
        continue
      if (
        (state.storm ||
          state.literalGroup ||
          isRevisedAffinityChoiceId(state.selection.choiceId) ||
          state.proficiency ||
          state.optionalPool ||
          state.companion ||
          state.projectedBranch ||
          state.revisedInvocations) &&
        state.recovery
      )
        continue
      if (state.recovery) {
        issues.push(
          readinessIssue(
            classChoiceReadinessId(state.selection.choiceId),
            'blocking',
            'class',
            `Restore or remove ${state.selection.label}`,
            'The saved choice cannot be matched to a current earned source declaration. Restore its source or remove the saved choice.',
            classChoiceTarget(entry, state.selection.classLevel, state.selection.choiceId),
          ),
        )
      } else if (state.storm?.stages.some((stage) => !stage.available)) {
        issues.push(
          readinessIssue(
            `class-choice-storm:${state.selection.choiceId}`,
            'blocking',
            'class',
            'Restore Storm Aura dependent rules',
            state.storm.stages
              .filter((stage) => !stage.available)
              .map((stage) => `${stage.name} rules unavailable.`)
              .join(' '),
            classChoiceTarget(entry, state.choice?.level, state.selection.choiceId),
          ),
        )
      } else if (state.affinity && !state.affinity.available) {
        issues.push(
          readinessIssue(
            `class-choice-affinity:${state.selection.choiceId}`,
            'blocking',
            'class',
            'Restore Elemental Affinity rules',
            'The selected ancestry is retained, but the exact earned PHB Elemental Affinity rule cannot be verified.',
            classChoiceTarget(entry, state.choice?.level, state.selection.choiceId),
          ),
        )
      }
    }

    for (const level of classData.normalizedRules?.asiLevels ?? []) {
      if (level > entry.levels || (level === EPIC_BOON_LEVEL && epicBoon)) continue
      const hasAbilityIncrease = (character.asiChoices ?? []).some((choice) =>
        isOwnedByClass(choice, entry, level),
      )
      const hasFeat = [...(character.feats ?? []), ...(character.specialFeats ?? [])].some((feat) =>
        isOwnedByClass(feat, entry, level),
      )
      if (!hasAbilityIncrease && !hasFeat) {
        issues.push(
          readinessIssue(
            classAsiReadinessId(readinessClassKey(entry), level),
            'blocking',
            'class',
            'Choose an ability increase or feat',
            `${entry.name} has an unresolved advancement choice at class level ${level}.`,
            classChoiceTarget(entry, level),
          ),
        )
      }
    }
  }
  return issues
}
