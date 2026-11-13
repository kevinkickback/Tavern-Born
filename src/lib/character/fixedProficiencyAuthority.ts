import { getCurrentGiantPower } from '@/lib/5etools/barbarianGiantPower'
import { CLASS_ORDERS } from '@/lib/5etools/classOrderIdentity'
import {
  canonicalProficiencyName,
  getClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/directFixedProficiencySource'
import { permitsClassRuleSource } from '@/lib/5etools/earnedClassFeatureSource'
import {
  type FixedProficiencyRelation,
  getFixedProficiencyId,
  getFixedTrainingSkills,
} from '@/lib/5etools/fixedProficiencyIdentity'
import {
  type FixedProficiencyRule,
  fixedProficiencyRule,
  getRetainedFixedClassCertificate,
} from '@/lib/5etools/fixedProficiencyRules'
import {
  getCurrentNativeSubclassGain,
  matchesNativeSubclassGain,
} from '@/lib/5etools/nativeSubclassGain'
import { matchesRetainedFirstSubclassGain } from '@/lib/5etools/ownedSubclassFeature'
import { getSubclassProficiencyOwner } from '@/lib/5etools/subclassProficiencyCertificates'
import { getCurrentSubclassProficiencyCertificate } from '@/lib/5etools/subclassProficiencySource'
import { toAbilityName } from '@/lib/calculations/abilityNames'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
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
  trainingInactive?: true
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
      trainingInactive?: true,
    ) => {
      if (relation.level <= selected.levels)
        result.push({
          ...relation,
          id: getFixedProficiencyId(relation),
          rule,
          sourceName,
          sourceRef,
          ...(trainingInactive && { trainingInactive }),
        })
    }
    const classOwner: [string, string] = [
      cls.name.trim().toLowerCase(),
      cls.source.trim().toLowerCase(),
    ]
    for (const rule of getCurrentDirectFixedClassRules(cls, catalogs)) {
      if (
        getRetainedFixedClassCertificate(classOwner, rule.target) &&
        (!permitsClassRuleSource(character, cls.source) ||
          !permitsClassRuleSource(character, rule.classSource))
      )
        continue
      push(
        {
          owner: classOwner,
          target: rule.target,
          level: rule.level,
        },
        rule,
        cls.name,
        cls.source,
      )
    }
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
      if (rule.subclassGainPosition) {
        const retainedGain = certificate?.retainedGainTarget ?? rule.retainedSubclassGainTarget
        const validGain = retainedGain
          ? permitsClassRuleSource(character, cls.source) &&
            permitsClassRuleSource(character, selected.subclassSource) &&
            permitsClassRuleSource(character, rule.classSource) &&
            matchesRetainedFirstSubclassGain(cls, retainedGain, path.level)
          : getCurrentNativeSubclassGain(
              cls,
              rule.subclassGainPosition === 'at-level' ? path.level : undefined,
            )?.level === path.level
        if (!validGain) continue
      }
      if (
        rule.languageFallback &&
        (!getSourceCompatibility(cls.source, character.originSystem).compatible ||
          !getCurrentGiantPower(cls, sub) ||
          (character.allowedSources?.length &&
            !getEffectiveSources(character.allowedSources, character.originSystem).some(
              (source) => canonicalProficiencyName(source) === owner[3],
            )))
      )
        continue
      if (
        rule.subclassGain &&
        (sub.sourceIdentityConflict ||
          !getSourceCompatibility(cls.source, character.originSystem).compatible ||
          !matchesNativeSubclassGain(
            cls,
            rule.subclassGain.target,
            path.level,
            rule.subclassGain.position,
          ))
      )
        continue
      const relation = { owner, target: path.target, level: path.level }
      if (rule.fallback?.savingThrowPool) {
        const choiceId = getClassProficiencyChoiceId(
          {
            name: cls.name,
            source: cls.source,
            subclassName: sub.name,
            subclassSource: sub.source,
          },
          path.target,
          'savingThrows',
          path.level,
        )
        const setup = character.classChoiceSelections?.find(
          (row) => row.choiceId === choiceId,
        )?.proficiencyAtGain
        const save = rule.fallback.name
        const tags = character.provenance.proficiencies.savingThrows[save] ?? []
        const independentlyProficient =
          character.proficiencies.savingThrows.some((name) => toAbilityName(name) === save) &&
          (!tags.length || tags.some((tag) => tag.grantVariant !== getFixedProficiencyId(relation)))
        if (setup?.alreadyProficient ?? independentlyProficient) {
          if (rule.skillCheckModifier) push(relation, rule, sub.name, sub.source, true)
          continue
        }
      }
      const effective = rule.startingSkillFallbacks
        ? {
            ...rule,
            training: {
              ...rule.training,
              skills: getFixedTrainingSkills(rule, relation, character.classChoiceSelections),
            },
          }
        : rule
      push(relation, effective, sub.name, sub.source)
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
