import { findClassReference } from '@/lib/5etools/classReference'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import type { NativeSpellLookups } from '@/lib/calculations/nativeRacialSpellChoices'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
/**
 * Class-domain command helpers.
 *
 * These commands coordinate character class state with provenance updates and
 * return a single result object for callers to apply.
 */

import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  assertStartingEquipmentSelections,
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import {
  createStartingEquipmentPolicy,
  type StartingEquipmentPolicy,
} from '@/lib/5etools/startingEquipmentPolicy'
import {
  type CharacterCalculationContext,
  createCharacterCalculationContext,
} from '@/lib/calculations/characterCalculationContext'
import { reconcileHitDiceUsed } from '@/lib/calculations/hitDice'
import { reconcileSkillExpertise } from '@/lib/calculations/skills'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import {
  replaceFeatSelectionsCommand,
  retractFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import { retainEarnedManagedClassSpells } from '@/lib/character/commands/managedClassSpellCommands'
import type { ManagedClassSpellContext } from '@/lib/character/managedClassSpells'
import { retainEarnedOptionalClassAdoptions } from '@/lib/character/optionalClassFeatureIdentity'
import {
  emptyStartingCurrency,
  reconcileStartingEquipmentGrant,
  sameStartingReference,
} from '@/lib/character/startingEquipmentGrants'
import {
  getCharacterClassEntries,
  getEffectiveMaxHP,
  getTotalCharacterLevel,
} from '@/lib/characterUtils'
import {
  addGrant,
  applyClassGrants,
  applyMulticlassGrants,
  diffProficiencyGrants,
  makeSourceTag,
  reconcileClassChange,
  removeGrantsBySourceRef,
  stripItemTag,
} from '@/lib/provenance'
import { applyAsiChoices } from '@/lib/provenance/applyAsiChoices'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Class5e, Item5e } from '@/types/5etools'
import type {
  Character,
  CharacterClassEntry,
  ClassFeatChoice,
  HitPointGain,
  HitPointGainMethod,
  StartingEquipmentItemChoices,
} from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from '../classChoiceFeatureCatalogs'
import {
  reconcileClassChoiceSelectionGrants,
  reconcileClassChoiceSelections,
} from './classChoiceCommands'
import { isNarrativeTool, normalizeSavingThrowName } from './classProficiencies'
import type { CharacterCommandResult } from './commandResult'
import { reconcileExpertiseOwnership } from './expertiseCommands'
import { getFeatSelectionKey } from './featCommandIdentity'
import { applyCharacterCommandResult } from './featCommandSupport'
import { projectProficiencyCommandResult } from './proficiencyProjection'

export interface ClassSelectionEntity {
  name: string
  source: string
  sourceIdentityConflict?: boolean
  proficiency?: string[]
  startingEquipment?: unknown
  startingProficiencies?: {
    armor?: string[]
    weapons?: string[]
    tools?: string[]
    toolProficiencies?: Record<
      string,
      number | boolean | { choose?: { from?: string[]; count?: number } }
    >[]
    skills?: Array<string | Record<string, unknown>>
  }
}

export interface ClassCommandResult extends CharacterCommandResult {
  classEntity?: Class5e
}

export interface LevelUpHitPointChoice {
  className: string
  classSource: string
  classLevel: number
  hitDie: number
  dieResult: number
  method: HitPointGainMethod
}

export interface LevelDownResult extends ClassCommandResult {
  removedClassName: string
  removedSpellCount: number
}

function projectMaximumHitPoints(
  character: Character,
  calculationContext: CharacterCalculationContext,
): number {
  const projectedContext = createCharacterCalculationContext(
    character,
    calculationContext.lookups.primary,
    calculationContext.lookups.raw,
  )
  return getEffectiveMaxHP(
    character,
    projectedContext.classes,
    projectedContext.abilityScores.total,
    projectedContext.effects.sourceDeclarations,
  )
}

interface ClassProgressionLookups extends NativeSpellLookups {
  classChoiceFeatureCatalogs?: ClassChoiceFeatureCatalogs
  spellContext?: ManagedClassSpellContext
}
interface SelectSubclassOptions extends ClassProgressionLookups {
  startingEquipmentPolicy?: StartingEquipmentPolicy
  raceResolution?: ResolvedRaceReference
  classProgression?: CharacterClassEntry[]
  viewingEntry?: CharacterClassEntry
}

function getClassChoiceKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`
}

function isExactClassTag(
  tag: SourceTag,
  className: string,
  classSource: string | undefined,
): boolean {
  return (
    tag.sourceType === 'class' &&
    tag.sourceName === className &&
    (tag.sourceRef ?? '') === (classSource ?? '')
  )
}

function retractRemovedClassMaterializedState(
  character: Character,
  ledger: ProvenanceLedger,
  removed: CharacterClassEntry,
): Character {
  let proficiencies = { ...character.proficiencies }
  for (const domain of [
    'armor',
    'weapons',
    'tools',
    'skills',
    'languages',
    'savingThrows',
  ] as const) {
    const exclusivelyOwnedKeys = new Set(
      Object.entries(ledger.proficiencies[domain])
        .filter(
          ([, tags]) =>
            tags.length > 0 &&
            tags.every((tag) => isExactClassTag(tag, removed.name, removed.source)),
        )
        .map(([key]) => key),
    )
    if (exclusivelyOwnedKeys.size === 0) continue
    proficiencies = {
      ...proficiencies,
      [domain]: proficiencies[domain].filter((name) => {
        const key = domain === 'savingThrows' ? normalizeSavingThrowName(name) : normalizeKey(name)
        return !exclusivelyOwnedKeys.has(key)
      }),
    }
  }

  const profileId = toClassProfileId(removed.name, removed.source)
  return {
    ...character,
    proficiencies: reconcileSkillExpertise(proficiencies),
    spells: {
      ...character.spells,
      spellProfiles: character.spells.spellProfiles.filter((profile) => profile.id !== profileId),
    },
  }
}

function replaceClassEquipmentGrants(
  ledger: ProvenanceLedger,
  className: string,
  classSource: string | undefined,
  equipmentNames: string[],
): ProvenanceLedger {
  const nextEquipment: Record<string, SourceTag[]> = {}

  for (const [itemName, tags] of Object.entries(ledger.equipment)) {
    const retained = tags.filter(
      (tag) =>
        !(
          tag.sourceType === 'class' &&
          tag.sourceName === className &&
          (tag.sourceRef ?? '') === (classSource ?? '')
        ),
    )
    if (retained.length > 0) nextEquipment[itemName] = retained
  }

  let nextLedger: ProvenanceLedger = { ...ledger, equipment: nextEquipment }
  const classTag = makeSourceTag('class', className, 'fixed', classSource)
  for (const itemName of equipmentNames) {
    nextLedger = addGrant(nextLedger, 'equipment', itemName, classTag)
  }

  return nextLedger
}

function withCurrentStartingGrants(
  policy: StartingEquipmentPolicy,
  character: Character,
  cls: Pick<ClassSelectionEntity, 'sourceIdentityConflict'>,
) {
  return {
    ...policy,
    owner: {
      ...policy.owner,
      sourceIdentityConflict: policy.owner.sourceIdentityConflict || cls.sourceIdentityConflict,
    },
    character: { ...policy.character, startingEquipmentGrants: character.startingEquipmentGrants },
  }
}

export function applyClassEquipmentChoiceCommand(
  character: Character,
  ledger: ProvenanceLedger,
  cls: Pick<
    ClassSelectionEntity,
    'name' | 'source' | 'startingEquipment' | 'sourceIdentityConflict'
  >,
  blockIndex: number,
  choice: string,
  itemLookup: Map<string, Item5e>,
  genericSelections?: Readonly<StartingEquipmentItemChoices>,
  policyOverride?: StartingEquipmentPolicy,
): CharacterCommandResult {
  const owner = character.initialClass
  if (
    !sameStartingReference(owner, cls) ||
    !character.classProgression.some((entry) => sameStartingReference(entry, owner))
  )
    throw new RangeError('Only the initial Class can change starting equipment.')
  if (!owner) throw new RangeError('Select an initial Class first.')
  const classChoiceKey = getClassChoiceKey(owner.name, owner.source)
  const itemSelections =
    genericSelections ?? character.classEquipmentItemChoices?.[classChoiceKey] ?? {}
  const previousChoices = character.classEquipmentChoices?.[classChoiceKey] ?? []
  const choices = [...previousChoices]
  while (choices.length <= blockIndex) choices.push('a')
  choices[blockIndex] = choice.toLowerCase()

  const blocks = getClassDefaultEquipmentBlocks(cls.startingEquipment)
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex >= blocks.length)
    throw new RangeError('Starting equipment block is unavailable.')
  const block = blocks[blockIndex]
  if (
    !block ||
    typeof block !== 'object' ||
    !Object.keys(block).some((key) => key.toLowerCase() === choice.toLowerCase())
  )
    throw new RangeError('Starting equipment package is unavailable.')
  const policy =
    policyOverride ??
    createStartingEquipmentPolicy(character, { ...cls, kind: 'class' }, cls.startingEquipment, [
      ...itemLookup.values(),
    ])
  if (
    !policy.ownerAvailable ||
    policy.owner.kind !== 'class' ||
    !sameStartingReference(policy.owner, owner)
  )
    throw new RangeError('Restore the current initial Class rules first.')
  if (JSON.stringify(policy.startingEquipment) !== JSON.stringify(cls.startingEquipment))
    throw new RangeError('Starting equipment rules changed. Review the current Class.')
  const resolved = resolveEquipmentWithBlockChoices(
    blocks,
    itemLookup,
    choices,
    itemSelections,
    withCurrentStartingGrants(policy, character, cls),
  )
  if (
    resolved.unavailablePackage &&
    choices[blockIndex] !== (previousChoices[blockIndex]?.toLowerCase() ?? 'a')
  )
    throw new RangeError('Restore the exact starting equipment rules before switching packages.')
  assertStartingEquipmentSelections(
    resolved,
    itemSelections,
    character.classEquipmentItemChoices?.[classChoiceKey],
  )
  const activeKeys = new Set(resolved.genericChoices?.map((slot) => slot.key))
  for (const [key, refs] of Object.entries(itemSelections)) {
    if (
      !activeKeys.has(key) &&
      JSON.stringify(refs) !==
        JSON.stringify(character.classEquipmentItemChoices?.[classChoiceKey]?.[key])
    )
      throw new RangeError('This starting item slot is no longer active.')
  }
  const equipmentPatch = reconcileStartingEquipmentGrant(
    character,
    'class',
    owner,
    resolved.lots ?? [],
    resolved.currency,
  )

  return {
    characterPatch: {
      ...equipmentPatch,
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classChoiceKey]: choices,
      },
      classEquipmentItemChoices: {
        ...(character.classEquipmentItemChoices ?? {}),
        [classChoiceKey]: { ...itemSelections },
      },
    },
    provenanceUpdate: replaceClassEquipmentGrants(
      ledger,
      owner.name,
      owner.source,
      equipmentPatch.startingEquipmentGrants?.class?.items.map((lot) => lot.reference.name) ?? [],
    ),
  }
}

function computeClassSelectionEffects(
  character: Character,
  ledger: ProvenanceLedger,
  cls: ClassSelectionEntity,
  subclass: { name: string; source?: string } | undefined,
  itemLookup: Map<string, Item5e>,
  policyOverride?: StartingEquipmentPolicy,
): CharacterCommandResult {
  const primaryClassEntry =
    character.classProgression.find((entry) =>
      sameStartingReference(entry, character.initialClass),
    ) ?? getCharacterClassEntries(character)[0]
  const oldClassName = primaryClassEntry?.name
  const oldSubclassName = primaryClassEntry?.subclass

  let provenanceUpdate = reconcileClassChange(ledger, oldClassName, oldSubclassName)
  provenanceUpdate = applyClassGrants(cls, subclass, provenanceUpdate)

  let proficiencies = { ...character.proficiencies }

  if (oldClassName) {
    const domains = ['armor', 'weapons', 'tools', 'skills', 'savingThrows'] as const
    for (const domain of domains) {
      const { toRemove } = diffProficiencyGrants(ledger, domain, 'class', oldClassName)
      if (toRemove.length === 0) continue
      if (domain === 'savingThrows') {
        proficiencies = {
          ...proficiencies,
          savingThrows: proficiencies.savingThrows.filter(
            (name) => !toRemove.includes(normalizeSavingThrowName(name)),
          ),
        }
      } else {
        proficiencies = {
          ...proficiencies,
          [domain]: proficiencies[domain].filter((name) => !toRemove.includes(normalizeKey(name))),
        }
      }
    }
  }

  const startingProficiencies = cls.startingProficiencies ?? {}
  const toolsFromArray = (startingProficiencies.tools ?? [])
    .filter((tool): tool is string => typeof tool === 'string')
    .map(stripItemTag)
    .filter((tool) => tool && !isNarrativeTool(tool))
  const toolsFromBlocks = extractProficiencyBlockNames(
    startingProficiencies.toolProficiencies ?? [],
    { includeAnyStandard: false },
  )

  proficiencies = {
    ...proficiencies,
    armor: [
      ...new Set([
        ...proficiencies.armor,
        ...(startingProficiencies.armor ?? [])
          .filter((armor): armor is string => typeof armor === 'string')
          .map(stripItemTag),
      ]),
    ],
    weapons: [
      ...new Set([
        ...proficiencies.weapons,
        ...(startingProficiencies.weapons ?? [])
          .filter((weapon): weapon is string => typeof weapon === 'string')
          .map(stripItemTag),
      ]),
    ],
    tools: [...new Set([...proficiencies.tools, ...toolsFromArray, ...toolsFromBlocks])],
    savingThrows: [
      ...new Set([
        ...proficiencies.savingThrows,
        ...(cls.proficiency ?? []).map(normalizeSavingThrowName),
      ]),
    ],
  }

  const classChoiceKey = getClassChoiceKey(cls.name, cls.source)
  const savedBlockChoices = character.classEquipmentChoices?.[classChoiceKey] ?? []
  const classBlocks = getClassDefaultEquipmentBlocks(cls.startingEquipment)
  const classEquipment = resolveEquipmentWithBlockChoices(
    classBlocks,
    itemLookup,
    savedBlockChoices,
    character.classEquipmentItemChoices?.[classChoiceKey] ?? {},
    policyOverride ??
      createStartingEquipmentPolicy(character, { ...cls, kind: 'class' }, cls.startingEquipment, [
        ...itemLookup.values(),
      ]),
  )
  const equipmentPatch = reconcileStartingEquipmentGrant(
    character,
    'class',
    { name: cls.name, source: cls.source },
    classEquipment.lots ?? [],
    classEquipment.currency,
  )
  provenanceUpdate = replaceClassEquipmentGrants(
    provenanceUpdate,
    cls.name,
    cls.source,
    equipmentPatch.startingEquipmentGrants?.class?.items.map((lot) => lot.reference.name) ?? [],
  )

  return reconcileExpertiseOwnership({
    characterPatch: {
      proficiencies: reconcileSkillExpertise(proficiencies),
      ...equipmentPatch,
      initialClass: { name: cls.name, source: cls.source },
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classChoiceKey]: savedBlockChoices,
      },
      classEquipmentItemChoices: {
        ...(character.classEquipmentItemChoices ?? {}),
        [classChoiceKey]: {
          ...(character.classEquipmentItemChoices?.[classChoiceKey] ?? {}),
        },
      },
    },
    provenanceUpdate,
  })
}

/**
 * Apply a class progression update and reconcile derived class fields.
 *
 * Centralizes the shared logic used by level up/down flows:
 * - update classProgression and total character level
 * - reconcile provenance when a class entry is fully removed
 */
export function applyClassProgressionUpdate(
  character: Character,
  ledger: ProvenanceLedger,
  nextProgression: CharacterClassEntry[],
  raceResolution?: ResolvedRaceReference,
  spellLookups?: ClassProgressionLookups,
): ClassCommandResult {
  const previousProgression = character.classProgression
  const removedEntries = previousProgression.filter(
    (old) =>
      !nextProgression.some((entry) => entry.name === old.name && entry.source === old.source),
  )

  let workingCharacter = retainEarnedManagedClassSpells(
    { ...character, provenance: ledger },
    nextProgression,
  )
  let provenanceUpdate = workingCharacter.provenance
  const retainedFeats = character.feats.filter(({ className, classSource, classLevel }) => {
    if (classLevel == null || !className?.trim() || !classSource?.trim()) return true
    const owner = findClassReference({ name: className, source: classSource }, nextProgression)
    return owner != null && owner.levels >= classLevel
  })
  if (retainedFeats.length !== character.feats.length) {
    const result = replaceFeatSelectionsCommand(workingCharacter, provenanceUpdate, retainedFeats)
    workingCharacter = applyCharacterCommandResult(workingCharacter, result)
    workingCharacter.feats = retainedFeats
    provenanceUpdate = result.provenanceUpdate
  }

  for (const removed of removedEntries) {
    workingCharacter = retractRemovedClassMaterializedState(
      workingCharacter,
      provenanceUpdate,
      removed,
    )
    provenanceUpdate = removeGrantsBySourceRef(
      provenanceUpdate,
      'class',
      removed.name,
      removed.source,
    )
  }

  const retainedClassFeatChoices: ClassFeatChoice[] = []
  for (const choice of character.classFeatChoices ?? []) {
    const matchingEntry = nextProgression.find(
      (entry) =>
        entry.name === choice.className &&
        entry.source === choice.classSource &&
        (!choice.subclassName ||
          (entry.subclass === choice.subclassName &&
            (entry.subclassSource ?? '') === (choice.subclassSource ?? ''))),
    )
    const retainedFeats = matchingEntry
      ? choice.feats.filter(
          (feat) => feat.classLevel == null || feat.classLevel <= matchingEntry.levels,
        )
      : []
    const retainedKeys = new Set(retainedFeats.map(getFeatSelectionKey))
    const retainedBuckets = new Set(retainedFeats.map((feat) => normalizeKey(feat.name)))
    for (const feat of choice.feats) {
      if (retainedKeys.has(getFeatSelectionKey(feat))) continue
      if (feat.options) {
        const result = retractFeatOptionsCommand(
          workingCharacter,
          provenanceUpdate,
          { name: feat.name, source: feat.source, classFeatChoiceId: choice.id },
          feat.options,
        )
        workingCharacter = applyCharacterCommandResult(workingCharacter, result)
        provenanceUpdate = result.provenanceUpdate
      }
      const key = normalizeKey(feat.name)
      if (retainedBuckets.has(key)) continue
      const retainedTags = (provenanceUpdate.feats[key] ?? []).filter(
        (tag) =>
          !(
            tag.sourceType === 'class' &&
            tag.sourceName === choice.className &&
            tag.sourceRef === choice.classSource &&
            tag.grantVariant === choice.id
          ),
      )
      const feats = { ...provenanceUpdate.feats }
      if (retainedTags.length > 0) feats[key] = retainedTags
      else delete feats[key]
      provenanceUpdate = { ...provenanceUpdate, feats }
    }
    if (matchingEntry && retainedFeats.length > 0) {
      retainedClassFeatChoices.push({ ...choice, feats: retainedFeats })
    }
  }

  const newTotalLevel = nextProgression.reduce((sum, entry) => sum + entry.levels, 0)
  const previousTotalLevel = previousProgression.reduce((sum, entry) => sum + entry.levels, 0)
  const retainedHitPointGains = (character.hitPointGains ?? []).filter((gain) => {
    const matchingEntry = nextProgression.find(
      (entry) => entry.name === gain.className && entry.source === gain.classSource,
    )
    return matchingEntry != null && gain.classLevel <= matchingEntry.levels
  })
  const hitPointGains =
    newTotalLevel < previousTotalLevel
      ? retainedHitPointGains
          .sort((a, b) => a.characterLevel - b.characterLevel)
          .map((gain, index, gains) => ({
            ...gain,
            characterLevel: newTotalLevel - gains.length + index + 1,
          }))
      : retainedHitPointGains
  const classChoiceSelections = reconcileClassChoiceSelections(
    character.classChoiceSelections,
    nextProgression,
  )
  const classChoiceGrants = reconcileClassChoiceSelectionGrants(
    {
      ...workingCharacter,
      classProgression: nextProgression,
    },
    provenanceUpdate,
    classChoiceSelections,
    spellLookups?.classChoiceFeatureCatalogs,
    spellLookups?.spellContext,
  )
  provenanceUpdate = classChoiceGrants.provenanceUpdate
  const asiChoices = (character.asiChoices ?? []).filter((choice) => {
    const matchingEntry = nextProgression.find(
      (entry) =>
        normalizeKey(entry.name) === normalizeKey(choice.className) &&
        normalizeKey(entry.source) === normalizeKey(choice.classSource),
    )
    return matchingEntry != null && choice.level <= matchingEntry.levels
  })
  provenanceUpdate = applyAsiChoices(provenanceUpdate, asiChoices)

  const characterPatch: Partial<Character> = {
    classProgression: nextProgression,
    optionalClassFeatureAdoptions: retainEarnedOptionalClassAdoptions(character, nextProgression),
    hitDiceUsed: reconcileHitDiceUsed(character.hitDiceUsed, nextProgression),
    hitPointGains,
    feats: workingCharacter.feats,
    classFeatChoices: retainedClassFeatChoices,
    classChoiceSelections,
    asiChoices,
    features: classChoiceGrants.features,
    spells: workingCharacter.spells,
    managedClassSpellChoices: workingCharacter.managedClassSpellChoices,
    managedClassSpellRevision: workingCharacter.managedClassSpellRevision,
    proficiencies: classChoiceGrants.proficiencies,
    abilityScores: workingCharacter.abilityScores,
  }
  if (
    character.initialClass &&
    !nextProgression.some((entry) => sameStartingReference(entry, character.initialClass))
  ) {
    Object.assign(
      characterPatch,
      reconcileStartingEquipmentGrant(
        { ...workingCharacter, ...characterPatch },
        'class',
        undefined,
        [],
        emptyStartingCurrency(),
      ),
      { initialClass: undefined },
    )
  }
  const native = refreshNativeRacialSpellState(
    applyCharacterCommandResult(character, { characterPatch, provenanceUpdate }),
    raceResolution,
    spellLookups,
  )
  characterPatch.spells = native.spells
  provenanceUpdate = native.provenance

  return projectProficiencyCommandResult(
    character,
    reconcileExpertiseOwnership({
      characterPatch,
      provenanceUpdate,
    }),
    spellLookups?.classChoiceFeatureCatalogs,
  )
}

/**
 * Atomically apply a class-level increase and its raw hit-die result.
 * Constitution is intentionally not stored so later CON changes recalculate HP correctly.
 */
export function applyLevelUp(
  character: Character,
  ledger: ProvenanceLedger,
  nextProgression: CharacterClassEntry[],
  hpChoice: LevelUpHitPointChoice,
  calculationContext: CharacterCalculationContext,
): ClassCommandResult {
  const characterLevel = nextProgression.reduce((sum, entry) => sum + entry.levels, 0)
  const targetEntry = nextProgression.find(
    (entry) => entry.name === hpChoice.className && entry.source === hpChoice.classSource,
  )

  if (!targetEntry || targetEntry.levels !== hpChoice.classLevel) {
    throw new Error('Hit-point choice does not match the level being added.')
  }
  if (characterLevel < 2 || characterLevel > 20) {
    throw new RangeError('Hit-point gains can only be recorded for character levels 2 through 20.')
  }
  if (
    !Number.isInteger(hpChoice.hitDie) ||
    hpChoice.hitDie < 1 ||
    !Number.isInteger(hpChoice.dieResult) ||
    hpChoice.dieResult < 1 ||
    hpChoice.dieResult > hpChoice.hitDie
  ) {
    throw new RangeError('Hit-point die result must be an integer within the hit die range.')
  }
  if (characterLevel !== getTotalCharacterLevel(character) + 1) {
    throw new RangeError('Level up must add exactly one character level.')
  }
  const previousProgression = getCharacterClassEntries(character)
  const entryKey = (entry: CharacterClassEntry) => JSON.stringify([entry.name, entry.source])
  const previousByKey = new Map(previousProgression.map((entry) => [entryKey(entry), entry]))
  const nextByKey = new Map(nextProgression.map((entry) => [entryKey(entry), entry]))
  const targetKey = JSON.stringify([hpChoice.className, hpChoice.classSource])
  const invalidProgression =
    previousByKey.size !== previousProgression.length ||
    nextByKey.size !== nextProgression.length ||
    [...previousByKey.keys()].some((key) => !nextByKey.has(key)) ||
    nextProgression.filter((entry) => {
      const previous = previousByKey.get(entryKey(entry))
      return !previous || entry.levels !== previous.levels
    }).length !== 1 ||
    nextProgression.some((entry) => {
      const previous = previousByKey.get(entryKey(entry))
      if (!previous) return entry.levels !== 1 || entryKey(entry) !== targetKey
      const delta = entry.levels - previous.levels
      return (
        delta < 0 ||
        delta > 1 ||
        (delta === 1 && entryKey(entry) !== targetKey) ||
        entry.subclass !== previous.subclass ||
        entry.subclassSource !== previous.subclassSource
      )
    })
  if (invalidProgression) {
    throw new RangeError('Level up must add exactly one source-qualified class level.')
  }

  const progressionResult = applyClassProgressionUpdate(
    character,
    ledger,
    nextProgression,
    calculationContext.raceResolution,
    {
      spellsByKey: calculationContext.lookups.primary.spellsByKey,
      rawSpellsByKey: calculationContext.lookups.raw.spellsByKey,
      classChoiceFeatureCatalogs: calculationContext.classChoices.catalogs,
      spellContext: calculationContext.classChoices.spellContext,
    },
  )
  const gain: HitPointGain = { ...hpChoice, characterLevel }
  const hitPointGains = [
    ...(progressionResult.characterPatch.hitPointGains ?? character.hitPointGains ?? []).filter(
      (existing) =>
        !(
          existing.className === gain.className &&
          existing.classLevel === gain.classLevel &&
          existing.classSource === gain.classSource
        ),
    ),
    gain,
  ].sort((a, b) => a.characterLevel - b.characterLevel)
  const projectedCharacter = applyCharacterCommandResult(character, progressionResult)
  projectedCharacter.hitPointGains = hitPointGains
  const maximumHitPoints = projectMaximumHitPoints(projectedCharacter, calculationContext)

  return {
    ...progressionResult,
    characterPatch: {
      ...progressionResult.characterPatch,
      hitPointGains,
      hitPoints: {
        ...character.hitPoints,
        current: maximumHitPoints,
      },
      hitPointsInitialized: true,
    },
  }
}

/** Remove the last earned level and clamp current HP after every grant has been reconciled. */
export function applyLevelDown(
  character: Character,
  ledger: ProvenanceLedger,
  calculationContext: CharacterCalculationContext,
): LevelDownResult {
  const progression = getCharacterClassEntries(character)
  if (getTotalCharacterLevel(character) <= 1 || progression.length === 0) {
    throw new RangeError('Cannot go below level 1.')
  }
  const lastGain = [...(character.hitPointGains ?? [])]
    .sort((a, b) => b.characterLevel - a.characterLevel)
    .find((gain) =>
      progression.some(
        (entry) =>
          entry.name === gain.className &&
          entry.source === gain.classSource &&
          entry.levels === gain.classLevel,
      ),
    )
  const fallback = progression[progression.length - 1]
  const className = lastGain?.className ?? fallback.name
  const classSource = lastGain?.classSource ?? fallback.source
  const classLevel = lastGain?.classLevel ?? fallback.levels
  const targetIndex = progression.findIndex(
    (entry) => entry.name === className && entry.source === classSource,
  )
  const nextProgression = progression.flatMap((entry, index) => {
    if (index !== targetIndex) return [entry]
    return entry.levels > 1 ? [{ ...entry, levels: entry.levels - 1 }] : []
  })
  const removedSpellCount = (character.managedClassSpellChoices ?? []).filter(
    (choice) =>
      choice.slot[0][1] === className.trim().toLowerCase() &&
      choice.slot[0][2] === classSource.trim().toLowerCase() &&
      choice.slot[3] === classLevel,
  ).length
  const progressionResult = applyClassProgressionUpdate(
    character,
    ledger,
    nextProgression,
    calculationContext.raceResolution,
    {
      spellsByKey: calculationContext.lookups.primary.spellsByKey,
      rawSpellsByKey: calculationContext.lookups.raw.spellsByKey,
      classChoiceFeatureCatalogs: calculationContext.classChoices.catalogs,
      spellContext: calculationContext.classChoices.spellContext,
    },
  )
  const projectedCharacter = applyCharacterCommandResult(character, progressionResult)
  const maximumHitPoints = projectMaximumHitPoints(projectedCharacter, calculationContext)
  return {
    characterPatch: {
      ...progressionResult.characterPatch,
      hitPoints: {
        ...character.hitPoints,
        current: Math.min(character.hitPoints.current, maximumHitPoints),
      },
    },
    provenanceUpdate: progressionResult.provenanceUpdate,
    removedClassName: className,
    removedSpellCount,
  }
}

/**
 * Apply a base class selection to a character.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param className - Name of class to select
 * @param classSource - Source of the class
 * @returns { classEntity, characterPatch, provenanceUpdate } - Apply both atomically
 */
export function selectBaseClass(
  character: Character,
  ledger: ProvenanceLedger,
  className: string,
  classEntity: Class5e,
  classSource: string = classEntity.source,
): ClassCommandResult {
  const startingProfs = classEntity.startingProficiencies ?? {}
  const updatedProficiencies = {
    ...character.proficiencies,
    armor: [...new Set([...(character.proficiencies.armor ?? []), ...(startingProfs.armor ?? [])])],
    weapons: [
      ...new Set([...(character.proficiencies.weapons ?? []), ...(startingProfs.weapons ?? [])]),
    ],
    tools: [...new Set([...(character.proficiencies.tools ?? []), ...(startingProfs.tools ?? [])])],
    savingThrows: [
      ...new Set([
        ...(character.proficiencies.savingThrows ?? []),
        ...(classEntity.proficiency ?? []),
      ]),
    ],
    skills: [
      ...new Set([
        ...(character.proficiencies.skills ?? []),
        ...(startingProfs.skills ?? []).filter((s): s is string => typeof s === 'string'),
      ]),
    ],
  }

  const updatedProgression = [...character.classProgression]
  const initialIndex = updatedProgression.findIndex((entry) =>
    sameStartingReference(entry, character.initialClass),
  )
  const targetIndex = initialIndex >= 0 ? initialIndex : 0
  if (
    updatedProgression.some(
      (entry, index) =>
        index !== targetIndex &&
        sameStartingReference(entry, { name: className, source: classSource }),
    )
  )
    throw new RangeError('That Class is already in the progression. Keep its separate Class entry.')
  if (updatedProgression.length > 0) {
    updatedProgression[targetIndex] = {
      ...updatedProgression[targetIndex],
      name: className,
      source: classSource,
      levels: updatedProgression[targetIndex].levels,
      subclass: undefined,
      subclassSource: undefined,
    }
  } else {
    updatedProgression.push({
      name: className,
      source: classSource,
      levels: 1,
    })
  }

  const characterPatch: Partial<Character> = {
    proficiencies: reconcileSkillExpertise(updatedProficiencies),
    classProgression: updatedProgression,
    hitDiceUsed: reconcileHitDiceUsed(character.hitDiceUsed, updatedProgression),
    initialClass: { name: className, source: classSource },
  }

  const provenanceUpdate = ledger

  return reconcileExpertiseOwnership({
    classEntity,
    characterPatch,
    provenanceUpdate,
  })
}

/**
 * Apply a subclass selection to a character.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param subclassName - Name of subclass to select
 * @param subclassSource - Source of the subclass
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function selectSubclass(
  character: Character,
  ledger: ProvenanceLedger,
  subclassName: string,
  subclassSource: string,
  subclassEntity?: Record<string, unknown>,
  options?: SelectSubclassOptions,
): ClassCommandResult {
  const progression = options?.classProgression ?? character.classProgression
  const target = options?.viewingEntry ?? progression[0]
  if (!target) throw new Error('Cannot choose a subclass before choosing a class.')
  const nextProgression = progression.map((entry) =>
    entry.name === target.name && entry.source === target.source
      ? {
          ...entry,
          subclass: subclassName,
          subclassSource,
        }
      : entry,
  )
  const progressionResult = applyClassProgressionUpdate(
    character,
    ledger,
    nextProgression,
    options?.raceResolution,
    options,
  )

  return {
    classEntity: subclassEntity as Class5e | undefined,
    characterPatch: progressionResult.characterPatch,
    provenanceUpdate: progressionResult.provenanceUpdate,
  }
}

export function applyClassSelectionCommand(
  character: Character,
  ledger: ProvenanceLedger,
  cls: ClassSelectionEntity,
  subclass: { name: string; source?: string } | undefined,
  itemLookup: Map<string, Item5e>,
  options?: SelectSubclassOptions,
): ClassCommandResult {
  if (subclass) {
    return selectSubclass(
      character,
      ledger,
      subclass.name,
      subclass.source ?? '',
      undefined,
      options,
    )
  }

  if (
    options?.startingEquipmentPolicy &&
    (!options.startingEquipmentPolicy.ownerAvailable ||
      options.startingEquipmentPolicy.owner.kind !== 'class' ||
      !sameStartingReference(options.startingEquipmentPolicy.owner, cls) ||
      JSON.stringify(options.startingEquipmentPolicy.startingEquipment) !==
        JSON.stringify(cls.startingEquipment))
  )
    throw new RangeError('Restore the current Class rules before selecting it.')

  const equipmentPolicy =
    options?.startingEquipmentPolicy ??
    createStartingEquipmentPolicy(character, { ...cls, kind: 'class' }, cls.startingEquipment, [
      ...itemLookup.values(),
    ])
  if (!equipmentPolicy.ownerAvailable)
    throw new RangeError('Restore the selected Class source rules first.')
  const effects = computeClassSelectionEffects(
    character,
    ledger,
    cls,
    subclass,
    itemLookup,
    withCurrentStartingGrants(equipmentPolicy, character, cls),
  )
  const identityCharacter = {
    ...character,
    ...effects.characterPatch,
    initialClass: character.initialClass,
  }
  const identity = selectBaseClass(identityCharacter, ledger, cls.name, cls as Class5e, cls.source)
  const identityProficiencies = identity.characterPatch.proficiencies
  const effectProficiencies = effects.characterPatch.proficiencies ?? character.proficiencies
  const selectionPatch: Partial<Character> = {
    ...effects.characterPatch,
    ...identity.characterPatch,
    ...(identityProficiencies
      ? {
          proficiencies: {
            ...effectProficiencies,
            skills: identityProficiencies.skills,
            expertise: identityProficiencies.expertise,
          },
        }
      : {}),
  }
  const nextProgression = identity.characterPatch.classProgression
  if (!nextProgression) {
    return reconcileExpertiseOwnership({
      classEntity: cls as Class5e,
      characterPatch: selectionPatch,
      provenanceUpdate: effects.provenanceUpdate,
    })
  }

  const progressionResult = applyClassProgressionUpdate(
    {
      ...character,
      ...selectionPatch,
      classProgression: character.classProgression,
      provenance: effects.provenanceUpdate,
    },
    effects.provenanceUpdate,
    nextProgression,
    options?.raceResolution,
    options,
  )
  return reconcileExpertiseOwnership({
    classEntity: cls as Class5e,
    characterPatch: { ...selectionPatch, ...progressionResult.characterPatch },
    provenanceUpdate: progressionResult.provenanceUpdate,
  })
}

/**
 * Apply a level change to a character's primary class.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param newLevel - The new character level
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function updateCharacterLevel(
  character: Character,
  ledger: ProvenanceLedger,
  newLevel: number,
  raceResolution?: ResolvedRaceReference,
  spellLookups?: NativeSpellLookups,
): ClassCommandResult {
  if (newLevel < 1 || newLevel > 20) {
    throw new Error(`Invalid level: ${newLevel}. Level must be between 1 and 20.`)
  }

  const primaryClass = character.classProgression[0]
  if (!primaryClass) {
    throw new Error('Character has no class selected. Cannot set level without a class.')
  }

  const updatedProgression = character.classProgression.map((entry, idx) => {
    if (idx === 0) {
      return {
        ...entry,
        levels: newLevel,
      }
    }
    return entry
  })

  return applyClassProgressionUpdate(
    character,
    ledger,
    updatedProgression,
    raceResolution,
    spellLookups,
  )
}

/**
 * Add a multiclass to a character.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param className - Name of class to add
 * @param classEntity - The Class5e entity data
 * @param classSource - Source of the class
 * @param startAtLevel - Level to start the new class at (default 1)
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function addMulticlass(
  character: Character,
  ledger: ProvenanceLedger,
  className: string,
  classEntity: Class5e,
  classSource: string = classEntity.source,
  startAtLevel: number = 1,
  raceResolution?: ResolvedRaceReference,
  spellLookups?: NativeSpellLookups,
): ClassCommandResult {
  if (findClassReference({ name: className, source: classSource }, character.classProgression)) {
    throw new Error(
      `Character already has class ${className}|${classSource}. Cannot add duplicate class.`,
    )
  }

  const updatedProgression = [
    ...character.classProgression,
    {
      name: className,
      source: classSource,
      levels: startAtLevel,
    },
  ]

  const gained = classEntity.multiclassing?.proficienciesGained
  const fallback = classEntity.startingProficiencies ?? {}
  const toolsFromBlocks = extractProficiencyBlockNames(gained?.toolProficiencies ?? [], {
    includeAnyStandard: false,
  })

  const updatedProficiencies = {
    ...character.proficiencies,
    armor: [
      ...new Set([
        ...(character.proficiencies.armor ?? []),
        ...(gained?.armor ?? fallback.armor ?? [])
          .filter((armor): armor is string => typeof armor === 'string')
          .map((armor) => stripItemTag(armor)),
      ]),
    ],
    weapons: [
      ...new Set([
        ...(character.proficiencies.weapons ?? []),
        ...(gained?.weapons ?? [])
          .filter((weapon): weapon is string => typeof weapon === 'string')
          .map((weapon) => stripItemTag(weapon)),
      ]),
    ],
    tools: [
      ...new Set([
        ...(character.proficiencies.tools ?? []),
        ...(gained?.tools ?? fallback.tools ?? [])
          .filter((tool): tool is string => typeof tool === 'string')
          .map((tool) => stripItemTag(tool)),
        ...toolsFromBlocks,
      ]),
    ],
    savingThrows: [...(character.proficiencies.savingThrows ?? [])],
    skills: [
      ...new Set([
        ...(character.proficiencies.skills ?? []),
        ...(fallback.skills ?? []).filter((skill): skill is string => typeof skill === 'string'),
      ]),
    ],
  }

  const characterPatch: Partial<Character> = {
    classProgression: updatedProgression,
    proficiencies: reconcileSkillExpertise(updatedProficiencies),
    hitDiceUsed: reconcileHitDiceUsed(character.hitDiceUsed, updatedProgression),
  }

  const native = refreshNativeRacialSpellState(
    {
      ...character,
      ...characterPatch,
      provenance: applyMulticlassGrants({ ...classEntity, source: classSource }, ledger),
    },
    raceResolution,
    spellLookups,
  )
  characterPatch.spells = native.spells
  const provenanceUpdate = native.provenance

  return reconcileExpertiseOwnership({
    classEntity,
    characterPatch,
    provenanceUpdate,
  })
}

/**
 * Remove a multiclass from a character.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param className - Name of class to remove
 * @param classSource - Source of the exact class printing to remove
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function removeMulticlass(
  character: Character,
  ledger: ProvenanceLedger,
  className: string,
  classSource: string,
  raceResolution?: ResolvedRaceReference,
  spellLookups?: NativeSpellLookups,
): ClassCommandResult {
  const matchesClass = (entry: CharacterClassEntry) =>
    entry.name === className && entry.source === classSource
  if (
    character.classProgression[0] &&
    matchesClass(character.classProgression[0]) &&
    character.classProgression.length === 1
  ) {
    throw new Error('Cannot remove the primary class. Character must have at least one class.')
  }

  const updatedProgression = character.classProgression.filter((entry) => !matchesClass(entry))

  return applyClassProgressionUpdate(
    character,
    ledger,
    updatedProgression,
    raceResolution,
    spellLookups,
  )
}
