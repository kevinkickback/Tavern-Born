import { useMemo } from 'react'
import { useGameDataStore } from '@/store/gameDataStore'
import { useCharacterStore } from '@/store/characterStore'
import { DataFilter } from '@/lib/5etools/filters'

export function useFilteredGameData() {
  const gameData = useGameDataStore((state) => state.gameData)
  const activeCharacter = useCharacterStore((state) => state.activeCharacter)

  const filteredData = useMemo(() => {
    if (!gameData) {
      return {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        classFeatures: [],
        optionalfeatures: [],
        sources: [],
      }
    }

    const allowedSources = activeCharacter?.allowedSources

    if (!allowedSources || allowedSources.length === 0) {
      return gameData
    }

    return {
      races: DataFilter.filterRaces(gameData.races, { sources: allowedSources }),
      classes: DataFilter.filterClasses(gameData.classes, { sources: allowedSources }),
      backgrounds: DataFilter.filterBackgrounds(gameData.backgrounds, { sources: allowedSources }),
      spells: DataFilter.filterSpells(gameData.spells, { sources: allowedSources }),
      feats: DataFilter.filterFeats(gameData.feats, { sources: allowedSources }),
      items: DataFilter.filterItems(gameData.items, { sources: allowedSources }),
      classFeatures: gameData.classFeatures.filter(
        (cf) => allowedSources.includes(cf.source)
      ),
      optionalfeatures: (gameData.optionalfeatures ?? []).filter(
        (of: any) => allowedSources.includes(of.source)
      ),
      sources: gameData.sources,
    }
  }, [gameData, activeCharacter?.allowedSources])

  return filteredData
}
