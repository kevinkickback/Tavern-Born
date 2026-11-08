import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getEffectiveSources, getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassResourceDef } from '@/types/classRules'
import type { CharacterEffect } from '@/types/effects'
import { getClassFeatureIdentity } from './classFeatureIdentity'
import { findClassReference } from './classReference'
import { DAMAGE_TYPE_LABELS } from './constants'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { getCurrentDirectSubclassSource } from './directSubclassSource'
import { mysticLimitedSubclassUses } from './mysticFeatureIdentity'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { PSIONIC_CLASS_SOURCE } from './psionicIdentity'

export const isMysticJourneyOwner = (owner: CharacterClassEntry) =>
  norm(owner.name) === 'mystic' && norm(owner.source) === norm(PSIONIC_CLASS_SOURCE)

export function getCurrentMysticRules(
  character: Character,
  owner: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (
    !isMysticJourneyOwner(owner) ||
    !catalogs ||
    !getSourceCompatibility(owner.source, character.originSystem).compatible ||
    (character.allowedSources?.length &&
      !getEffectiveSources(character.allowedSources, character.originSystem).some(
        (source) => norm(source) === norm(owner.source),
      )) ||
    character.classProgression.filter((row) => findClassReference(owner, [row])).length !== 1
  )
    return undefined
  const classes = catalogs.classes?.filter((cls) => findClassReference(owner, [cls]))
  if (classes?.length !== 1 || classes[0].sourceIdentityConflict || classes[0]._copy)
    return undefined
  const [cls] = classes
  const features = (cls.classFeatureRefs ?? []).flatMap((ref) => {
    if (
      !ref.level ||
      ref.level > owner.levels ||
      ref.gainSubclassFeature ||
      norm(ref.source) !== norm(owner.source)
    )
      return []
    const target = getClassFeatureIdentity(ref)
    const feature = target && getCurrentDirectClassFeature(cls, catalogs, target)
    return feature ? [feature] : []
  })
  return { owner, cls, features }
}

export function getMysticPsiLimit(current: ReturnType<typeof getCurrentMysticRules>) {
  if (!current?.features.some((feature) => feature.name === 'Psionics')) return undefined
  const matches = (current.cls.classTableGroups ?? []).flatMap((value) => {
    const group = record(value)
    if (!Array.isArray(group.colLabels) || !Array.isArray(group.rows)) return []
    return group.colLabels.flatMap((label, index) =>
      label === 'Psi Limit' ? [{ rows: group.rows as unknown[], index }] : [],
    )
  })
  if (matches.length !== 1) return undefined
  const [{ rows, index }] = matches
  const row = rows[current.owner.levels - 1]
  const limit = Array.isArray(row) ? row[index] : undefined
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : undefined
}

export function getMysticMasteryResource(
  current: ReturnType<typeof getCurrentMysticRules>,
): ClassResourceDef | undefined {
  if (!current) return undefined
  const features = current.features.flatMap((feature) => {
    const match = /^Psionic Mastery \(([1-9]\d*)\/Day\)$/.exec(feature.name)
    return match && feature.level
      ? [{ feature, level: feature.level, maximum: Number(match[1]) }]
      : []
  })
  const initial = features.find((row) => row.maximum === 1)
  const clauses =
    initial?.feature.entries?.filter((row): row is string => typeof row === 'string') ?? []
  const recovery = clauses.flatMap((line) => {
    const match =
      /^You have one use of this feature, and you regain any expended use of it with a long rest\. You gain one additional use of this feature at ([\da-z, ]+) level\.$/.exec(
        line,
      )
    return match ? [match[1]] : []
  })
  if (!initial || recovery.length !== 1) return undefined
  const gains = recovery[0].split(/, (?:and )?| and /).map((text) => {
    const match = /^(\d+)(?:st|nd|rd|th)$/.exec(text)
    return match ? Number(match[1]) : 0
  })
  if (gains.some((level, index) => level <= (gains[index - 1] ?? initial.level) || level > 20))
    return undefined
  const expected = [initial.level, ...gains].filter((level) => level <= current.owner.levels)
  const uses = ['once', 'twice', 'three times', 'four times', 'five times', 'six times']
  if (
    features.length !== expected.length ||
    expected.some((level, index) => {
      const rows = features.filter((row) => row.level === level && row.maximum === index + 1)
      if (rows.length !== 1) return true
      if (index === 0) return false
      const entries = rows[0].feature.entries
      const clause =
        entries?.length === 1 &&
        typeof entries[0] === 'string' &&
        /^At (\d+)(?:st|nd|rd|th) level, you can use your Psionic Mastery ([a-z ]+) per day\.$/.exec(
          entries[0],
        )
      return !clause || Number(clause[1]) !== level || uses.indexOf(clause[2]) !== index
    })
  )
    return undefined
  const pool = clauses.flatMap((line) => {
    const first = /As an action, you gain (\d+) special psi points/.exec(line)
    if (first) return [{ level: initial.level, points: Number(first[1]) }]
    const later =
      /^At (\d+)(?:st|nd|rd|th) level, the pool of psi points you gain from this feature increases to (\d+)\.$/.exec(
        line,
      )
    return later ? [{ level: Number(later[1]), points: Number(later[2]) }] : []
  })
  const currentPool = pool.filter(({ level }) => level <= current.owner.levels).pop()
  if (!currentPool) return undefined
  return {
    id: 'mystic-psionic-mastery',
    label: 'Psionic Mastery',
    maxPerLevel: Array.from({ length: 20 }, (_, index) =>
      Math.max(0, ...features.filter((row) => row.level <= index + 1).map((row) => row.maximum)),
    ),
    restType: 'long',
    recovery: { longRest: 'all' },
    usageText: `${currentPool.points} special Psi Points per use.`,
  }
}

export function getMysticLimitedUseResources(
  character: Character,
  current: NonNullable<ReturnType<typeof getCurrentMysticRules>>,
): ClassResourceDef[] {
  const origin = getCurrentDirectSubclassSource(character, current.owner, [current.cls], 'Mystic')
  const subclassNames =
    origin?.subclass.source === PSIONIC_CLASS_SOURCE &&
    (origin.subclass.shortName === 'Awakened' || origin.subclass.shortName === 'Nomad')
      ? mysticLimitedSubclassUses[origin.subclass.shortName]
      : []
  const earned = [
    current.features.find((feature) => feature.name === 'Consumptive Power'),
    ...subclassNames.map((name) => {
      const feature = origin?.getFeature(name)
      return feature && { ...feature, name }
    }),
  ]
  return earned.flatMap((feature) => {
    if (!feature?.level) return []
    const { level } = feature
    const recovery = feature.entries?.flatMap((line) => {
      if (typeof line !== 'string') return []
      const clause =
        /(?:^|\. )Once you use this feature, you can't use it again until you finish a (short or long|long) rest\.$/.exec(
          line,
        )
      return clause ? [clause[1] === 'short or long' ? ('short' as const) : ('long' as const)] : []
    })
    if (recovery?.length !== 1) return []
    const restType = recovery[0]
    return [
      {
        id: `mystic-${feature.name.toLowerCase().replace(/ /g, '-')}`,
        label: feature.name,
        maxPerLevel: Array.from({ length: 20 }, (_, index) => Number(index + 1 >= level)),
        restType,
        recovery: { ...(restType === 'short' && { shortRest: 'all' as const }), longRest: 'all' },
      },
    ]
  })
}

export function getMysticImmortalDurability(
  character: Character,
  current: NonNullable<ReturnType<typeof getCurrentMysticRules>>,
) {
  const origin = getCurrentDirectSubclassSource(character, current.owner, [current.cls], 'Mystic')
  if (origin?.subclass.shortName !== 'Immortal' || origin.subclass.source !== PSIONIC_CLASS_SOURCE)
    return undefined
  const feature = origin.getFeature('Immortal Durability')
  if (!feature || feature.entries.length !== 2) return undefined
  const [hp, ac] = feature.entries
  const hitPoints =
    typeof hp === 'string' &&
    /^Starting at (\d+)(?:st|nd|rd|th) level, your hit point maximum increases by (\d+) per mystic level\.$/.exec(
      hp,
    )
  const armorClass =
    typeof ac === 'string' &&
    /^In addition, while you aren't wearing armor or wielding a shield, your base AC equals (\d+) \+ your Dexterity modifier \+ your Constitution modifier\.$/.exec(
      ac,
    )
  return hitPoints && armorClass && Number(hitPoints[1]) === feature.level
    ? {
        target: feature.target,
        hitPoints: Number(hitPoints[2]) * current.owner.levels,
        armorClass: Number(armorClass[1]),
      }
    : undefined
}

export function getMysticBodyEffects(
  current: NonNullable<ReturnType<typeof getCurrentMysticRules>>,
): CharacterEffect[] {
  const feature = current.features.find((row) => row.name === 'Psionic Body')
  const target = feature && getClassFeatureIdentity(feature)
  if (!feature || !target) return []
  const lists = feature.entries?.map(record).filter((row) => row.type === 'list')
  const lines = lists?.length === 1 && Array.isArray(lists[0].items) ? lists[0].items : []
  const resistance = lines.flatMap((line) => {
    const match =
      typeof line === 'string' && /^You gain resistance to ([a-z, ]+) damage\.$/.exec(line)
    return match ? [match[1]] : []
  })
  const immunity = lines.flatMap((line) => {
    const match =
      typeof line === 'string' &&
      /^You are immune to disease, ([a-z]+) damage, and the \{@condition ([a-z]+)\} condition\.$/.exec(
        line,
      )
    return match ? [match] : []
  })
  const damageTypes = new Set(Object.values(DAMAGE_TYPE_LABELS).map(norm))
  const resistances = resistance.length === 1 ? resistance[0].split(/, (?:and )?| and /) : []
  if (
    !resistances.length ||
    immunity.length !== 1 ||
    [...resistances, immunity[0][1]].some((type) => !damageTypes.has(type))
  )
    return []
  const targets = [
    ...resistances.map((damageType) => ({ kind: 'damage-resistance' as const, damageType })),
    { kind: 'damage-immunity' as const, damageType: immunity[0][1] },
    { kind: 'condition-immunity' as const, condition: immunity[0][2] },
  ]
  return targets.map((effect, index) => ({
    id: `${target}:${index}`,
    label: feature.name,
    source: { kind: 'class', name: feature.name, source: feature.source, entityId: target },
    target: effect,
    operation: { kind: 'grant' },
  }))
}
