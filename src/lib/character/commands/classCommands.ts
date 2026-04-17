/**
 * Class-domain command helpers.
 *
 * These commands coordinate character class state with provenance updates and
 * return a single result object for callers to apply.
 */

import { extractProficiencyBlockNames } from '@/lib/5etools/parsers'
import { applyMulticlassGrants, reconcileClassChange, stripItemTag } from '@/lib/provenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'

export interface ClassCommandResult {
  classEntity?: Class5e
  characterUpdate: Partial<Character>
  provenanceUpdate: ProvenanceLedger
}

interface SelectSubclassOptions {
  classProgression?: CharacterClassEntry[]
  viewingEntry?: CharacterClassEntry
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
  const characterUpdate: Partial<Character> = {
    classProgression: nextProgression,
    level: newTotalLevel,
    class: nextProgression[0]?.name ?? character.class,
    classSource: nextProgression[0]?.source ?? character.classSource,
  }

  return {
    characterUpdate,
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
 * @returns { classEntity, characterUpdate, provenanceUpdate } - Apply both atomically
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

  const characterUpdate: Partial<Character> = {
    class: className,
    classSource: classSource ?? undefined,
    subclass: undefined,
    subclassSource: undefined,
    proficiencies: updatedProficiencies,
    classProgression: updatedProgression,
  }

  const provenanceUpdate = ledger

  return {
    classEntity,
    characterUpdate,
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
 * @returns { characterUpdate, provenanceUpdate } - Apply both atomically
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

  const characterUpdate: Partial<Character> = {
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
    characterUpdate,
    provenanceUpdate,
  }
}

/**
 * Apply a level change to a character's primary class.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param newLevel - The new character level
 * @returns { characterUpdate, provenanceUpdate } - Apply both atomically
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

  const characterUpdate: Partial<Character> = {
    level: newLevel,
    classProgression: updatedProgression,
  }

  const provenanceUpdate = ledger

  return {
    characterUpdate,
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
 * @returns { characterUpdate, provenanceUpdate } - Apply both atomically
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

  const characterUpdate: Partial<Character> = {
    classProgression: updatedProgression,
    proficiencies: updatedProficiencies,
  }

  const provenanceUpdate = applyMulticlassGrants(classEntity, ledger)

  return {
    classEntity,
    characterUpdate,
    provenanceUpdate,
  }
}

/**
 * Remove a multiclass from a character.
 *
 * @param character - Active character
 * @param ledger - Current provenance ledger
 * @param className - Name of class to remove
 * @returns { characterUpdate, provenanceUpdate } - Apply both atomically
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

  const characterUpdate: Partial<Character> = {
    classProgression: updatedProgression,
  }

  const provenanceUpdate = reconcileClassChange(ledger, className, undefined)

  return {
    characterUpdate,
    provenanceUpdate,
  }
}
