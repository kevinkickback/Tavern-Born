import { useCallback, useMemo } from 'react'
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

const EMPTY_ITEMS: never[] = []

export function useRaceProvenanceMutations() {
  // Domain mutation hook contract:
  // 1. Read character + ledger from store (via useLedgerPatch or direct store selectors).
  // 2. Reconcile: remove grants from the old source (reconcile* functions in lib/provenance).
  // 3. Apply: add grants from the new source (apply* functions in lib/provenance).
  // 4. Sync derived character fields (proficiencies, skills via mergeSkillState, equipment).
  // 5. Write via updateCharacter(character.id, patch) or patchLedger for ledger-only writes.
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const items = gameData?.items ?? EMPTY_ITEMS
  const itemsBase = gameData?.itemsBase ?? EMPTY_ITEMS

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
    (
      race: {
        name: string
        source?: string
        lineage?: string | boolean
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
      },
      subrace?: {
        name: string
        source?: string
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
        overwrite?: { ability?: boolean }
      },
      raceAsiBlockIndex: 0 | 1 = 0,
    ) => {
      if (!character) return
      const result = applyRaceSelectionCommand(
        character,
        ledger,
        race as Race5e,
        subrace as Race5e | undefined,
        raceAsiBlockIndex,
        resolveRaceChoiceOptions,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, resolveRaceChoiceOptions, updateCharacter],
  )

  const applySubraceChange = useCallback(
    (
      race: {
        name: string
        source?: string
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
      },
      subrace?: {
        name: string
        source?: string
        darkvision?: number
        resist?: string[]
        immune?: string[]
        conditionImmune?: string[]
        skillProficiencies?: unknown[]
        languageProficiencies?: unknown[]
        toolProficiencies?: unknown[]
        weaponProficiencies?: unknown[]
        armorProficiencies?: unknown[]
        ability?: unknown[]
        feats?: unknown[]
        overwrite?: { ability?: boolean }
      },
    ) => {
      if (!character) return
      const result = applySubraceSelectionCommand(
        character,
        ledger,
        race as Race5e,
        subrace as Race5e | undefined,
        resolveRaceChoiceOptions,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, ledger, resolveRaceChoiceOptions, updateCharacter],
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
