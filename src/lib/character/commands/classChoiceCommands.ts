import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { addGrant } from '@/lib/provenance/ledger'
import { normalizeKey } from '@/lib/provenance/normalization'
import { makeSourceTag } from '@/lib/provenance/sourceLabels'
import type { ProvenanceLedger } from '@/lib/provenance/types'
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
import { assignProgressionSlotLevels } from './progressionSlotOwnership'

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

function findOwner(
  character: Character,
  choice: NormalizedCharacterChoice,
): CharacterClassEntry | undefined {
  return character.classProgression?.find(
    (entry) =>
      entry.name === choice.owner.name && (entry.source ?? '') === (choice.owner.source ?? ''),
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
  if (choice.options.length === 0 || choice.optionFilter) return
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
  const owner = findOwner(character, choice)
  const classLevel = owner?.levels ?? 0
  if (classLevel < choice.level) {
    throw new RangeError(`${choice.label} is not available at the character's current class level.`)
  }
  if (
    choice.owner.type === 'subclass' &&
    (!choice.owner.subclassName ||
      owner?.subclass !== choice.owner.subclassName ||
      (owner.subclassSource ?? '') !== (choice.owner.subclassSource ?? ''))
  ) {
    throw new RangeError(`${choice.label} is not available for the character's current subclass.`)
  }
  const requiredCount = getRequiredChoiceSelectionCount(choice, classLevel)
  if (selected.length > requiredCount) {
    throw new RangeError(`${choice.label} allows ${requiredCount} selections at this class level.`)
  }
  validateSelectedOptions(choice, selected)

  const existingSelection = character.classChoiceSelections?.find(
    (existing) => existing.choiceId === choice.id,
  )
  const slotLevels = assignProgressionSlotLevels(
    (existingSelection?.selected ?? []).map((option) => ({
      key: optionKey(option),
      slotLevel: option.slotLevel,
    })),
    selected.map(optionKey),
    getChoiceSlotLevels(choice).slice(0, requiredCount),
    choice.level,
  )
  const selection: CharacterClassChoiceSelection = {
    choiceId: choice.id,
    label: choice.label,
    kind: choice.kind,
    className: choice.owner.name,
    classSource: choice.owner.source,
    ...(choice.owner.subclassName ? { subclassName: choice.owner.subclassName } : {}),
    ...(choice.owner.subclassSource ? { subclassSource: choice.owner.subclassSource } : {}),
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
  entityType: 'classFeature' | 'subclassFeature' | 'optionalFeature'
} {
  return (
    option.entityType === 'classFeature' ||
    option.entityType === 'subclassFeature' ||
    option.entityType === 'optionalFeature'
  )
}

function featureIdentity(option: Pick<CharacterClassChoiceOption, 'name' | 'source'>): string {
  return `${normalizeKey(option.name)}|${normalizeKey(option.source ?? '')}`
}

export function reconcileClassChoiceFeatMirror(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  selection: CharacterClassChoiceSelection | undefined,
): CharacterCommandResult {
  if (choice.kind !== 'feat') return { characterPatch: {}, provenanceUpdate: ledger }
  const categories = choice.optionFilter?.categories ?? []
  return replaceClassFeatSelectionsCommand(
    character,
    ledger,
    {
      choiceId: choice.id,
      className: choice.owner.name,
      classSource: choice.owner.source,
      ...(choice.owner.subclassName ? { subclassName: choice.owner.subclassName } : {}),
      ...(choice.owner.subclassSource ? { subclassSource: choice.owner.subclassSource } : {}),
      progressionName: choice.label,
      categories,
      slotLevels: selection?.selected.map((option) => option.slotLevel) ?? [],
    },
    selection?.selected.map((option) => ({ name: option.name, source: option.source })) ?? [],
  )
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
  const activeSelections = selections.filter((selection) => !selection.inactive)
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

  for (const selection of activeSelections) {
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
    features: rebuildClassChoiceFeatures(character.features, activeSelections),
    provenanceUpdate,
  }
}

/** Persists a normalized class choice and atomically reconciles its safe mechanical grants. */
export function applyClassChoiceSelectionWithGrantsCommand(
  character: Character,
  ledger: ProvenanceLedger,
  choice: NormalizedCharacterChoice,
  selected: readonly NormalizedChoiceOptionReference[],
): CharacterCommandResult {
  const selectionPatch = applyClassChoiceSelectionCommand(character, choice, selected)
  const classChoiceSelections = selectionPatch.classChoiceSelections ?? []
  const grants = reconcileClassChoiceSelectionGrants(character, ledger, classChoiceSelections)
  const withSelections: Character = {
    ...character,
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
    if (
      selection.subclassName &&
      (owner.subclass !== selection.subclassName ||
        (owner.subclassSource ?? '') !== (selection.subclassSource ?? ''))
    ) {
      return []
    }
    const selected = selection.selected.filter((option) => option.slotLevel <= owner.levels)
    return selected.length > 0 ? [{ ...selection, selected }] : []
  })
}
