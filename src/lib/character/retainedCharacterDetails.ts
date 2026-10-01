import {
  buildGameDataLookups,
  getEntityLookupKey,
  getSubclassLookupKey,
} from '@/lib/5etools/lookups'
import { getRaceTraits } from '@/lib/calculations/raceUtils'
import {
  collectSubclassFeatures,
  getCreatureChoiceEntries,
  resolveClassChoiceOptionEntity,
} from '@/lib/character/classChoiceOptions'
import type {
  Class5e,
  ClassFeature,
  Creature5e,
  GameData,
  OptionalFeatureLike,
  Race5e,
} from '@/types/5etools'
import type { Character } from '@/types/character'

export interface RetainedChoiceDetails {
  availability: 'available' | 'source-unavailable' | 'missing'
  entries: unknown[]
}

function classFeatures(classData: Class5e | undefined): ClassFeature[] {
  return [
    ...(classData?.classFeatures ?? []).filter(
      (feature): feature is ClassFeature => typeof feature !== 'string',
    ),
    ...(classData?.classFeatureRefs ?? []).flatMap((reference) =>
      reference.feature ? [reference.feature] : [],
    ),
  ]
}

/** Exact retained identities use their saved owner context, independent of selection eligibility. */
export function buildRetainedCharacterDetails(
  character: Character,
  primary: GameData,
  raw: GameData | null | undefined,
  race?: Race5e,
) {
  const featureEntriesByKey = new Map<string, unknown[]>()
  const choiceDetailsById = new Map<string, RetainedChoiceDetails[]>()
  const addFeature = (feature: { name: string; source?: string; entries?: unknown[] }) => {
    if (!feature.source) return
    const key = getEntityLookupKey(feature.name, feature.source)
    if (
      !featureEntriesByKey.has(key) ||
      (!featureEntriesByKey.get(key)?.length && feature.entries?.length)
    )
      featureEntriesByKey.set(key, feature.entries ?? [])
  }
  for (const [data, availability] of [
    [primary, 'available'],
    [raw, 'source-unavailable'],
  ] as const) {
    if (!data) continue
    // Filtered views can carry raw lookups, so always rebuild indexes from their own catalogs.
    const lookups = buildGameDataLookups(data)
    for (const feature of [
      ...data.classFeatures,
      ...(data.optionalfeatures as OptionalFeatureLike[]),
    ])
      addFeature(feature)
    const subclassFor = (
      className: string,
      classSource: string,
      subclassName?: string,
      subclassSource?: string,
    ) =>
      lookups.subclassesByKey[
        getSubclassLookupKey(className, classSource, subclassName, subclassSource)
      ]
    for (const entry of character.classProgression) {
      classFeatures(lookups.classesByKey[getEntityLookupKey(entry.name, entry.source)]).forEach(
        addFeature,
      )
      collectSubclassFeatures(
        subclassFor(entry.name, entry.source, entry.subclass, entry.subclassSource),
      ).forEach(addFeature)
    }
    for (const choice of character.classChoiceSelections ?? []) {
      const classKey = getEntityLookupKey(choice.className, choice.classSource)
      const classData = lookups.classesByKey[classKey]
      const catalogs = {
        ...data,
        creatures: data.creatures ?? [],
        optionalFeatures: data.optionalfeatures as OptionalFeatureLike[],
        classFeatures: [
          ...classFeatures(classData),
          ...data.classFeatures.filter(
            (feature) => getEntityLookupKey(feature.className, feature.classSource) === classKey,
          ),
        ],
        subclassFeatures: collectSubclassFeatures(
          subclassFor(
            choice.className,
            choice.classSource,
            choice.subclassName,
            choice.subclassSource,
          ),
        ),
      }
      const details = choiceDetailsById.get(choice.choiceId) ?? []
      choice.selected.forEach((option, index) => {
        if (details[index]?.availability === 'available') return
        const entity = option.source?.trim()
          ? resolveClassChoiceOptionEntity(option, catalogs)
          : undefined
        details[index] = entity
          ? {
              availability,
              entries:
                option.entityType === 'creature'
                  ? getCreatureChoiceEntries(entity as Creature5e)
                  : (entity.entries ?? []),
            }
          : { availability: 'missing', entries: [] }
      })
      choiceDetailsById.set(choice.choiceId, details)
    }
  }
  if (race) {
    for (const trait of getRaceTraits(race)) {
      const key = getEntityLookupKey(trait.name, race.source)
      if (!featureEntriesByKey.has(key)) featureEntriesByKey.set(key, trait.entries)
    }
  }
  return { featureEntriesByKey, choiceDetailsById }
}
