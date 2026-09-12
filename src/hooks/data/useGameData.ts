import { useMemo } from 'react'
import {
  type ClassFilters,
  DataFilter,
  getSubclassLookupKey,
  searchByName,
  sortByName,
} from '@/lib/5etools'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Condition5e, Item5e, Race5e, Subclass5e } from '@/types/5etools'

const EMPTY_RACE_LOOKUP: Readonly<Record<string, Race5e>> = {}
const EMPTY_BACKGROUND_LOOKUP: Readonly<Record<string, Background5e>> = {}
const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()
const EMPTY_STRING_LOOKUP: Readonly<Record<string, string>> = {}
const EMPTY_STRING_LIST: readonly string[] = []
const EMPTY_CONDITION_LIST: readonly Condition5e[] = []

/**
 * Raw unfiltered class list. Does NOT apply `allowedSources` or `preferNewerPrintings`.
 * For character-scoped build pages use `useFilteredGameData()` instead.
 */
export function useClasses(filters?: ClassFilters, searchQuery?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.classes) return []

    let classes = gameData.classes

    if (filters) {
      classes = DataFilter.filterClasses(classes, filters)
    }

    if (searchQuery) {
      classes = searchByName(classes, searchQuery)
    }

    return sortByName(classes)
  }, [gameData?.classes, filters, searchQuery])
}

/**
 * Raw unfiltered spell list. Does NOT apply `allowedSources` or `preferNewerPrintings`.
 * For character-scoped build pages use `useFilteredGameData()` instead.
 */
export function useClassLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => gameData?.lookups?.classesByKey ?? {}, [gameData?.lookups?.classesByKey])
}

export function useRaceLookup() {
  return useGameDataStore((state) => state.gameData?.lookups?.racesByKey) ?? EMPTY_RACE_LOOKUP
}

export function useBackgroundLookup() {
  return (
    useGameDataStore((state) => state.gameData?.lookups?.backgroundsByKey) ??
    EMPTY_BACKGROUND_LOOKUP
  )
}

export function useItemLookup() {
  return useGameDataStore((state) => state.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP
}

export function useItemPropertyLookup(): Readonly<Record<string, string>> {
  return (
    useGameDataStore((state) => state.gameData?.lookups?.itemPropertyByAbbr) ?? EMPTY_STRING_LOOKUP
  )
}

export function useItemTypeLookup(): Readonly<Record<string, string>> {
  return useGameDataStore((state) => state.gameData?.lookups?.itemTypeByAbbr) ?? EMPTY_STRING_LOOKUP
}

export function useSkillToAbilityMap(): Readonly<Record<string, string>> {
  return (
    useGameDataStore((state) => state.gameData?.lookups?.skillToAbilityMap) ?? EMPTY_STRING_LOOKUP
  )
}

export function useSpellLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => gameData?.lookups?.spellsByKey ?? {}, [gameData?.lookups?.spellsByKey])
}

export function useOptionalFeatureLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(
    () => gameData?.lookups?.optionalFeaturesByKey ?? {},
    [gameData?.lookups?.optionalFeaturesByKey],
  )
}

function useSubclassLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(
    () => gameData?.lookups?.subclassesByKey ?? {},
    [gameData?.lookups?.subclassesByKey],
  )
}

export function useSubclass(
  className: string,
  classSource: string | undefined,
  subclassName: string,
  subclassSource?: string,
): Subclass5e | undefined {
  const subclassLookup = useSubclassLookup()
  const classes = useClasses()

  return useMemo(() => {
    if (classSource && subclassSource) {
      const exact =
        subclassLookup[getSubclassLookupKey(className, classSource, subclassName, subclassSource)]
      if (exact) return exact
    }

    return classes
      .find((c) => c.name === className && (!classSource || c.source === classSource))
      ?.subclasses?.find(
        (subclass) =>
          (subclass.name === subclassName || subclass.shortName === subclassName) &&
          (!subclassSource || subclass.source === subclassSource),
      )
  }, [subclassLookup, classes, className, classSource, subclassName, subclassSource])
}

/** Returns parsed condition rule records, excluding disease records and malformed entries. */
export function useConditions(): readonly Condition5e[] {
  const conditions = useGameDataStore((state) => state.gameData?.conditions)

  return useMemo(() => {
    if (!conditions) return EMPTY_CONDITION_LIST
    return conditions.filter((entry): entry is Condition5e => {
      if (!entry || typeof entry !== 'object') return false
      const condition = entry as Record<string, unknown>
      return (
        condition._sourceType !== 'disease' &&
        typeof condition.name === 'string' &&
        typeof condition.source === 'string'
      )
    })
  }, [conditions])
}

/**
 * Returns the ordered list of skill names from data/skills.json.
 * Falls back to an empty array while game data is loading.
 */
export function useSkillList(): readonly string[] {
  const skillList = useGameDataStore((state) => state.gameData?.lookups?.skillList)
  return skillList ?? EMPTY_STRING_LIST
}
