import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
import {
  collectKnownSpells,
  ensureSpellProfiles,
  isSpellOnClassList,
} from '@/lib/calculations/spellProfiles'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'

interface CountAsiAndFeatSlotsParams {
  classProgression: CharacterClassEntry[]
  character: Character | null
  classLookup: Record<string, Class5e | undefined>
  fallbackClassByName: Map<string, Class5e>
}

interface BuildCharacterSnapshotParams {
  character: Character | null
  classProgression: CharacterClassEntry[]
  viewingClass?: string
}

interface BuildLevelsToShowParams {
  allClassFeatures: Array<{ level?: number }>
  asiLevels: number[]
  subclassLevel: number
  viewingClassLevel: number
  spellChoicesByLevel: Map<number, unknown>
  optFeatureProgressions: Array<{
    progression: number[] | Record<string, number>
  }>
  classFeatProgressions: Array<{
    progression: number[] | Record<string, number>
  }>
}

interface BuildFeatModalFeatsParams<T extends { name: string; source?: string }> {
  availableFeats: T[]
  selectedFeats: Array<{ name: string; source?: string }>
  createFallback: (selected: { name: string; source?: string }) => T
}

export function buildClassProgression(character: Character | null): CharacterClassEntry[] {
  return getCharacterClassEntries(character)
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

function getOptFeatureTotalAtLevel(
  progression: number[] | Record<string, number>,
  level: number,
): number {
  if (Array.isArray(progression)) {
    return progression[Math.max(0, level - 1)] ?? 0
  }

  let total = 0
  for (const [key, value] of Object.entries(progression)) {
    if (Number(key) <= level) {
      total = Math.max(total, Number(value))
    }
  }
  return total
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

export function buildCharacterSnapshot({
  character,
  classProgression,
  viewingClass,
}: BuildCharacterSnapshotParams): PrereqCharacterSnapshot {
  const profileSpells = character ? collectKnownSpells(ensureSpellProfiles(character)) : null
  const progressionLevel = classProgression.reduce((sum, entry) => sum + (entry.levels ?? 0), 0)

  return {
    level: progressionLevel > 0 ? progressionLevel : (character?.level ?? 0),
    class: viewingClass,
    race: character?.race,
    abilityScores: character?.abilityScores,
    features: character?.features ?? [],
    spells: {
      cantrips: profileSpells?.cantrips ?? [],
      spellsKnown: profileSpells?.spellsKnown ?? [],
      preparedSpells: profileSpells?.preparedSpells ?? [],
    },
    ...(classProgression.length > 0
      ? {
          progression: {
            classes: classProgression.map((entry) => ({
              name: entry.name,
              levels: entry.levels,
              source: entry.source,
            })),
          },
        }
      : {}),
  }
}

export function buildLevelsToShow({
  allClassFeatures,
  asiLevels,
  subclassLevel,
  viewingClassLevel,
  spellChoicesByLevel,
  optFeatureProgressions,
  classFeatProgressions,
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

  for (const progression of optFeatureProgressions) {
    for (let level = 1; level <= viewingClassLevel; level++) {
      if (
        getOptFeatureTotalAtLevel(progression.progression, level) >
        getOptFeatureTotalAtLevel(progression.progression, level - 1)
      ) {
        levels.add(level)
      }
    }
  }

  for (const progression of classFeatProgressions) {
    for (let level = 1; level <= viewingClassLevel; level++) {
      if (
        getOptFeatureTotalAtLevel(progression.progression, level) >
        getOptFeatureTotalAtLevel(progression.progression, level - 1)
      ) {
        levels.add(level)
      }
    }
  }

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
