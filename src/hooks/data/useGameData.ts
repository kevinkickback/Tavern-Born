import { useMemo } from 'react'
import {
  type BackgroundFilters,
  type ClassFilters,
  DataFilter,
  type FeatFilters,
  getEntityLookupKey,
  getSubclassLookupKey,
  type ItemFilters,
  type RaceFilters,
  type SpellFilters,
  searchByName,
  sortByName,
} from '@/lib/5etools'
import { useGameDataStore } from '@/store/gameDataStore'
import type {
  Background5e,
  Class5e,
  Feat5e,
  Item5e,
  Race5e,
  Spell5e,
  Subclass5e,
} from '@/types/5etools'

/**
 * Raw unfiltered race list from the game data store. Does NOT apply the active character's
 * `allowedSources` or `preferNewerPrintings` suppression.
 *
 * **Build pages and character-scoped UI must use `useFilteredGameData()` instead.**
 * Use this hook only for non-character contexts (e.g. compendium browser, admin tooling)
 * where all sources should be visible regardless of character settings.
 */
export function useRaces(filters?: RaceFilters, searchQuery?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.races) return []

    let races = gameData.races

    if (filters) {
      races = DataFilter.filterRaces(races, filters)
    }

    if (searchQuery) {
      races = searchByName(races, searchQuery)
    }

    return sortByName(races)
  }, [gameData?.races, filters, searchQuery])
}

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
export function useSpells(filters?: SpellFilters, searchQuery?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.spells) return []

    let spells = gameData.spells

    if (filters) {
      spells = DataFilter.filterSpells(spells, filters)
    }

    if (searchQuery) {
      spells = searchByName(spells, searchQuery)
    }

    return sortByName(spells)
  }, [gameData?.spells, filters, searchQuery])
}

/**
 * Raw unfiltered background list. Does NOT apply `allowedSources` or `preferNewerPrintings`.
 * For character-scoped build pages use `useFilteredGameData()` instead.
 */
export function useBackgrounds(filters?: BackgroundFilters, searchQuery?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.backgrounds) return []

    let backgrounds = gameData.backgrounds

    if (filters) {
      backgrounds = DataFilter.filterBackgrounds(backgrounds, filters)
    }

    if (searchQuery) {
      backgrounds = searchByName(backgrounds, searchQuery)
    }

    return sortByName(backgrounds)
  }, [gameData?.backgrounds, filters, searchQuery])
}

/**
 * Raw unfiltered feat list. Does NOT apply `allowedSources` or `preferNewerPrintings`.
 * For character-scoped build pages use `useFilteredGameData()` instead.
 */
export function useFeats(filters?: FeatFilters, searchQuery?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.feats) return []

    let feats = gameData.feats

    if (filters) {
      feats = DataFilter.filterFeats(feats, filters)
    }

    if (searchQuery) {
      feats = searchByName(feats, searchQuery)
    }

    return sortByName(feats)
  }, [gameData?.feats, filters, searchQuery])
}

/**
 * Raw unfiltered item list. Does NOT apply `allowedSources` or `preferNewerPrintings`.
 * For character-scoped build pages use `useFilteredGameData()` instead.
 */
export function useItems(filters?: ItemFilters, searchQuery?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.items) return []

    let items = gameData.items

    if (filters) {
      items = DataFilter.filterItems(items, filters)
    }

    if (searchQuery) {
      items = searchByName(items, searchQuery)
    }

    return sortByName(items)
  }, [gameData?.items, filters, searchQuery])
}

export function useClassFeatures(className?: string, classSource?: string) {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => {
    if (!gameData?.classFeatures) return []

    let features = gameData.classFeatures

    if (className) {
      features = features.filter((f) => f.className === className)
    }

    if (classSource) {
      features = features.filter((f) => f.classSource === classSource)
    }

    return features.sort((a, b) => (a.level || 0) - (b.level || 0))
  }, [gameData?.classFeatures, className, classSource])
}

export function useClassFeatureLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(
    () => gameData?.lookups?.classFeaturesByKey ?? {},
    [gameData?.lookups?.classFeaturesByKey],
  )
}

export function useClassLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(() => gameData?.lookups?.classesByKey ?? {}, [gameData?.lookups?.classesByKey])
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

export function useSubclassLookup() {
  const gameData = useGameDataStore((state) => state.gameData)

  return useMemo(
    () => gameData?.lookups?.subclassesByKey ?? {},
    [gameData?.lookups?.subclassesByKey],
  )
}

export function useRace(name: string, source?: string): Race5e | undefined {
  const races = useRaces()

  return useMemo(() => {
    return races.find((r) => {
      const nameMatch = r.name === name
      const sourceMatch = !source || r.source === source
      return nameMatch && sourceMatch
    })
  }, [races, name, source])
}

export function useClass(name: string, source?: string): Class5e | undefined {
  const classes = useClasses()
  const classLookup = useClassLookup()
  const classByName = useMemo(() => new Map(classes.map((cls) => [cls.name, cls])), [classes])

  return useMemo(() => {
    if (source) {
      return classLookup[getEntityLookupKey(name, source)]
    }
    return classByName.get(name)
  }, [classByName, classLookup, name, source])
}

export function useSpell(name: string, source?: string): Spell5e | undefined {
  const spells = useSpells()
  const spellLookup = useSpellLookup()
  const spellByName = useMemo(() => new Map(spells.map((spell) => [spell.name, spell])), [spells])

  return useMemo(() => {
    if (source) {
      return spellLookup[getEntityLookupKey(name, source)]
    }
    return spellByName.get(name)
  }, [spellByName, spellLookup, name, source])
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

export function useBackground(name: string, source?: string): Background5e | undefined {
  const backgrounds = useBackgrounds()

  return useMemo(() => {
    return backgrounds.find((b) => {
      const nameMatch = b.name === name
      const sourceMatch = !source || b.source === source
      return nameMatch && sourceMatch
    })
  }, [backgrounds, name, source])
}

export function useFeat(name: string, source?: string): Feat5e | undefined {
  const feats = useFeats()

  return useMemo(() => {
    return feats.find((f) => {
      const nameMatch = f.name === name
      const sourceMatch = !source || f.source === source
      return nameMatch && sourceMatch
    })
  }, [feats, name, source])
}

export function useItem(name: string, source?: string): Item5e | undefined {
  const items = useItems()

  return useMemo(() => {
    return items.find((i) => {
      const nameMatch = i.name === name
      const sourceMatch = !source || i.source === source
      return nameMatch && sourceMatch
    })
  }, [items, name, source])
}

/**
 * Returns the sorted list of standard condition names from data/conditionsdiseases.json.
 * Falls back to an empty array while game data is loading.
 */
export function useConditionNames(): readonly string[] {
  const conditionNames = useGameDataStore((state) => state.gameData?.lookups?.conditionNames)
  return useMemo(() => conditionNames ?? [], [conditionNames])
}

/**
 * Returns the ordered list of skill names from data/skills.json.
 * Falls back to an empty array while game data is loading.
 */
export function useSkillList(): readonly string[] {
  const skillList = useGameDataStore((state) => state.gameData?.lookups?.skillList)
  return useMemo(() => skillList ?? [], [skillList])
}

export function useGameDataStatus() {
  const isLoading = useGameDataStore((state) => state.isLoading)
  const loadProgress = useGameDataStore((state) => state.loadProgress)
  const error = useGameDataStore((state) => state.error)
  const dataSourceConfig = useGameDataStore((state) => state.dataSourceConfig)
  const lastLoadedAt = useGameDataStore((state) => state.lastLoadedAt)
  const hasData = useGameDataStore((state) => !!state.gameData)

  return {
    isLoading,
    loadProgress,
    error,
    dataSourceConfig,
    lastLoadedAt,
    hasData,
  }
}
