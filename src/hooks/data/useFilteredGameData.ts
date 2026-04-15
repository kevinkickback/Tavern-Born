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
    const races = gameData.races ?? []
    const classes = gameData.classes ?? []
    const backgrounds = gameData.backgrounds ?? []
    const spells = gameData.spells ?? []
    const feats = gameData.feats ?? []
    const items = gameData.items ?? []
    const itemsBase = gameData.itemsBase ?? []
    const classFeatures = gameData.classFeatures ?? []
    const optionalfeatures = gameData.optionalfeatures ?? []
    const sources = gameData.sources ?? []

    if (!allowedSources || allowedSources.length === 0) {
      return {
        ...gameData,
        races,
        classes,
        backgrounds,
        spells,
        feats,
        items,
        itemsBase,
        classFeatures,
        optionalfeatures,
        sources,
      }
    }

    const suppressedKeys = preferNewerPrintings
      ? buildSuppressedKeys(
          [
            ...races,
            ...classes,
            ...backgrounds,
            ...spells,
            ...feats,
            ...items,
            ...itemsBase,
            ...classFeatures,
            ...(optionalfeatures as Array<{
              name?: unknown
              source?: unknown
              reprintedAs?: unknown
            }>),
          ],
          new Set(allowedSources),
        )
      : undefined

    return {
      races: DataFilter.filterRaces(races, {
        sources: allowedSources,
        suppressedKeys,
      }),
      classes: DataFilter.filterClasses(classes, {
        sources: allowedSources,
        suppressedKeys,
      }),
      backgrounds: DataFilter.filterBackgrounds(backgrounds, {
        sources: allowedSources,
        suppressedKeys,
      }),
      spells: DataFilter.filterSpells(spells, {
        sources: allowedSources,
        suppressedKeys,
      }),
      feats: DataFilter.filterFeats(feats, {
        sources: allowedSources,
        suppressedKeys,
      }),
      items: DataFilter.filterItems(items, {
        sources: allowedSources,
        suppressedKeys,
      }),
      itemsBase: DataFilter.filterItems(itemsBase, {
        sources: allowedSources,
        suppressedKeys,
      }),
      classFeatures: classFeatures.filter(
        (cf) =>
          allowedSources.includes(cf.source) &&
          !(suppressedKeys?.has(`${cf.name}|${cf.source}`) ?? false),
      ),
      optionalfeatures: optionalfeatures.filter((of: unknown) => {
        const optionalFeature = of as { name?: string; source?: string }
        const source = optionalFeature.source ?? ''
        if (!allowedSources.includes(source)) {
          return false
        }
        return !(suppressedKeys?.has(`${optionalFeature.name}|${source}`) ?? false)
      }),
      sources,
    }
  }, [
    gameData,
    activeCharacter?.allowedSources,

    activeCharacter?.variantRules?.preferNewerPrintings,
  ])

  return filteredData
}
