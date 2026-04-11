import { useMemo } from 'react'
import { DataFilter } from '@/lib/5etools/filters'
import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

export function useFilteredGameData() {
  const gameData = useGameDataStore((state) => state.gameData)
  const activeCharacter = useCharacterStore((state) => {
    if (state.activeCharacter) return state.activeCharacter
    if (!state.activeCharacterId) return null
    return state.characters.find((character) => character.id === state.activeCharacterId) ?? null
  })

  const filteredData = useMemo(() => {
    if (!gameData) {
      return {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        classFeatures: [],
        optionalfeatures: [],
        sources: [],
      }
    }

    const allowedSources = activeCharacter?.allowedSources
    const preferNewerPrintings = activeCharacter?.variantRules?.preferNewerPrintings ?? false

    if (!allowedSources || allowedSources.length === 0) {
      return {
        ...gameData,
        items: gameData.items,
        itemsBase: gameData.itemsBase ?? [],
      }
    }

    const suppressedKeys = preferNewerPrintings
      ? buildSuppressedKeys(
          [
            ...gameData.races,
            ...gameData.classes,
            ...gameData.backgrounds,
            ...gameData.spells,
            ...gameData.feats,
            ...gameData.items,
            ...(gameData.itemsBase ?? []),
            ...gameData.classFeatures,
            ...((gameData.optionalfeatures ?? []) as Array<{
              name?: unknown
              source?: unknown
              reprintedAs?: unknown
            }>),
          ],
          new Set(allowedSources),
        )
      : undefined

    return {
      races: DataFilter.filterRaces(gameData.races, {
        sources: allowedSources,
        suppressedKeys,
      }),
      classes: DataFilter.filterClasses(gameData.classes, {
        sources: allowedSources,
        suppressedKeys,
      }),
      backgrounds: DataFilter.filterBackgrounds(gameData.backgrounds, {
        sources: allowedSources,
        suppressedKeys,
      }),
      spells: DataFilter.filterSpells(gameData.spells, {
        sources: allowedSources,
        suppressedKeys,
      }),
      feats: DataFilter.filterFeats(gameData.feats, {
        sources: allowedSources,
        suppressedKeys,
      }),
      items: DataFilter.filterItems(gameData.items, {
        sources: allowedSources,
        suppressedKeys,
      }),
      itemsBase: DataFilter.filterItems(gameData.itemsBase ?? [], {
        sources: allowedSources,
        suppressedKeys,
      }),
      classFeatures: gameData.classFeatures.filter(
        (cf) =>
          allowedSources.includes(cf.source) &&
          !(suppressedKeys?.has(`${cf.name}|${cf.source}`) ?? false),
      ),
      optionalfeatures: (gameData.optionalfeatures ?? []).filter((of: unknown) => {
        const optionalFeature = of as { name?: string; source?: string }
        const source = optionalFeature.source ?? ''
        if (!allowedSources.includes(source)) {
          return false
        }
        return !(suppressedKeys?.has(`${optionalFeature.name}|${source}`) ?? false)
      }),
      sources: gameData.sources,
    }
  }, [
    gameData,
    activeCharacter?.allowedSources,

    activeCharacter?.variantRules?.preferNewerPrintings,
  ])

  return filteredData
}
