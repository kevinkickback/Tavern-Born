import { findClassReference } from '@/lib/5etools/classReference'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { ClassProficiencyDomain, NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs, ClassChoiceOptionView } from './classChoiceOptions'
import { getEffectiveOwnerProficiencyChoices } from './classProficiencyAuthority'
import { resolveClassProficiencyOptions } from './classProficiencyOptions'
import { getClassProficiencySelectionStates } from './classProficiencySelections'
import { resolveHistoricalProficiencyChoice } from './historicalProficiencyChoices'

interface ClassProficiencyWorkflow {
  id: string
  label: string
  className: string
  classSource: string
  subclassName?: string
  subclassSource?: string
  level: number
  domain: ClassProficiencyDomain
  choice?: NormalizedCharacterChoice
  selection?: CharacterClassChoiceSelection
  options: ClassChoiceOptionView[]
}

/** One shared model for per-feature editing, Class progress, and route focus. */
export function getClassProficiencyWorkflow(
  character: Character | null,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassProficiencyWorkflow[] {
  if (!character || !catalogs) return []
  const states = getClassProficiencySelectionStates(character, classes, catalogs)
  const rows = new Map<string, ClassProficiencyWorkflow>()
  for (const owner of character.classProgression ?? []) {
    const cls = findClassReference(owner, classes)
    if (!cls) continue
    for (const original of getEffectiveOwnerProficiencyChoices(character, owner, catalogs)) {
      const choice = resolveHistoricalProficiencyChoice(character, original)
      if (choice.level > owner.levels) continue
      const selection = states.find((row) => row.selection.choiceId === choice.id)?.selection
      rows.set(choice.id, {
        id: choice.id,
        label: choice.label,
        className: owner.name,
        classSource: owner.source,
        subclassName: choice.owner.subclassName,
        subclassSource: choice.owner.subclassSource,
        level: choice.level,
        domain: choice.proficiencyDomain!,
        choice,
        selection,
        options: resolveClassProficiencyOptions(
          choice,
          catalogs,
          selection?.selected ?? [],
          character,
        ),
      })
    }
  }
  for (const state of states) {
    if (rows.has(state.selection.choiceId) || !state.proficiency) continue
    rows.set(state.selection.choiceId, {
      id: state.selection.choiceId,
      label: state.selection.label,
      className: state.selection.className,
      classSource: state.selection.classSource,
      subclassName: state.selection.subclassName,
      subclassSource: state.selection.subclassSource,
      level: state.selection.classLevel,
      domain: state.proficiency.domain,
      selection: state.selection,
      options: state.options,
    })
  }
  return [...rows.values()]
}
