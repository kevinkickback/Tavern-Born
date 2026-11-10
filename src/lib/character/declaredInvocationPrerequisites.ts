import { readDeclaredInvocationBook } from '@/lib/5etools/declaredInvocationBook'
import { readDeclaredInvocationCast } from '@/lib/5etools/declaredInvocationCasting'
import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import {
  hasCurrentRevisedInvocationOption,
  isRevisedInvocationPoolId,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { OptionalFeatureLike } from '@/types/5etools'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { isRevisedAtWillInvocationOption } from './atWillInvocationRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceCatalogOptionKey } from './classChoiceIdentity'

function candidates(
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (option.entityType !== 'optionalFeature' || !option.source?.trim()) return []
  return catalogs?.optionalFeatureCandidates
    ? (catalogs.optionalFeatureCandidates.get(
        getClassChoiceCatalogOptionKey({
          entityType: 'optionalFeature',
          name: option.name,
          source: option.source,
        }),
      ) ?? [])
    : (catalogs?.optionalFeatures ?? []).filter(
        (feature) =>
          norm(feature.name) === norm(option.name) && norm(feature.source) === norm(option.source),
      )
}

export function getDeclaredInvocationLeaf(
  choice: NormalizedCharacterChoice,
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const rows = candidates(option, catalogs)
  const [feature] = rows
  const raw = record(feature)
  return rows.length === 1 &&
    option.ref === undefined &&
    option.invocationCantrip === undefined &&
    norm(feature.name) === norm(option.name) &&
    norm(feature.source) === norm(option.source) &&
    !raw._copy &&
    !raw.sourceIdentityConflict &&
    !raw.featureOptionSourceConflict &&
    feature.featureType?.length === 1 &&
    feature.featureType[0] === 'EI' &&
    hasCurrentRevisedInvocationOption(choice, catalogs, option)
    ? feature
    : undefined
}

function readRequirement(feature: OptionalFeatureLike, owner: NormalizedCharacterChoice['owner']) {
  const raw = feature.prerequisite
  if (raw === undefined || (Array.isArray(raw) && !raw.length)) return { level: 1 }
  if (!Array.isArray(raw) || raw.length !== 1) return undefined
  const clause = record(raw[0])
  const level = record(clause.level)
  const cls = record(level.class)
  const namedOwner =
    typeof cls.name === 'string' &&
    typeof cls.source === 'string' &&
    ((norm(cls.name) === 'warlock' && norm(cls.source) === 'xphb') ||
      (norm(cls.name) === norm(owner.name) && norm(cls.source) === norm(owner.source)))
  if (
    !Object.keys(clause).every((key) => key === 'level' || key === 'optionalfeature') ||
    !Object.keys(level).every((key) => key === 'level' || key === 'class') ||
    !Object.keys(cls).every(
      (key) => key === 'name' || key === 'source' || key === 'visibleStats',
    ) ||
    (cls.visibleStats !== undefined && typeof cls.visibleStats !== 'boolean') ||
    !namedOwner ||
    typeof level.level !== 'number' ||
    !Number.isInteger(level.level) ||
    level.level < 1 ||
    level.level > 20
  )
    return undefined
  if (!('optionalfeature' in clause)) return { level: level.level }
  const required = clause.optionalfeature
  if (
    !Array.isArray(required) ||
    required.length !== 1 ||
    typeof required[0] !== 'string' ||
    !/^[^|#{}]+\|[^|#{}]+$/.test(required[0])
  )
    return undefined
  const [name, source] = required[0].split('|').map((part) => part.trim())
  return name && source
    ? { level: level.level, required: { entityType: 'optionalFeature' as const, name, source } }
    : undefined
}

/** A single exact provider belongs to this pool, independently of the printed class on the rule. */
export function getDeclaredInvocationRequirement(
  choice: NormalizedCharacterChoice,
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (!isRevisedInvocationPoolId(choice.id)) return undefined
  if (!hasDeclaredInvocationRequirement(option, catalogs)) return undefined
  const leaf = getDeclaredInvocationLeaf(choice, option, catalogs)
  const rule = leaf && readRequirement(leaf, choice.owner)
  if (!rule) return null
  if (!rule.required) return rule
  const provider = getDeclaredInvocationLeaf(choice, rule.required, catalogs)
  const providerRule = provider && readRequirement(provider, choice.owner)
  // A single prerequisite-free or level-gated provider can support this direct dependency.
  if (!provider || !providerRule || providerRule.required) return null
  return {
    level: Math.max(rule.level, providerRule.level),
    required: {
      entityType: 'optionalFeature' as const,
      name: provider.name,
      source: provider.source,
    },
  }
}

function hasDeclaredInvocationRequirement(
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  return candidates(option, catalogs).some(
    ({ prerequisite }) =>
      Array.isArray(prerequisite) &&
      prerequisite.some((value) => {
        const clause = record(value)
        return (
          'optionalfeature' in clause ||
          (Object.keys(clause).length === 1 && 'class' in record(clause.level))
        )
      }),
  )
}

export function hasDeclaredInvocationSpells(
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  return candidates(option, catalogs).some(
    (feature) => readDeclaredInvocationCast(feature) || readDeclaredInvocationBook(feature),
  )
}

export function isDeclaredRevisedInvocationOption(
  choiceId: string,
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  return (
    isRevisedInvocationPoolId(choiceId) &&
    !isRevisedAtWillInvocationOption(option) &&
    (hasDeclaredInvocationRequirement(option, catalogs) ||
      hasDeclaredInvocationSpells(option, catalogs))
  )
}
