import { getItemPropertyLabel, getItemPropertyUid } from '@/lib/5etools/itemProperties'
import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import { isProficientWithWeapon } from '@/lib/calculations/weaponProficiency'
import type {
  Creature5e,
  Feat5e,
  Item5e,
  ItemPropertyReference,
  OptionalFeatureLike,
} from '@/types/5etools'
import type { NormalizedChoiceOptionFilter } from '@/types/classRules'

interface FilterableChoiceEntity {
  name: string
  source?: string
}
const normalized = (value: string | undefined) => value?.trim().toLowerCase() ?? ''
function getFeatureTypes(entity: FilterableChoiceEntity): string[] {
  const raw = (entity as OptionalFeatureLike).featureType
  return (Array.isArray(raw) ? raw : [raw])
    .filter((value): value is string => typeof value === 'string')
    .map(normalized)
}

function getItemTypeLabels(
  item: Item5e,
  itemTypeByAbbr: Readonly<Record<string, string>>,
): string[] {
  const rawTypes = Array.isArray(item.type) ? item.type : [item.type]
  const typeCodes = rawTypes
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.split('|')[0]?.trim())
    .filter((value): value is string => Boolean(value))
  const weaponCategory = normalized(item.weaponCategory)
  return [
    ...typeCodes,
    ...typeCodes.map((code) => itemTypeByAbbr[code.toUpperCase()]),
    item.weaponCategory,
    weaponCategory ? `${weaponCategory} weapon` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalized)
}

function getItemPropertyLabels(
  item: Item5e,
  itemPropertyByAbbr: Readonly<Record<string, string>>,
): string[] {
  return getItemPropertyReferences(item).flatMap((value) => {
    const uid = getItemPropertyUid(value)
    const code = uid.split('|')[0]?.trim() ?? ''
    return [code, getItemPropertyLabel(uid, itemPropertyByAbbr)].filter((label): label is string =>
      Boolean(label),
    )
  })
}

export function getItemPropertyReferences(item: Item5e): ItemPropertyReference[] {
  const raw = (item as Record<string, unknown>).property
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return values.flatMap((value) => {
    if (typeof value === 'string') return [value]
    if (!value || typeof value !== 'object') return []
    const record = value as Record<string, unknown>
    const reference = record.uid ?? record.property ?? record.abbreviation ?? record.name
    if (typeof reference !== 'string') return []
    return [typeof record.note === 'string' ? { uid: reference, note: record.note } : reference]
  })
}

function matchesAny(actual: readonly string[], expected: readonly string[] | undefined): boolean {
  if (!expected || expected.length === 0) return true
  const actualValues = new Set(actual.map(normalized))
  return expected.some((value) => actualValues.has(normalized(value)))
}

export function matchesClassChoiceFilter(
  entity: FilterableChoiceEntity,
  filter: NormalizedChoiceOptionFilter,
  itemPropertyByAbbr: Readonly<Record<string, string>>,
  itemTypeByAbbr: Readonly<Record<string, string>>,
  weaponProficiencies: readonly string[],
  classLevel: number,
): boolean {
  if ((filter.minimumClassLevel ?? 1) > classLevel) return false
  if (
    filter.anyOf?.length &&
    !filter.anyOf.some((candidate) =>
      matchesClassChoiceFilter(
        entity,
        candidate,
        itemPropertyByAbbr,
        itemTypeByAbbr,
        weaponProficiencies,
        classLevel,
      ),
    )
  ) {
    return false
  }
  if (filter.source && normalized(entity.source) !== normalized(filter.source)) return false
  if (
    filter.entityType === 'creature' &&
    !matchesAny(getCreatureTypes(entity as Creature5e), filter.creatureTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'creature' &&
    !matchesAny((entity as Creature5e).size ?? [], filter.sizes)
  ) {
    return false
  }
  if (
    filter.entityType === 'creature' &&
    filter.challengeRatingMaximum !== undefined &&
    (getCreatureChallengeRating(entity as Creature5e) ?? Infinity) > filter.challengeRatingMaximum
  ) {
    return false
  }
  if (
    filter.entityType === 'creature' &&
    filter.excludeSwarms &&
    isCreatureSwarm(entity as Creature5e)
  ) {
    return false
  }
  if (
    filter.entityType === 'feat' &&
    !matchesAny([(entity as Feat5e).category ?? ''], filter.categories)
  ) {
    return false
  }
  if (
    filter.entityType === 'optionalFeature' &&
    !matchesAny(getFeatureTypes(entity), filter.featureTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    !matchesAny(getItemTypeLabels(entity as Item5e, itemTypeByAbbr), filter.itemTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.excludedItemTypes?.length &&
    matchesAny(getItemTypeLabels(entity as Item5e, itemTypeByAbbr), filter.excludedItemTypes)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.excludedItemProperties?.length &&
    matchesAny(
      getItemPropertyLabels(entity as Item5e, itemPropertyByAbbr),
      filter.excludedItemProperties,
    )
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    !matchesAny([(entity as Item5e).rarity ?? ''], filter.rarities)
  ) {
    return false
  }
  if (filter.entityType === 'item' && filter.excludeCursed && (entity as Item5e).curse) return false
  if (
    filter.entityType === 'item' &&
    !matchesAny(
      getNormalizedItemTraits(entity as Item5e, itemTypeByAbbr).weaponRanges,
      filter.weaponRanges,
    )
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.requiresProficiency &&
    !isProficientWithWeapon(weaponProficiencies, entity as Item5e)
  ) {
    return false
  }
  if (
    filter.entityType === 'item' &&
    filter.requiresMastery &&
    ((entity as Item5e).mastery?.length ?? 0) === 0
  ) {
    return false
  }
  return true
}

export function getCreatureTypes(creature: Creature5e): string[] {
  const type = creature.type
  if (typeof type === 'string') return [type]
  return typeof type?.type === 'string' ? [type.type] : []
}

function getCreatureChallengeRating(creature: Creature5e): number | undefined {
  const raw = typeof creature.cr === 'object' && creature.cr !== null ? creature.cr.cr : creature.cr
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'string') return undefined
  const fraction = /^(\d+)\/(\d+)$/.exec(raw.trim())
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator > 0 ? Number(fraction[1]) / denominator : undefined
  }
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : undefined
}

function isCreatureSwarm(creature: Creature5e): boolean {
  return typeof creature.type === 'object' && creature.type?.swarmSize != null
}
