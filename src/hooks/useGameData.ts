import { useMemo } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'
import {
  DataFilter,
  RaceFilters,
  ClassFilters,
  SpellFilters,
  BackgroundFilters,
  FeatFilters,
  ItemFilters,
  searchByName,
  sortByName,
} from '@/lib/5etools'
import { Race5e, Class5e, Spell5e, Background5e, Feat5e, Item5e, ClassFeature } from '@/types/5etools'

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

  return useMemo(() => {
    return classes.find((c) => {
      const nameMatch = c.name === name
      const sourceMatch = !source || c.source === source
      return nameMatch && sourceMatch
    })
  }, [classes, name, source])
}

export function useSpell(name: string, source?: string): Spell5e | undefined {
  const spells = useSpells()

  return useMemo(() => {
    return spells.find((s) => {
      const nameMatch = s.name === name
      const sourceMatch = !source || s.source === source
      return nameMatch && sourceMatch
    })
  }, [spells, name, source])
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
