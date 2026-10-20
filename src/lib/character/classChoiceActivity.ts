import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { decodeNaturalExplorerChoiceId } from '@/lib/5etools/naturalExplorerIdentity'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceCandidates } from './classChoiceOptions'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

/** Read-only effective selection view. Only domain commands reconcile persisted inactivity hints. */
export function getEffectiveClassChoiceSelections(
  character: Pick<
    Character,
    'classChoiceSelections' | 'variantRules' | 'classProgression' | 'optionalClassFeatureAdoptions'
  >,
  classes: readonly Class5e[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): readonly CharacterClassChoiceSelection[] {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const candidates = new Map(
    character.classProgression
      .flatMap((entry) => {
        const cls = findClassReference(entry, classes)
        return cls
          ? getClassChoiceCandidates(cls, getSelectedSubclassData(cls, entry), catalogs)
          : []
      })
      .map((row) => [row.id, row]),
  )
  return (character.classChoiceSelections ?? []).map((selection) => {
    const owner = optionalClassOwner({
      name: selection.className,
      source: selection.classSource,
      subclassName: selection.subclassName,
      subclassSource: selection.subclassSource,
    })
    const proficiency = decodeClassProficiencyChoiceId(selection.choiceId)
    const terrain = decodeNaturalExplorerChoiceId(selection.choiceId)
    const candidate = candidates.get(selection.choiceId)
    const inactive = proficiency
      ? activity.dormant(owner, proficiency.target)
      : terrain
        ? activity.suppressed(owner, terrain.grant, 'favored-terrain')
        : candidate
          ? !activity.choice(candidate)
          : !!selection.inactive
    if (!!selection.inactive === inactive) return selection
    if (inactive) return { ...selection, inactive: true }
    const { inactive: _hint, ...active } = selection
    return active
  })
}
