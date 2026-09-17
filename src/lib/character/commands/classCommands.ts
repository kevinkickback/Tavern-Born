/**
 * Class-domain command helpers.
 *
 * These commands coordinate character class state with provenance updates and
 * return a single result object for callers to apply.
 */

import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import {
  getClassDefaultEquipmentBlocks,
  resolveEquipmentWithBlockChoices,
} from '@/lib/5etools/startingEquipment'
import { mergeSkillState } from '@/lib/calculations/skills'
import { toClassProfileId } from '@/lib/calculations/spellProfiles.constants'
import { retractFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import {
  removeSpellFromCharacter,
  rollbackClassSpellSwapsAboveLevel,
} from '@/lib/character/commands/spellCommands'
import {
  removeSourceGrantedEquipment,
  upsertGrantedEquipment,
} from '@/lib/character/equipmentHelpers'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  addGrant,
  applyClassGrants,
  applyMulticlassGrants,
  diffProficiencyGrants,
  getSpellsGrantedAtLevel,
  makeSourceTag,
  reconcileClassChange,
  removeGrantsBySourceRef,
  removeSpellChoicesAtLevel,
  removeSpellGrantsAtLevel,
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
} from '@/types/character'
import {
  reconcileClassChoiceSelectionGrants,
  reconcileClassChoiceSelections,
} from './classChoiceCommands'
import { isNarrativeTool, normalizeSavingThrowName } from './classProficiencies'
import type { CharacterCommandResult } from './commandResult'

export { buildInitialCharacterProficiencies } from './classProficiencies'

export interface ClassSelectionEntity {
  name: string
  source: string
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

interface SelectSubclassOptions {
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
    proficiencies,
    skills: mergeSkillState(character.skills ?? {}, proficiencies.skills),
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

export function applyClassEquipmentChoiceCommand(
  character: Character,
  ledger: ProvenanceLedger,
  cls: Pick<ClassSelectionEntity, 'name' | 'source' | 'startingEquipment'>,
  blockIndex: number,
  choice: string,
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<Record<string, string>> = character.classEquipmentItemChoices?.[
    getClassChoiceKey(cls.name, cls.source)
  ] ?? {},
): CharacterCommandResult {
  const equipmentToRemove = Object.entries(ledger.equipment)
    .filter(([, tags]) =>
      tags.every(
        (tag) =>
          tag.sourceType === 'class' &&
          tag.sourceName === cls.name &&
          (tag.sourceRef ?? '') === (cls.source ?? ''),
      ),
    )
    .map(([name]) => name)
  const equipment = removeSourceGrantedEquipment(
    [...(character.equipment ?? [])],
    equipmentToRemove,
  )
  const classChoiceKey = getClassChoiceKey(cls.name, cls.source)
  const choices = [...(character.classEquipmentChoices?.[classChoiceKey] ?? [])]
  while (choices.length <= blockIndex) choices.push('a')
  choices[blockIndex] = choice.toLowerCase()

  const blocks = getClassDefaultEquipmentBlocks(cls.startingEquipment)
  const resolved = resolveEquipmentWithBlockChoices(blocks, itemLookup, choices, genericSelections)

  return {
    characterPatch: {
      equipment: upsertGrantedEquipment(equipment, resolved.items),
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classChoiceKey]: choices,
      },
      classEquipmentItemChoices: {
        ...(character.classEquipmentItemChoices ?? {}),
        [classChoiceKey]: { ...genericSelections },
      },
    },
    provenanceUpdate: replaceClassEquipmentGrants(
      ledger,
      cls.name,
      cls.source,
      resolved.items.map((item) => item.name),
    ),
  }
}

function computeClassSelectionEffects(
  character: Character,
  ledger: ProvenanceLedger,
  cls: ClassSelectionEntity,
  subclass: { name: string; source?: string } | undefined,
  itemLookup: Map<string, Item5e>,
): CharacterCommandResult {
  const primaryClassEntry = getCharacterClassEntries(character)[0]
  const oldClassName = primaryClassEntry?.name
  const oldSubclassName = primaryClassEntry?.subclass

  let provenanceUpdate = reconcileClassChange(ledger, oldClassName, oldSubclassName)
  provenanceUpdate = applyClassGrants(cls, subclass, provenanceUpdate, { itemLookup })

  let proficiencies = { ...character.proficiencies }
  let equipment = [...(character.equipment ?? [])]

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

    const equipmentToRemove = Object.entries(ledger.equipment)
      .filter(
        ([, tags]) =>
          tags.length > 0 &&
          tags.every((tag) => tag.sourceType === 'class' && tag.sourceName === oldClassName),
      )
      .map(([name]) => name)
    equipment = removeSourceGrantedEquipment(equipment, equipmentToRemove)
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
  )
  provenanceUpdate = replaceClassEquipmentGrants(
    provenanceUpdate,
    cls.name,
    cls.source,
    classEquipment.items.map((item) => item.name),
  )

  return {
    characterPatch: {
      proficiencies,
      skills: mergeSkillState(character.skills ?? {}, proficiencies.skills),
      equipment: upsertGrantedEquipment(equipment, classEquipment.items),
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
  }
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
): ClassCommandResult {
  const previousProgression = character.classProgression
  const removedEntries = previousProgression.filter(
    (old) =>
      !nextProgression.some((entry) => entry.name === old.name && entry.source === old.source),
  )

  let workingCharacter = character
  let provenanceUpdate = ledger

  for (const previousEntry of previousProgression) {
    const retainedEntry = nextProgression.find(
      (entry) => entry.name === previousEntry.name && entry.source === previousEntry.source,
    )
    if (!retainedEntry || retainedEntry.levels >= previousEntry.levels) continue

    for (let level = previousEntry.levels; level > retainedEntry.levels; level -= 1) {
      const affectedSpells = getSpellsGrantedAtLevel(
        provenanceUpdate,
        previousEntry.name,
        level,
        previousEntry.source,
      )
      provenanceUpdate = removeSpellChoicesAtLevel(
        provenanceUpdate,
        previousEntry.name,
        level,
        previousEntry.source,
      )
      provenanceUpdate = removeSpellGrantsAtLevel(
        provenanceUpdate,
        previousEntry.name,
        level,
        previousEntry.source,
      )

      for (const spellName of affectedSpells) {
        if ((provenanceUpdate.spells[normalizeKey(spellName)] ?? []).length > 0) continue
        const result = removeSpellFromCharacter(workingCharacter, provenanceUpdate, spellName, {
          profileId: toClassProfileId(previousEntry.name, previousEntry.source),
        })
        workingCharacter = {
          ...workingCharacter,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }
        provenanceUpdate = result.provenanceUpdate
      }
    }

    const swapRollback = rollbackClassSpellSwapsAboveLevel(workingCharacter, provenanceUpdate, {
      className: previousEntry.name,
      classSource: previousEntry.source,
      retainedLevel: retainedEntry.levels,
    })
    workingCharacter = {
      ...workingCharacter,
      ...swapRollback.characterPatch,
      provenance: swapRollback.provenanceUpdate,
    }
    provenanceUpdate = swapRollback.provenanceUpdate
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
      (entry) => entry.name === choice.className && entry.source === choice.classSource,
    )
    const retainedFeats = matchingEntry
      ? choice.feats.filter(
          (feat) => feat.classLevel == null || feat.classLevel <= matchingEntry.levels,
        )
      : []
    const retainedIds = new Set(retainedFeats.map((feat) => feat.id))
    for (const feat of choice.feats) {
      if (retainedIds.has(feat.id)) continue
      if (feat.options) {
        const result = retractFeatOptionsCommand(
          workingCharacter,
          provenanceUpdate,
          { name: feat.name, source: feat.source, classFeatChoiceId: choice.id },
          feat.options,
        )
        workingCharacter = {
          ...workingCharacter,
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        }
        provenanceUpdate = result.provenanceUpdate
      }
      const key = normalizeKey(feat.name)
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
    character,
    provenanceUpdate,
    classChoiceSelections,
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
    hitPointGains,
    classFeatChoices: retainedClassFeatChoices,
    classChoiceSelections,
    asiChoices,
    features: classChoiceGrants.features,
    spells: workingCharacter.spells,
    proficiencies: workingCharacter.proficiencies,
    skills: workingCharacter.skills,
    abilityScores: workingCharacter.abilityScores,
  }

  return {
    characterPatch,
    provenanceUpdate,
  }
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

  const progressionResult = applyClassProgressionUpdate(character, ledger, nextProgression)
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

  return {
    ...progressionResult,
    characterPatch: {
      ...progressionResult.characterPatch,
      hitPointGains,
    },
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
  if (updatedProgression.length > 0) {
    updatedProgression[0] = {
      ...updatedProgression[0],
      name: className,
      source: classSource,
      levels: updatedProgression[0].levels,
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
    proficiencies: updatedProficiencies,
    skills: mergeSkillState(character.skills ?? {}, updatedProficiencies.skills),
    classProgression: updatedProgression,
  }

  const provenanceUpdate = ledger

  return {
    classEntity,
    characterPatch,
    provenanceUpdate,
  }
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

  const characterPatch: Partial<Character> = {
    classProgression: nextProgression,
  }

  const provenanceUpdate = ledger

  return {
    classEntity: subclassEntity as Class5e | undefined,
    characterPatch,
    provenanceUpdate,
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

  const effects = computeClassSelectionEffects(character, ledger, cls, subclass, itemLookup)
  const identityCharacter = { ...character, ...effects.characterPatch }
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
          },
          skills: identity.characterPatch.skills,
        }
      : {}),
  }
  const nextProgression = identity.characterPatch.classProgression
  if (!nextProgression) {
    return {
      classEntity: cls as Class5e,
      characterPatch: selectionPatch,
      provenanceUpdate: effects.provenanceUpdate,
    }
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
  )
  return {
    classEntity: cls as Class5e,
    characterPatch: { ...selectionPatch, ...progressionResult.characterPatch },
    provenanceUpdate: progressionResult.provenanceUpdate,
  }
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

  return applyClassProgressionUpdate(character, ledger, updatedProgression)
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
): ClassCommandResult {
  const existingClassIndex = character.classProgression.findIndex(
    (entry) => entry.name === className && entry.source === classSource,
  )
  if (existingClassIndex >= 0) {
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
        ...(gained?.weapons ?? fallback.weapons ?? [])
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
    proficiencies: updatedProficiencies,
    skills: mergeSkillState(character.skills ?? {}, updatedProficiencies.skills),
  }

  const provenanceUpdate = applyMulticlassGrants({ ...classEntity, source: classSource }, ledger)

  return {
    classEntity,
    characterPatch,
    provenanceUpdate,
  }
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

  return applyClassProgressionUpdate(character, ledger, updatedProgression)
}
