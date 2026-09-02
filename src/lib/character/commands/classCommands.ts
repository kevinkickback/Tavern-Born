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
  makeSourceTag,
  reconcileClassChange,
  stripItemTag,
} from '@/lib/provenance'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import type { Class5e, Item5e } from '@/types/5etools'
import type { Character, CharacterClassEntry, Skills } from '@/types/character'
import type { CharacterCommandResult } from './commandResult'

const SAVING_THROW_NAME_BY_KEY: Record<string, string> = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
}

function normalizeSavingThrowName(name: string): string {
  const normalized = normalizeKey(name)
  return SAVING_THROW_NAME_BY_KEY[normalized] ?? normalized
}

const isNarrativeTool = (value: string) => /of your choice|choose|one type of/i.test(value)

export interface ClassSelectionEntity {
  name: string
  source?: string
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

interface SelectSubclassOptions {
  classProgression?: CharacterClassEntry[]
  viewingEntry?: CharacterClassEntry
}

export function buildInitialCharacterProficiencies(
  cls: (Omit<ClassSelectionEntity, 'name'> & { name?: string }) | undefined,
  normalizedBackground:
    | {
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
      }
    | undefined,
): {
  proficiencies: {
    armor: string[]
    weapons: string[]
    tools: string[]
    skills: string[]
    languages: string[]
    savingThrows: string[]
  }
  skills: Skills
} {
  const clsProfs = cls?.startingProficiencies ?? {}
  const armor = (clsProfs.armor ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map(stripItemTag)
  const weapons = (clsProfs.weapons ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map(stripItemTag)
  const classTools = [
    ...(clsProfs.tools ?? [])
      .filter((value): value is string => typeof value === 'string')
      .map(stripItemTag)
      .filter((value) => value && !isNarrativeTool(value)),
    ...extractProficiencyBlockNames((clsProfs.toolProficiencies as unknown[]) ?? [], {
      includeAnyStandard: false,
    }),
  ]
  const savingThrows = [...new Set((cls?.proficiency ?? []).map(normalizeSavingThrowName))]
  const backgroundSkills = extractProficiencyBlockNames(
    normalizedBackground?.skillProficiencies ?? [],
    { includeAnyStandard: false },
  ).filter((name) => !name.toLowerCase().startsWith('choose '))
  const backgroundLanguages = extractProficiencyBlockNames(
    normalizedBackground?.languageProficiencies ?? [],
    { includeAnyStandard: false },
  )
  const backgroundTools = extractProficiencyBlockNames(
    normalizedBackground?.toolProficiencies ?? [],
    { includeAnyStandard: false },
  )
  const skills = [...new Set(backgroundSkills.map((skill) => skill.toLowerCase()))]
  const proficiencies = {
    armor,
    weapons,
    tools: [...new Set([...classTools, ...backgroundTools])],
    skills,
    languages: [...new Set(backgroundLanguages)],
    savingThrows,
  }

  return { proficiencies, skills: mergeSkillState({}, skills) }
}

function getClassChoiceKey(name: string, source?: string): string {
  return `${name}|${source ?? ''}`
}

export function replaceClassEquipmentGrants(
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
  const resolved = resolveEquipmentWithBlockChoices(blocks, itemLookup, choices)

  return {
    characterPatch: {
      equipment: upsertGrantedEquipment(equipment, resolved.items),
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classChoiceKey]: choices,
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
  const oldClassName = primaryClassEntry?.name ?? character.class ?? undefined
  const oldSubclassName = primaryClassEntry?.subclass ?? character.subclass ?? undefined

  let provenanceUpdate = reconcileClassChange(ledger, oldClassName, oldSubclassName)
  provenanceUpdate = applyClassGrants(cls, subclass, provenanceUpdate, { itemLookup })

  let proficiencies = { ...character.proficiencies }
  let equipment = [...(character.equipment ?? [])]

  if (oldClassName) {
    const domains = ['armor', 'weapons', 'tools', 'savingThrows'] as const
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
        ...(startingProficiencies.armor ?? []).map(stripItemTag),
      ]),
    ],
    weapons: [
      ...new Set([
        ...proficiencies.weapons,
        ...(startingProficiencies.weapons ?? []).map(stripItemTag),
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
      skills: { ...(character.skills ?? {}) },
      equipment: upsertGrantedEquipment(equipment, classEquipment.items),
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classChoiceKey]: savedBlockChoices,
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
 * - keep top-level class/classSource in sync with the first class entry
 * - reconcile provenance when a class entry is fully removed
 */
export function applyClassProgressionUpdate(
  character: Character,
  ledger: ProvenanceLedger,
  nextProgression: CharacterClassEntry[],
): ClassCommandResult {
  const previousProgression = character.classProgression ?? []
  const removedEntries = previousProgression.filter(
    (old) => !nextProgression.some((entry) => entry.name === old.name),
  )

  let provenanceUpdate = ledger
  for (const removed of removedEntries) {
    provenanceUpdate = reconcileClassChange(provenanceUpdate, removed.name, undefined)
  }

  const newTotalLevel = nextProgression.reduce((sum, entry) => sum + entry.levels, 0)
  const characterPatch: Partial<Character> = {
    classProgression: nextProgression,
    level: newTotalLevel,
    class: nextProgression[0]?.name ?? character.class,
    classSource: nextProgression[0]?.source ?? character.classSource,
  }

  return {
    characterPatch,
    provenanceUpdate,
  }
}

/**
 * Apply a base class selection to a character.
 *
 * Manages both:
 * - Character state: updates character.class, character.classSource, proficiencies, and classProgression
 * - Attribution: records the class source (PHB, custom manual selection, etc.)
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param className - Name of class to select
 * @param classSource - Source of the class (e.g., 'PHB', or undefined for fallback single match)
 * @returns { classEntity, characterPatch, provenanceUpdate } - Apply both atomically
 */
export function selectBaseClass(
  character: Character,
  ledger: ProvenanceLedger,
  className: string,
  classEntity: Class5e,
  classSource?: string,
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

  const existingClassIndex =
    character.classProgression?.findIndex((c) => c.name === className) ?? -1
  const updatedProgression = [...(character.classProgression ?? [])]

  if (existingClassIndex >= 0) {
    updatedProgression[existingClassIndex] = {
      ...updatedProgression[existingClassIndex],
      name: className,
      source: classSource ?? classEntity.source ?? undefined,
      levels: updatedProgression[existingClassIndex].levels ?? 1,
    }
  } else {
    updatedProgression.push({
      name: className,
      source: classSource ?? classEntity.source ?? undefined,
      levels: 1,
    })
  }

  const characterPatch: Partial<Character> = {
    class: className,
    classSource: classSource ?? undefined,
    subclass: undefined,
    subclassSource: undefined,
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
  let nextProgression = options?.classProgression

  if (options?.classProgression && options.viewingEntry) {
    nextProgression = options.classProgression.map((entry) =>
      entry.name === options.viewingEntry?.name &&
      (entry.source ?? '') === (options.viewingEntry?.source ?? '')
        ? {
            ...entry,
            subclass: subclassName,
            subclassSource,
          }
        : entry,
    )
  }

  const shouldUpdateTopLevel =
    !options?.viewingEntry || options.viewingEntry.name === character.class

  const characterPatch: Partial<Character> = {
    ...(nextProgression ? { classProgression: nextProgression } : {}),
    ...(shouldUpdateTopLevel
      ? {
          subclass: subclassName,
          subclassSource,
        }
      : {}),
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
  const effects = computeClassSelectionEffects(character, ledger, cls, subclass, itemLookup)
  const identity = subclass
    ? selectSubclass(character, ledger, subclass.name, subclass.source ?? '', undefined, options)
    : selectBaseClass(character, ledger, cls.name, cls as Class5e, cls.source)
  const identityProficiencies = identity.characterPatch.proficiencies
  const effectProficiencies = effects.characterPatch.proficiencies ?? character.proficiencies

  return {
    classEntity: cls as Class5e,
    characterPatch: {
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
    },
    provenanceUpdate: effects.provenanceUpdate,
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

  const primaryClass = character.classProgression?.[0]
  if (!primaryClass) {
    throw new Error('Character has no class selected. Cannot set level without a class.')
  }

  const updatedProgression = (character.classProgression ?? []).map((entry, idx) => {
    if (idx === 0) {
      return {
        ...entry,
        levels: newLevel,
      }
    }
    return entry
  })

  const characterPatch: Partial<Character> = {
    level: newLevel,
    classProgression: updatedProgression,
  }

  const provenanceUpdate = ledger

  return {
    characterPatch,
    provenanceUpdate,
  }
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
  classSource?: string,
  startAtLevel: number = 1,
): ClassCommandResult {
  const existingClassIndex =
    character.classProgression?.findIndex((c) => c.name === className) ?? -1
  if (existingClassIndex >= 0) {
    throw new Error(`Character already has class ${className}. Cannot add duplicate class.`)
  }

  const updatedProgression = [
    ...(character.classProgression ?? []),
    {
      name: className,
      source: classSource ?? classEntity.source ?? undefined,
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

  const provenanceUpdate = applyMulticlassGrants(classEntity, ledger)

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
 * @returns { characterPatch, provenanceUpdate } - Apply both atomically
 */
export function removeMulticlass(
  character: Character,
  ledger: ProvenanceLedger,
  className: string,
): ClassCommandResult {
  if (
    character.classProgression?.[0]?.name === className &&
    character.classProgression.length === 1
  ) {
    throw new Error('Cannot remove the primary class. Character must have at least one class.')
  }

  const updatedProgression = character.classProgression?.filter((c) => c.name !== className) ?? []

  const characterPatch: Partial<Character> = {
    classProgression: updatedProgression,
  }

  const provenanceUpdate = reconcileClassChange(ledger, className, undefined)

  return {
    characterPatch,
    provenanceUpdate,
  }
}
