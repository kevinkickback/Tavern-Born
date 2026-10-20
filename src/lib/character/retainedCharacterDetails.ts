import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import {
  buildSubclassLookup,
  getEntityLookupKey,
  getSubclassLookupKey,
} from '@/lib/5etools/lookups'
import { getRaceTraits } from '@/lib/calculations/raceUtils'
import {
  getClassChoiceFeatureId,
  getClassChoiceFeatureTarget,
  getFeatureOwnerKey,
} from '@/lib/character/classChoiceIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  collectSubclassFeatures,
  getClassChoiceCandidates,
  getCreatureChoiceEntries,
  resolveClassChoiceOptionEntity,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import { isValidClassProficiencySelection } from '@/lib/schema/classProficiencyValidation'
import type {
  Class5e,
  ClassFeature,
  Creature5e,
  GameData,
  OptionalFeatureLike,
  Race5e,
} from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { getEffectiveClassChoiceSelections } from './classChoiceActivity'
import { getProficiencyOptionEntries } from './classProficiencyVocabulary'
import { getEffectiveClassChoiceFeatureRoutes } from './effectiveClassChoiceFeatures'
import { getFeatureOptionSelectionStates } from './featureOptionSelections'
import { getOptionalClassPoolSelectionSection } from './optionalClassAdoptionRules'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import { optionalClassOwner } from './optionalClassFeatureIdentity'

export interface RetainedChoiceDetails {
  availability: 'available' | 'source-unavailable' | 'missing' | 'inactive'
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
  effectiveSpellProfiles?: readonly SpellProfile[],
) {
  const featureEntriesByKey = new Map<string, unknown[]>()
  const choiceDetailsById = new Map<string, RetainedChoiceDetails[]>()
  const primaryCatalogs = buildClassChoiceFeatureCatalogs(primary)
  const effectiveClassChoiceSelections = getEffectiveClassChoiceSelections(
    character,
    primary.classes,
    primaryCatalogs,
  )
  const inactiveLiterals = new Set(
    effectiveClassChoiceSelections
      .filter((selection) => selection.inactive && isFeatureLiteralChoiceId(selection.choiceId))
      .map((selection) => selection.choiceId),
  )
  for (const selection of effectiveClassChoiceSelections)
    if (inactiveLiterals.has(selection.choiceId))
      choiceDetailsById.set(
        selection.choiceId,
        selection.selected.map(() => ({
          availability: 'available',
          entries: [
            'Saved favored-terrain intent is inactive while Deft Explorer replaces Natural Explorer.',
          ],
        })),
      )
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
    const subclassesByKey = buildSubclassLookup(data.classes)
    const featureCatalogs =
      data === primary ? primaryCatalogs : buildClassChoiceFeatureCatalogs(data)
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
    ) => {
      const owner = findClassReference({ name: className, source: classSource }, data.classes)
      return owner
        ? subclassesByKey[
            getSubclassLookupKey(owner.name, owner.source, subclassName, subclassSource)
          ]
        : undefined
    }
    for (const entry of character.classProgression) {
      classFeatures(findClassReference(entry, data.classes)).forEach(addFeature)
      collectSubclassFeatures(
        subclassFor(entry.name, entry.source, entry.subclass, entry.subclassSource),
      ).forEach(addFeature)
    }
    for (const state of getFeatureOptionSelectionStates(character, data.classes, featureCatalogs)) {
      if (inactiveLiterals.has(state.selection.choiceId)) continue
      const details = choiceDetailsById.get(state.selection.choiceId) ?? []
      state.details.forEach((row, index) => {
        if (details[index]?.availability === 'available') return
        details[index] = {
          availability: row.available ? availability : 'missing',
          entries: row.entries,
        }
      })
      choiceDetailsById.set(state.selection.choiceId, details)
    }
    for (const choice of character.classChoiceSelections ?? []) {
      if (data !== primary && isValidClassProficiencySelection(choice)) {
        const relation = decodeClassProficiencyChoiceId(choice.choiceId)!
        const dormant = createOptionalClassFeatureActivity(character, primaryCatalogs).dormant(
          optionalClassOwner({
            name: choice.className,
            source: choice.classSource,
            subclassName: choice.subclassName,
            subclassSource: choice.subclassSource,
          }),
          relation.target,
        )
        const cls = findClassReference(
          { name: choice.className, source: choice.classSource },
          data.classes,
        )
        const candidate =
          cls &&
          getClassChoiceCandidates(
            cls,
            subclassFor(
              choice.className,
              choice.classSource,
              choice.subclassName,
              choice.subclassSource,
            ),
            featureCatalogs,
          ).find((row) => row.id === choice.choiceId && row.level === choice.classLevel)
        if (!dormant && candidate) {
          const details = choiceDetailsById.get(choice.choiceId) ?? []
          choice.selected.forEach((option, index) => {
            if (details[index]?.availability === 'available') return
            const entries = getProficiencyOptionEntries(option, featureCatalogs)
            if (entries) details[index] = { availability: 'source-unavailable', entries }
          })
          choiceDetailsById.set(choice.choiceId, details)
        }
      }
      const catalogs = {
        ...data,
        creatures: data.creatures ?? [],
        optionalFeatures: data.optionalfeatures as OptionalFeatureLike[],
        ...scopeClassChoiceFeatureCatalogs(
          featureCatalogs,
          choice.subclassName
            ? getFeatureOwnerKey(
                choice.className,
                choice.classSource,
                choice.subclassName,
                choice.subclassSource,
              )
            : undefined,
        ),
      }
      const details = choiceDetailsById.get(choice.choiceId) ?? []
      choice.selected.forEach((option, index) => {
        if (
          option.entityType === 'featureOption' ||
          option.entityType === 'proficiency' ||
          choice.choiceId.startsWith('subclass-options:')
        )
          return
        if (details[index]?.availability === 'available') return
        const entity =
          option.source?.trim() || getClassChoiceFeatureTarget(option)
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
  const routes = getEffectiveClassChoiceFeatureRoutes(
    character,
    primaryCatalogs,
    effectiveSpellProfiles,
  )
  for (const selection of character.classChoiceSelections ?? []) {
    if (!getOptionalClassPoolSelectionSection(selection)) continue
    const details = choiceDetailsById.get(selection.choiceId)
    selection.selected.forEach((option, index) => {
      const detail = details?.[index]
      if (
        option.entityType === 'optionalFeature' &&
        detail?.availability === 'available' &&
        !routes.featureIds.has(getClassChoiceFeatureId(selection, option))
      )
        details![index] = { ...detail, availability: 'inactive' }
    })
  }
  if (race) {
    for (const trait of getRaceTraits(race)) {
      const key = getEntityLookupKey(trait.name, race.source)
      if (!featureEntriesByKey.has(key)) featureEntriesByKey.set(key, trait.entries)
    }
  }
  return { featureEntriesByKey, choiceDetailsById, effectiveClassChoiceSelections }
}
