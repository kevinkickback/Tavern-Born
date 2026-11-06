import {
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
} from '@/lib/5etools/classFeatureIdentity'
import { CLASS_ORDERS } from '@/lib/5etools/classOrderIdentity'
import { canonicalProficiencyName } from '@/lib/5etools/classProficiencyIdentity'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/directFixedProficiencySource'
import {
  type FixedProficiencyRelation,
  getFixedProficiencyId,
} from '@/lib/5etools/fixedProficiencyIdentity'
import {
  type FixedProficiencyRule,
  fixedProficiencyRule,
} from '@/lib/5etools/fixedProficiencyRules'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import { getSubclassProficiencyOwner } from '@/lib/5etools/subclassProficiencyCertificates'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import { getCurrentClassOrder } from './classOrder'

export interface CurrentFixedProficiency extends FixedProficiencyRelation {
  id: string
  rule: FixedProficiencyRule
  sourceName: string
  sourceRef: string
}

function matchesGainDeclaration(ref: Record<string, unknown>, uid: unknown, target: string) {
  return (
    typeof uid === 'string' &&
    !ref.sourceIdentityConflict &&
    decodeOptionalDeclaration(uid, 'classFeature')?.target === target &&
    exactOptionalDeclarationReference(ref, uid, 'classFeature')
  )
}

function matchesNativeSubclassGain(cls: Class5e, target: string, level: number): boolean {
  if (
    cls.sourceIdentityConflict ||
    '_copy' in cls ||
    !Array.isArray(cls.classFeatures) ||
    !Array.isArray(cls.classFeatureRefs)
  )
    return false
  const rawGains = cls.classFeatures
    .map(optionalDeclarationObject)
    .filter((ref) => ref.gainSubclassFeature === true)
  const raw = rawGains[0]
  if (
    !raw ||
    !matchesGainDeclaration(raw, raw.classFeature, target) ||
    Object.keys(raw).some(
      (key) =>
        ![
          'classFeature',
          'gainSubclassFeature',
          'name',
          'source',
          'className',
          'classSource',
          'level',
        ].includes(key),
    ) ||
    rawGains.filter(
      (ref) =>
        typeof ref.classFeature === 'string' &&
        getClassFeatureReferenceLevel({ ref: ref.classFeature }) === level,
    ).length !== 1
  )
    return false

  const gains = cls.classFeatureRefs.filter((ref) => ref.gainSubclassFeature === true)
  const gain = gains[0]
  return (
    !!gain &&
    matchesGainDeclaration(optionalDeclarationObject(gain), gain.ref, target) &&
    (!gain.feature ||
      (!gain.feature.sourceIdentityConflict && getClassFeatureIdentity(gain.feature) === target)) &&
    gains.filter((ref) => getClassFeatureReferenceLevel(ref) === level).length === 1
  )
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
      true,
    )
    for (const path of certificate?.paths ?? []) {
      const rule = fixedProficiencyRule(path.target, owner)
      if (!rule) continue
      if (
        rule.subclassGain &&
        (sub.sourceIdentityConflict ||
          !getSourceCompatibility(cls.source, character.originSystem).compatible ||
          !matchesNativeSubclassGain(cls, rule.subclassGain.target, path.level))
      )
        continue
      push({ owner, target: path.target, level: path.level }, rule, sub.name, sub.source)
    }
  }
  for (const order of CLASS_ORDERS) {
    if (getCurrentClassOrder(character, order, catalogs)?.branch !== 'training') continue
    const target = order.training.target
    const rule = fixedProficiencyRule(target)
    if (!rule) continue
    const relation: FixedProficiencyRelation = { owner: [order.owner, 'xphb'], target, level: 1 }
    result.push({
      ...relation,
      id: getFixedProficiencyId(relation),
      rule,
      sourceName: order.className,
      sourceRef: 'XPHB',
    })
  }
  return result
}
