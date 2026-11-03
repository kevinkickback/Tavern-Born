import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  normalizeFavoredEnemyChoices,
  resolveFavoredEnemyOption,
} from '@/lib/5etools/favoredEnemyChoices'
import { decodeFavoredEnemyChoiceId } from '@/lib/5etools/favoredEnemyIdentity'
import { collectUnconditionalFeatureReferences } from '@/lib/5etools/unconditionalFeatureReferences'
import {
  getInvalidFavoredEnemySelectionIds,
  hasCompleteEnemyAllocation,
} from '@/lib/schema/favoredEnemyValidation'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { hasProficiencyCatalogTarget } from './classProficiencyVocabulary'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

/** Shared current source/activity authority below proficiency projection and choice presentation. */
export function getFavoredEnemyAuthority(
  character: Character,
  classes: readonly Class5e[],
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const saved = character.classChoiceSelections ?? []
  if (!saved.some((s) => decodeFavoredEnemyChoiceId(s.choiceId))) return []
  const invalid = getInvalidFavoredEnemySelectionIds(saved)
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return saved.flatMap((raw) => {
    const relation = decodeFavoredEnemyChoiceId(raw.choiceId)
    if (!relation) return []
    const inactive = activity.suppressed(
      optionalClassOwner({
        name: raw.className,
        source: raw.classSource,
        subclassName: raw.subclassName,
        subclassSource: raw.subclassSource,
      }),
      relation.grant,
      'favored-enemy-language',
    )
    const selection: CharacterClassChoiceSelection =
      !!raw.inactive === inactive
        ? raw
        : inactive
          ? { ...raw, inactive: true }
          : (({ inactive: _hint, ...active }) => active)(raw)
    const owner = findClassReference(
      { name: selection.className, source: selection.classSource },
      character.classProgression,
    )
    const classData = owner && findClassReference(owner, classes)
    const choice =
      classData && owner && owner.levels >= selection.classLevel && !invalid.has(selection.choiceId)
        ? normalizeFavoredEnemyChoices(
            { type: 'class', name: classData.name, source: classData.source },
            collectUnconditionalFeatureReferences(classData.classFeatureRefs ?? [], 'classFeature'),
            catalogs ?? { classFeatures: [] },
          ).choices.find((c) => c.id === selection.choiceId && activity.choice(c))
        : undefined
    const enemyAvailable =
      !!choice && selection.selected.every((o) => !!resolveFavoredEnemyOption(o, catalogs))
    const complete = enemyAvailable && hasCompleteEnemyAllocation(selection) && !inactive
    const language = selection.favoredEnemy?.language
    const languageAvailable =
      language?.kind === 'none' ||
      (language?.kind === 'spoken' &&
        hasProficiencyCatalogTarget(getProficiencyOption('languages', language.name), catalogs)) ||
      false
    const recovery =
      !inactive &&
      (!choice || !enemyAvailable || (language?.kind === 'spoken' && !languageAvailable))
    return [
      {
        selection,
        relation,
        owner,
        classData,
        choice,
        enemyAvailable,
        complete,
        languageAvailable,
        recovery,
      },
    ]
  })
}
