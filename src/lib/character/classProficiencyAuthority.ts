import { getCurrentClassProficiencyChoices } from '@/lib/5etools/classProficiencyChoices'
import {
  decodeClassProficiencyChoiceId,
  isClassProficiencyChoiceId,
} from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule } from '@/lib/5etools/classProficiencyRules'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  getCurrentNativeSubclassGain,
  matchesNativeSubclassGain,
} from '@/lib/5etools/nativeSubclassGain'
import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import {
  getSubclassProficiencyOwner,
  subclassProficiencyDigest,
} from '@/lib/5etools/subclassProficiencyCertificates'
import { normalizeSubclassProficiencyChoices } from '@/lib/5etools/subclassProficiencyChoices'
import { ALL_SKILLS } from '@/lib/calculations/skillNames'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { AbilityScores, Character, CharacterClassEntry } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from './classChoiceIdentity'
import type { CurrentFixedProficiency } from './fixedProficiencyAuthority'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { getOptionalClassProficiencyCandidates } from './optionalClassProficiencyChoices'

function readStartingSkillPool(cls: Class5e, base: readonly string[]) {
  const skills = cls.startingProficiencies?.skills
  if (cls.sourceIdentityConflict || '_copy' in cls || !Array.isArray(skills) || skills.length !== 1)
    return undefined
  const entry = record(skills[0])
  const { from, count } = record(entry.choose)
  if (
    Object.keys(entry).length !== 1 ||
    Object.keys(record(entry.choose)).length !== 2 ||
    !Array.isArray(from) ||
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > from.length ||
    !from.every((row) => typeof row === 'string' && ALL_SKILLS.includes(row.toLowerCase()))
  )
    return undefined
  const names = from.map((row) => row.toLowerCase() as string)
  return new Set(names).size === names.length ? [...new Set([...base, ...names])] : undefined
}

/** Full current owner collections are checked before any selected-root/feature first-match projection. */
export function getCurrentOwnedProficiencyCandidates(
  classData: Pick<Class5e, 'name' | 'source' | 'classFeatureRefs'>,
  includeVariants: boolean,
  catalogs?: ClassChoiceFeatureCatalogs,
  selectedSubclass?: Pick<Subclass5e, 'name' | 'source'>,
): NormalizedCharacterChoice[] {
  const choices = [
    ...getCurrentClassProficiencyChoices(classData, includeVariants, catalogs),
    ...(includeVariants ? getOptionalClassProficiencyCandidates(classData, catalogs) : []),
  ]
  if (!catalogs?.subclassTargets || !selectedSubclass) return choices
  const key = (value: string) => value.trim().toLowerCase()
  const parents = (catalogs.classes ?? []).filter(
    (row) => key(row.name) === key(classData.name) && key(row.source) === key(classData.source),
  )
  if (parents.length !== 1) return choices
  const selectedOwner = [
    key(classData.name),
    key(classData.source),
    key(selectedSubclass.name),
    key(selectedSubclass.source),
  ]
  const roots = (parents[0].subclasses ?? []).filter(
    (row) => JSON.stringify(getSubclassProficiencyOwner(row)) === JSON.stringify(selectedOwner),
  )
  if (roots.length !== 1) return choices
  const subclass = roots[0]
  const owner = {
    type: 'subclass' as const,
    name: classData.name,
    source: classData.source,
    subclassName: subclass.name,
    subclassSource: subclass.source,
  }
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(owner.name, owner.source, subclass.name, subclass.source),
  )
  // No unscoped/raw fallback for missing candidates, including explicitly empty supplied indexes.
  if (!scoped.subclassFeatureCandidates) return choices
  const canonical = normalizeSubclassProficiencyChoices(
    owner,
    subclass,
    subclass.subclassFeatureRefs ?? [],
    scoped.subclassFeatureCandidates,
  )
  const claimed = (subclass.normalizedRules?.choices ?? []).filter(
    (row) => row.kind === 'proficiency' || isClassProficiencyChoiceId(row.id),
  )
  if (
    claimed.some(
      (row) =>
        !canonical.some(
          (current) => subclassProficiencyDigest(current) === subclassProficiencyDigest(row),
        ),
    )
  )
    return choices
  return [
    ...choices,
    ...canonical.flatMap((choice) => {
      const relation = decodeClassProficiencyChoiceId(choice.id)
      const rule = relation && classProficiencyRule(relation.target)
      const targets =
        rule?.subclassGainTargets ??
        (rule?.subclassGainTarget ? [rule.subclassGainTarget] : undefined)
      if (rule?.subclassGainPosition) {
        const gain = getCurrentNativeSubclassGain(
          parents[0],
          rule.subclassGainPosition === 'at-level' ? choice.level : undefined,
        )
        if (gain?.level !== choice.level) return []
      }
      if (
        targets &&
        !targets.some((target) =>
          matchesNativeSubclassGain(
            parents[0],
            target,
            choice.level,
            relation?.domain === 'savingThrows' ? 'at-level' : 'first',
          ),
        )
      )
        return []
      if (!rule?.startingSkillPoolBase || relation?.domain !== 'skills') return [choice]
      const pool = readStartingSkillPool(parents[0], rule.startingSkillPoolBase)
      if (!pool) return []
      const skillPool = relation.trigger
        ? pool.filter((skill) => !rule.domains.some((domain) => domain.trigger === skill))
        : pool
      return skillPool.length ? [{ ...choice, currentProficiencySkillPool: skillPool }] : []
    }),
  ]
}

export function getEarnedOwnerProficiencyCandidates(
  owner: CharacterClassEntry,
  includeVariants: boolean,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const classData = findClassReference(owner, catalogs?.classes ?? [])
  if (!classData) return []
  return getCurrentOwnedProficiencyCandidates(
    classData,
    includeVariants,
    catalogs,
    owner.subclass && owner.subclassSource
      ? { name: owner.subclass, source: owner.subclassSource }
      : undefined,
  ).filter((choice) => choice.level <= owner.levels)
}

/** Character entitlement is an additional gate after complete current source candidate validation. */
export function getEffectiveOwnerProficiencyChoices(
  character: Character,
  owner: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
  options: { resolveLanguageFoundation?: boolean } = {},
) {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  return getEarnedOwnerProficiencyCandidates(owner, true, catalogs).filter(
    options.resolveLanguageFoundation ? activity.choiceSource : activity.choice,
  )
}

/** The effective ledger contains only current, earned proficiency ownership. */
export function getOwnedSubclassSkillModifiers(
  character: Character,
  abilities: AbilityScores,
  fixed: readonly CurrentFixedProficiency[],
): CharacterEffect[] {
  const selected = Object.entries(character.provenance?.proficiencies.skills ?? {}).flatMap(
    ([skill, tags]) =>
      tags.flatMap((tag): CharacterEffect[] => {
        if (tag.sourceType !== 'subclass' || !tag.grantVariant) return []
        const choice = decodeClassProficiencyChoiceId(tag.grantVariant)
        const rule = choice && classProficiencyRule(choice.target)?.skillModifier
        if (!rule || choice?.domain !== 'skills') return []
        return [
          {
            id: `${tag.grantVariant}:${skill}`,
            label: rule.label,
            source: {
              kind: 'subclass',
              name: rule.label,
              source: tag.sourceRef,
              provenance: { choiceId: tag.grantVariant },
            },
            target: { kind: 'skill-modifier', skill },
            operation: { kind: 'add', value: Math.max(rule.minimum, abilities[rule.ability]) },
          },
        ]
      }),
  )
  const fixedEffects = fixed.flatMap(({ id, rule, sourceRef }): CharacterEffect[] => {
    const modifier = rule.skillCheckModifier
    if (!modifier) return []
    return [
      {
        id: `${id}:${modifier.skill}`,
        label: rule.name,
        source: { kind: 'subclass', name: rule.name, source: sourceRef },
        target: { kind: 'skill-modifier', skill: modifier.skill, ability: modifier.checkAbility },
        operation: { kind: 'add', value: abilities[modifier.bonusAbility] },
      },
    ]
  })
  return [...selected, ...fixedEffects]
}
