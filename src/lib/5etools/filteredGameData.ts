import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { DataFilter } from '@/lib/5etools/filters'
import { buildLegacySubclassChoiceCatalogs } from '@/lib/5etools/legacySubclassChoices'
import { filterCharacterItems } from '@/lib/5etools/playerItemAvailability'
import { buildSuppressedKeys, collectReprintableEntities } from '@/lib/5etools/reprints'
import {
  XPHB_LEGACY_FEAT_KEYS,
  XPHB_LEGACY_RACE_KEYS,
  XPHB_LEGACY_SUBCLASS_KEYS,
} from '@/lib/5etools/rulesetMetadata'
import { normalizeAllowedSources } from '@/lib/sourceCompatibility'
import type { Creature5e, GameData, ItemMastery5e } from '@/types/5etools'

export interface FilterParams {
  allowedSources?: string[]
  preferNewerPrintings?: boolean
  originSystem?: '2014' | '2024'
}

export interface FilteredGameData extends GameData {
  itemMasteries: ItemMastery5e[]
  creatures: Creature5e[]
}

// Game data is replaced on reload; object identity keeps derived source views in sync.
const filteredDataCache = new WeakMap<GameData, Map<string, FilteredGameData>>()

function cacheFilteredData(
  data: GameData,
  key: string,
  result: FilteredGameData,
): FilteredGameData {
  let variants = filteredDataCache.get(data)
  if (!variants) {
    variants = new Map()
    filteredDataCache.set(data, variants)
  }
  if (variants.size >= 32) variants.delete(variants.keys().next().value ?? '')
  variants.set(key, result)
  return result
}

export function getFilteredGameData(
  gameData: GameData | null,
  { allowedSources, preferNewerPrintings = false, originSystem }: FilterParams,
): FilteredGameData {
  if (!gameData) return createEmptyGameData()

  const cacheKey = JSON.stringify([
    originSystem ?? '',
    preferNewerPrintings,
    (allowedSources ?? []).map((source) => source.trim().toUpperCase()).sort(),
  ])
  const cached = filteredDataCache.get(gameData)?.get(cacheKey)
  if (cached) return cached

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
    return cacheFilteredData(gameData, cacheKey, {
      ...gameData,
      races,
      classes,
      legacySubclassChoices: buildLegacySubclassChoiceCatalogs(gameData, classes),
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
    })
  }

  const suppressedKeys =
    preferNewerPrintings || originSystem === '2024'
      ? buildSuppressedKeys(collectReprintableEntities(gameData), new Set(compatibleAllowedSources))
      : undefined
  const legacyRaceKeys = originSystem === '2024' ? XPHB_LEGACY_RACE_KEYS : undefined
  const legacyFeatKeys = originSystem === '2024' ? XPHB_LEGACY_FEAT_KEYS : undefined
  const legacySubclassKeys = originSystem === '2024' ? XPHB_LEGACY_SUBCLASS_KEYS : undefined

  const filteredClasses = DataFilter.filterClasses(classes, {
    sources: compatibleAllowedSources,
    suppressedKeys,
    allowedSubclassKeys: legacySubclassKeys,
  })
  return cacheFilteredData(gameData, cacheKey, {
    ...gameData,
    races: DataFilter.filterRaces(races, {
      sources: compatibleAllowedSources,
      suppressedKeys,
      allowedKeys: legacyRaceKeys,
    }),
    psionics: (gameData.psionics ?? []).filter((row) =>
      compatibleAllowedSources.some((source) => source.toUpperCase() === row.source.toUpperCase()),
    ),
    classes: filteredClasses,
    legacySubclassChoices: buildLegacySubclassChoiceCatalogs(gameData, filteredClasses),
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
    classFeatures: DataFilter.filterClassFeatures(classFeatures, {
      sources: compatibleAllowedSources,
      suppressedKeys,
    }),
    creatures: creatures.filter((creature) => {
      const source = creature.source.toUpperCase()
      const implicitMonsterSource = originSystem === '2024' ? 'XMM' : 'MM'
      const sourceIsAvailable =
        source === implicitMonsterSource ||
        compatibleAllowedSources.some((allowed) => allowed.toUpperCase() === source)
      return (
        sourceIsAvailable && !(suppressedKeys?.has(`${creature.name}|${creature.source}`) ?? false)
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
  })
}
