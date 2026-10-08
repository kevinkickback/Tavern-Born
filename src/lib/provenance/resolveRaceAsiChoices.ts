import {
  ABILITY_NAMES,
  getRaceAbilityChoiceSelections,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import type { AbilityName, Character } from '@/types/character'
import { resolveChoiceRecord } from './ledger'
import { getSelectedRaceAbilityChoices } from './raceOwnership'
import type { ProvenanceLedger } from './types'

/**
 * Syncs `raceAsiChoices` (stored on the character) into each race/subrace ability-bonus
 * ChoiceRecord's `selected` array, in selected parent-then-child block order.
 *
 * Call this before deriving provenance rows so that `getAbilityBonusRows` can read
 * resolved race ASI selections purely from the ledger without external params.
 */
export function resolveRaceAsiChoicesInLedger(
  character: Character,
  ledger: ProvenanceLedger,
  raceAsiChoices: string[][],
): ProvenanceLedger {
  if (character.originSystem === '2024') return ledger
  const raceAsiRecords = getSelectedRaceAbilityChoices(ledger, character)

  if (raceAsiRecords.length === 0) return ledger

  const selectedByBlock = getRaceAbilityChoiceSelections(
    {
      choices: raceAsiRecords.map((record) => ({
        count: record.chooseCount,
        from:
          record.optionPool.length === 0
            ? [...ABILITY_NAMES]
            : record.optionPool
                .map(normalizeAbilityName)
                .filter((ability): ability is AbilityName => ability !== null),
      })),
    },
    raceAsiChoices,
  )
  const resolved = new Map(
    raceAsiRecords.map((record, index) => [
      record,
      resolveChoiceRecord(record, selectedByBlock[index]),
    ]),
  )
  return { ...ledger, choices: ledger.choices.map((record) => resolved.get(record) ?? record) }
}
