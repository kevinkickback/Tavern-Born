import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { projectEffectiveClassChoiceFeatures } from '@/lib/character/effectiveClassChoiceFeatures'
import { buildEffectivePrerequisiteSnapshot } from './prerequisiteSnapshot'

export * from './prerequisiteRules'

export function buildPrerequisiteSnapshot({
  classChoiceFeatureCatalogs,
  ...params
}: Parameters<typeof buildEffectivePrerequisiteSnapshot>[0] & {
  classChoiceFeatureCatalogs?: ClassChoiceFeatureCatalogs
}) {
  return buildEffectivePrerequisiteSnapshot({
    ...params,
    character: params.character
      ? projectEffectiveClassChoiceFeatures(
          params.character,
          classChoiceFeatureCatalogs,
          params.effectiveSpellProfiles,
        )
      : null,
  })
}
