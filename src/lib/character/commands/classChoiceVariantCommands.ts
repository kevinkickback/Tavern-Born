import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import { getEffectiveClassChoiceSelections } from '@/lib/character/classChoiceActivity'
import {
  type ClassChoiceFeatureCatalogs,
  getCharacterClassChoices,
  getClassChoiceCandidates,
} from '@/lib/character/classChoiceOptions'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import type { ManagedClassSpellContext } from '@/lib/character/managedClassSpells'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  reconcileClassChoiceFeatMirror,
  reconcileClassChoiceSelectionGrants,
} from './classChoiceCommands'
import type { CharacterCommandResult } from './commandResult'
import { projectProficiencyCommandResult } from './proficiencyProjection'

function uniqueChoices(choices: readonly NormalizedCharacterChoice[]): NormalizedCharacterChoice[] {
  return [...new Map(choices.map((choice) => [choice.id, choice])).values()]
}

/**
 * Activates the original or replacement side of optional class-feature choices atomically.
 * Dormant selections are retained so toggling the rule back restores the prior choice, while
 * features and feat mirrors are rebuilt from active selections only. The complete catalog scopes
 * persisted replacement families; the source-filtered catalog determines which side may activate.
 */
export function reconcileOptionalClassFeatureChoicesCommand(
  character: Character,
  ledger: ProvenanceLedger,
  catalogs: {
    availableClasses: readonly Class5e[]
    allClasses: readonly Class5e[]
    classChoiceFeatureCatalogs?: ClassChoiceFeatureCatalogs
    spellContext?: ManagedClassSpellContext
  },
  includeVariants: boolean,
): CharacterCommandResult {
  const proposed = {
    ...character,
    variantRules: { ...character.variantRules, optionalClassFeatures: includeVariants },
  }
  const activity = createOptionalClassFeatureActivity(proposed, catalogs.classChoiceFeatureCatalogs)
  const allChoices: NormalizedCharacterChoice[] = []
  const activeChoiceIds = new Set<string>()

  for (const entry of character.classProgression) {
    const scopedClassData = findClassReference(entry, catalogs.allClasses)
    if (scopedClassData) {
      const scopedSubclass = getSelectedSubclassData(scopedClassData, entry)
      allChoices.push(
        ...getClassChoiceCandidates(
          scopedClassData,
          scopedSubclass,
          catalogs.classChoiceFeatureCatalogs,
        ),
      )
    }

    const availableClassData = findClassReference(entry, catalogs.availableClasses)
    if (!availableClassData) continue
    const availableSubclass = getSelectedSubclassData(availableClassData, entry)
    for (const choice of getCharacterClassChoices(
      availableClassData,
      availableSubclass,
      activity,
      catalogs.classChoiceFeatureCatalogs,
    )) {
      activeChoiceIds.add(choice.id)
    }
  }

  const scopedChoices = uniqueChoices(allChoices)
  const scopedChoiceIds = new Set(scopedChoices.map((choice) => choice.id))
  const effective = new Map(
    getEffectiveClassChoiceSelections(
      proposed,
      catalogs.availableClasses,
      catalogs.classChoiceFeatureCatalogs,
    ).map((selection) => [selection.choiceId, selection]),
  )
  const classChoiceSelections: CharacterClassChoiceSelection[] = (
    character.classChoiceSelections ?? []
  ).map((selection) => {
    if (isFeatureLiteralChoiceId(selection.choiceId))
      return effective.get(selection.choiceId) ?? selection
    if (!scopedChoiceIds.has(selection.choiceId)) return selection
    if (!activeChoiceIds.has(selection.choiceId)) return { ...selection, inactive: true }
    const { inactive: _inactive, ...activeSelection } = selection
    return activeSelection
  })
  const grants = reconcileClassChoiceSelectionGrants(
    proposed,
    ledger,
    classChoiceSelections,
    catalogs.classChoiceFeatureCatalogs,
    catalogs.spellContext,
  )
  let workingCharacter: Character = {
    ...character,
    classChoiceSelections,
    features: grants.features,
    proficiencies: grants.proficiencies,
    provenance: grants.provenanceUpdate,
  }
  let provenanceUpdate = grants.provenanceUpdate
  let characterPatch: Partial<Character> = {
    classChoiceSelections,
    features: grants.features,
    proficiencies: grants.proficiencies,
  }

  for (const choice of scopedChoices) {
    if (choice.kind !== 'feat') continue
    const selection = classChoiceSelections.find(
      (candidate) => candidate.choiceId === choice.id && !candidate.inactive,
    )
    const featMirror = reconcileClassChoiceFeatMirror(
      workingCharacter,
      provenanceUpdate,
      choice,
      selection,
    )
    characterPatch = { ...characterPatch, ...featMirror.characterPatch }
    provenanceUpdate = featMirror.provenanceUpdate
    workingCharacter = {
      ...workingCharacter,
      ...featMirror.characterPatch,
      provenance: provenanceUpdate,
    }
  }

  if (catalogs.classChoiceFeatureCatalogs) {
    const projected = refreshClassProficiencyState(
      {
        ...workingCharacter,
        variantRules: { ...workingCharacter.variantRules, optionalClassFeatures: includeVariants },
      },
      catalogs.availableClasses,
      {
        ...catalogs.classChoiceFeatureCatalogs,
        classes: catalogs.classChoiceFeatureCatalogs.classes ?? catalogs.availableClasses,
      },
    )
    characterPatch = { ...characterPatch, proficiencies: projected.proficiencies }
    provenanceUpdate = projected.provenance
  }
  return projectProficiencyCommandResult(
    {
      ...character,
      variantRules: { ...character.variantRules, optionalClassFeatures: includeVariants },
    },
    { characterPatch, provenanceUpdate },
    catalogs.classChoiceFeatureCatalogs,
  )
}
