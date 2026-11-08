import type {
  ClassProficiencyChoiceDomain,
  ClassProficiencyDomain,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'

const PREFIX = 'feature-proficiencies:'
export const isClassProficiencyChoiceId = (id: string) => id.startsWith(PREFIX)
const CLASS_PROFICIENCY_DOMAINS: readonly ClassProficiencyDomain[] = [
  'expertise',
  'languages',
  'tools',
  'skills',
  'savingThrows',
]

/** Proficiencies are named domains, independent of equivalent catalog printings. */
export function canonicalProficiencyName(value: string): string | undefined {
  const name = value.trim().toLowerCase()
  return name.length > 0 &&
    name.length <= 200 &&
    !/\p{Cc}/u.test(name) &&
    !['__proto__', 'prototype', 'constructor'].includes(name)
    ? name
    : undefined
}

export function getClassProficiencyChoiceId(
  owner: { name: string; source: string; subclassName?: string; subclassSource?: string },
  target: string,
  domain: ClassProficiencyChoiceDomain,
  level: number,
  trigger?: string,
): string {
  return (
    PREFIX +
    encodeURIComponent(
      JSON.stringify([
        [
          owner.name.trim().toLowerCase(),
          owner.source.trim().toLowerCase(),
          ...(owner.subclassName
            ? [owner.subclassName.trim().toLowerCase(), owner.subclassSource?.trim().toLowerCase()]
            : []),
        ],
        target,
        domain,
        level,
        ...(trigger === undefined ? [] : [trigger]),
      ]),
    )
  )
}

export function decodeClassProficiencyChoiceId(id: string):
  | {
      owner: [string, string] | [string, string, string, string]
      target: string
      domain: ClassProficiencyChoiceDomain
      level: number
      trigger?: string
    }
  | undefined {
  if (!isClassProficiencyChoiceId(id)) return undefined
  try {
    const parts: unknown = JSON.parse(decodeURIComponent(id.slice(PREFIX.length)))
    if (!Array.isArray(parts) || ![4, 5].includes(parts.length)) return undefined
    const [owner, target, domain, level, trigger] = parts
    if (
      !Array.isArray(owner) ||
      ![2, 4].includes(owner.length) ||
      !owner.every(
        (value) =>
          typeof value === 'string' && value.trim() && value === value.trim().toLowerCase(),
      ) ||
      typeof target !== 'string' ||
      !(owner.length === 2
        ? target.startsWith('class-feature|')
        : target.startsWith('subclass-feature|')) ||
      (domain !== 'skill-or-language' && !CLASS_PROFICIENCY_DOMAINS.includes(domain)) ||
      (parts.length === 5 &&
        ((domain !== 'skills' && domain !== 'tools') ||
          owner.length !== 4 ||
          typeof trigger !== 'string' ||
          canonicalProficiencyName(trigger) !== trigger)) ||
      !Number.isInteger(level) ||
      level < 1 ||
      level > 20
    )
      return undefined
    const feature =
      owner.length === 2
        ? decodeClassFeatureReference(target.split('|').slice(1).join('|'))
        : decodeSubclassFeatureReference(target.split('|').slice(1).join('|'))
    const identity =
      owner.length === 2 ? getClassFeatureIdentity(feature) : getSubclassFeatureIdentity(feature)
    if (identity !== target || level < (feature.level ?? Infinity)) return undefined
    const relation = {
      owner: owner as [string, string] | [string, string, string, string],
      target,
      domain: domain as ClassProficiencyChoiceDomain,
      level,
      ...(typeof trigger === 'string' && { trigger }),
    }
    return getClassProficiencyChoiceId(
      {
        name: owner[0],
        source: owner[1],
        ...(owner.length === 4 ? { subclassName: owner[2], subclassSource: owner[3] } : {}),
      },
      target,
      domain,
      level,
      trigger,
    ) === id
      ? relation
      : undefined
  } catch {
    return undefined
  }
}

export function allowsProficiencyDomain(
  choice: ClassProficiencyChoiceDomain,
  option: ClassProficiencyDomain,
): boolean {
  return (
    choice === option ||
    (choice === 'skill-or-language' && (option === 'skills' || option === 'languages'))
  )
}

export function getProficiencyOption(
  domain: ClassProficiencyDomain,
  name: string,
  proficiencyType?: 'tool',
): NormalizedChoiceOptionReference {
  const key = canonicalProficiencyName(name)
  if (!key) throw new RangeError('A proficiency requires a valid name.')
  return {
    entityType: 'proficiency',
    name,
    ref: JSON.stringify(
      proficiencyType === 'tool'
        ? ['proficiency', domain, 'tool', key]
        : ['proficiency', domain, key],
    ),
  }
}

export function decodeProficiencyOption(option: NormalizedChoiceOptionReference):
  | {
      domain: ClassProficiencyDomain
      name: string
      proficiencyType?: 'skill' | 'tool'
    }
  | undefined {
  if (option.entityType !== 'proficiency' || !option.ref || option.source?.trim()) return undefined
  try {
    const parts: unknown = JSON.parse(option.ref)
    if (
      !Array.isArray(parts) ||
      (parts.length !== 3 && parts.length !== 4) ||
      parts[0] !== 'proficiency' ||
      !CLASS_PROFICIENCY_DOMAINS.includes(parts[1]) ||
      (parts.length === 4 && (parts[1] !== 'expertise' || parts[2] !== 'tool')) ||
      typeof parts[parts.length - 1] !== 'string' ||
      canonicalProficiencyName(parts[parts.length - 1]) !== parts[parts.length - 1] ||
      canonicalProficiencyName(option.name) !== parts[parts.length - 1] ||
      JSON.stringify(parts) !== option.ref
    )
      return undefined
    return {
      domain: parts[1],
      name: parts[parts.length - 1],
      ...(parts[1] === 'expertise'
        ? { proficiencyType: parts.length === 4 ? ('tool' as const) : ('skill' as const) }
        : {}),
    }
  } catch {
    return undefined
  }
}
