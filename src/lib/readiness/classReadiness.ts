import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getSubclassSelectionInfo } from '@/lib/5etools/classData'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import {
  type ClassChoiceCatalogs,
  getClassChoiceOptionKey,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
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

function classChoiceTarget(entry: CharacterClassEntry, level: number, choiceId?: string): string {
  const params = new URLSearchParams({
    class: `${entry.name}|${entry.source ?? ''}`,
    level: String(level),
  })
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
    (value.classSource ?? '') === (entry.source ?? '') &&
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
  const classDataByKey = new Map(
    calculation.classes.map((classData) => [readinessClassKey(classData), classData]),
  )
  const selections = new Map(
    (character.classChoiceSelections ?? []).map((selection) => [selection.choiceId, selection]),
  )

  for (const entry of entries) {
    const classData = classDataByKey.get(readinessClassKey(entry))
    if (!classData) continue
    const subclassInfo = getSubclassSelectionInfo(classData)
    if (
      (classData.subclasses?.length ?? 0) > 0 &&
      entry.levels >= subclassInfo.subclassLevel &&
      !entry.subclass
    ) {
      issues.push(
        readinessIssue(
          classSubclassReadinessId(readinessClassKey(entry)),
          'blocking',
          'class',
          'Choose a subclass',
          `${entry.name} requires a subclass choice at class level ${subclassInfo.subclassLevel}.`,
          classChoiceTarget(entry, subclassInfo.subclassLevel),
        ),
      )
    }

    for (const choice of classData.normalizedRules?.choices ?? []) {
      const required = getRequiredChoiceSelectionCount(choice, entry.levels)
      if (required <= 0) continue
      const storedSelection = selections.get(choice.id)?.selected ?? []
      const eligibleOptionKeys = catalogs
        ? new Set(
            resolveClassChoiceOptions(choice, catalogs).map((option) =>
              getClassChoiceOptionKey(option.reference),
            ),
          )
        : undefined
      const count = eligibleOptionKeys
        ? storedSelection.filter((option) =>
            eligibleOptionKeys.has(getClassChoiceOptionKey(option)),
          ).length
        : storedSelection.length
      if (count !== required) {
        issues.push(
          readinessIssue(
            classChoiceReadinessId(choice.id),
            'blocking',
            'class',
            `Finish ${choice.label}`,
            `${entry.name} requires ${required} eligible ${required === 1 ? 'selection' : 'selections'} here; ${count} are stored.`,
            classChoiceTarget(entry, choice.level, choice.id),
          ),
        )
      }
    }
    for (const diagnostic of classData.normalizedRules?.choiceDiagnostics ?? []) {
      if ((diagnostic.level ?? 1) > entry.levels) continue
      issues.push(
        readinessIssue(
          classChoiceDiagnosticReadinessId(
            readinessClassKey(entry),
            diagnostic.featureName,
            diagnostic.code,
          ),
          'blocking',
          'class',
          `Review unresolved ${diagnostic.featureName} choice`,
          diagnostic.message,
          classChoiceTarget(entry, diagnostic.level ?? 1),
        ),
      )
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
