import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import {
  type ClassChoicePrerequisiteContext,
  projectEffectiveClassChoiceFeatures,
} from '@/lib/character/effectiveClassChoiceFeatures'
import { buildEffectivePrerequisiteSnapshot } from './prerequisiteSnapshot'

export * from './prerequisiteRules'

export function buildPrerequisiteSnapshot({
  classChoiceFeatureCatalogs,
  classChoicePrerequisites,
  ...params
}: Parameters<typeof buildEffectivePrerequisiteSnapshot>[0] & {
  classChoiceFeatureCatalogs?: ClassChoiceFeatureCatalogs
  classChoicePrerequisites?: ClassChoicePrerequisiteContext
}) {
  return buildEffectivePrerequisiteSnapshot({
    ...params,
    character: params.character
      ? projectEffectiveClassChoiceFeatures(
          params.character,
          classChoiceFeatureCatalogs,
          classChoicePrerequisites,
        )
      : null,
  })
}
