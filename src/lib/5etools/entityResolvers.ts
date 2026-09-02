import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'

export interface EntityReference {
  name?: string
  source?: string
}

export interface EntityLookupSet {
  classesByKey?: Readonly<Record<string, Class5e>>
  racesByKey?: Readonly<Record<string, Race5e>>
  backgroundsByKey?: Readonly<Record<string, Background5e>>
}

export interface RaceReference extends EntityReference {
  subraceName?: string
  subraceSource?: string
}

export interface ResolvedRaceReference {
  parentRace: Race5e | undefined
  subraceData: Race5e | undefined
  mergedRace: Race5e | undefined
  subraceIsNested: boolean
}

function deterministicNameMatch<T extends { name: string; source: string }>(
  name: string,
  primaryLookup: Readonly<Record<string, T>> | undefined,
  rawLookup: Readonly<Record<string, T>> | undefined,
): T | undefined {
  const compare = (left: T, right: T) =>
    left.source.localeCompare(right.source) || left.name.localeCompare(right.name)
  const primary = Object.values(primaryLookup ?? {})
    .filter((entity) => entity.name === name)
    .sort(compare)[0]
  if (primary) return primary
  return Object.values(rawLookup ?? {})
    .filter((entity) => entity.name === name)
    .sort(compare)[0]
}

function resolveEntity<T extends { name: string; source: string }>(
  reference: EntityReference,
  primaryLookup: Readonly<Record<string, T>> | undefined,
  rawLookup: Readonly<Record<string, T>> | undefined,
): T | undefined {
  const name = reference.name?.trim()
  if (!name) return undefined
  const source = reference.source?.trim()
  if (source) {
    const key = getEntityLookupKey(name, source)
    return primaryLookup?.[key] ?? rawLookup?.[key]
  }
  return deterministicNameMatch(name, primaryLookup, rawLookup)
}

export function resolveClassReference(
  reference: EntityReference,
  primaryLookups: EntityLookupSet,
  rawLookups: EntityLookupSet = primaryLookups,
): Class5e | undefined {
  return resolveEntity(reference, primaryLookups.classesByKey, rawLookups.classesByKey)
}

export function resolveBackgroundReference(
  reference: EntityReference,
  primaryLookups: EntityLookupSet,
  rawLookups: EntityLookupSet = primaryLookups,
): Background5e | undefined {
  return resolveEntity(reference, primaryLookups.backgroundsByKey, rawLookups.backgroundsByKey)
}

function resolveSubraceFromParents(
  reference: EntityReference,
  primaryParent: Race5e | undefined,
  rawParent: Race5e | undefined,
): Race5e | undefined {
  const name = reference.name?.trim()
  if (!name) return undefined
  const source = reference.source?.trim()
  const candidates = [primaryParent, rawParent]
  for (const parent of candidates) {
    const subraces = parent?.subraces ?? []
    if (source) {
      const exact = subraces.find((subrace) => subrace.name === name && subrace.source === source)
      if (exact) return exact
      continue
    }
    const byName = subraces
      .filter((subrace) => subrace.name === name)
      .sort((left, right) => left.source.localeCompare(right.source))[0]
    if (byName) return byName
  }
  return undefined
}

export function resolveRaceReference(
  reference: RaceReference,
  primaryLookups: EntityLookupSet,
  rawLookups: EntityLookupSet = primaryLookups,
): ResolvedRaceReference {
  const parentRace = resolveEntity(reference, primaryLookups.racesByKey, rawLookups.racesByKey)
  if (!parentRace) {
    return {
      parentRace: undefined,
      subraceData: undefined,
      mergedRace: undefined,
      subraceIsNested: false,
    }
  }

  const rawParent = resolveEntity(reference, rawLookups.racesByKey, rawLookups.racesByKey)
  const subraceReference = {
    name: reference.subraceName,
    source: reference.subraceSource,
  }
  const nestedSubrace = resolveSubraceFromParents(subraceReference, parentRace, rawParent)
  const topLevelSubrace = nestedSubrace
    ? undefined
    : resolveEntity(subraceReference, primaryLookups.racesByKey, rawLookups.racesByKey)
  const subraceData = nestedSubrace ?? topLevelSubrace

  return {
    parentRace,
    subraceData,
    mergedRace: subraceData ? mergeRaceWithSubrace(parentRace, subraceData) : parentRace,
    subraceIsNested: !!nestedSubrace,
  }
}
