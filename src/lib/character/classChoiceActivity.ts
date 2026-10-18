import { findClassReference } from '@/lib/5etools/classReference'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import { isNaturalExplorerReplaced } from '@/lib/5etools/naturalExplorerChoices'
import type { ClassFeatureSourceCatalog } from '@/lib/5etools/naturalExplorerSource'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'

/** Read-only effective selection view. Only domain commands reconcile persisted inactivity hints. */
export function getEffectiveClassChoiceSelections(
  character: Pick<Character, 'classChoiceSelections' | 'variantRules' | 'classProgression'>,
  classes: readonly Class5e[],
  catalogs: ClassFeatureSourceCatalog | undefined,
  includeVariants = character.variantRules?.optionalClassFeatures ?? false,
): readonly CharacterClassChoiceSelection[] {
  const policies = new Map<Class5e | undefined, boolean>()
  return (character.classChoiceSelections ?? []).map((selection) => {
    if (!isFeatureLiteralChoiceId(selection.choiceId)) return selection
    const owner = findClassReference(
      { name: selection.className, source: selection.classSource },
      character.classProgression,
    )
    const classData = owner ? findClassReference(owner, classes) : undefined
    if (!policies.has(classData))
      policies.set(classData, isNaturalExplorerReplaced(classData, includeVariants, catalogs))
    const inactive = policies.get(classData)!
    if (!!selection.inactive === inactive) return selection
    if (inactive) return { ...selection, inactive: true }
    const { inactive: _hint, ...active } = selection
    return active
  })
}
