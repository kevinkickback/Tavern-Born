import { useCallback, useMemo } from 'react'
import {
  type EntityReference,
  type RaceReference,
  resolveBackgroundReference,
  resolveClassReference,
  resolveRaceReference,
} from '@/lib/5etools/entityResolvers'
import { buildBackgroundLookup, buildClassLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { buildSuppressedKeys } from '@/lib/5etools/reprints'
import { XPHB_LEGACY_RACE_KEYS } from '@/lib/5etools/rulesetMetadata'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { useFilteredGameDataParams } from './useFilteredGameData'
import { useBackgroundLookup, useClassLookup, useRaceLookup } from './useGameData'

interface WizardGameDataParams {
  allowedSources?: string[]
  originSystem?: '2014' | '2024' | ''
  preferNewerPrintings?: boolean
}

export function useWizardGameData({
  allowedSources,
  originSystem,
  preferNewerPrintings = false,
}: WizardGameDataParams) {
  const effectiveSources = useMemo(() => {
    if (!allowedSources) return undefined
    return getEffectiveSources(allowedSources, originSystem || '2014')
  }, [allowedSources, originSystem])
  const filteredData = useFilteredGameDataParams({
    allowedSources: effectiveSources,
    preferNewerPrintings,
    originSystem: originSystem || '2014',
  })
  const rawClassLookup = useClassLookup()
  const rawRaceLookup = useRaceLookup()
  const rawBackgroundLookup = useBackgroundLookup()

  const races = useMemo(() => {
    if (!effectiveSources || effectiveSources.length === 0) return filteredData.races
    const allowed = new Set(effectiveSources.map((source) => source.toUpperCase()))
    const entities = filteredData.races.flatMap((race) => [race, ...(race.subraces ?? [])])
    const suppressed =
      preferNewerPrintings || originSystem === '2024'
        ? buildSuppressedKeys(entities, new Set(effectiveSources))
        : undefined
    return filteredData.races.map((race) => ({
      ...race,
      subraces: (race.subraces ?? []).filter((subrace) => {
        const source = subrace.source ?? race.source
        return (
          (allowed.has(source.toUpperCase()) ||
            (originSystem === '2024' &&
              XPHB_LEGACY_RACE_KEYS.has(`${race.name}|${race.source}`))) &&
          !(suppressed?.has(`${subrace.name}|${source}`) ?? false)
        )
      }),
    }))
  }, [effectiveSources, filteredData.races, originSystem, preferNewerPrintings])
  const classes = useMemo(
    () => filteredData.classes.filter((classEntity) => !classEntity.isSidekick),
    [filteredData.classes],
  )
  const itemLookup = useMemo(
    () => buildItemLookup([...filteredData.items, ...filteredData.itemsBase]),
    [filteredData.items, filteredData.itemsBase],
  )
  const filteredLookups = useMemo(
    () => ({
      classesByKey: buildClassLookup(classes),
      racesByKey: buildRaceLookup(races),
      backgroundsByKey: buildBackgroundLookup(filteredData.backgrounds),
    }),
    [classes, races, filteredData.backgrounds],
  )
  const rawLookups = useMemo(
    () => ({
      classesByKey: rawClassLookup,
      racesByKey: rawRaceLookup,
      backgroundsByKey: rawBackgroundLookup,
    }),
    [rawClassLookup, rawRaceLookup, rawBackgroundLookup],
  )

  const resolveRace = useCallback(
    (reference: RaceReference) => resolveRaceReference(reference, filteredLookups, rawLookups),
    [filteredLookups, rawLookups],
  )
  const resolveClass = useCallback(
    (reference: EntityReference) => resolveClassReference(reference, filteredLookups, rawLookups),
    [filteredLookups, rawLookups],
  )
  const resolveBackground = useCallback(
    (reference: EntityReference) =>
      resolveBackgroundReference(reference, filteredLookups, rawLookups),
    [filteredLookups, rawLookups],
  )

  return {
    ...filteredData,
    races,
    classes,
    itemLookup,
    resolveRace,
    resolveClass,
    resolveBackground,
  }
}
