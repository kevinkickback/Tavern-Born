import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { addGrant } from '@/lib/provenance/ledger'
import { normalizeKey } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
  Feature,
} from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import type { CharacterCommandResult } from './commandResult'
import { replaceClassFeatSelectionsCommand } from './featCommands'

const CLASS_CHOICE_FEATURE_ID_PREFIX = 'class-choice:'

function optionKey(option: NormalizedChoiceOptionReference): string {
  return `${option.entityType}|${option.name.trim().toLowerCase()}|${option.source?.trim().toLowerCase() ?? ''}`
}

function getChoiceSlotLevels(choice: NormalizedCharacterChoice): number[] {
  const levels: number[] = []
  let previousCount = 0
  choice.selectionCountByLevel.forEach((count, index) => {
    const gain = Math.max(0, count - previousCount)
    for (let slot = 0; slot < gain; slot += 1) levels.push(index + 1)
    previousCount = count
  })
  return levels
}

function findOwnerLevel(character: Character, choice: NormalizedCharacterChoice): number {
  return (
    character.classProgression?.find(
      (entry) =>
        entry.name === choice.owner.name && (entry.source ?? '') === (choice.owner.source ?? ''),
    )?.levels ?? 0
  )
}

function validateSelectedOptions(
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
): void {
  const keys = selected.map(optionKey)
  if (!choice.repeatable && new Set(keys).size !== keys.length) {
    throw new RangeError(`${choice.label} does not allow duplicate selections.`)
  }
  if (choice.options.length === 0) return
  const allowed = new Set(choice.options.map(optionKey))
  if (keys.some((key) => !allowed.has(key))) {
    throw new RangeError(`A selected option is not available for ${choice.label}.`)
  }
}

/** Persists a complete or partial source-qualified class choice without applying future effects. */
export function applyClassChoiceSelectionCommand(
  character: Character,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
): Pick<Character, 'classChoiceSelections'> {
  const classLevel = findOwnerLevel(character, choice)
  if (classLevel < choice.level) {
    throw new RangeError(`${choice.label} is not available at the character's current class level.`)
  }
  const requiredCount = getRequiredChoiceSelectionCount(choice, classLevel)
  if (selected.length > requiredCount) {
    throw new RangeError(`${choice.label} allows ${requiredCount} selections at this class level.`)
  }
  validateSelectedOptions(choice, selected)

  const slotLevels = getChoiceSlotLevels(choice)
  const selection: CharacterClassChoiceSelection = {
    choiceId: choice.id,
    label: choice.label,
    kind: choice.kind,
    className: choice.owner.name,
    classSource: choice.owner.source,
    classLevel: choice.level,
    selected: selected.map<CharacterClassChoiceOption>((option, index) => ({
      ...option,
      name: option.name.trim(),
      ...(option.source?.trim() ? { source: option.source.trim() } : {}),
      slotLevel: slotLevels[index] ?? choice.level,
    })),
  }
  const retained = (character.classChoiceSelections ?? []).filter(
    (existing) => existing.choiceId !== choice.id,
  )
  return {
    classChoiceSelections: selection.selected.length > 0 ? [...retained, selection] : retained,
  }
}

function isFeatureOption(
  option: CharacterClassChoiceOption,
): option is CharacterClassChoiceOption & {
  entityType: 'classFeature' | 'optionalFeature'
} {
  return option.entityType === 'classFeature' || option.entityType === 'optionalFeature'
}

function featureIdentity(option: Pick<CharacterClassChoiceOption, 'name' | 'source'>): string {
  return `${normalizeKey(option.name)}|${normalizeKey(option.source ?? '')}`
}

function applyCommandResult(character: Character, result: CharacterCommandResult): Character {
  return {
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

function sameCategories(left: readonly string[], right: readonly string[]): boolean {
  const normalizedRight = new Set(right.map(normalizeKey))
  return (
    left.length === right.length &&
    left.every((category) => normalizedRight.has(normalizeKey(category)))
  )
}

function remapClassFeatChoiceOwner(
  tag: SourceTag,
  previousChoiceId: string,
  choiceId: string,
): SourceTag {
  const grantVariant =
    tag.grantVariant === previousChoiceId
      ? choiceId
      : tag.grantVariant === `class:${previousChoiceId}`
        ? `class:${choiceId}`
        : tag.grantVariant
  return grantVariant === tag.grantVariant ? tag : { ...tag, grantVariant }
}

function remapTagMap<T extends SourceTag>(
  entries: Record<string, T[]>,
  previousChoiceId: string,
  choiceId: string,
): Record<string, T[]> {
  return Object.fromEntries(
    Object.entries(entries).map(([key, tags]) => [
      key,
      tags.map((tag) => remapClassFeatChoiceOwner(tag, previousChoiceId, choiceId) as T),
    ]),
  )
}

/** Transfers legacy class-feat and feat-option ownership without reapplying mechanical effects. */
function migrateClassFeatChoiceOwner(
  character: Character,
  ledger: ProvenanceLedger,
  previousChoiceId: string,
  choice: NormalizedCharacterChoice,
  categories: readonly string[],
): { character: Character; ledger: ProvenanceLedger } {
  const remap = <T extends SourceTag>(entries: Record<string, T[]>) =>
    remapTagMap(entries, previousChoiceId, choice.id)
  return {
    character: {
      ...character,
      classFeatChoices: character.classFeatChoices?.map((entry) =>
        entry.id === previousChoiceId
          ? {
              ...entry,
              id: choice.id,
              progressionName: choice.label,
              categories: [...categories],
            }
          : entry,
      ),
    },
    ledger: {
      ...ledger,
      proficiencies: {
        armor: remap(ledger.proficiencies.armor),
        weapons: remap(ledger.proficiencies.weapons),
        tools: remap(ledger.proficiencies.tools),
        languages: remap(ledger.proficiencies.languages),
        skills: remap(ledger.proficiencies.skills),
        savingThrows: remap(ledger.proficiencies.savingThrows),
      },
      abilityBonuses: ledger.abilityBonuses.map((record) => ({
        ...record,
        sourceTag: remapClassFeatChoiceOwner(record.sourceTag, previousChoiceId, choice.id),
      })),
      features: remap(ledger.features),
      feats: remap(ledger.feats),
      spells: remap(ledger.spells),
      equipment: remap(ledger.equipment),
      choices: ledger.choices.map((record) => ({
        ...record,
        sourceTag: remapClassFeatChoiceOwner(record.sourceTag, previousChoiceId, choice.id),
      })),
    },
  }
}

function reconcileClassChoiceFeatMirror(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  selection: CharacterClassChoiceSelection | undefined,
): CharacterCommandResult {
  if (choice.kind !== 'feat') return { characterPatch: {}, provenanceUpdate: ledger }
  const categories = choice.optionFilter?.categories ?? []
  let workingCharacter = character
  let provenanceUpdate = ledger
  const legacyChoices = (character.classFeatChoices ?? []).filter(
    (entry) =>
      entry.id !== choice.id &&
      entry.className === choice.owner.name &&
      (entry.classSource ?? '') === choice.owner.source &&
      normalizeKey(entry.progressionName) === normalizeKey(choice.label) &&
      sameCategories(entry.categories, categories),
  )
  const firstLegacy = legacyChoices[0]
  let migratedFirstLegacy = false
  if (
    firstLegacy &&
    !(workingCharacter.classFeatChoices ?? []).some((entry) => entry.id === choice.id)
  ) {
    const migrated = migrateClassFeatChoiceOwner(
      workingCharacter,
      provenanceUpdate,
      firstLegacy.id,
      choice,
      categories,
    )
    workingCharacter = migrated.character
    provenanceUpdate = migrated.ledger
    migratedFirstLegacy = true
  }
  for (const legacy of legacyChoices.slice(migratedFirstLegacy ? 1 : 0)) {
    const cleared = replaceClassFeatSelectionsCommand(
      workingCharacter,
      provenanceUpdate,
      {
        choiceId: legacy.id,
        className: legacy.className,
        classSource: legacy.classSource,
        progressionName: legacy.progressionName,
        categories: legacy.categories,
        slotLevels: legacy.feats.map((feat) => feat.classLevel ?? choice.level),
      },
      [],
    )
    workingCharacter = applyCommandResult(workingCharacter, cleared)
    provenanceUpdate = cleared.provenanceUpdate
  }

  return replaceClassFeatSelectionsCommand(
    workingCharacter,
    provenanceUpdate,
    {
      choiceId: choice.id,
      className: choice.owner.name,
      classSource: choice.owner.source,
      progressionName: choice.label,
      categories,
      slotLevels: selection?.selected.map((option) => option.slotLevel) ?? [],
    },
    selection?.selected.map((option) => ({ name: option.name, source: option.source })) ?? [],
  )
}

function retractLegacyOptionalFeatureGrants(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  legacyOptions: readonly NormalizedChoiceOptionReference[],
): { character: Character; ledger: ProvenanceLedger } {
  if (
    choice.kind !== 'optional-feature' ||
    choice.source.kind !== 'optional-feature-progression' ||
    legacyOptions.length === 0
  ) {
    return { character, ledger }
  }
  const optionIdentities = new Set(legacyOptions.map(featureIdentity))
  const features = { ...ledger.features }
  const identitiesWithoutOwners = new Set<string>()
  for (const option of legacyOptions) {
    const key = normalizeKey(option.name)
    const existing = features[key] ?? []
    const retained = existing.filter(
      (tag) =>
        !(
          tag.sourceType === 'class' &&
          tag.sourceName === choice.owner.name &&
          tag.grantType === 'choice' &&
          tag.grantVariant === undefined &&
          (!option.source || (tag.sourceRef ?? '') === option.source)
        ),
    )
    if (retained.length === existing.length) continue
    if (retained.length > 0) features[key] = retained
    else {
      delete features[key]
      identitiesWithoutOwners.add(featureIdentity(option))
    }
  }
  if (identitiesWithoutOwners.size === 0) return { character, ledger: { ...ledger, features } }
  return {
    character: {
      ...character,
      features: character.features.filter(
        (feature) =>
          !(
            optionIdentities.has(featureIdentity(feature)) &&
            identitiesWithoutOwners.has(featureIdentity(feature))
          ),
      ),
    },
    ledger: { ...ledger, features },
  }
}

function generatedFeatureId(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
): string {
  return `${CLASS_CHOICE_FEATURE_ID_PREFIX}${encodeURIComponent(selection.choiceId)}:${encodeURIComponent(featureIdentity(option))}`
}

function rebuildClassChoiceFeatures(
  existing: readonly Feature[],
  selections: readonly CharacterClassChoiceSelection[],
): Feature[] {
  const retained = existing.filter(
    (feature) => !feature.id.startsWith(CLASS_CHOICE_FEATURE_ID_PREFIX),
  )
  const existingIdentities = new Set(retained.map(featureIdentity))

  for (const selection of selections) {
    for (const option of selection.selected) {
      if (!isFeatureOption(option)) continue
      const identity = featureIdentity(option)
      if (existingIdentities.has(identity)) continue
      retained.push({
        id: generatedFeatureId(selection, option),
        name: option.name,
        source: option.source ?? '',
        description: '',
        level: option.slotLevel,
      })
      existingIdentities.add(identity)
    }
  }

  return retained
}

/**
 * Rebuilds grants owned by normalized class choices from their persisted selections.
 *
 * Feature-shaped options can be materialized without interpreting rules prose. Feat choices are
 * reconciled separately through the established feat-option handler, while item choices remain
 * source-qualified selections until structured item effects can be applied safely.
 */
export function reconcileClassChoiceSelectionGrants(
  character: Pick<Character, 'classChoiceSelections' | 'features'>,
  ledger: ProvenanceLedger,
  selections: readonly CharacterClassChoiceSelection[],
): Pick<CharacterCommandResult, 'provenanceUpdate'> & { features: Feature[] } {
  const ownedChoiceIds = new Set([
    ...(character.classChoiceSelections ?? []).map((selection) => selection.choiceId),
    ...selections.map((selection) => selection.choiceId),
  ])
  const features = Object.fromEntries(
    Object.entries(ledger.features).flatMap(([key, tags]) => {
      const retained = tags.filter(
        (tag) =>
          !(
            tag.sourceType === 'class' &&
            tag.grantVariant !== undefined &&
            ownedChoiceIds.has(tag.grantVariant)
          ),
      )
      return retained.length > 0 ? [[key, retained]] : []
    }),
  )
  let provenanceUpdate: ProvenanceLedger = { ...ledger, features }

  for (const selection of selections) {
    const tag = {
      ...makeSourceTag('class', selection.className, 'choice', selection.classSource),
      grantVariant: selection.choiceId,
    }
    for (const option of selection.selected) {
      if (!isFeatureOption(option)) continue
      provenanceUpdate = addGrant(provenanceUpdate, 'features', option.name, tag)
    }
  }

  return {
    features: rebuildClassChoiceFeatures(character.features, selections),
    provenanceUpdate,
  }
}

/** Persists a normalized class choice and atomically reconciles its safe mechanical grants. */
export function applyClassChoiceSelectionWithGrantsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
  legacyOptions: readonly NormalizedChoiceOptionReference[] = [],
): CharacterCommandResult {
  const migrated = retractLegacyOptionalFeatureGrants(character, ledger, choice, legacyOptions)
  const selectionPatch = applyClassChoiceSelectionCommand(migrated.character, choice, selected)
  const classChoiceSelections = selectionPatch.classChoiceSelections ?? []
  const grants = reconcileClassChoiceSelectionGrants(
    migrated.character,
    migrated.ledger,
    classChoiceSelections,
  )
  const withSelections: Character = {
    ...migrated.character,
    classChoiceSelections,
    features: grants.features,
    provenance: grants.provenanceUpdate,
  }
  const featMirror = reconcileClassChoiceFeatMirror(
    withSelections,
    grants.provenanceUpdate,
    choice,
    classChoiceSelections.find((selection) => selection.choiceId === choice.id),
  )

  return {
    characterPatch: {
      ...featMirror.characterPatch,
      classChoiceSelections,
      features: grants.features,
    },
    provenanceUpdate: featMirror.provenanceUpdate,
  }
}

/** Removes selections whose source-qualified class or earned choice slot no longer exists. */
export function reconcileClassChoiceSelections(
  selections: readonly CharacterClassChoiceSelection[] | undefined,
  progression: readonly CharacterClassEntry[],
): CharacterClassChoiceSelection[] {
  return (selections ?? []).flatMap((selection) => {
    const owner = progression.find(
      (entry) =>
        entry.name === selection.className &&
        (entry.source ?? '') === (selection.classSource ?? ''),
    )
    if (!owner || owner.levels < selection.classLevel) return []
    const selected = selection.selected.filter((option) => option.slotLevel <= owner.levels)
    return selected.length > 0 ? [{ ...selection, selected }] : []
  })
}
