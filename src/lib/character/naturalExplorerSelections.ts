import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import {
  decodeNaturalExplorerChoiceId,
  getNaturalExplorerChoiceId,
} from '@/lib/5etools/naturalExplorerIdentity'
import { getNaturalExplorerSources } from '@/lib/5etools/naturalExplorerSource'
import { getInvalidNaturalExplorerSelectionIds } from '@/lib/schema/naturalExplorerValidation'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { getEffectiveClassChoiceSelections } from './classChoiceActivity'
import { getClassChoiceOptionKey } from './classChoiceIdentity'
import {
  type ClassChoiceFeatureCatalogs,
  type ClassChoiceOptionView,
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import type { FeatureOptionSelectionState } from './featureOptionSelections'

/** Other earned gains occupy their own literals, independent of saved order or the current edit. */
export function scopeNaturalExplorerOptions(
  choice: Pick<NormalizedCharacterChoice, 'id'>,
  options: ClassChoiceOptionView[],
  selections: readonly CharacterClassChoiceSelection[],
): ClassChoiceOptionView[] {
  const relation = decodeNaturalExplorerChoiceId(choice.id)
  if (!relation) return options
  const occupied = new Set(
    selections.flatMap((selection) => {
      const other = decodeNaturalExplorerChoiceId(selection.choiceId)
      return other &&
        selection.choiceId !== choice.id &&
        JSON.stringify(other.owner) === JSON.stringify(relation.owner) &&
        other.pool === relation.pool &&
        other.group === relation.group
        ? selection.selected.map(getClassChoiceOptionKey)
        : []
    }),
  )
  return options.map((option) =>
    occupied.has(getClassChoiceOptionKey(option.reference))
      ? {
          ...option,
          availability: 'retained' as const,
          entries: ['Already selected by another earned Natural Explorer choice.'],
        }
      : option,
  )
}
export function getNaturalExplorerSelectionStates(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): FeatureOptionSelectionState[] {
  const selections = getEffectiveClassChoiceSelections(character, classes, catalogs)
  const invalid = getInvalidNaturalExplorerSelectionIds(character.classChoiceSelections ?? [])
  const seenContext = new Set<string>()
  return selections
    .filter((selection) => isFeatureLiteralChoiceId(selection.choiceId))
    .sort((left, right) => left.classLevel - right.classLevel)
    .map((selection) => {
      const relation = decodeNaturalExplorerChoiceId(selection.choiceId)
      const owner = findClassReference(
        { name: selection.className, source: selection.classSource },
        character.classProgression,
      )
      const classData = owner ? findClassReference(owner, classes) : undefined
      const choice =
        classData && owner && !invalid.has(selection.choiceId)
          ? getCharacterClassChoices(
              classData,
              undefined,
              character.variantRules?.optionalClassFeatures ?? false,
              catalogs,
            ).find(
              (candidate) =>
                candidate.id === selection.choiceId &&
                candidate.level === selection.classLevel &&
                candidate.level <= owner.levels &&
                selection.selected.every((option) => option.slotLevel === candidate.level),
            )
          : undefined
      const options: ClassChoiceOptionView[] =
        choice && owner
          ? scopeNaturalExplorerOptions(
              choice,
              resolveClassChoiceOptions(
                choice,
                createClassChoiceCatalogs(catalogs),
                selection.selected,
                owner.levels,
              ),
              character.classChoiceSelections ?? [],
            )
          : selection.selected.map((reference) => ({
              reference,
              availability: 'retained' as const,
              entries: [],
            }))
      const recovery =
        !selection.inactive &&
        (!choice || !options.some((option) => option.availability === 'eligible'))
      const family = relation
        ? JSON.stringify([relation.owner, relation.pool, relation.group])
        : selection.choiceId
      const details = selection.selected.map((selected) => {
        const option = options.find(
          (row) => getClassChoiceOptionKey(row.reference) === getClassChoiceOptionKey(selected),
        )
        const available =
          !selection.inactive &&
          !recovery &&
          option?.availability === 'eligible' &&
          !!option.sourceGroup &&
          !!relation &&
          !!getNaturalExplorerSources(catalogs).get(relation.grant)
        const entries = selection.inactive
          ? []
          : available
            ? seenContext.has(family)
              ? []
              : option?.entries
            : [
                'Current favored-terrain rules are unavailable. Restore the exact pool and earned grant or remove this saved choice.',
              ]
        if (available) seenContext.add(family)
        return { name: selected.name, available, entries }
      })
      return {
        selection,
        owner,
        classData,
        choice,
        options,
        recovery,
        details,
        literalGroup: { family, group: 'favored-terrain', gain: selection.classLevel },
      }
    })
}

/** A saved recovery is the single obligation for its complete owner/grant/earned relation. */
export function hasNaturalExplorerRecovery(
  diagnostic: ClassChoiceDiagnostic,
  states: readonly FeatureOptionSelectionState[],
): boolean {
  const reference = diagnostic.requiredChoice?.target
  if (
    reference?.entityType !== 'classFeature' ||
    !reference.ref ||
    diagnostic.subclassName ||
    diagnostic.subclassSource
  )
    return false
  const target = getClassFeatureIdentity(decodeClassFeatureReference(reference.ref))
  if (!target) return false
  const id = getNaturalExplorerChoiceId(
    { name: diagnostic.className, source: diagnostic.classSource },
    target,
    diagnostic.level ?? 1,
  )
  return (
    !!decodeNaturalExplorerChoiceId(id) &&
    states.some(
      (state) =>
        state.literalGroup &&
        !state.selection.inactive &&
        state.recovery &&
        state.selection.choiceId === id,
    )
  )
}
