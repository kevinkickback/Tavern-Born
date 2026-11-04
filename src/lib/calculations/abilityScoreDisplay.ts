import type { Race5e } from '@/types/5etools'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type BackgroundAbilityData,
  formatModifier,
  getRaceAbilityChoiceSelections,
  getRaceAbilityData,
  type RaceAbilityData,
} from './abilityScores'

function displayAbilityAbbreviation(ability: string): string {
  return ability.toUpperCase().slice(0, 3)
}

export function formatAbilityBonus(ability: string, amount: number): string {
  return `${displayAbilityAbbreviation(ability)} ${formatModifier(amount)}`
}

export function formatAbilityChoice(
  count: number,
  from: readonly string[],
  amounts: number | readonly number[],
  remaining = false,
): string {
  const first = typeof amounts === 'number' ? amounts : amounts[0]
  const bonus =
    typeof amounts === 'number' || amounts.every((amount) => amount === first)
      ? `${formatModifier(first)}${count > 1 ? ' each' : ''}`
      : `${amounts.map(formatModifier).join(' and ')}, one bonus per ability`
  const pool = from.map(displayAbilityAbbreviation)
  const restriction = ABILITY_NAMES.every((ability) =>
    pool.includes(ABILITY_ABBREVIATIONS[ability]),
  )
    ? ''
    : ` from ${pool.join(', ') || 'no available scores'}`
  return `Choose ${count}${remaining ? ' more' : ''} ${count === 1 ? 'ability' : 'abilities'}${restriction} (${bonus})`
}

export function formatBackgroundAbilityPatterns(data: BackgroundAbilityData): string[] {
  return data.blocks.map(({ from, weights }) => formatAbilityChoice(weights.length, from, weights))
}

export function formatRacialAbilityPatterns({ choices }: RaceAbilityData): string {
  return choices
    .map(({ count, from, amount }) => formatAbilityChoice(count, from, amount))
    .join(' · ')
}

/**
 * Format ability score increases as display strings.
 * When `raceAsiChoices` is provided, shows selected choices and remaining count.
 * Uses the selected parent/child rules and the chosen flexible distribution.
 */
export function getAsiDisplay(
  race: Race5e | undefined,
  raceAsiBlockIndex: 0 | 1 = 0,
  raceAsiChoices?: string[][],
  subrace?: Race5e,
): string[] {
  if (!race) return []
  const { fixed, choices } = getRaceAbilityData(race, subrace, raceAsiBlockIndex)
  const selectedByBlock = getRaceAbilityChoiceSelections({ choices }, raceAsiChoices ?? [])
  const lines = fixed.map(({ ability, value }) => formatAbilityBonus(ability, value))
  const taken = new Set(selectedByBlock.flat())
  for (const [blockIdx, block] of choices.entries()) {
    const selections = selectedByBlock[blockIdx]
    for (const ability of selections) lines.push(formatAbilityBonus(ability, block.amount))
    const remaining = block.count - selections.length
    if (remaining > 0) {
      lines.push(
        formatAbilityChoice(
          remaining,
          block.from.filter((ability) => !taken.has(ability)),
          block.amount,
          selections.length > 0,
        ),
      )
    }
  }
  return lines
}
