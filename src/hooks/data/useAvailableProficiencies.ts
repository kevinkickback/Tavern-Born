import { useMemo } from 'react'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  iterateProficiencyBlocks,
  normalizeGenericToolChoice,
  normalizeKey,
  resolveRaceGrantFilterOptions,
  toProficiencyBlocks,
} from '@/lib/provenance'

export interface AvailableProficiencies {
  armor: string[]
  weapons: string[]
  tools: string[]
  languages: string[]
}

function toGenericChoiceLabel(value: string): string {
  return normalizeGenericToolChoice(value) ?? value
}

function sanitizeProficiencyLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let out = value.trim()
  if (!out) return null

  out = out.replace(/\{@[a-zA-Z]+\s+([^}|]+)(?:\|[^}]*)?\}/g, '$1')
  // Fallback for malformed tags like "{@Item Dart Phb|Darks}".
  out = out.replace(/^\{@[a-zA-Z]+\s+/, '').replace(/\}$/, '')
  // Handle plain refs such as "dagger|phb|daggers" by keeping display/base name.
  if (out.includes('|')) {
    const parts = out
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean)
    out = parts[2] ?? parts[0] ?? out
  }
  out = out.replace(/^one type of\s+/i, '')
  out = out.replace(/\s+of your choice$/i, '')
  out = out.replace(/^\+\d+\s+/, '')
  out = out.replace(/\s+/g, ' ').trim()

  out = toGenericChoiceLabel(out)
  if (!out) return null
  return out
}

function canonicalizeToolName(value: string): string {
  const key = normalizeKey(value)
  if (key === "theives' tools" || key === 'theives tools') return "thieves' tools"
  return value
}

function isConcreteToolName(value: string): boolean {
  const key = normalizeKey(value)
  if (key.includes('choose')) return false
  if (key.includes('any')) return false
  if (key.includes('your choice')) return false
  if (key.includes('one type')) return false
  if (key === 'tool') return false
  return true
}

function isConcreteWeaponName(value: string): boolean {
  const key = normalizeKey(value)
  if (key.includes('that have')) return false
  if (key.includes('property')) return false
  if (key.includes('choose')) return false
  if (key.includes('your choice')) return false
  if (key.includes('one type')) return false
  if (key.includes('any')) return false
  return true
}

function addUniqueNormalized(map: Map<string, string>, value: unknown): void {
  const clean = sanitizeProficiencyLabel(value)
  if (!clean) return
  const norm = normalizeKey(clean)
  if (!map.has(norm)) map.set(norm, clean)
}

function addUniqueWeapon(map: Map<string, string>, value: unknown): void {
  const clean = sanitizeProficiencyLabel(value)
  if (!clean || !isConcreteWeaponName(clean)) return
  const norm = normalizeKey(clean)
  if (!map.has(norm)) map.set(norm, clean)
}

function addUniqueTool(map: Map<string, string>, value: unknown): void {
  const clean = sanitizeProficiencyLabel(value)
  if (!clean) return
  const normalizedGeneric = normalizeGenericToolChoice(clean)
  const canonical = normalizedGeneric ?? canonicalizeToolName(clean)
  if (!normalizedGeneric && !isConcreteToolName(canonical)) return
  const norm = normalizeKey(canonical)
  if (!map.has(norm)) map.set(norm, canonical)
}

function collectFromProfBlocks(
  blocks: Record<string, unknown>[] | undefined,
  map: Map<string, string>,
): void {
  for (const entry of iterateProficiencyBlocks(toProficiencyBlocks(blocks), 'tools')) {
    if (entry.kind === 'fixed' || entry.kind === 'numeric') {
      addUniqueTool(map, entry.key)
      continue
    }
    if (entry.kind === 'generic-tool') {
      addUniqueTool(map, entry.genericKey)
      continue
    }
    if (entry.kind === 'choose') {
      for (const choice of entry.from) addUniqueTool(map, choice)
    }
  }
}

function collectWeaponOrArmorFromProfBlocks(
  blocks: Record<string, unknown>[] | undefined,
  map: Map<string, string>,
  domain: 'armor' | 'weapons',
  context: Parameters<typeof resolveRaceGrantFilterOptions>[2],
): void {
  for (const entry of iterateProficiencyBlocks(toProficiencyBlocks(blocks), domain)) {
    if (entry.kind === 'fixed' || entry.kind === 'numeric') {
      if (domain === 'weapons') addUniqueWeapon(map, entry.key)
      else addUniqueNormalized(map, entry.key)
      continue
    }

    if (entry.kind === 'choose') {
      for (const item of entry.from) {
        if (domain === 'weapons') addUniqueWeapon(map, item)
        else addUniqueNormalized(map, item)
      }

      if (typeof entry.fromFilter === 'string') {
        for (const item of resolveRaceGrantFilterOptions(domain, entry.fromFilter, context)) {
          if (domain === 'weapons') addUniqueWeapon(map, item)
          else addUniqueNormalized(map, item)
        }
      }
    }
  }
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
