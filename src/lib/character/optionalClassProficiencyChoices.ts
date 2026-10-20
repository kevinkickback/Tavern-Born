import { getClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { getCurrentOptionalDeclaration } from '@/lib/5etools/optionalClassDeclarationSource'
import { OPTIONAL_CLASS_PROFICIENCY_RULES } from '@/lib/5etools/ownedClassProficiencyRules'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'

/** Current declaration authority supplies both earned gains; no parsed or saved choice mirror. */
export function getOptionalClassProficiencyCandidates(
  classData: { name: string; source: string },
  catalogs: ClassChoiceFeatureCatalogs | undefined,
): NormalizedCharacterChoice[] {
  return OPTIONAL_CLASS_PROFICIENCY_RULES.flatMap((rule) => {
    const declaration = getCurrentOptionalDeclaration(
      catalogs,
      [...rule.owner],
      rule.target,
      rule.rootLevel,
    )
    if (
      classData.name.trim().toLowerCase() !== rule.owner[1] ||
      classData.source.trim().toLowerCase() !== rule.owner[2] ||
      !declaration ||
      declaration.certificate.certificate !== rule.digest
    )
      return []
    const owner = {
      type: 'class' as const,
      name: classData.name,
      source: classData.source,
      featureName: rule.name,
      featureSource: rule.source,
    }
    return rule.gains.flatMap((level) =>
      rule.domains.map(
        (domain): NormalizedCharacterChoice => ({
          id: getClassProficiencyChoiceId(owner, rule.target, domain.domain, level),
          label: `${rule.name} ${domain.domain}`,
          kind: 'proficiency',
          proficiencyDomain: domain.domain,
          owner,
          level,
          minimumSelections: domain.count,
          maximumSelections: domain.count,
          selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
            index + 1 >= level ? domain.count : 0,
          ),
          options: [],
          repeatable: false,
          replacement: { cadence: 'never' },
          source: { kind: 'class-feature-options', field: 'entries' },
        }),
      ),
    )
  })
}
