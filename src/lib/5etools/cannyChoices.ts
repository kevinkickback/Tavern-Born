import type { Class5e } from '@/types/5etools'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import { getClassProficiencyChoiceId } from './classProficiencyIdentity'
import { classProficiencyRule } from './classProficiencyRules'
import { DEFT_EXPLORER_TARGET } from './naturalExplorerIdentity'
import {
  type ClassFeatureSourceCatalog,
  getNaturalExplorerSources,
  isAuditedNaturalExplorerFeature,
} from './naturalExplorerSource'
import {
  collectUnconditionalFeatureReferences,
  type UnconditionalFeatureReference,
} from './unconditionalFeatureReferences'

/** The existing complete TCE audit also owns the Canny declaration, before any live grants. */
export function normalizeCannyChoices(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
): { choices: NormalizedCharacterChoice[]; diagnostics: ClassChoiceDiagnostic[] } {
  const rows = declarations.filter(
    (row) => row.kind === 'classFeature' && row.target === DEFT_EXPLORER_TARGET,
  )
  if (!rows.length) return { choices: [], diagnostics: [] }
  const level = Math.min(...rows.map((row) => row.level))
  const declared = rows[0].reference
  const declaredTarget = getClassFeatureIdentity({
    ...decodeClassFeatureReference(declared.ref!),
    ...Object.fromEntries(Object.entries(declared).filter(([, value]) => value !== undefined)),
  })
  if (
    rows.length !== 1 ||
    declaredTarget !== DEFT_EXPLORER_TARGET ||
    !isAuditedNaturalExplorerFeature(declared.feature)
  ) {
    return {
      choices: [],
      diagnostics: [
        {
          code: 'unverified-required-choice',
          className: owner.name,
          classSource: owner.source,
          featureName: 'Deft Explorer',
          level,
          message:
            'Canny setup rules are unavailable, conflicting or changed. Restore the exact Deft Explorer declaration.',
          requiredChoice: {
            target: {
              entityType: 'classFeature',
              name: 'Deft Explorer',
              source: 'TCE',
              ref: 'Deft Explorer|Ranger|PHB|1|TCE',
            },
            replaces: 'Natural Explorer|Ranger|PHB|1|PHB',
          },
        },
      ],
    }
  }
  return {
    choices: (classProficiencyRule(DEFT_EXPLORER_TARGET)?.domains ?? []).map(
      ({ domain, count }) => ({
        id: getClassProficiencyChoiceId(owner, DEFT_EXPLORER_TARGET, domain, level),
        label: domain === 'expertise' ? 'Canny expertise' : 'Canny languages',
        kind: 'proficiency',
        proficiencyDomain: domain,
        owner: { ...owner, featureName: 'Deft Explorer', featureSource: 'TCE' },
        level,
        minimumSelections: count,
        maximumSelections: count,
        selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
          index + 1 >= level ? count : 0,
        ),
        options: [],
        repeatable: false,
        replacement: { cadence: 'never' },
        featureVariant: { replacesFeatureName: 'Natural Explorer' },
        source: { kind: 'class-feature-options', field: 'entries.Canny' },
      }),
    ),
    diagnostics: [],
  }
}

export function getCurrentCannyChoices(
  classData: Pick<Class5e, 'name' | 'source' | 'classFeatureRefs'>,
  includeVariants: boolean,
  catalogs: ClassFeatureSourceCatalog | undefined,
): NormalizedCharacterChoice[] {
  if (!includeVariants || !getNaturalExplorerSources(catalogs).get(DEFT_EXPLORER_TARGET)) return []
  return normalizeCannyChoices(
    { type: 'class', name: classData.name, source: classData.source },
    collectUnconditionalFeatureReferences(classData.classFeatureRefs ?? [], 'classFeature'),
  ).choices
}
