/**
 * Unified class selection hook.
 *
 * Applies command-based character updates together with provenance updates.
 */

import { useCallback } from 'react'
import { useProvenance } from '@/hooks/character/useProvenance'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import {
  selectBaseClass,
  selectSubclass as selectSubclassCommand,
} from '@/lib/character/commands/classCommands'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

export function useUnifiedClassSelection() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { applyClassSelection } = useProvenance()

  /**
   * Apply a base class selection in a single coordinated operation.
   *
   * Coordinates command-derived character updates with provenance application.
   */
  const selectClass = useCallback(
    (
      className: string,
      classSource: string | undefined,
      classLookup: Record<string, Class5e | undefined>,
      fallbackClassByName: Map<string, Class5e>,
    ) => {
      if (!character) return

      const cls = classSource
        ? classLookup[getEntityLookupKey(className, classSource)]
        : fallbackClassByName.get(className)

      if (!cls) return

      const result = selectBaseClass(
        character,
        character.provenance ?? emptyProvenance(),
        className,
        cls,
        classSource,
      )

      if (cls) applyClassSelection(cls, undefined)
      updateCharacter(character.id, result.characterUpdate)
    },
    [character, updateCharacter, applyClassSelection],
  )

  /**
   * Apply a subclass selection in a single coordinated operation.
   *
   * Coordinates command-derived character updates with provenance application.
   */
  const selectSubclass = useCallback(
    (
      subclassName: string,
      subclassSource: string | undefined,
      classProgression: CharacterClassEntry[] | undefined,
      viewingEntry: CharacterClassEntry | undefined,
    ) => {
      if (!character || !classProgression || !viewingEntry || !subclassSource) return

      const classEntity = {
        name: viewingEntry.name,
        source: viewingEntry.source,
      }

      applyClassSelection(classEntity, { name: subclassName, source: subclassSource })

      const result = selectSubclassCommand(
        character,
        character.provenance ?? emptyProvenance(),
        subclassName,
        subclassSource,
        undefined,
        {
          classProgression,
          viewingEntry,
        },
      )

      updateCharacter(character.id, result.characterUpdate)
    },
    [character, updateCharacter, applyClassSelection],
  )

  return { selectClass, selectSubclass }
}
