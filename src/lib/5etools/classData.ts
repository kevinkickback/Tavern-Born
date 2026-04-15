import { getMaxSpellLevelForClassLevel } from '@/lib/calculations/spellSlots'
import type {
  Class5e,
  ClassFeature,
  OptFeatureProg,
  OptionalFeatureLike,
  Subclass5e,
  SubclassFeature,
} from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

export type { OptFeatureProg, OptionalFeatureLike }

/**
 * Canonical map of 5etools optional feature type abbreviations to their full display names.
 * Mirrors `Parser.OPT_FEATURE_TYPE_TO_FULL` from the 5etools source.
 */
export const OPT_FEATURE_TYPE_TO_FULL: Readonly<Record<string, string>> = {
  AI: 'Artificer Infusion',
  ED: 'Elemental Discipline',
  EI: 'Eldritch Invocation',
  'EI:PB': 'Eldritch Invocation (Pact of the Blade)',
  MM: 'Metamagic',
  MV: 'Maneuver',
  'MV:B': 'Maneuver, Battle Master',
  AS: 'Arcane Shot',
  OTH: 'Other',
  'FS:F': 'Fighting Style; Fighter',
  'FS:B': 'Fighting Style; Bard',
  'FS:P': 'Fighting Style; Paladin',
  'FS:R': 'Fighting Style; Ranger',
  PB: 'Pact Boon',
  OR: 'Onomancy Resonant',
  RN: 'Rune Knight Rune',
  AF: 'Alchemical Formula',
  TT: "Traveler's Trick",
  RP: 'Renown Perk',
}

/** Convert a 5etools optional feature type abbreviation to its full display name. */
export function optFeatureTypeToFull(type: string): string {
  if (import.meta.env.DEV && !(type in OPT_FEATURE_TYPE_TO_FULL)) {
    console.warn(`[classData] optFeatureTypeToFull: unknown optional feature type code "${type}"`)
  }
  return OPT_FEATURE_TYPE_TO_FULL[type] ?? type
}

/**
 * Canonical map of 5etools feat category abbreviations to their full display names.
 * Mirrors `Parser.FEAT_CATEGORY_TO_FULL` from the 5etools source.
 */
export const FEAT_CATEGORY_TO_FULL: Readonly<Record<string, string>> = {
  D: 'Dragonmark',
  G: 'General',
  O: 'Origin',
  FS: 'Fighting Style',
  'FS:P': 'Fighting Style Replacement (Paladin)',
  'FS:R': 'Fighting Style Replacement (Ranger)',
  EB: 'Epic Boon',
}

const NON_STANDARD_FEAT_SELECTION_CATEGORIES = new Set(['O', 'EB', 'FS:P', 'FS:R'])

/** Convert a 5etools feat category abbreviation to its full display name. */
export function featCategoryToFull(category: string): string {
  if (import.meta.env.DEV && !(category in FEAT_CATEGORY_TO_FULL)) {
    console.warn(`[classData] featCategoryToFull: unknown feat category code "${category}"`)
  }
  return FEAT_CATEGORY_TO_FULL[category] ?? category
}

/** Returns true when a feat can appear in the generic ASI-driven feat picker. */
export function isNormallySelectableFeatCategory(category?: string): boolean {
  if (!category) return true
  return !NON_STANDARD_FEAT_SELECTION_CATEGORIES.has(category)
}

/** Returns true when a feat can appear in the generic ASI-driven feat picker. */
export function isNormallySelectableFeat(
  feat: Pick<Class5e | { category?: string }, 'category'>,
): boolean {
  const category = typeof feat.category === 'string' ? feat.category : undefined
  return isNormallySelectableFeatCategory(category)
}

export interface SpellGainAtLevel {
  cantrips: number
  spells: number
  maxSpellLevel: number
  /** True when known-caster swap is available (level 2+ with spellsKnownProgression). */
  canSwap: boolean
}

export function getClassSpellGainAtLevel(
  classData: Class5e | undefined,
  level: number,
): SpellGainAtLevel {
  if (!classData?.spellcastingAbility) {
    return { cantrips: 0, spells: 0, maxSpellLevel: 0, canSwap: false }
  }

  const cantripProg = Array.isArray(classData.cantripProgression)
    ? (classData.cantripProgression as number[])
    : undefined
  const spellsFixed = Array.isArray(classData.spellsKnownProgressionFixed)
    ? (classData.spellsKnownProgressionFixed as number[])
    : undefined
  const spellsKnown = Array.isArray(classData.spellsKnownProgression)
    ? (classData.spellsKnownProgression as number[])
    : undefined
  const preparedProg = Array.isArray(classData.preparedSpellsProgression)
    ? (classData.preparedSpellsProgression as number[])
    : undefined

  const idx = level - 1
  const prevIdx = level - 2
  const cantripsNow = cantripProg ? (cantripProg[idx] ?? 0) : 0
  const cantripsPrev = cantripProg && level > 1 ? (cantripProg[prevIdx] ?? 0) : 0
  const newCantrips = Math.max(0, cantripsNow - cantripsPrev)

  let newSpells = 0
  if (spellsFixed) {
    newSpells = spellsFixed[idx] ?? 0
  } else if (spellsKnown) {
    const spellsNow = spellsKnown[idx] ?? 0
    const spellsPrev = level > 1 ? (spellsKnown[prevIdx] ?? 0) : 0
    newSpells = Math.max(0, spellsNow - spellsPrev)
  } else if (preparedProg) {
    const spellsNow = preparedProg[idx] ?? 0
    const spellsPrev = level > 1 ? (preparedProg[prevIdx] ?? 0) : 0
    newSpells = Math.max(0, spellsNow - spellsPrev)
  }

  return {
    cantrips: newCantrips,
    spells: newSpells,
    maxSpellLevel: getMaxSpellLevelForClassLevel(classData, level),
    canSwap:
      level >= 2 &&
      (Array.isArray(classData.spellsKnownProgression) ||
        classData.preparedSpellsChange === 'level'),
  }
}

export function groupFeaturesByLevel<T extends { level?: number }>(
  features: T[],
): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const feature of features) {
    const level = feature.level ?? 0
    if (!map.has(level)) map.set(level, [])
    map.get(level)?.push(feature)
  }
  return map
}

export function getSubclassSelectionInfo(classData: Class5e | undefined): {
  subclassLevel: number
  subclassFeatureName: string | null
} {
  const ref = (classData?.classFeatureRefs ?? []).find(
    (featureRef) => featureRef.gainSubclassFeature === true,
  )

  return {
    subclassLevel: ref?.level ?? ref?.feature?.level ?? 3,
    subclassFeatureName: ref?.feature?.name ?? ref?.name ?? null,
  }
}

export function getSubclassByName(
  classData: Class5e | undefined,
  subclassName?: string,
): Subclass5e | undefined {
  if (!classData || !subclassName) return undefined
  return classData.subclasses?.find(
    (subclass) => subclass.name === subclassName || subclass.shortName === subclassName,
  )
}

export function getSelectedSubclassData(
  classData: Class5e | undefined,
  entry: Pick<CharacterClassEntry, 'subclass' | 'subclassSource'>,
): Subclass5e | undefined {
  if (!classData || !entry.subclass) return undefined

  return (classData.subclasses ?? []).find(
    (subclass) =>
      subclass.name === entry.subclass && (subclass.source ?? '') === (entry.subclassSource ?? ''),
  )
}

export function getSubclassFeatureGroups(
  subclass: Subclass5e | undefined,
): Array<{ level: number; features: SubclassFeature[] }> {
  return (subclass?.levelFeatures ?? []).slice().sort((a, b) => a.level - b.level)
}

export function getClassFeatureGroups(features: ClassFeature[]): Map<number, ClassFeature[]> {
  return groupFeaturesByLevel(features)
}

/** Returns the featureType array for an optional feature, normalizing string→array. */
export function getFeatureTypes(feature: OptionalFeatureLike): string[] {
  return Array.isArray(feature.featureType) ? feature.featureType : [feature.featureType ?? '']
}

/** Total optional features of this type allowed at the given class level. */
export function getOptFeatureTotal(prog: OptFeatureProg['progression'], level: number): number {
  if (level <= 0) return 0
  if (Array.isArray(prog)) return prog[level - 1] ?? 0
  let total = 0
  for (const [k, v] of Object.entries(prog)) {
    if (Number(k) <= level) total = Math.max(total, Number(v))
  }
  return total
}

/**
 * Expand refSubclassFeature entries for a specific selected subclass shortName.
 *
 * - Refs matching the given shortName are replaced with their resolved `.feature` entries.
 * - Refs for other subclasses are removed.
 * - Non-ref entries pass through unchanged; objects with nested `entries` are recursed.
 * - If `subclassShortName` is undefined or empty, all refs are filtered out.
 */
export function resolveSubclassFeatureRefs(
  entries: unknown[],
  subclassShortName: string | undefined,
): unknown[] {
  return entries.flatMap((e) => {
    if (typeof e !== 'object' || e === null) return [e]
    const obj = e as Record<string, unknown>
    if (obj.type !== 'refSubclassFeature') {
      if (Array.isArray(obj.entries)) {
        return [
          {
            ...obj,
            entries: resolveSubclassFeatureRefs(obj.entries, subclassShortName),
          },
        ]
      }
      return [e]
    }
    // Extract this ref's subclass shortName (segment 3 of the pipe-delimited string)
    const refStr = typeof obj.subclassFeature === 'string' ? obj.subclassFeature : ''
    const refShortName = refStr.split('|')[3] ?? ''
    // Filter out if no subclass selected or ref is for a different subclass
    if (!subclassShortName || (refShortName && refShortName !== subclassShortName)) {
      return []
    }
    // Expand resolved feature entries
    const feature = obj.feature as Record<string, unknown> | undefined
    if (feature?.entries && Array.isArray(feature.entries)) {
      return feature.entries as unknown[]
    }
    // No resolved feature — return feature name as a string stub
    const featureName = refStr.split('|')[0] ?? ''
    return featureName ? [featureName] : []
  })
}
