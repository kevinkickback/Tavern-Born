import {
  decodeClassProficiencyChoiceId,
  isClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import type { SourceTag } from '@/lib/provenance/types'
import {
  getInvalidClassProficiencySelectionIds,
  isValidClassProficiencySelection,
} from '@/lib/schema/classProficiencyValidation'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { ClassChoiceDiagnostic } from '@/types/classRules'
import { getClassChoiceFeatureTarget } from './classChoiceIdentity'
import type { ClassChoiceFeatureCatalogs } from './classChoiceOptions'
import { projectOwnedProficiencies } from './classProficiencyFoundation'
import { resolveClassProficiencyOptions } from './classProficiencyOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'
import { resolveHistoricalProficiencyChoice } from './historicalProficiencyChoices'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

function sameAppliedProficiencies(left: Character, right: Character): boolean {
  for (const domain of Object.keys(left.proficiencies) as Array<keyof Character['proficiencies']>) {
    const before = left.proficiencies[domain],
      after = right.proficiencies[domain]
    if (before.length !== after.length || before.some((value, index) => value !== after[index]))
      return false
    const previous = left.provenance?.proficiencies[domain],
      next = right.provenance?.proficiencies[domain]
    if (!previous || !next) {
      if (previous !== next) return false
      continue
    }
    const keys = Object.keys(previous)
    if (keys.length !== Object.keys(next).length) return false
    for (const key of keys) {
      const tags = previous[key],
        other = next[key]
      if (!other || tags.length !== other.length) return false
      if (
        tags.some((tag, index) => {
          const fields = Object.keys(tag) as Array<keyof SourceTag>
          return (
            fields.length !== Object.keys(other[index]).length ||
            fields.some((field) => tag[field] !== other[index][field])
          )
        })
      )
        return false
    }
  }
  return true
}

export function getClassProficiencySelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): FeatureOptionSelectionState[] {
  const projection = projectOwnedProficiencies(character, catalogs)
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const invalid = getInvalidClassProficiencySelectionIds(character.classChoiceSelections ?? [])
  return (character.classChoiceSelections ?? [])
    .filter(
      (selection) =>
        isClassProficiencyChoiceId(selection.choiceId) || selection.kind === 'proficiency',
    )
    .map((selection) => {
      const relation = decodeClassProficiencyChoiceId(selection.choiceId)
      const owner = findClassReference(
        { name: selection.className, source: selection.classSource },
        character.classProgression,
      )
      const classData = owner ? findClassReference(owner, classes) : undefined
      const dormant =
        !!relation &&
        activity.dormant(
          optionalClassOwner({
            name: selection.className,
            source: selection.classSource,
            subclassName: selection.subclassName,
            subclassSource: selection.subclassSource,
          }),
          relation.target,
        )
      const currentChoice =
        classData &&
        owner &&
        !invalid.has(selection.choiceId) &&
        isValidClassProficiencySelection(selection)
          ? projection.current
              .map((row) => row.choice)
              .find(
                (candidate) =>
                  candidate.id === selection.choiceId && candidate.level <= owner.levels,
              )
          : undefined
      const choice = currentChoice && resolveHistoricalProficiencyChoice(character, currentChoice)
      const options =
        choice && catalogs
          ? resolveClassProficiencyOptions(
              choice,
              catalogs,
              selection.selected,
              character,
              projection,
            )
          : selection.selected.map((reference) => ({
              reference,
              availability: 'retained' as const,
              entries: [],
            }))
      const recovery =
        !dormant &&
        (!choice ||
          (choice.maximumSelections > 0 &&
            !options.some((option) => option.availability === 'eligible')))
      return {
        selection: { ...selection, ...(dormant ? { inactive: true } : { inactive: undefined }) },
        owner,
        classData,
        choice,
        options,
        recovery,
        proficiency: relation ? { domain: relation.domain } : undefined,
        details: selection.selected.map((reference) => {
          const option = options.find((candidate) => candidate.reference.ref === reference.ref)
          return {
            name: reference.name,
            entries: option?.entries ?? [],
            available: !dormant && option?.availability === 'eligible',
          }
        }),
      }
    })
}

/** Source refresh derives benefits without writes or promotion of stale materialization to manual. */
export function refreshClassProficiencyState(
  character: Character,
  _classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): Character {
  const result = projectOwnedProficiencies(character, catalogs).effective
  return sameAppliedProficiencies(character, result) ? character : result
}

export function hasClassProficiencyRecovery(
  diagnostic: ClassChoiceDiagnostic,
  states: readonly FeatureOptionSelectionState[],
) {
  const target =
    diagnostic.requiredChoice && getClassChoiceFeatureTarget(diagnostic.requiredChoice.target)
  if (!target) return false
  const key = (value: string | undefined) => value?.trim().toLowerCase() ?? ''
  return states.some(
    (state) =>
      state.proficiency &&
      state.recovery &&
      !state.selection.inactive &&
      decodeClassProficiencyChoiceId(state.selection.choiceId)?.target === target &&
      state.selection.classLevel === diagnostic.level &&
      key(state.selection.className) === key(diagnostic.className) &&
      key(state.selection.classSource) === key(diagnostic.classSource) &&
      key(state.selection.subclassName) === key(diagnostic.subclassName) &&
      key(state.selection.subclassSource) === key(diagnostic.subclassSource),
  )
}
