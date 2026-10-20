import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import {
  type FixedProficiencyRelation,
  getFixedProficiencyId,
} from '@/lib/5etools/fixedProficiencyIdentity'
import {
  type FixedProficiencyRule,
  fixedProficiencyRule,
} from '@/lib/5etools/fixedProficiencyRules'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/fixedProficiencySource'
import { getSubclassProficiencyOwner } from '@/lib/5etools/subclassProficiencyCertificates'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'

export interface CurrentFixedProficiency extends FixedProficiencyRelation {
  id: string
  rule: FixedProficiencyRule
  sourceName: string
  sourceRef: string
}
/** Establish the unique selected current owner before invoking any supplied-root source audit. */
export function getCurrentFixedProficiencies(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
): CurrentFixedProficiency[] {
  const result: CurrentFixedProficiency[] = []
  const key = (name: string, source: string) =>
    JSON.stringify([canonicalProficiencyName(name), canonicalProficiencyName(source)])
  for (const selected of character.classProgression) {
    if (
      character.classProgression.filter(
        (row) => key(row.name, row.source) === key(selected.name, selected.source),
      ).length !== 1
    )
      continue
    const parents = (catalogs?.classes ?? []).filter(
      (row) => key(row.name, row.source) === key(selected.name, selected.source),
    )
    if (parents.length !== 1 || !catalogs) continue
    const cls = parents[0]
    const push = (
      relation: FixedProficiencyRelation,
      rule: FixedProficiencyRule,
      sourceName: string,
      sourceRef: string,
    ) => {
      if (relation.level <= selected.levels)
        result.push({
          ...relation,
          id: getFixedProficiencyId(relation),
          rule,
          sourceName,
          sourceRef,
        })
    }
    for (const rule of getCurrentDirectFixedClassRules(cls, catalogs))
      push(
        {
          owner: [cls.name.trim().toLowerCase(), cls.source.trim().toLowerCase()],
          target: rule.target,
          level: rule.level,
        },
        rule,
        cls.name,
        cls.source,
      )
    if (!selected.subclass || !selected.subclassSource || !catalogs.subclassTargets) continue
    const owner = [cls.name, cls.source, selected.subclass, selected.subclassSource].map((value) =>
      value.trim().toLowerCase(),
    ) as [string, string, string, string]
    const roots = (cls.subclasses ?? []).filter(
      (row) => JSON.stringify(getSubclassProficiencyOwner(row)) === JSON.stringify(owner),
    )
    if (roots.length !== 1) continue
    const sub = roots[0]
    const scoped = scopeClassChoiceFeatureCatalogs(
      catalogs,
      getFeatureOwnerKey(cls.name, cls.source, sub.name, sub.source),
    )
    if (!scoped.subclassFeatureCandidates) continue
    const certificate = getCurrentSubclassProficiencyCertificate(
      cls,
      sub,
      scoped.subclassFeatureCandidates,
    )
    for (const path of certificate?.paths ?? []) {
      const rule = fixedProficiencyRule(path.target)
      if (rule && rule.kind !== 'proficient-tools')
        push({ owner, target: path.target, level: path.level }, rule, sub.name, sub.source)
    }
  }
  return result
}
