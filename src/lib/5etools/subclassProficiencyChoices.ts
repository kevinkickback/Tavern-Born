import type { Subclass5e, SubclassFeature, SubclassFeatureReference } from '@/types/5etools'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getClassProficiencyChoiceId } from './classProficiencyIdentity'
import { classProficiencyRule } from './classProficiencyRules'
import { getSubclassProficiencyRootCertificate } from './subclassProficiencyRegistry'
import { getCurrentSubclassProficiencyCertificate } from './subclassProficiencySource'

/** Reconstruct declarations from the certified current path; cached quota/owner fields confer no authority. */
export function normalizeSubclassProficiencyChoices(
  owner: NormalizedCharacterChoice['owner'],
  subclass: Subclass5e,
  refs: readonly SubclassFeatureReference[],
  candidates?: ReadonlyMap<string, readonly SubclassFeature[]>,
): NormalizedCharacterChoice[] {
  const embedded = new Map<string, SubclassFeature[]>()
  const seen = new Set<object>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = value as Record<string, unknown>
    const target = getSubclassFeatureIdentity(record)
    if (target && Array.isArray(record.entries))
      embedded.set(target, [...(embedded.get(target) ?? []), record as unknown as SubclassFeature])
    if (record.type !== 'options') Object.values(record).forEach(visit)
  }
  for (const ref of refs) visit(ref.feature)
  const certificate = getCurrentSubclassProficiencyCertificate(
    owner,
    { ...subclass, subclassFeatureRefs: [...refs] },
    candidates ?? embedded,
  )
  if (!certificate) return []
  return certificate.paths.flatMap((path) => {
    const rule = classProficiencyRule(path.target)
    const target = (candidates ?? embedded).get(path.target)?.[0]
    if (!target) return []
    return (rule?.domains ?? []).map((domain) => ({
      id: getClassProficiencyChoiceId(owner, path.target, domain.domain, path.level),
      label: `${target.name} ${domain.domain}`,
      kind: 'proficiency' as const,
      proficiencyDomain: domain.domain,
      owner: { ...owner, featureName: target.name, featureSource: target.source },
      level: path.level,
      minimumSelections: domain.count,
      maximumSelections: domain.count,
      selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
        index + 1 >= path.level ? domain.count : 0,
      ),
      options: [],
      repeatable: false,
      replacement: { cadence: 'never' as const },
      source: { kind: 'class-feature-options' as const, field: 'entries' },
    }))
  })
}

/** A known selected printing whose required source cannot qualify stays visibly unverified. */
export function getSubclassProficiencyDiagnostics(
  owner: NormalizedCharacterChoice['owner'],
  choices: readonly NormalizedCharacterChoice[],
): ClassChoiceDiagnostic[] {
  if (!owner.subclassName || !owner.subclassSource) return []
  const certificate = getSubclassProficiencyRootCertificate(
    [owner.name, owner.source, owner.subclassName, owner.subclassSource].map((value) =>
      value.trim().toLowerCase(),
    ),
  )
  return (certificate?.paths ?? []).flatMap((path) => {
    const rule = classProficiencyRule(path.target)
    if (!rule) return []
    if (
      rule?.domains.every((domain) =>
        choices.some(
          (choice) =>
            choice.id ===
            getClassProficiencyChoiceId(owner, path.target, domain.domain, path.level),
        ),
      )
    )
      return []
    const target = decodeSubclassFeatureReference(path.refs[path.refs.length - 1])
    return [
      {
        code: 'unverified-required-choice' as const,
        className: owner.name,
        classSource: owner.source,
        subclassName: owner.subclassName,
        subclassSource: owner.subclassSource,
        featureName: target.name,
        level: path.level,
        message: `${target.name} proficiency setup cannot be verified from the current source. Restore the exact subclass and feature declarations.`,
        requiredChoice: {
          target: {
            entityType: 'subclassFeature' as const,
            name: target.name,
            source: target.source,
            ref: target.ref,
          },
        },
      },
    ]
  })
}
