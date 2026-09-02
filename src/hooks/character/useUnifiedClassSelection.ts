/**
 * Unified class selection hook.
 *
 * Applies command-based character updates together with provenance updates.
 */

import { useCallback } from 'react'
import { useItemLookup } from '@/hooks/data/useGameData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

export function useUnifiedClassSelection() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useItemLookup()

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

      const ledger = character.provenance ?? emptyProvenance()
      const result = applyClassSelectionCommand(character, ledger, cls, undefined, itemLookup)

      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter, itemLookup],
  )

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

      const ledger = character.provenance ?? emptyProvenance()
      const result = applyClassSelectionCommand(
        character,
        ledger,
        classEntity,
        { name: subclassName, source: subclassSource },
        itemLookup,
        {
          classProgression,
          viewingEntry,
        },
      )

      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter, itemLookup],
  )

  return { selectClass, selectSubclass }
}
