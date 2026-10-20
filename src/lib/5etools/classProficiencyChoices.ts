import type { Class5e, ClassFeature } from '@/types/5etools'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { normalizeCannyChoices } from './cannyChoices'
import { decodeClassFeatureReference, getClassFeatureIdentity } from './classFeatureIdentity'
import {
  decodeClassProficiencyChoiceId,
  getClassProficiencyChoiceId,
} from './classProficiencyIdentity'
import { CLASS_PROFICIENCY_RULES, classProficiencyRule } from './classProficiencyRules'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import { DEFT_EXPLORER_TARGET } from './naturalExplorerIdentity'
import { type ClassFeatureSourceCatalog, getNaturalExplorerSources } from './naturalExplorerSource'
import {
  collectUnconditionalFeatureReferences,
  type UnconditionalFeatureReference,
} from './unconditionalFeatureReferences'

function isAuditedClassProficiencyFeature(
  feature: ClassFeature | Record<string, unknown> | undefined,
): boolean {
  if (!feature || feature.featureOptionSourceConflict || !Array.isArray(feature.entries))
    return false
  const rule = classProficiencyRule(getClassFeatureIdentity(feature) ?? '')
  return (
    !!rule &&
    hasFeatureSourceShape(feature, new Set(rule.fields)) &&
    (feature.isClassFeatureVariant === true) === rule.optional &&
    getFeatureSourceDigest(feature.entries, false) === rule.digest
  )
}

/** Challenge every producer before the parser's first-match projection. */
export function auditClassProficiencySources(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  const invalid = new Set<string>()
  const cleaned = records.map((record) => {
    const target = getClassFeatureIdentity(record)
    if (!target || !classProficiencyRule(target)) return record
    const { featureOptionSourceConflict: _derived, ...feature } = record
    if (!isAuditedClassProficiencyFeature(feature)) invalid.add(target)
    return feature
  })
  return cleaned.map((feature) =>
    invalid.has(getClassFeatureIdentity(feature) ?? '')
      ? { ...feature, featureOptionSourceConflict: true }
      : feature,
  )
}

const sourceCache = new WeakMap<object, ReadonlyMap<string, ClassFeature>>()
function getClassProficiencySources(
  catalogs: ClassFeatureSourceCatalog | undefined,
): ReadonlyMap<string, ClassFeature> {
  if (!catalogs) return new Map()
  const snapshot = catalogs.classFeatureCandidates ?? catalogs.classFeatures
  const cached = sourceCache.get(snapshot)
  if (cached) return cached
  const sources = new Map<string, ClassFeature>()
  for (const rule of CLASS_PROFICIENCY_RULES) {
    const candidates =
      catalogs.classFeatureCandidates !== undefined
        ? (catalogs.classFeatureCandidates.get(rule.target) ?? [])
        : catalogs.classFeatures.filter(
            (feature) => getClassFeatureIdentity(feature) === rule.target,
          )
    if (
      candidates.length === 1 &&
      isAuditedClassProficiencyFeature(candidates[0]) &&
      (rule.target !== DEFT_EXPLORER_TARGET || getNaturalExplorerSources(catalogs).get(rule.target))
    )
      sources.set(rule.target, candidates[0])
  }
  sourceCache.set(snapshot, sources)
  return sources
}

export function normalizeClassProficiencyChoices(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
) {
  const canny = normalizeCannyChoices(owner, declarations)
  const choices: NormalizedCharacterChoice[] = [...canny.choices]
  const diagnostics: ClassChoiceDiagnostic[] = [...canny.diagnostics]
  for (const rule of CLASS_PROFICIENCY_RULES) {
    if (rule.target === DEFT_EXPLORER_TARGET) continue
    const rows = declarations.filter(
      (row) => row.kind === 'classFeature' && row.target === rule.target,
    )
    if (!rows.length) continue
    const row = rows[0]
    const target = decodeClassFeatureReference(row.reference.ref!)
    const declared = {
      ...target,
      ...Object.fromEntries(
        Object.entries(row.reference).filter(([, value]) => value !== undefined),
      ),
    }
    if (
      rows.length !== 1 ||
      getClassFeatureIdentity(declared) !== rule.target ||
      !isAuditedClassProficiencyFeature(row.reference.feature)
    ) {
      diagnostics.push({
        code: 'unverified-required-choice',
        className: owner.name,
        classSource: owner.source,
        featureName: target.name,
        level: row.level,
        message: `${target.name} proficiency rules are unavailable, conflicting or changed. Restore the exact feature declaration.`,
        requiredChoice: {
          target: {
            entityType: 'classFeature',
            name: target.name,
            source: target.source,
            ref: row.reference.ref!,
          },
        },
      })
      continue
    }
    for (const domain of rule.domains)
      choices.push({
        id: getClassProficiencyChoiceId(owner, rule.target, domain.domain, row.level),
        label: target.name === 'Expertise' ? 'Expertise' : `${target.name} ${domain.domain}`,
        kind: 'proficiency',
        proficiencyDomain: domain.domain,
        owner: { ...owner, featureName: target.name, featureSource: target.source },
        level: row.level,
        minimumSelections: domain.count,
        maximumSelections: domain.count,
        selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
          index + 1 >= row.level ? domain.count : 0,
        ),
        options: [],
        repeatable: false,
        replacement: { cadence: 'never' },
        source: { kind: 'class-feature-options', field: 'entries' },
      })
  }
  return { choices, diagnostics }
}

export function getCurrentClassProficiencyChoices(
  classData: Pick<Class5e, 'name' | 'source' | 'classFeatureRefs'>,
  includeVariants: boolean,
  catalogs: ClassFeatureSourceCatalog | undefined,
): NormalizedCharacterChoice[] {
  const sources = getClassProficiencySources(catalogs)
  return normalizeClassProficiencyChoices(
    { type: 'class', name: classData.name, source: classData.source },
    collectUnconditionalFeatureReferences(classData.classFeatureRefs ?? [], 'classFeature'),
  ).choices.filter((choice) => {
    const target = classProficiencyRule(decodeClassProficiencyChoiceId(choice.id)?.target ?? '')
    return !!target && sources.has(target.target) && (includeVariants || !target.optional)
  })
}
