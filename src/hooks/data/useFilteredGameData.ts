import { useMemo } from 'react'
import { DataFilter } from '@/lib/5etools/filters'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import { buildSuppressedKeys, collectReprintableEntities } from '@/lib/5etools/reprints'
import {
  XPHB_LEGACY_FEAT_KEYS,
  XPHB_LEGACY_RACE_KEYS,
  XPHB_LEGACY_SUBCLASS_KEYS,
} from '@/lib/5etools/rulesetMetadata'
import { getEffectiveSources, normalizeAllowedSources } from '@/lib/sourceCompatibility'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type {
  Background5e,
  Class5e,
  ClassFeature,
  Creature5e,
  Feat5e,
  Item5e,
  ItemMastery5e,
  Language5e,
  Race5e,
  SourceBook,
} from '@/types/5etools'

interface FilterParams {
  allowedSources?: string[]
  preferNewerPrintings?: boolean
  originSystem?: '2014' | '2024'
}

/**
 * Core game data filtering hook. Accepts explicit filter parameters so callers
 * without an active character (settings pages, compendium) can pass their own
 * source lists without coupling to `characterStore`.
 */
export function useFilteredGameDataParams(params: FilterParams) {
  const gameData = useGameDataStore((state) => state.gameData)
  const { allowedSources, preferNewerPrintings = false, originSystem } = params

  const filteredData = useMemo(() => {
    if (!gameData) {
      return {
        races: [] as Race5e[],
        classes: [] as Class5e[],
        backgrounds: [] as Background5e[],
        organizations: [],
        spells: [],
        feats: [] as Feat5e[],
        items: [] as Item5e[],
        itemsBase: [] as Item5e[],
        itemMasteries: [] as ItemMastery5e[],
        classFeatures: [] as ClassFeature[],
        creatures: [] as Creature5e[],
        optionalfeatures: [],
        sources: [] as SourceBook[],
        actions: [],
        conditions: [],
        deities: [],
        skills: [],
        senses: [],
        languages: [] as Language5e[],
        variantrules: [],
        trapHazards: [],
        rewards: [],
      }
    }

    const races = gameData.races ?? []
    const classes = gameData.classes ?? []
    const backgrounds = gameData.backgrounds ?? []
    const organizations = gameData.organizations ?? []
    const spells = gameData.spells ?? []
    const feats = gameData.feats ?? []
    const items = gameData.items ?? []
    const itemsBase = gameData.itemsBase ?? []
    const itemMasteries = gameData.itemMasteries ?? []
    const classFeatures = gameData.classFeatures ?? []
    const creatures = gameData.creatures ?? []
    const optionalfeatures = gameData.optionalfeatures ?? []
    const sources = gameData.sources ?? []
    const compatibleAllowedSources =
      allowedSources && originSystem
        ? normalizeAllowedSources(allowedSources, originSystem, sources)
        : allowedSources

    if (!compatibleAllowedSources || compatibleAllowedSources.length === 0) {
      return {
        ...gameData,
        races,
        classes,
        backgrounds,
        organizations,
        spells,
        feats,
        items,
        itemsBase,
        itemMasteries,
        classFeatures,
        creatures,
        optionalfeatures,
        sources,
      }
    }

    const suppressedKeys =
      preferNewerPrintings || originSystem === '2024'
        ? buildSuppressedKeys(
            collectReprintableEntities(gameData),
            new Set(compatibleAllowedSources),
          )
        : undefined
    const legacyRaceKeys = originSystem === '2024' ? XPHB_LEGACY_RACE_KEYS : undefined
    const legacyFeatKeys = originSystem === '2024' ? XPHB_LEGACY_FEAT_KEYS : undefined
    const legacySubclassKeys = originSystem === '2024' ? XPHB_LEGACY_SUBCLASS_KEYS : undefined

    return {
      ...gameData,
      races: DataFilter.filterRaces(races, {
        sources: compatibleAllowedSources,
        suppressedKeys,
        allowedKeys: legacyRaceKeys,
      }),
      classes: DataFilter.filterClasses(classes, {
        sources: compatibleAllowedSources,
        suppressedKeys,
        allowedSubclassKeys: legacySubclassKeys,
      }),
      backgrounds: DataFilter.filterBackgrounds(backgrounds, {
        sources: compatibleAllowedSources,
        suppressedKeys,
      }),
      // Organizations are reference/flavor content (like deities) — not gated by sourcebook.
      organizations,
      spells: DataFilter.filterSpells(spells, {
        sources: compatibleAllowedSources,
        suppressedKeys,
      }),
      feats: DataFilter.filterFeats(feats, {
        sources: compatibleAllowedSources,
        suppressedKeys,
        allowedKeys: legacyFeatKeys,
      }),
      items: filterCharacterItems(items, {
        allowedSources: compatibleAllowedSources,
        originSystem,
        suppressedKeys,
      }),
      itemsBase: filterCharacterItems(itemsBase, {
        allowedSources: compatibleAllowedSources,
        originSystem,
        suppressedKeys,
      }),
      itemMasteries: itemMasteries.filter((mastery) =>
        compatibleAllowedSources.some(
          (source) => source.toUpperCase() === mastery.source.toUpperCase(),
        ),
      ),
      classFeatures: classFeatures.filter(
        (cf) =>
          compatibleAllowedSources.some((s) => s.toUpperCase() === cf.source.toUpperCase()) &&
          !(suppressedKeys?.has(`${cf.name}|${cf.source}`) ?? false),
      ),
      creatures: creatures.filter((creature) => {
        const source = creature.source.toUpperCase()
        const implicitMonsterSource = originSystem === '2024' ? 'XMM' : 'MM'
        const sourceIsAvailable =
          source === implicitMonsterSource ||
          compatibleAllowedSources.some((allowed) => allowed.toUpperCase() === source)
        return (
          sourceIsAvailable &&
          !(suppressedKeys?.has(`${creature.name}|${creature.source}`) ?? false)
        )
      }),
      optionalfeatures: optionalfeatures.filter((of: unknown) => {
        const optionalFeature = of as { name?: string; source?: string }
        const source = optionalFeature.source ?? ''
        if (!compatibleAllowedSources.some((s) => s.toUpperCase() === source.toUpperCase())) {
          return false
        }
        return !(suppressedKeys?.has(`${optionalFeature.name}|${source}`) ?? false)
      }),
      sources,
      languages: DataFilter.filterLanguages(gameData.languages ?? [], {
        sources: compatibleAllowedSources,
      }),
    }
  }, [gameData, allowedSources, preferNewerPrintings, originSystem])

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
    return getEffectiveSources(allowedSources, originSystem ?? '2014')
  }, [allowedSources, originSystem])

  return useFilteredGameDataParams({
    allowedSources: effectiveSources,
    preferNewerPrintings,
    originSystem: originSystem ?? '2014',
  })
}
