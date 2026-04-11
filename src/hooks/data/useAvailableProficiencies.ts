import { useMemo } from 'react'
import {
  normalizeGenericToolChoice,
  normalizeKey,
  resolveRaceGrantFilterOptions,
} from '@/lib/provenance'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

export interface AvailableProficiencies {
  armor: string[]
  weapons: string[]
  tools: string[]
  languages: string[]
  /** Languages with type "standard" in game data. */
  standardLanguages: string[]
  /** Returns true when the named language is type "standard". Case-insensitive. */
  isStandardLanguage: (name: string) => boolean
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
  if (!Array.isArray(blocks)) return
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    for (const [key, val] of Object.entries(block as Record<string, unknown>)) {
      if (key === 'choose') {
        const chooseFrom = (val as { from?: unknown[] } | undefined)?.from
        if (Array.isArray(chooseFrom)) {
          for (const entry of chooseFrom) addUniqueTool(map, entry)
        }
        continue
      }
      if (typeof val === 'number' && val > 0) {
        addUniqueTool(map, key)
        continue
      }
      if (val === true) addUniqueTool(map, key)
    }
  }
}

function collectWeaponOrArmorFromProfBlocks(
  blocks: Record<string, unknown>[] | undefined,
  map: Map<string, string>,
  domain: 'armor' | 'weapons',
  context: Parameters<typeof resolveRaceGrantFilterOptions>[2],
): void {
  if (!Array.isArray(blocks)) return
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    for (const [key, val] of Object.entries(block)) {
      if (key === 'choose') {
        const choose = val as { from?: unknown[]; fromFilter?: string } | undefined
        if (Array.isArray(choose?.from)) {
          for (const entry of choose.from) {
            if (domain === 'weapons') addUniqueWeapon(map, entry)
            else addUniqueNormalized(map, entry)
          }
        }
        if (typeof choose?.fromFilter === 'string') {
          for (const entry of resolveRaceGrantFilterOptions(domain, choose.fromFilter, context)) {
            if (domain === 'weapons') addUniqueWeapon(map, entry)
            else addUniqueNormalized(map, entry)
          }
        }
        continue
      }
      if (val === true) {
        if (domain === 'weapons') addUniqueWeapon(map, key)
        else addUniqueNormalized(map, key)
      }
    }
  }
}

/**
 * Returns all available proficiency options for each category from game data.
 * Never hardcoded — all sourced from 5etools data.
 */
export function useAvailableProficiencies(): AvailableProficiencies {
  const gameData = useGameDataStore((state) => state.gameData)
  const activeCharacter = useCharacterStore((state) => {
    if (state.activeCharacter) return state.activeCharacter
    if (!state.activeCharacterId) return null
    return state.characters.find((character) => character.id === state.activeCharacterId) ?? null
  })

  return useMemo(() => {
    const empty: AvailableProficiencies = {
      armor: [],
      weapons: [],
      tools: [],
      languages: [],
      standardLanguages: [],
      isStandardLanguage: () => false,
    }
    if (!gameData) return empty

    const allowedSources = activeCharacter?.allowedSources ?? []
    const hasSourceFilter = allowedSources.length > 0
    const isAllowedBySource = (entry: { source?: string } | null | undefined): boolean => {
      if (!hasSourceFilter) return true
      if (!entry?.source) return true
      return allowedSources.includes(entry.source)
    }

    const classes = (gameData.classes ?? []).filter((cls) => isAllowedBySource(cls))
    const backgrounds = (gameData.backgrounds ?? []).filter((bg) => isAllowedBySource(bg))
    const races = (gameData.races ?? []).filter((race) => isAllowedBySource(race))
    const languages = (gameData.languages ?? []).filter((lang) => isAllowedBySource(lang))
    const raceOptionContext = {
      items: gameData.items ?? [],
      itemsBase: gameData.itemsBase ?? [],
      allowedSources,
    }

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
      for (const sr of (race.subraces ?? []).filter((subrace) => isAllowedBySource(subrace))) {
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
      for (const sr of (race.subraces ?? []).filter((subrace) => isAllowedBySource(subrace))) {
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
      for (const sr of (race.subraces ?? []).filter((subrace) => isAllowedBySource(subrace))) {
        collectFromProfBlocks(
          (sr as { toolProficiencies?: Record<string, unknown>[] }).toolProficiencies,
          toolMap,
        )
      }
    }
    const tools = Array.from(toolMap.values()).sort()

    const languageSet = new Map<string, string>()
    const standardSet = new Set<string>()
    const standardMap = new Map<string, string>()
    for (const lang of languages) {
      const cleanName = sanitizeProficiencyLabel(lang.name)
      if (!cleanName) continue
      const norm = normalizeKey(cleanName)
      if (!languageSet.has(norm)) languageSet.set(norm, cleanName)
      if (lang.type === 'standard') {
        if (!standardMap.has(norm)) standardMap.set(norm, cleanName)
        standardSet.add(norm)
      }
    }
    const allLanguages = Array.from(languageSet.values()).sort()
    const standardLanguages = Array.from(standardMap.values()).sort()

    const isStandardLanguage = (name: string) => standardSet.has(normalizeKey(name))

    return {
      armor,
      weapons,
      tools,
      languages: allLanguages,
      standardLanguages,
      isStandardLanguage,
    }
  }, [activeCharacter?.allowedSources, gameData])
}
