import type { AsiChoice } from '@/types/character'
import { makeSourceTag } from './sourceLabels'
import type { ProvenanceLedger } from './types'

/**
 * Rebuilds ASI ability bonus provenance records from the given choices.
 * Removes all existing ASI/class-choice abilityBonuses and replaces them
 * with records derived from `asiChoices`. Pure — does not mutate the ledger.
 */
export function applyAsiChoices(
  ledger: ProvenanceLedger,
  asiChoices: AsiChoice[],
): ProvenanceLedger {
  let result: ProvenanceLedger = {
    ...ledger,
    abilityBonuses: ledger.abilityBonuses.filter(
      (r) =>
        r.sourceTag.sourceType !== 'ASI' &&
        (r.sourceTag.sourceType !== 'class' || r.sourceTag.grantType !== 'choice'),
    ),
  }

  for (const asi of asiChoices) {
    for (const [ability, value] of Object.entries(asi.abilityChanges)) {
      result = {
        ...result,
        abilityBonuses: [
          ...result.abilityBonuses,
          {
            ability,
            value,
            sourceTag: makeSourceTag('ASI', asi.className, 'choice', undefined),
          },
        ],
      }
    }
  }

  return result
}
