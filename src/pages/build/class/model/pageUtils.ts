import { getProgressiveChoiceGainCount } from '@/lib/5etools/classChoiceNormalization'
import { getSubclassFeatureGroups, resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
  getSubclassFeatureReferenceLevel,
  isExactSubclassFeatureReference,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { matchesNativeSubclassGain } from '@/lib/5etools/nativeSubclassGain'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { isSpellOnClassList } from '@/lib/calculations/spellProfiles'
import { optionalClassOwner } from '@/lib/character/optionalClassFeatureIdentity'
import type {
  ClassFeatureDisplay,
  SelectedFeatureState,
} from '@/pages/build/class/components/DetailsPanel'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

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
  if (
    classData &&
    !findClassReference({ name: selection.className, source: selection.classSource }, [classData])
  )
    return null
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

const normalized = (value: string | undefined) => value?.trim().toLowerCase()

export function isProgressiveChoiceFeature(
  feature: ClassFeatureDisplay,
  choice: NormalizedCharacterChoice,
) {
  const origin = feature.origin
  if (
    origin?.kind !== 'declared' ||
    JSON.stringify(origin.owner) !== JSON.stringify(optionalClassOwner(choice.owner))
  )
    return false
  const label = normalized(choice.label)
  const name = normalized(feature.name)
  return (
    name === label ||
    name === `additional ${label}` ||
    name === normalized(choice.owner.featureName)
  )
}

export function isDeclaredProgressiveChoiceAnchor(
  feature: ClassFeatureDisplay,
  cls: Class5e | undefined,
  subclass: Subclass5e | undefined,
) {
  const origin = feature.origin
  if (
    origin?.kind !== 'declared' ||
    ('sourceIdentityConflict' in feature && feature.sourceIdentityConflict)
  )
    return false
  if (origin.owner[0] === 'subclass') {
    return (
      subclass?.subclassFeatureRefs?.filter(
        (ref) =>
          !ref.sourceIdentityConflict &&
          isExactSubclassFeatureReference({ ...ref }, ref.ref) &&
          getSubclassFeatureIdentity(decodeSubclassFeatureReference(ref.ref)) === origin.target,
      ).length === 1
    )
  }
  return (
    cls?.classFeatureRefs?.filter(
      (ref) =>
        !ref.feature?.sourceIdentityConflict &&
        getClassFeatureIdentity(ref) === origin.target &&
        getClassFeatureIdentity(decodeClassFeatureReference(ref.ref)) === origin.target,
    ).length === 1
  )
}

/** A verified named feature can anchor an earned choice. Otherwise its row stands on its own. */
export function projectClassLevelFeatures(
  featuresByLevel: Map<number, ClassFeatureDisplay[]>,
  cls: Class5e | undefined,
  subclass: Subclass5e | undefined,
  sourceSubclass: Subclass5e | undefined,
  choices: readonly NormalizedCharacterChoice[],
  classLevel: number,
) {
  if (
    !cls ||
    !subclass ||
    !sourceSubclass ||
    subclass.sourceIdentityConflict ||
    !findClassReference({ name: subclass.className, source: subclass.classSource }, [cls])
  )
    return featuresByLevel

  const result = new Map(featuresByLevel)
  const isSorcerer = !!findClassReference(cls, [
    { name: 'Sorcerer', source: 'PHB' },
    { name: 'Sorcerer', source: 'XPHB' },
  ])
  for (const { level, features } of getSubclassFeatureGroups(subclass)) {
    if (level > classLevel) continue
    const refs =
      sourceSubclass.subclassFeatureRefs?.filter(
        (ref) => getSubclassFeatureReferenceLevel(ref) === level,
      ) ?? []
    const targets = refs.flatMap((ref) => {
      const decoded = decodeSubclassFeatureReference(ref.ref)
      return !ref.sourceIdentityConflict &&
        isExactSubclassFeatureReference({ ...ref }, ref.ref) &&
        normalized(decoded.className) === normalized(cls.name) &&
        (normalized(decoded.classSource) === normalized(cls.source) ||
          (normalized(cls.source) === 'xphb' &&
            normalized(decoded.classSource) === 'phb' &&
            normalized(subclass.source) !== 'xphb')) &&
        normalized(decoded.subclassShortName) === normalized(subclass.shortName) &&
        normalized(decoded.subclassSource) === normalized(subclass.source)
        ? [getSubclassFeatureIdentity(decoded)]
        : []
    })
    const exact = features.filter((feature) => {
      const target = getSubclassFeatureIdentity(feature)
      return (
        !!target &&
        targets.filter((ref) => ref === target).length === 1 &&
        features.filter((row) => getSubclassFeatureIdentity(row) === target).length === 1 &&
        !feature.sourceIdentityConflict &&
        !!feature.entries?.length
      )
    })
    const current = result.get(level) ?? []
    if (isSorcerer && (level === 14 || level === 18) && exact.length) {
      const complete = targets.length === refs.length && refs.length === exact.length
      result.set(
        level,
        current.flatMap<ClassFeatureDisplay>((feature) =>
          feature.origin?.kind === 'declared' &&
          matchesNativeSubclassGain(cls, feature.origin.target, level, 'at-level')
            ? complete
              ? exact
              : [feature, ...exact]
            : [feature],
        ),
      )
    } else {
      const anchors = exact.filter((feature) =>
        choices.some(
          (choice) =>
            level > choice.level &&
            getProgressiveChoiceGainCount(choice, level) &&
            isProgressiveChoiceFeature(feature, choice),
        ),
      )
      if (anchors.length) result.set(level, [...current, ...anchors])
    }
  }
  return result
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
  return findClassReference(entry, Object.values(classLookup))
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
      (choice) =>
        earned.includes(choice.level) &&
        !!findClassReference(entry, [{ name: choice.className, source: choice.classSource }]),
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
