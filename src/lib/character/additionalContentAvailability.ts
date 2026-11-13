import { resolveClassProgressionRules } from '@/lib/5etools/classData'
import { isClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { type EntityLookupSet, resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { isFeatureLiteralChoiceId } from '@/lib/5etools/featureOptionIdentity'
import { buildRaceLookup, getEntityLookupKey } from '@/lib/5etools/lookups'
import { resolvePsionic } from '@/lib/5etools/psionics'
import { getSpellReferenceKey, parseSpellReference } from '@/lib/calculations/spellIdentity'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  buildClassChoiceFeatureCatalogs,
  type ClassChoiceFeatureCatalogs,
  resolveClassChoiceFeatureEntity,
  resolveFeatureOptionEntity,
  scopeClassChoiceFeatureCatalogs,
} from '@/lib/character/classChoiceOptions'
import type { Class5e, GameData } from '@/types/5etools'
import type { Character, CharacterClassChoiceOption, Equipment, Feat } from '@/types/character'
import { getEffectiveClassChoiceSelections } from './classChoiceActivity'
import { getClassProficiencySelectionStates } from './classProficiencySelections'
import { hasProficiencyCatalogTarget } from './classProficiencyVocabulary'
import {
  getCompanionFamilyRules,
  isCompanionFamilyMastery,
  isCompanionFamilyOption,
} from './companionFamilies'
import { getCompanionSelectionStates } from './companionSelections'
import { getFeatureOptionSelectionStates } from './featureOptionSelections'
import { getMysticDisciplineState } from './mysticDisciplineReplacement'
import { createOptionalClassFeatureActivity } from './optionalClassFeatureActivity'

export interface GameDataAvailabilityIndex {
  backgrounds: ReadonlySet<string>
  creatures: ReadonlySet<string>
  feats: ReadonlySet<string>
  items: ReadonlySet<string>
  optionalFeatures: ReadonlySet<string>
  spells: ReadonlySet<string>
  raceLookup: EntityLookupSet
  featureOptions?: ClassChoiceFeatureCatalogs
  choiceClasses?: readonly Class5e[]
}

function entityKey(value: { name?: unknown; source?: unknown }): string | null {
  if (typeof value.name !== 'string' || typeof value.source !== 'string') return null
  const key = getEntityLookupKey(value.name, value.source)
  return key === '|' ? null : key
}

function entityKeys(values: readonly unknown[]): Set<string> {
  const keys = new Set<string>()
  for (const value of values) {
    if (!value || typeof value !== 'object') continue
    const key = entityKey(value as { name?: unknown; source?: unknown })
    if (key) keys.add(key)
  }
  return keys
}

export function createGameDataAvailabilityIndex(gameData: GameData): GameDataAvailabilityIndex {
  const featureCatalogs = buildClassChoiceFeatureCatalogs(gameData)
  return {
    raceLookup: { racesByKey: buildRaceLookup(gameData.races) },
    featureOptions: featureCatalogs,
    choiceClasses: gameData.classes,
    backgrounds: entityKeys(gameData.backgrounds),
    creatures: entityKeys(gameData.creatures ?? []),
    feats: entityKeys(gameData.feats),
    items: entityKeys([...(gameData.items ?? []), ...(gameData.itemsBase ?? [])]),
    optionalFeatures: entityKeys(gameData.optionalfeatures),
    spells: new Set(gameData.spells.map((spell) => getSpellReferenceKey(spell.name, spell.source))),
  }
}

function referenceIsMissing(
  name: string | undefined,
  source: string | undefined,
  available: ReadonlySet<string>,
): boolean {
  if (!name?.trim() || !source?.trim()) return false
  return !available.has(getEntityLookupKey(name, source))
}

function featIsMissing(feat: Pick<Feat, 'name' | 'source'>, index: GameDataAvailabilityIndex) {
  return referenceIsMissing(feat.name, feat.source, index.feats)
}

function itemIsMissing(item: Pick<Equipment, 'name' | 'source'>, index: GameDataAvailabilityIndex) {
  return referenceIsMissing(item.name, item.source, index.items)
}

function choiceIsMissing(
  choice: CharacterClassChoiceOption,
  index: GameDataAvailabilityIndex,
  subclassOwner?: string,
): boolean {
  if (choice.entityType === 'psionic')
    return !resolvePsionic(choice, index.featureOptions?.psionics)
  if (choice.entityType === 'proficiency') {
    return !hasProficiencyCatalogTarget(choice, index.featureOptions)
  }
  if (choice.entityType === 'featureOption') {
    return (
      !index.featureOptions ||
      !resolveFeatureOptionEntity(
        choice,
        scopeClassChoiceFeatureCatalogs(index.featureOptions, subclassOwner),
      )
    )
  }
  if (choice.entityType === 'classFeature' || choice.entityType === 'subclassFeature') {
    const catalogs = index.featureOptions
    return (
      !catalogs ||
      !resolveClassChoiceFeatureEntity(
        choice,
        choice.entityType === 'subclassFeature'
          ? scopeClassChoiceFeatureCatalogs(catalogs, subclassOwner)
          : catalogs,
      )
    )
  }
  const catalogs: Record<
    Exclude<
      CharacterClassChoiceOption['entityType'],
      'classFeature' | 'subclassFeature' | 'featureOption' | 'proficiency' | 'psionic'
    >,
    ReadonlySet<string>
  > = {
    creature: index.creatures,
    feat: index.feats,
    item: index.items,
    optionalFeature: index.optionalFeatures,
  }
  return referenceIsMissing(choice.name, choice.source, catalogs[choice.entityType])
}

export interface UnavailableCharacterContent {
  name: string
  source?: string
}

/** Exact saved targets. An empty character filter leaves the full loaded catalog authoritative. */
export function* getUnavailableCharacterContent(
  saved: Character,
  index: GameDataAvailabilityIndex,
): Generator<UnavailableCharacterContent> {
  const character = saved.allowedSources?.length ? { ...saved, allowedSources: [] } : saved
  const race = resolveRaceReference(
    {
      name: character.race,
      source: character.raceSource,
      subraceName: character.subrace,
      subraceSource: character.subraceSource,
    },
    index.raceLookup,
  )
  if (character.race.trim() && character.raceSource?.trim() && !race.parentRace) {
    yield { name: character.race, source: character.raceSource }
  }
  if (
    character.subrace?.trim() &&
    character.subraceSource?.trim() &&
    character.raceSource?.trim() &&
    !race.subraceData
  ) {
    yield { name: character.subrace, source: character.subraceSource }
  }
  if (referenceIsMissing(character.background, character.backgroundSource, index.backgrounds)) {
    yield { name: character.background, source: character.backgroundSource }
  }

  const classes = index.choiceClasses ?? []
  const availableFamilies = character.classChoiceSelections?.some((row) =>
    row.selected.some(isCompanionFamilyOption),
  )
    ? getCompanionSelectionStates(character, classes, index.featureOptions)
    : []
  const spellMissing = ({ name, source }: { name?: string; source?: string }) =>
    !!name?.trim() && !!source?.trim() && !index.spells.has(getSpellReferenceKey(name, source))
  for (const { name, source, subclass, subclassSource } of character.classProgression) {
    if (name.trim() && source.trim() && !resolveClassProgressionRules({ name, source }, classes))
      yield { name, source }
    if (
      subclass &&
      subclassSource &&
      !resolveClassProgressionRules({ name, source, subclass, subclassSource }, classes)
    )
      yield { name: subclass, source: subclassSource }
  }

  for (const feat of [
    ...character.feats,
    ...(character.specialFeats ?? []),
    ...(character.classFeatChoices ?? []).flatMap((choice) => choice.feats),
  ]) {
    if (featIsMissing(feat, index)) yield feat
  }
  const literalStates = new Map(
    getFeatureOptionSelectionStates(character, index.choiceClasses ?? [], index.featureOptions).map(
      (state) => [state.selection.choiceId, state],
    ),
  )
  const proficiencyStates = new Map(
    getClassProficiencySelectionStates(
      character,
      index.choiceClasses ?? [],
      index.featureOptions,
    ).map((state) => [state.selection.choiceId, state]),
  )
  const mysticSlots = character.mysticDisciplineReplacements?.length
    ? getMysticDisciplineState(character, index.featureOptions).slots
    : []
  for (const selection of getEffectiveClassChoiceSelections(
    character,
    index.choiceClasses ?? [],
    index.featureOptions,
  )) {
    if (selection.inactive) continue
    const disciplines = mysticSlots.filter((slot) => slot.selection.choiceId === selection.choiceId)
    if (disciplines.length) {
      for (const slot of disciplines) if (!slot.printing) yield slot.current
      continue
    }
    if (
      (isClassProficiencyChoiceId(selection.choiceId) &&
        !proficiencyStates.get(selection.choiceId)?.choice) ||
      (isFeatureLiteralChoiceId(selection.choiceId) &&
        literalStates.get(selection.choiceId)?.recovery !== false)
    ) {
      yield { name: selection.label, source: selection.subclassSource ?? selection.classSource }
      continue
    }
    if (isFeatureLiteralChoiceId(selection.choiceId)) continue
    const owner = selection.subclassName
      ? getFeatureOwnerKey(
          selection.className,
          selection.classSource,
          selection.subclassName,
          selection.subclassSource,
        )
      : undefined
    for (const option of selection.selected) {
      const target = option.invocationCantrip
      if (target && spellMissing(target)) yield target
      if (isCompanionFamilyOption(option)) {
        if (
          !availableFamilies.some(
            (row) => row.selection.choiceId === selection.choiceId && row.creature,
          )
        )
          yield option
        continue
      }
      if (isCompanionFamilyMastery(option)) {
        const owner = character.classProgression.find(
          (entry) =>
            getFeatureOwnerKey(entry.name, entry.source) ===
            getFeatureOwnerKey(selection.className, selection.classSource),
        )
        const rules =
          owner &&
          index.featureOptions &&
          getCompanionFamilyRules(character, owner, index.featureOptions)
        if (
          !rules?.mastery ||
          getFeatureOwnerKey(rules.reference.name, rules.reference.source) !==
            getFeatureOwnerKey(option.name, option.source)
        )
          yield option
        continue
      }
      if (choiceIsMissing(option, index, owner)) yield option
    }
  }
  for (const { root, state } of createOptionalClassFeatureActivity(character, index.featureOptions)
    .states) {
    if (state === 'unavailable') yield { name: root.name, source: root.source }
  }

  for (const item of [
    ...character.equipment,
    ...Object.values(character.backgroundEquipmentItemChoices ?? {}).flat(),
    ...Object.values(character.classEquipmentItemChoices ?? {}).flatMap((choices) =>
      Object.values(choices).flat(),
    ),
  ]) {
    if (itemIsMissing(item, index)) yield item
  }

  const spellReferences = character.spells.spellProfiles.flatMap((profile) => [
    ...profile.cantrips,
    ...profile.spellsKnown,
    ...profile.preparedSpells,
    ...(profile.fixedSpells ?? []),
    ...(profile.alwaysPreparedSpells ?? []),
    ...(profile.choices ?? []).flatMap((choice) => choice.selected),
  ])
  for (const reference of [
    ...spellReferences,
    ...Object.values(character.fixedFeatOptions ?? {}).flatMap((options) => options.spells ?? []),
  ]) {
    const spell = parseSpellReference(reference)
    if (spellMissing(spell)) yield spell
  }
  for (const { target } of character.managedClassSpellChoices ?? []) {
    if (spellMissing(target)) yield target
  }
}

export function characterUsesContentOutsideCatalog(
  character: Character,
  index: GameDataAvailabilityIndex,
) {
  return !getUnavailableCharacterContent(character, index).next().done
}
