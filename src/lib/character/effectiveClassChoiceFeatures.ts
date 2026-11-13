import {
  BLESSED_STRIKES_ID,
  getCurrentBlessedStrikes,
  getSavedBlessedStrikes,
} from '@/lib/5etools/blessedStrikesSource'
import {
  getProgressiveChoiceGainCount,
  getRequiredChoiceSelectionCount,
} from '@/lib/5etools/classChoiceNormalization'
import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { getClassOrderById, getSavedClassOrder } from '@/lib/5etools/classOrderIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  ELEMENTAL_FURY_ID,
  getCurrentElementalFury,
  getSavedElementalFury,
  IMPROVED_ELEMENTAL_FURY_LEVEL,
  IMPROVED_ELEMENTAL_FURY_NAME,
} from '@/lib/5etools/elementalFurySource'
import { getPsionicEntries } from '@/lib/5etools/psionicEntries'
import {
  type InvocationCantripsByOwner,
  isCurrentRevisedInvocationCantripPool,
  isRevisedInvocationPoolId,
  isRevisedTargetedInvocation,
} from '@/lib/5etools/warlockInvocationCantripSource'
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
import type { NormalizedCharacterChoice } from '@/types/classRules'
import {
  getCurrentAtWillInvocation,
  isInvocationPool,
  isRevisedAtWillInvocationOption,
} from './atWillInvocationRules'
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
import { isCompanionFamilyMastery } from './companionFamilies'
import {
  getDeclaredInvocationLeaf,
  isDeclaredRevisedInvocationOption,
} from './declaredInvocationPrerequisites'
import { getFighterStylePair } from './fighterStyleChoices'
import { replayMysticDisciplines } from './mysticDisciplineHistory'
import { getMysticDisciplineState } from './mysticDisciplineReplacement'
import { getOptionalClassPoolSection } from './optionalClassAdoptionRules'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'
import {
  getSavedRevisedInvocationOwner,
  hasEarnedRevisedInvocationSlots,
} from './warlockInvocationChoices'

/** Current independent providers only: feature-owned spells cannot qualify their own producer. */
export interface ClassChoicePrerequisiteContext {
  effectiveAbilityScores?: AbilityScores
  effectiveSpellProfiles?: readonly SpellProfile[]
  knownWarlockCantrips?: InvocationCantripsByOwner
}

/** Exact current contributing routes retain shared IDs; unproved reserved IDs never become manual. */
function buildEffectiveClassChoiceFeatureRoutes(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
  prerequisites?: ClassChoicePrerequisiteContext,
) {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const choiceCandidates = character.classProgression
    .flatMap((owner) => {
      const cls = findClassReference(owner, catalogs?.classes ?? [])
      return cls ? getClassChoiceCandidates(cls, getSelectedSubclassData(cls, owner), catalogs) : []
    })
    .filter(activity.choice)
  const choices = new Map(choiceCandidates.map((row) => [row.id, row]))
  const progressiveChoiceIds = new Set(
    choiceCandidates
      .filter((choice) => getProgressiveChoiceGainCount(choice, choice.level))
      .map((choice) => choice.id),
  )
  const featureIds = new Set<string>(),
    choiceIds = new Set<string>()
  const masteredWeapons = new Map<string, Set<string>>()
  const masteredCompanionFamilies = new Map<string, Set<string>>()
  const seenMastery = new Set<string>()
  const featureNamesByChoice = new Map<string, Set<string>>()
  const selectedOptions: Array<{
    atWillInvocation?: ReturnType<typeof getCurrentAtWillInvocation>
    ambiguousInvocationPool?: boolean
    choice: NormalizedCharacterChoice
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
  const history = character.mysticDisciplineReplacements?.length
    ? replayMysticDisciplines(character)
    : undefined
  const disciplineSlots = history ? getMysticDisciplineState(character, catalogs).slots : []
  const invalidPsionics = getInvalidPsionicSelectionIds(
    character.classChoiceSelections ?? [],
    history,
  )
  const blessedStrikes = getSavedBlessedStrikes(character.classChoiceSelections ?? [])
  const elementalFury = getSavedElementalFury(character.classChoiceSelections ?? [])
  for (const selection of character.classChoiceSelections ?? []) {
    const order = getClassOrderById(selection.choiceId)
    if (
      order?.owner === 'druid' &&
      (getSavedClassOrder(character, order)?.selection !== selection || selection.inactive)
    )
      continue
    if (
      selection.choiceId === BLESSED_STRIKES_ID &&
      (selection !== blessedStrikes || selection.inactive)
    )
      continue
    if (
      selection.choiceId === ELEMENTAL_FURY_ID &&
      (selection !== elementalFury || selection.inactive)
    )
      continue
    if (invalidPsionics.has(selection.choiceId)) continue
    if (
      getFighterStylePair(selection.choiceId) &&
      character.classChoiceSelections?.filter((row) => row.choiceId === selection.choiceId)
        .length !== 1
    )
      continue
    const choice = choices.get(selection.choiceId)
    if (history && selection.kind === 'psionic' && choice) {
      const slots = disciplineSlots.filter((slot) => slot.selection === selection)
      if (slots.length) {
        choiceIds.add(choice.id)
        for (const { current: option, printing } of slots) {
          if (!printing) continue
          selectedOptions.push({ choice, selection, option })
          contributions.push({
            id: getClassChoiceFeatureId(selection, option),
            choiceId: selection.choiceId,
            name: option.name,
            feature: getClassChoiceGrantedFeature(selection, option),
            guarded: false,
            psionic: true,
            entries: getPsionicEntries(printing),
            prerequisite: undefined,
            className: selection.className,
            classSource: selection.classSource,
          })
        }
        continue
      }
    }
    const mastery = choice?.optionFilter?.requiresMastery
    if (mastery) {
      if (seenMastery.has(selection.choiceId)) {
        masteredWeapons.delete(selection.choiceId)
        masteredCompanionFamilies.delete(selection.choiceId)
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
      (!progressiveChoiceIds.has(choice.id) &&
        selection.selected.length > getRequiredChoiceSelectionCount(choice, owner.levels)) ||
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
          prerequisites?.knownWarlockCantrips,
        )
      : []
    const eligible = new Set(
      options
        .filter((row) => row.availability === 'eligible')
        .map((row) => getClassChoiceOptionKey(row.reference)),
    )
    const invocationPool = isInvocationPool(choice)
    const ambiguousInvocationPool =
      invocationPool && choiceCandidates.filter((row) => row.id === choice.id).length > 1
    const validRevisedInvocationSlots =
      isCurrentRevisedInvocationCantripPool(choice, catalogs) &&
      !ambiguousInvocationPool &&
      !!getSavedRevisedInvocationOwner(character, selection) &&
      hasEarnedRevisedInvocationSlots(choice, selection.selected, owner.levels)
    const progressive = progressiveChoiceIds.has(choice.id)
    const countByGain = new Map<number, number>()
    if (progressive) {
      for (const { slotLevel } of selection.selected) {
        countByGain.set(slotLevel, (countByGain.get(slotLevel) ?? 0) + 1)
      }
    }
    for (const option of selection.selected) {
      const declared = isDeclaredRevisedInvocationOption(choice.id, option, catalogs)
      if (declared && !getDeclaredInvocationLeaf(choice, option, catalogs)) continue
      const revisedAtWill =
        isRevisedInvocationPoolId(choice.id) && isRevisedAtWillInvocationOption(option, catalogs)
      if (
        (option.invocationCantrip ||
          declared ||
          (isRevisedInvocationPoolId(choice.id) && isRevisedTargetedInvocation(option))) &&
        !validRevisedInvocationSlots
      )
        continue
      if (
        option.slotLevel < choice.level ||
        option.slotLevel > owner.levels ||
        (progressive &&
          (countByGain.get(option.slotLevel) ?? 0) >
            (getProgressiveChoiceGainCount(choice, option.slotLevel) ?? 0)) ||
        (getFighterStylePair(choice.id) && option.slotLevel !== choice.level) ||
        (mastery && !option.source?.trim()) ||
        (!eligible.has(getClassChoiceOptionKey(option)) &&
          !(revisedAtWill && ambiguousInvocationPool))
      )
        continue
      if (mastery) {
        const mastered = isCompanionFamilyMastery(option)
          ? masteredCompanionFamilies
          : masteredWeapons
        const keys = mastered.get(choice.id) ?? new Set<string>()
        keys.add(getClassChoiceOptionKey(option))
        mastered.set(choice.id, keys)
        continue
      }
      const atWillInvocation = invocationPool
        ? getCurrentAtWillInvocation(choice, selection, option, catalogs, ambiguousInvocationPool)
        : undefined
      if (
        revisedAtWill &&
        (!atWillInvocation || (!ambiguousInvocationPool && !validRevisedInvocationSlots))
      )
        continue
      // Replacements can fill an earlier slot while requiring the current class level.
      if (atWillInvocation && owner.levels < atWillInvocation.minimumLevel) continue
      selectedOptions.push({ atWillInvocation, ambiguousInvocationPool, choice, selection, option })
      if (revisedAtWill && ambiguousInvocationPool) continue
      if (
        ['classFeature', 'subclassFeature', 'optionalFeature', 'psionic'].includes(
          option.entityType,
        )
      ) {
        const view = options.find(
          (row) => getClassChoiceOptionKey(row.reference) === getClassChoiceOptionKey(option),
        )!
        const isFury = choice.id === ELEMENTAL_FURY_ID
        const improved =
          isFury && owner.levels >= IMPROVED_ELEMENTAL_FURY_LEVEL
            ? (getCurrentElementalFury(catalogs)?.improvementFor(option) ?? [])
            : choice.id === BLESSED_STRIKES_ID && owner.levels >= 14
              ? (getCurrentBlessedStrikes(catalogs)?.improvementFor(option) ?? [])
              : []
        contributions.push({
          id: getClassChoiceFeatureId(selection, option),
          feature: getClassChoiceGrantedFeature(selection, option),
          psionic: option.entityType === 'psionic',
          entries: improved.length
            ? [
                ...view.entries,
                {
                  type: 'entries',
                  name: isFury ? IMPROVED_ELEMENTAL_FURY_NAME : 'Improved Blessed Strikes',
                  entries: improved,
                },
              ]
            : view.entries,
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
    progressiveChoiceIds,
    masteredWeapons,
    masteredCompanionFamilies,
    featureNamesByChoice,
    contributions: [...accepted].map((index) => contributions[index]),
    selectedOptions: selectedOptions.filter(
      ({ selection, option, atWillInvocation, ambiguousInvocationPool }) =>
        (!!atWillInvocation && ambiguousInvocationPool) ||
        !['classFeature', 'subclassFeature', 'optionalFeature', 'psionic'].includes(
          option.entityType,
        ) ||
        featureIds.has(getClassChoiceFeatureId(selection, option)),
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
      knownWarlockCantrips?: InvocationCantripsByOwner
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
    old.scores === prerequisites?.effectiveAbilityScores &&
    old.knownWarlockCantrips === prerequisites?.knownWarlockCantrips
  )
    return old.result
  const next = buildEffectiveClassChoiceFeatureRoutes(character, catalogs, prerequisites)
  entries.set(key, {
    profiles: prerequisites?.effectiveSpellProfiles,
    scores: prerequisites?.effectiveAbilityScores,
    knownWarlockCantrips: prerequisites?.knownWarlockCantrips,
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
        (candidate) =>
          (candidate.psionic ||
            candidate.choiceId === BLESSED_STRIKES_ID ||
            candidate.choiceId === ELEMENTAL_FURY_ID) &&
          candidate.id === row.id,
      )
      if (!current) return row
      const description = renderEntriesToText(current.entries)
      return description !== row.description ? { ...row, description } : row
    })
  const existingIds = new Set(features.map((row) => row.id))
  for (const row of routes.contributions)
    if (!existingIds.has(row.id)) {
      features.push(
        row.psionic || row.choiceId === BLESSED_STRIKES_ID || row.choiceId === ELEMENTAL_FURY_ID
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
          feat.classLevel === option.slotLevel &&
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
