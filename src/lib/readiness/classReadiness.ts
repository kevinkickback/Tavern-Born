import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData, getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { resolveClassReference } from '@/lib/5etools/entityResolvers'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getEffectiveClassChoiceSelections } from '@/lib/character/classChoiceActivity'
import { getClassChoiceFeatureId } from '@/lib/character/classChoiceIdentity'
import {
  type ClassChoiceCatalogs,
  collectSubclassFeatures,
  getCharacterClassChoiceDiagnostics,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { hasClassProficiencyRecovery } from '@/lib/character/classProficiencySelections'
import { getEffectiveClassChoiceFeatureRoutes } from '@/lib/character/effectiveClassChoiceFeatures'
import { getFeatureOptionSelectionStates } from '@/lib/character/featureOptionSelections'
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
  const featureOptionStates = getFeatureOptionSelectionStates(
    character,
    calculation.classChoices.classes,
    catalogs,
  )
  for (const state of featureOptionStates.filter(
    (row) =>
      (row.storm || row.literalGroup || row.proficiency || row.optionalPool) &&
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
        `Restore or remove ${state.selection.label}`,
        'The saved choice cannot be matched to current source rules. Restore its source or remove the saved choice.',
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

    for (const original of getCharacterClassChoices(classData, subclassData, activity, catalogs)) {
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
      const eligibleOptionKeys = choiceCatalogs
        ? new Set(
            resolveClassChoiceOptions(
              choice,
              choiceCatalogs,
              choice.kind === 'proficiency' ? storedSelection : [],
              entry.levels,
              character,
            )
              .filter(isClassChoiceOptionEligible)
              .map((option) => getClassChoiceOptionKey(option.reference)),
          )
        : undefined
      const effectiveRoutes = getEffectiveClassChoiceFeatureRoutes(
        character,
        choiceCatalogs,
        calculation.character.spells.spellProfiles,
      )
      const savedChoice = selections.get(choice.id)
      const count = eligibleOptionKeys
        ? storedSelection.filter(
            (option) =>
              eligibleOptionKeys.has(getClassChoiceOptionKey(option)) &&
              (!['classFeature', 'subclassFeature', 'optionalFeature'].includes(
                option.entityType,
              ) ||
                (!!savedChoice &&
                  effectiveRoutes.featureIds.has(getClassChoiceFeatureId(savedChoice, option)))),
          ).length
        : storedSelection.length
      if (count !== required) {
        issues.push(
          readinessIssue(
            classChoiceReadinessId(choice.id),
            'blocking',
            'class',
            `Finish ${choice.label}`,
            `${entry.name}: choose ${required} ${required === 1 ? 'selection' : 'selections'}; ${count} chosen.`,
            classChoiceTarget(entry, choice.level, choice.id),
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
        hasNaturalExplorerRecovery(diagnostic, featureOptionStates) ||
        hasClassProficiencyRecovery(diagnostic, featureOptionStates) ||
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
            diagnostic.featureName === 'Natural Explorer' && diagnostic.requiredChoice?.target.ref
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
        (state.storm || state.literalGroup || state.proficiency || state.optionalPool) &&
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
      if (level > entry.levels) continue
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
