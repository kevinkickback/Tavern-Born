import { formatAbilityChoice } from '@/lib/calculations/abilityScoreDisplay'
import type { RaceAbilityData } from '@/lib/calculations/abilityScores'

export function RacialAbilityChoiceSummary({ choices }: Pick<RaceAbilityData, 'choices'>) {
  if (choices.length === 0) return null

  return (
    <ul className="mt-1 list-disc space-y-1 pl-4 text-left text-xs leading-relaxed text-muted-foreground">
      {choices.map(({ count, from, amount }, index) => (
        <li key={JSON.stringify([index, count, from, amount])}>
          {formatAbilityChoice(count, from, amount)}
        </li>
      ))}
    </ul>
  )
}
