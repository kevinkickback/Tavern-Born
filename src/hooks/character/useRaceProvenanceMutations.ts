import { useCallback, useMemo } from 'react'
import { useRaceLookup } from '@/hooks/data/useGameData'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import {
  applyRaceAsiChoicesCommand,
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { resolveRaceGrantFilterOptions } from '@/lib/provenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

const EMPTY_ITEMS: never[] = []

function getSpellSelectionContext(
  race: Race5e,
  subrace: Race5e | undefined,
  racesByKey: Readonly<Record<string, Race5e>>,
  character: Character,
) {
  const resolved = resolveRaceReference(
    {
      name: race.name,
      source: race.source,
      subraceName: subrace?.name,
      subraceSource: subrace?.source,
    },
    { racesByKey },
  )
  const previous = resolveRaceReference(
    {
      name: character.race,
      source: character.raceSource,
      subraceName: character.subrace,
      subraceSource: character.subraceSource,
    },
    { racesByKey },
  )
  return {
    subraceIsNested: resolved.subraceData ? resolved.subraceIsNested : undefined,
    previousSubrace: previous.subraceData,
  }
}

export function useRaceProvenanceMutations() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const items = gameData?.items ?? EMPTY_ITEMS
  const itemsBase = gameData?.itemsBase ?? EMPTY_ITEMS
  const racesByKey = useRaceLookup()
  const ledger = useMemo<ProvenanceLedger>(
    () => character?.provenance ?? emptyProvenance(),
    [character],
  )
  const resolveRaceChoiceOptions = useCallback(
    (domain: 'armor' | 'weapons', fromFilter: string) =>
      resolveRaceGrantFilterOptions(domain, fromFilter, {
        items,
        itemsBase,
        allowedSources: character?.allowedSources,
      }),
    [character?.allowedSources, items, itemsBase],
  )
  const applyRaceSelection = useCallback(
    (race: Race5e, subrace?: Race5e, raceAsiBlockIndex: 0 | 1 = 0) => {
      if (!character) return
      const result = applyRaceSelectionCommand(
        character,
        ledger,
        race,
        subrace,
        raceAsiBlockIndex,
        resolveRaceChoiceOptions,
        getSpellSelectionContext(race, subrace, racesByKey, character),
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, resolveRaceChoiceOptions, updateCharacter, racesByKey],
  )
  const applySubraceChange = useCallback(
    (race: Race5e, subrace?: Race5e) => {
      if (!character) return
      const result = applySubraceSelectionCommand(
        character,
        ledger,
        race,
        subrace,
        resolveRaceChoiceOptions,
        getSpellSelectionContext(race, subrace, racesByKey, character),
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, resolveRaceChoiceOptions, updateCharacter, racesByKey],
  )
  const applyRaceAsiChoices = useCallback(
    (choices: string[][]) => {
      if (!character) return
      const result = applyRaceAsiChoicesCommand(ledger, choices)
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, updateCharacter],
  )
  return { applyRaceSelection, applySubraceChange, applyRaceAsiChoices }
}
