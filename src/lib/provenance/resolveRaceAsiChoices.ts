import {
  ABILITY_NAMES,
  getRaceAbilityChoiceSelections,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import type { AbilityName } from '@/types/character'
import { resolveChoice } from './ledger'
import type { ProvenanceLedger } from './types'

/**
 * Syncs `raceAsiChoices` (stored on the character) into each race/subrace ability-bonus
 * ChoiceRecord's `selected` array. The outer index of `raceAsiChoices` maps positionally
 * to the race/subrace abilityBonuses choice records in ledger insertion order.
 *
 * Call this before deriving provenance rows so that `getAbilityBonusRows` can read
 * resolved race ASI selections purely from the ledger without external params.
 */
export function resolveRaceAsiChoicesInLedger(
  ledger: ProvenanceLedger,
  raceAsiChoices: string[][],
): ProvenanceLedger {
  const raceAsiRecords = ledger.choices.filter(
    (c) =>
      c.domain === 'abilityBonuses' &&
      (c.sourceTag.sourceType === 'race' || c.sourceTag.sourceType === 'subrace'),
  )

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
  let result = ledger
  for (let i = 0; i < raceAsiRecords.length; i++) {
    const record = raceAsiRecords[i]
    const selections = selectedByBlock[i]
    result = resolveChoice(result, record.id, selections)
  }
  return result
}
