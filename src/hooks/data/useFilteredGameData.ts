import { useMemo } from 'react'
import { DataFilter } from '@/lib/5etools/filters'
import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import { getImplicitSource } from '@/lib/sourcePresets'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

interface FilterParams {
  allowedSources?: string[]
  preferNewerPrintings?: boolean
}

/**
 * Core game data filtering hook. Accepts explicit filter parameters so callers
 * without an active character (settings pages, compendium) can pass their own
 * source lists without coupling to `characterStore`.
 */
export function useFilteredGameDataParams(params: FilterParams) {
  const gameData = useGameDataStore((state) => state.gameData)
  const { allowedSources, preferNewerPrintings = false } = params

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
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [],
        magicvariants: [],
        variantrules: [],
      }
    }

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
      ...gameData,
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
  }, [gameData, allowedSources, preferNewerPrintings])

  return filteredData
}

/**
 * Game data filtered by the active character's source settings.
 * Thin wrapper around {@link useFilteredGameDataParams} that reads filter
 * params from the active character in `characterStore`.
 */
export function useFilteredGameData() {
  const allowedSources = useCharacterStore((state) => state.activeCharacter?.allowedSources)
  const originSystem = useCharacterStore((state) => state.activeCharacter?.originSystem)
  const preferNewerPrintings = useCharacterStore(
    (state) => state.activeCharacter?.variantRules?.preferNewerPrintings ?? false,
  )

  const effectiveSources = useMemo(() => {
    if (!allowedSources) return undefined
    const implicit = getImplicitSource(originSystem ?? '2014')
    if (allowedSources.includes(implicit)) return allowedSources
    return [...allowedSources, implicit]
  }, [allowedSources, originSystem])

  return useFilteredGameDataParams({ allowedSources: effectiveSources, preferNewerPrintings })
}
