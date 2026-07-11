import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  addUniqueNormalized,
  addUniqueTool,
  addUniqueWeapon,
  collectFromProfBlocks,
  collectWeaponOrArmorFromProfBlocks,
  sanitizeProficiencyLabel,
} from '@/lib/calculations/proficiencyLabels'
import { normalizeKey } from '@/lib/provenance'

export interface AvailableProficiencies {
  armor: string[]
  weapons: string[]
  tools: string[]
  languages: string[]
}

/**
 * Returns all available proficiency options for each category from game data.
 * Never hardcoded — all sourced from 5etools data. Respects the active character's
 * `allowedSources` and `preferNewerPrintings` settings via `useFilteredGameData`.
 */
export function useAvailableProficiencies(): AvailableProficiencies {
  const filteredData = useFilteredGameData()
  const { races, classes, backgrounds, items, itemsBase, languages } = filteredData

  return useMemo(() => {
    // Items are already source-filtered by useFilteredGameData; pass empty allowedSources so
    // resolveRaceGrantFilterOptions does not double-filter them.
    const raceOptionContext = { items, itemsBase, allowedSources: [] as string[] }

    const armorMap = new Map<string, string>()
    for (const cls of classes) {
      for (const a of cls.startingProficiencies?.armor ?? []) {
        addUniqueNormalized(armorMap, a)
      }
    }
    for (const race of races) {
      collectWeaponOrArmorFromProfBlocks(
        race.armorProficiencies as Record<string, unknown>[] | undefined,
        armorMap,
        'armor',
        raceOptionContext,
      )
      // subraces are already source-filtered by DataFilter.filterRaces
      for (const sr of race.subraces ?? []) {
        collectWeaponOrArmorFromProfBlocks(
          (sr as { armorProficiencies?: Record<string, unknown>[] }).armorProficiencies,
          armorMap,
          'armor',
          raceOptionContext,
        )
      }
    }
    const armor = Array.from(armorMap.values()).sort()

    const weaponMap = new Map<string, string>()
    for (const cls of classes) {
      for (const w of cls.startingProficiencies?.weapons ?? []) {
        addUniqueWeapon(weaponMap, w)
      }
    }
    for (const race of races) {
      collectWeaponOrArmorFromProfBlocks(
        race.weaponProficiencies as Record<string, unknown>[] | undefined,
        weaponMap,
        'weapons',
        raceOptionContext,
      )
      for (const sr of race.subraces ?? []) {
        collectWeaponOrArmorFromProfBlocks(
          (sr as { weaponProficiencies?: Record<string, unknown>[] }).weaponProficiencies,
          weaponMap,
          'weapons',
          raceOptionContext,
        )
      }
    }
    const weapons = Array.from(weaponMap.values()).sort()

    const toolMap = new Map<string, string>()
    for (const cls of classes) {
      for (const t of cls.startingProficiencies?.tools ?? []) {
        addUniqueTool(toolMap, t)
      }
    }
    for (const bg of backgrounds) {
      collectFromProfBlocks(bg.toolProficiencies, toolMap)
    }
    for (const race of races) {
      collectFromProfBlocks(
        race.toolProficiencies as Record<string, unknown>[] | undefined,
        toolMap,
      )
      for (const sr of race.subraces ?? []) {
        collectFromProfBlocks(
          (sr as { toolProficiencies?: Record<string, unknown>[] }).toolProficiencies,
          toolMap,
        )
      }
    }
    const tools = Array.from(toolMap.values()).sort()

    const languageSet = new Map<string, string>()
    for (const lang of languages) {
      const cleanName = sanitizeProficiencyLabel(lang.name)
      if (!cleanName) continue
      const norm = normalizeKey(cleanName)
      if (!languageSet.has(norm)) languageSet.set(norm, cleanName)
    }
    const allLanguages = Array.from(languageSet.values()).sort()

    return {
      armor,
      weapons,
      tools,
      languages: allLanguages,
    }
  }, [races, classes, backgrounds, items, itemsBase, languages])
}
