import { CORE_RULES_METADATA } from '@/lib/5etools/rulesetMetadata'
import type { OriginSystem, VariantRules } from '@/types/character'

type AbilityScoreMethod = NonNullable<VariantRules['abilityScoreMethod']>

export interface AbilityScoreMethodOption {
  value: AbilityScoreMethod
  label: string
  description: string
}

function formatScoreList(scores: readonly number[]): string {
  if (scores.length < 2) return scores.join('')
  return `${scores.slice(0, -1).join(', ')}, and ${scores[scores.length - 1]}`
}

export function getAbilityScoreMethodOptions(
  originSystem: OriginSystem,
): AbilityScoreMethodOption[] {
  const rules = CORE_RULES_METADATA[originSystem]
  return [
    {
      value: 'point-buy',
      label: 'Point Buy',
      description: `Spend ${rules.pointBuyBudget} points to customize your six ability scores, from ${rules.pointBuyMin} to ${rules.pointBuyMax} before bonuses.`,
    },
    {
      value: 'standard-array',
      label: 'Standard Array',
      description: `Assign ${formatScoreList(rules.standardArray)} to your six abilities in any order.`,
    },
    {
      value: 'custom',
      label: 'Custom',
      description:
        'Enter ability scores freely, including rolled scores; no generation restrictions are enforced.',
    },
  ]
}
