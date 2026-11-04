import {
  formatAbilityBonus,
  formatAbilityChoice,
  formatBackgroundAbilityPatterns,
} from '@/lib/calculations/abilityScoreDisplay'
import {
  ABILITY_NAMES,
  type BackgroundAbilityData,
  isBackgroundAbilitySelectionComplete,
  normalizeAbilityName,
} from '@/lib/calculations/abilityScores'
import { formatSourceType } from './summaries'
import type { ProvenanceLedger, SourceRow, SourceTag } from './types'

/** Derive ability bonus source rows for display. */
export function getAbilityBonusRows(ledger: ProvenanceLedger): SourceRow[] {
  // Fixed and directly-applied bonuses (race fixed ASIs, background ASIs, ASI class features).
  const fixedRows: SourceRow[] = ledger.abilityBonuses.map((r) => ({
    itemName: formatAbilityBonus(r.ability, r.value),
    category: 'Ability Bonuses',
    attribution: formatAbilityBonusAttribution(r.sourceTag),
    sourceTypes: [r.sourceTag.sourceType],
    isPending: false,
  }))

  // Choice-based ASI bonuses. ChoiceRecord.selected is populated by
  // resolveRaceAsiChoicesInLedger before rows are derived.
  const choices = ledger.choices.filter((choice) => choice.domain === 'abilityBonuses')
  const taken = new Set(choices.flatMap((choice) => choice.selected.map(normalizeAbilityName)))
  const choiceRows: SourceRow[] = choices.flatMap((choice) => {
    const source = {
      category: 'Ability Bonuses',
      attribution: formatSourceType(choice.sourceTag.sourceType),
      sourceTypes: [choice.sourceTag.sourceType],
    }
    const amount = choice.amount ?? 1
    const selected = choice.status === 'pending' ? [] : choice.selected
    const rows = selected.map((ability) => ({
      ...source,
      itemName: formatAbilityBonus(ability, amount),
      isPending: false,
    }))
    if (choice.status !== 'resolved') {
      const pool = choice.optionPool.length ? choice.optionPool : ABILITY_NAMES
      rows.push({
        ...source,
        itemName: formatAbilityChoice(
          choice.chooseCount - selected.length,
          pool.filter((ability) => !taken.has(normalizeAbilityName(ability))),
          amount,
          selected.length > 0,
        ),
        isPending: true,
      })
    }
    return rows
  })

  return [...fixedRows, ...choiceRows]
}

export function getPendingBackgroundAbilityRows(
  data: BackgroundAbilityData,
  blockIndex: number,
  choices: string[],
): SourceRow[] {
  if (data.blocks.length === 0 || isBackgroundAbilitySelectionComplete(data, blockIndex, choices)) {
    return []
  }
  const block = data.blocks[blockIndex] ?? data.blocks[0]
  const taken = new Set<string>()
  const remaining = block.weights.filter((_, index) => {
    const ability = normalizeAbilityName(choices[index] ?? '')
    if (!ability || !block.from.includes(ability) || taken.has(ability)) return true
    taken.add(ability)
    return false
  })
  return [
    {
      itemName: taken.size
        ? formatAbilityChoice(
            remaining.length,
            block.from.filter((ability) => !taken.has(ability)),
            remaining,
            true,
          )
        : formatBackgroundAbilityPatterns(data).join(' or '),
      category: 'Ability Bonuses',
      attribution: 'background',
      sourceTypes: ['background'],
      isPending: true,
    },
  ]
}

function formatAbilityBonusAttribution(tag: SourceTag): string {
  if (
    tag.label.toLowerCase() === 'asi' ||
    tag.sourceName.toLowerCase() === 'ability score improvement'
  ) {
    return 'ASI'
  }
  return formatSourceType(tag.sourceType)
}
