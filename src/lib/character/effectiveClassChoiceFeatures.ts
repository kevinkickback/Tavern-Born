import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { checkAllPrerequisites } from '@/lib/calculations/prerequisiteRules'
import { buildEffectivePrerequisiteSnapshot } from '@/lib/calculations/prerequisiteSnapshot'
import { renderEntriesToText } from '@/lib/entryText'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { addGrant } from '@/lib/provenance/ledger'
import { normalizeKey } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import { getInvalidPsionicSelectionIds } from '@/lib/schema/psionicValidation'
import type {
  AbilityScores,
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
  Feature,
  SpellProfile,
} from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import {
  getClassChoiceFeatureId,
  getClassChoiceGrantedFeature,
  getClassChoiceOptionKey,
  getFeatureOwnerKey,
} from './classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getClassChoiceCandidates,
  resolveClassChoiceOptions,
} from './classChoiceOptions'
import { getFighterStylePair } from './fighterStyleChoices'
import { getOptionalClassPoolSection } from './optionalClassAdoptionRules'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'

/** Current independent providers only: feature-owned spells cannot qualify their own producer. */
export interface ClassChoicePrerequisiteContext {
  effectiveAbilityScores?: AbilityScores
  effectiveSpellProfiles?: readonly SpellProfile[]
}

/** Exact current contributing routes retain shared IDs; unproved reserved IDs never become manual. */
function buildEffectiveClassChoiceFeatureRoutes(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
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
  const masteredWeapons = new Map<string, Set<string>>()
  const seenMastery = new Set<string>()
  const featureNamesByChoice = new Map<string, Set<string>>()
  const selectedOptions: Array<{
    selection: CharacterClassChoiceSelection
    option: CharacterClassChoiceOption
  }> = []
  const contributions: Array<{
    id: string
    choiceId: string
    name: string
    feature: Feature
    guarded: boolean
    psionic: boolean
    entries: unknown[]
    prerequisite: ReturnType<typeof resolveClassChoiceOptions>[number]['prerequisite']
    className: string
    classSource: string
  }> = []
  const invalidPsionics = getInvalidPsionicSelectionIds(character.classChoiceSelections ?? [])
  for (const selection of character.classChoiceSelections ?? []) {
    if (invalidPsionics.has(selection.choiceId)) continue
    if (
      getFighterStylePair(selection.choiceId) &&
      character.classChoiceSelections?.filter((row) => row.choiceId === selection.choiceId)
        .length !== 1
    )
      continue
    const choice = choices.get(selection.choiceId)
    const mastery = choice?.optionFilter?.requiresMastery
    if (mastery) {
      if (seenMastery.has(selection.choiceId)) {
        masteredWeapons.delete(selection.choiceId)
        continue
      }
      seenMastery.add(selection.choiceId)
    }
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
      (!mastery &&
        new Set(selection.selected.map(getClassChoiceOptionKey)).size !== selection.selected.length)
    )
      continue
    choiceIds.add(choice.id)
    if (
      !mastery &&
      !selection.selected.some((row) =>
        ['classFeature', 'subclassFeature', 'optionalFeature', 'feat', 'psionic'].includes(
          row.entityType,
        ),
      )
    )
      continue
    const options = catalogs
      ? resolveClassChoiceOptions(
          choice,
          { ...createClassChoiceCatalogs(catalogs), feats: catalogs.featExpertiseFeats ?? [] },
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
        (getFighterStylePair(choice.id) && option.slotLevel !== choice.level) ||
        (mastery && !option.source?.trim()) ||
        !eligible.has(getClassChoiceOptionKey(option))
      )
        continue
      if (mastery) {
        const keys = masteredWeapons.get(choice.id) ?? new Set<string>()
        keys.add(getClassChoiceOptionKey(option))
        masteredWeapons.set(choice.id, keys)
        continue
      }
      selectedOptions.push({ selection, option })
      if (
        ['classFeature', 'subclassFeature', 'optionalFeature', 'psionic'].includes(
          option.entityType,
        )
      ) {
        const view = options.find(
          (row) => getClassChoiceOptionKey(row.reference) === getClassChoiceOptionKey(option),
        )!
        contributions.push({
          id: getClassChoiceFeatureId(selection, option),
          feature: getClassChoiceGrantedFeature(selection, option),
          psionic: option.entityType === 'psionic',
          entries: view.entries,
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
        effectiveAbilityScores: prerequisites?.effectiveAbilityScores,
        effectiveSpellProfiles: prerequisites?.effectiveSpellProfiles ?? [],
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
    masteredWeapons,
    featureNamesByChoice,
    contributions: [...accepted].map((index) => contributions[index]),
    selectedOptions: selectedOptions.filter(
      ({ selection, option }) =>
        !['classFeature', 'subclassFeature', 'optionalFeature', 'psionic'].includes(
          option.entityType,
        ) || featureIds.has(getClassChoiceFeatureId(selection, option)),
    ),
  }
}

const noCatalog = {}
const cache = new WeakMap<
  Character,
  WeakMap<
    object,
    {
      profiles?: readonly SpellProfile[]
      scores?: AbilityScores
      result: ReturnType<typeof buildEffectiveClassChoiceFeatureRoutes>
    }
  >
>()
export function getEffectiveClassChoiceFeatureRoutes(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
) {
  let entries = cache.get(character)
  if (!entries) {
    entries = new WeakMap()
    cache.set(character, entries)
  }
  const key = catalogs ?? noCatalog
  const old = entries.get(key)
  if (
    old &&
    old.profiles === prerequisites?.effectiveSpellProfiles &&
    old.scores === prerequisites?.effectiveAbilityScores
  )
    return old.result
  const next = buildEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  entries.set(key, {
    profiles: prerequisites?.effectiveSpellProfiles,
    scores: prerequisites?.effectiveAbilityScores,
    result: next,
  })
  return next
}

export function projectEffectiveClassChoiceFeatures(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
): Character {
  const routes = getEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  const features = character.features
    .filter((row) => !row.id.startsWith('class-choice:') || routes.featureIds.has(row.id))
    .map((row) => {
      const current = routes.contributions.find(
        (candidate) => candidate.psionic && candidate.id === row.id,
      )
      if (!current) return row
      const description = renderEntriesToText(current.entries)
      return description !== row.description ? { ...row, description } : row
    })
  const existingIds = new Set(features.map((row) => row.id))
  for (const row of routes.contributions)
    if (!existingIds.has(row.id)) {
      features.push(
        row.psionic
          ? { ...row.feature, description: renderEntriesToText(row.entries) }
          : row.feature,
      )
      existingIds.add(row.id)
    }
  const managed = new Set((character.classChoiceSelections ?? []).map((row) => row.choiceId))
  const suppressedStyleGrants = new Map<string, Set<string>>()
  const classFeatChoices = character.classFeatChoices?.flatMap((choice) => {
    if (!catalogs?.classes || !getFighterStylePair(choice.id)) return [choice]
    const owner = getFeatureOwnerKey(
      choice.className,
      choice.classSource,
      choice.subclassName,
      choice.subclassSource,
    )
    const allowed = routes.selectedOptions.filter(
      ({ selection }) =>
        selection.choiceId === choice.id &&
        getFeatureOwnerKey(
          selection.className,
          selection.classSource,
          selection.subclassName,
          selection.subclassSource,
        ) === owner,
    )
    const feats = choice.feats.filter((feat) => {
      const current = allowed.some(
        ({ option }) =>
          option.entityType === 'feat' &&
          (feat.classLevel == null || option.slotLevel === feat.classLevel) &&
          getFeatSelectionKey(option) === getFeatSelectionKey(feat),
      )
      if (!current) {
        const names = suppressedStyleGrants.get(choice.id) ?? new Set<string>()
        names.add(normalizeKey(feat.name))
        suppressedStyleGrants.set(choice.id, names)
      }
      return current
    })
    return feats.length === choice.feats.length
      ? [choice]
      : feats.length
        ? [{ ...choice, feats }]
        : []
  })
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
  const provenanceFeats = suppressedStyleGrants.size
    ? Object.fromEntries(
        Object.entries(character.provenance.feats).flatMap(([name, tags]) => {
          const kept = tags.filter(
            (tag) =>
              tag.sourceType !== 'class' ||
              !tag.grantVariant ||
              !suppressedStyleGrants.get(tag.grantVariant)?.has(name),
          )
          return kept.length ? [[name, kept]] : []
        }),
      )
    : character.provenance.feats
  changed ||= suppressedStyleGrants.size > 0
  const baseLedger = changed
    ? { ...character.provenance, features: provenanceFeatures, feats: provenanceFeats }
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
        classFeatChoices,
        provenance,
      }
    : character
}
