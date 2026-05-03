/**
 * Unified class selection hook.
 *
 * Applies command-based character updates together with provenance updates.
 */

import { useCallback } from 'react'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import {
  selectBaseClass,
  selectSubclass as selectSubclassCommand,
} from '@/lib/character/commands/classCommands'
import { computeApplyClassSelectionUpdates } from '@/lib/character/commands/classSelectionOrchestrationCommand'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Item5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()

export function useUnifiedClassSelection() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP

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
      // Compute provenance/equipment/proficiency updates atomically via the orchestration command.
      const orchestrationUpdates = computeApplyClassSelectionUpdates(
        character,
        ledger,
        cls,
        undefined,
        itemLookup,
      )
      // Compute class identity and classProgression updates via the command layer.
      const commandResult = selectBaseClass(character, ledger, className, cls, classSource)

      // Single atomic write: orchestration wins for provenance/equipment/armor/weapons/tools/savingThrows;
      // selectBaseClass provides class identity fields and the merged skills map.
      updateCharacter(character.id, {
        ...orchestrationUpdates,
        class: commandResult.characterUpdate.class,
        classSource: commandResult.characterUpdate.classSource,
        subclass: commandResult.characterUpdate.subclass,
        subclassSource: commandResult.characterUpdate.subclassSource,
        classProgression: commandResult.characterUpdate.classProgression,
        skills: commandResult.characterUpdate.skills,
        proficiencies: {
          // orchestrationUpdates always sets proficiencies; Partial<Character> makes it optional so fallback to current
          ...(orchestrationUpdates.proficiencies ?? character.proficiencies),
          // selectBaseClass correctly adds new class skill profs; orchestration omits skills.
          skills: commandResult.characterUpdate.proficiencies?.skills ?? [],
        },
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
      // Compute provenance/equipment/proficiency updates atomically.
      const orchestrationUpdates = computeApplyClassSelectionUpdates(
        character,
        ledger,
        classEntity,
        { name: subclassName, source: subclassSource },
        itemLookup,
      )
      // Compute classProgression/subclass field updates.
      const result = selectSubclassCommand(
        character,
        ledger,
        subclassName,
        subclassSource,
        undefined,
        {
          classProgression,
          viewingEntry,
        },
      )

      // Single atomic write: merge both update sets (no field overlap).
      updateCharacter(character.id, {
        ...orchestrationUpdates,
        ...result.characterUpdate,
      })
    },
    [character, updateCharacter, itemLookup],
  )

  return { selectClass, selectSubclass }
}
