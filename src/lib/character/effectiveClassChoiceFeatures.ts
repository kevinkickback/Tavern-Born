import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { checkAllPrerequisites } from '@/lib/calculations/prerequisiteRules'
import { buildEffectivePrerequisiteSnapshot } from '@/lib/calculations/prerequisiteSnapshot'
import { addGrant } from '@/lib/provenance/ledger'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { Character, Feature, SpellProfile } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import {
  getClassChoiceFeatureId,
  getClassChoiceGrantedFeature,
  getClassChoiceOptionKey,
} from './classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import { getOptionalClassPoolSection } from './optionalClassAdoptionRules'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'

/** Exact current contributing routes retain shared IDs; unproved reserved IDs never become manual. */
function buildEffectiveClassChoiceFeatureRoutes(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  effectiveSpellProfiles?: readonly SpellProfile[],
) {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const choices = new Map(
    character.classProgression
      .flatMap((owner) => {
        const cls = findClassReference(owner, catalogs?.classes ?? [])
        return cls
          ? getClassChoiceCandidates(cls, getSelectedSubclassData(cls, owner), catalogs)
          : []
      })
      .filter(activity.choice)
      .map((row) => [row.id, row]),
  )
  const featureIds = new Set<string>(),
    choiceIds = new Set<string>()
  const featureNamesByChoice = new Map<string, Set<string>>()
  const contributions: Array<{
    id: string
    choiceId: string
    name: string
    feature: Feature
    guarded: boolean
    prerequisite: ReturnType<typeof resolveClassChoiceOptions>[number]['prerequisite']
    className: string
    classSource: string
  }> = []
  for (const selection of character.classChoiceSelections ?? []) {
    const choice = choices.get(selection.choiceId)
    const owner = findClassReference(
      { name: selection.className, source: selection.classSource },
      character.classProgression,
    )
    if (
      !choice ||
      !owner ||
      choice.kind !== selection.kind ||
      choice.level !== selection.classLevel ||
      choice.owner.name.trim().toLowerCase() !== selection.className.trim().toLowerCase() ||
      choice.owner.source.trim().toLowerCase() !== selection.classSource.trim().toLowerCase() ||
      (choice.owner.subclassName?.trim().toLowerCase() ?? '') !==
        (selection.subclassName?.trim().toLowerCase() ?? '') ||
      (choice.owner.subclassSource?.trim().toLowerCase() ?? '') !==
        (selection.subclassSource?.trim().toLowerCase() ?? '') ||
      selection.selected.length > getRequiredChoiceSelectionCount(choice, owner.levels) ||
      new Set(selection.selected.map(getClassChoiceOptionKey)).size !== selection.selected.length
    )
      continue
    choiceIds.add(choice.id)
    if (
      !selection.selected.some((row) =>
        ['classFeature', 'subclassFeature', 'optionalFeature'].includes(row.entityType),
      )
    )
      continue
    const options = catalogs
      ? resolveClassChoiceOptions(
          choice,
          createClassChoiceCatalogs(catalogs),
          selection.selected,
          owner.levels,
          character,
        )
      : []
    const eligible = new Set(
      options
        .filter((row) => row.availability === 'eligible')
        .map((row) => getClassChoiceOptionKey(row.reference)),
    )
    for (const option of selection.selected) {
      if (
        option.slotLevel < choice.level ||
        option.slotLevel > owner.levels ||
        !eligible.has(getClassChoiceOptionKey(option))
      )
        continue
      if (['classFeature', 'subclassFeature', 'optionalFeature'].includes(option.entityType)) {
        const view = options.find(
          (row) => getClassChoiceOptionKey(row.reference) === getClassChoiceOptionKey(option),
        )!
        contributions.push({
          id: getClassChoiceFeatureId(selection, option),
          feature: getClassChoiceGrantedFeature(selection, option),
          choiceId: selection.choiceId,
          name: option.name,
          guarded: !!getOptionalClassPoolSection(choice),
          prerequisite: view.prerequisite,
          className: selection.className,
          classSource: selection.classSource,
        })
      }
    }
  }
  // Grow only from independent providers and prior rounds. A pick cannot bootstrap itself or a cycle.
  const seed = character.features.filter((row) => !row.id.startsWith('class-choice:'))
  const accepted = new Set<number>()
  contributions.forEach((row, index) => {
    if (!row.guarded) accepted.add(index)
  })
  const baseSnapshot = contributions.some((row) => row.guarded)
    ? buildEffectivePrerequisiteSnapshot({
        character: { ...character, features: seed },
        effectiveSpellProfiles,
      })
    : undefined
  for (let round = 0; round <= contributions.length; round++) {
    if (!baseSnapshot) break
    const snapshot = {
      ...baseSnapshot,
      features: [...seed, ...[...accepted].map((index) => ({ name: contributions[index].name }))],
    }
    const additions = contributions.flatMap((row, index) =>
      !accepted.has(index) &&
      checkAllPrerequisites({ prerequisite: row.prerequisite }, snapshot, {
        className: row.className,
        classSource: row.classSource,
      }).met
        ? [index]
        : [],
    )
    if (!additions.length) break
    for (const index of additions) accepted.add(index)
  }
  for (const index of accepted) {
    const row = contributions[index]
    featureIds.add(row.id)
    const names = featureNamesByChoice.get(row.choiceId) ?? new Set<string>()
    names.add(row.name.trim().toLowerCase())
    featureNamesByChoice.set(row.choiceId, names)
  }
  return {
    featureIds,
    choiceIds,
    featureNamesByChoice,
    contributions: [...accepted].map((index) => contributions[index]),
  }
}

const noCatalog = {}
const cache = new WeakMap<
  Character,
  WeakMap<
    object,
    {
      profiles?: readonly SpellProfile[]
      result: ReturnType<typeof buildEffectiveClassChoiceFeatureRoutes>
    }
  >
>()
export function getEffectiveClassChoiceFeatureRoutes(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  effectiveSpellProfiles?: readonly SpellProfile[],
) {
  let entries = cache.get(character)
  if (!entries) {
    entries = new WeakMap()
    cache.set(character, entries)
  }
  const key = catalogs ?? noCatalog
  const old = entries.get(key)
  if (old && old.profiles === effectiveSpellProfiles) return old.result
  const next = buildEffectiveClassChoiceFeatureRoutes(character, catalogs, effectiveSpellProfiles)
  entries.set(key, { profiles: effectiveSpellProfiles, result: next })
  return next
}

export function projectEffectiveClassChoiceFeatures(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  effectiveSpellProfiles?: readonly SpellProfile[],
): Character {
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, effectiveSpellProfiles)
  const features = character.features.filter(
    (row) => !row.id.startsWith('class-choice:') || routes.featureIds.has(row.id),
  )
  const existingIds = new Set(features.map((row) => row.id))
  for (const row of routes.contributions)
    if (!existingIds.has(row.id)) {
      features.push(row.feature)
      existingIds.add(row.id)
    }
  const managed = new Set((character.classChoiceSelections ?? []).map((row) => row.choiceId))
  let changed =
    features.length !== character.features.length ||
    features.some((row, index) => row !== character.features[index])
  const provenanceFeatures = Object.fromEntries(
    Object.entries(character.provenance.features).flatMap(([name, tags]) => {
      const kept = tags.filter(
        (tag) =>
          !(
            tag.sourceType === 'class' &&
            tag.grantVariant &&
            managed.has(tag.grantVariant) &&
            !routes.featureNamesByChoice.get(tag.grantVariant)?.has(name.trim().toLowerCase())
          ),
      )
      if (kept.length !== tags.length) changed = true
      return kept.length ? [[name, kept]] : []
    }),
  )
  const baseLedger = changed
    ? { ...character.provenance, features: provenanceFeatures }
    : character.provenance
  let provenance = baseLedger
  for (const row of routes.contributions)
    provenance = addGrant(provenance, 'features', row.name, {
      ...makeSourceTag('class', row.className, 'choice', row.classSource),
      grantVariant: row.choiceId,
    })
  changed ||= provenance !== baseLedger
  return changed
    ? {
        ...character,
        features,
        provenance,
      }
    : character
}
