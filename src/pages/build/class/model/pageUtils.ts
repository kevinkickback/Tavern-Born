import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'

interface CountAsiAndFeatSlotsParams {
  classProgression: CharacterClassEntry[]
  character: Character | null
  classLookup: Record<string, Class5e | undefined>
  fallbackClassByName: Map<string, Class5e>
}

interface BuildLevelsToShowParams {
  allClassFeatures: Array<{ level?: number }>
  asiLevels: number[]
  subclassLevel: number
  viewingClassLevel: number
  spellChoicesByLevel: Map<number, unknown>
  classChoiceLevels?: number[]
}

interface BuildFeatModalFeatsParams<T extends { name: string; source?: string }> {
  availableFeats: T[]
  selectedFeats: Array<{ name: string; source?: string }>
  createFallback: (selected: { name: string; source?: string }) => T
}

function resolveClassForEntry(
  entry: Pick<CharacterClassEntry, 'name' | 'source'>,
  classLookup: Record<string, Class5e | undefined>,
  fallbackClassByName: Map<string, Class5e>,
): Class5e | undefined {
  if (entry.source) {
    return classLookup[getEntityLookupKey(entry.name, entry.source)]
  }
  return fallbackClassByName.get(entry.name)
}

export function countTotalAsiAcrossClasses({
  classProgression,
  character,
  classLookup,
  fallbackClassByName,
}: CountAsiAndFeatSlotsParams): number {
  if (!character) return 0

  let count = 0
  for (const entry of classProgression) {
    const cls = resolveClassForEntry(entry, classLookup, fallbackClassByName)
    const levels = getASILevelsFromClass(cls)
    count += levels.filter((level) => level <= (entry.levels ?? 0)).length
  }
  return count
}

export function countTotalFeatSlots({
  classProgression,
  character,
  classLookup,
  fallbackClassByName,
}: CountAsiAndFeatSlotsParams): number {
  if (!character) return 0

  let count = 0
  for (const entry of classProgression) {
    const cls = resolveClassForEntry(entry, classLookup, fallbackClassByName)
    const earned = getASILevelsFromClass(cls).filter((level) => level <= (entry.levels ?? 0))
    const usedForAsi = (character.asiChoices ?? []).filter(
      (choice) => choice.className === entry.name && earned.includes(choice.level),
    ).length
    count += earned.length - usedForAsi
  }
  return count
}

export function buildLevelsToShow({
  allClassFeatures,
  asiLevels,
  subclassLevel,
  viewingClassLevel,
  spellChoicesByLevel,
  classChoiceLevels = [],
}: BuildLevelsToShowParams): number[] {
  const levels = new Set<number>()

  allClassFeatures.forEach((feature) => {
    if (feature.level && feature.level <= viewingClassLevel) {
      levels.add(feature.level)
    }
  })

  asiLevels
    .filter((level) => level <= viewingClassLevel)
    .forEach((level) => {
      levels.add(level)
    })

  if (subclassLevel <= viewingClassLevel) {
    levels.add(subclassLevel)
  }

  spellChoicesByLevel.forEach((_, level) => {
    if (level <= viewingClassLevel) {
      levels.add(level)
    }
  })

  classChoiceLevels
    .filter((level) => level > 0 && level <= viewingClassLevel)
    .forEach((level) => {
      levels.add(level)
    })

  return Array.from(levels).sort((a, b) => a - b)
}

export function buildFeatModalFeats<T extends { name: string; source?: string }>({
  availableFeats,
  selectedFeats,
  createFallback,
}: BuildFeatModalFeatsParams<T>): T[] {
  const availableIds = new Set(availableFeats.map((feat) => `${feat.name}|${feat.source ?? ''}`))

  const selectedNotInList = selectedFeats
    .filter((feat) => !availableIds.has(`${feat.name}|${feat.source ?? ''}`))
    .map(createFallback)

  return [...availableFeats, ...selectedNotInList]
}

export function filterClassSpells<
  T extends {
    classes?: { fromClassList?: Array<{ name?: string; source?: string }> }
  },
>(spells: T[], viewingClass?: string, viewingClassSource?: string): T[] {
  if (!viewingClass) return spells

  return spells.filter((spell) => isSpellOnClassList(spell, viewingClass, viewingClassSource))
}
