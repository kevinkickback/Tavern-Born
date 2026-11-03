import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
/**
 * Unified class selection hook.
 *
 * Applies command-based character updates together with provenance updates.
 */

import { useCallback } from 'react'
import { useItemLookup } from '@/hooks/data/useGameData'
import { useStartingEquipmentAuthority } from '@/hooks/data/useStartingEquipment'
import { findClassReference } from '@/lib/5etools/classReference'
import { startingEquipmentSetupHandle } from '@/lib/5etools/startingEquipmentPolicy'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'

export function useUnifiedClassSelection() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const itemLookup = useItemLookup()
  const calculationContext = useCharacterCalculationContext(character)
  const { getPolicy: getEquipmentPolicy, sourceData } = useStartingEquipmentAuthority()

  const selectClass = useCallback(
    (className: string, classSource: string, classLookup: Record<string, Class5e | undefined>) => {
      const latest = useCharacterStore.getState().activeCharacter
      if (
        !hasCurrentCharacterSourceContext(
          latest,
          character,
          useGameDataStore.getState().gameData,
          sourceData,
        ) ||
        !latest ||
        !character ||
        startingEquipmentSetupHandle(latest, 'class') !==
          startingEquipmentSetupHandle(character, 'class')
      )
        throw new RangeError(
          'The initial Class or source rules changed. Review the current selection.',
        )

      const cls = findClassReference(
        { name: className, source: classSource },
        Object.values(classLookup),
      )

      if (!cls) return

      const result = applyClassSelectionCommand(
        latest,
        latest.provenance,
        cls,
        undefined,
        itemLookup,
        {
          startingEquipmentPolicy: getEquipmentPolicy(latest, 'class', cls),
          raceResolution: calculationContext?.raceResolution,
          spellsByKey: calculationContext?.lookups.primary.spellsByKey,
          rawSpellsByKey: calculationContext?.lookups.raw.spellsByKey,
          classChoiceFeatureCatalogs: calculationContext?.classChoices.catalogs,
          spellContext: calculationContext?.classChoices.spellContext,
        },
      )

      updateCharacter(latest.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter, itemLookup, calculationContext, getEquipmentPolicy, sourceData],
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
          raceResolution: calculationContext?.raceResolution,
          spellsByKey: calculationContext?.lookups.primary.spellsByKey,
          rawSpellsByKey: calculationContext?.lookups.raw.spellsByKey,
          classChoiceFeatureCatalogs: calculationContext?.classChoices.catalogs,
          spellContext: calculationContext?.classChoices.spellContext,
        },
      )

      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter, itemLookup, calculationContext],
  )

  return { selectClass, selectSubclass }
}
