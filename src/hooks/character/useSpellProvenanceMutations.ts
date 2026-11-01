import { useCallback } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import {
  type ManagedClassSpellRequest,
  setManagedClassSpellChoicesCommand,
} from '@/lib/character/commands/managedClassSpellCommands'
import { managedClassSpellId } from '@/lib/character/managedClassSpellIdentity'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'

export function useSpellProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const sourceData = useGameDataStore((state) => state.gameData)
  const calculationContext = useCharacterCalculationContext(character)

  const finishClassSpellChoices = useCallback(
    (requests: readonly ManagedClassSpellRequest[]) => {
      const latest = useCharacterStore.getState().activeCharacter
      if (!latest || !character || latest.id !== character.id)
        throw new RangeError('The character changed. Reopen the spell choices.')
      const grants = requests.some((request) => {
        if (!request.target) return false
        const old = latest.managedClassSpellChoices?.find(
          (choice) => managedClassSpellId(choice.slot) === managedClassSpellId(request.slot),
        )
        const same =
          old &&
          getSpellReferenceKey(old.target.name, old.target.source) ===
            getSpellReferenceKey(request.target.name, request.target.source) &&
          old.policy === request.policy
        const prepare = request.prepare === undefined ? old?.prepare : request.prepare || undefined
        return !same || (prepare !== old?.prepare && !(old?.prepare && !prepare))
      })
      if (
        grants &&
        (!calculationContext ||
          !hasCurrentCharacterSourceContext(
            latest,
            character,
            useGameDataStore.getState().gameData,
            sourceData,
          ))
      )
        throw new RangeError('The spell sources changed. Reopen the choices before confirming.')
      const current =
        grants && calculationContext
          ? createCharacterCalculationContext(
              latest,
              calculationContext.lookups.primary,
              calculationContext.lookups.raw,
            )
          : undefined
      const result = setManagedClassSpellChoicesCommand(
        latest,
        latest.provenance,
        requests,
        current
          ? { ...current.classChoices.spellContext, abilityScores: current.abilityScores.total }
          : undefined,
      )
      if (!Object.keys(result.characterPatch).length) return
      const next = current
        ? refreshNativeRacialSpellState(
            { ...latest, ...result.characterPatch, provenance: result.provenanceUpdate },
            current.raceResolution,
            {
              spellsByKey: current.lookups.primary.spellsByKey,
              rawSpellsByKey: current.lookups.raw.spellsByKey,
            },
          )
        : undefined
      useCharacterStore.getState().updateCharacter(latest.id, {
        ...result.characterPatch,
        ...(next ? { spells: next.spells } : {}),
        provenance: next?.provenance ?? result.provenanceUpdate,
      })
    },
    [character, sourceData, calculationContext],
  )

  return { finishClassSpellChoices }
}
