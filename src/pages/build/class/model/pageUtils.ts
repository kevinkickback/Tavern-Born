import { getSubclassFeatureGroups, resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import type { SelectedFeatureState } from '@/pages/build/class/components/DetailsPanel'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'

/** Store the selected owner and printing, rather than a catalog-content snapshot. */
export interface SubclassDetailsSelection {
  kind: 'subclass'
  name: string
  source: string
  className: string
  classSource: string
}

export type ClassDetailsSelection = SelectedFeatureState | SubclassDetailsSelection

export function createSubclassDetailsSelection(
  classData: Class5e,
  subclass: Subclass5e,
): SubclassDetailsSelection {
  return {
    kind: 'subclass',
    name: subclass.name,
    source: subclass.source,
    className: classData.name,
    classSource: classData.source,
  }
}

export function resolveSubclassDetailsSelection(
  selection: ClassDetailsSelection | null,
  classData: Class5e | undefined,
): SelectedFeatureState | null {
  if (!selection || !('kind' in selection)) return selection
  const ownerKey = getEntityLookupKey(selection.className, selection.classSource)
  if (classData && getEntityLookupKey(classData.name, classData.source) !== ownerKey) return null
  const key = getEntityLookupKey(selection.name, selection.source)
  const subclass = classData?.subclasses?.find(
    (value) => getEntityLookupKey(value.name, value.source) === key,
  )
  return {
    name: subclass?.name ?? selection.name,
    source: subclass?.source ?? selection.source,
    entries: resolveSubclassFeatureRefs(subclass?.entries ?? [], subclass?.shortName),
    levelFeatures: getSubclassFeatureGroups(subclass),
  }
}

interface CountAsiAndFeatSlotsParams {
  classProgression: CharacterClassEntry[]
  character: Character | null
  classLookup: Record<string, Class5e | undefined>
}

interface BuildLevelsToShowParams {
  allClassFeatures: Array<{ level?: number }>
  asiLevels: number[]
  subclassLevel: number | undefined
  viewingClassLevel: number
  spellChoicesByLevel: Map<number, unknown>
  classChoiceLevels?: number[]
}

function resolveClassForEntry(
  entry: Pick<CharacterClassEntry, 'name' | 'source'>,
  classLookup: Record<string, Class5e | undefined>,
): Class5e | undefined {
  return classLookup[getEntityLookupKey(entry.name, entry.source)]
}

export function countTotalAsiAcrossClasses({
  classProgression,
  character,
  classLookup,
}: CountAsiAndFeatSlotsParams): number {
  if (!character) return 0

  let count = 0
  for (const entry of classProgression) {
    const cls = resolveClassForEntry(entry, classLookup)
    const levels = getASILevelsFromClass(cls)
    count += levels.filter((level) => level <= (entry.levels ?? 0)).length
  }
  return count
}

export function countTotalFeatSlots({
  classProgression,
  character,
  classLookup,
}: CountAsiAndFeatSlotsParams): number {
  if (!character) return 0

  let count = 0
  for (const entry of classProgression) {
    const cls = resolveClassForEntry(entry, classLookup)
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

  if (subclassLevel !== undefined && subclassLevel <= viewingClassLevel) {
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

export function filterClassSpells<
  T extends {
    classes?: { fromClassList?: Array<{ name?: string; source?: string }> }
  },
>(spells: T[], viewingClass?: string, viewingClassSource?: string): T[] {
  if (!viewingClass) return spells

  return spells.filter((spell) => isSpellOnClassList(spell, viewingClass, viewingClassSource))
}
