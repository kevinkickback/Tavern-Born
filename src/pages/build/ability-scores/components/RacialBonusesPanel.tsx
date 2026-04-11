import { useMemo } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ABILITY_ABBREVIATIONS, type AbilityName } from '@/lib/calculations/abilityScores'

interface RaceAsiData {
  fixed: Array<{ ability: AbilityName; value: number }>
  choices: Array<{ count: number; amount: number; from: AbilityName[] }>
}

interface BuildAbilityScoresRacialBonusesPanelProps {
  raceAsiData: RaceAsiData
  raceAsiChoices: string[][]
  onUpdateChoice: (blockIdx: number, slotIdx: number, value: string) => void
}

export function BuildAbilityScoresRacialBonusesPanel({
  raceAsiData,
  raceAsiChoices,
  onUpdateChoice,
}: BuildAbilityScoresRacialBonusesPanelProps) {
  const choiceSlotIds = useMemo(
    () =>
      raceAsiData.choices.map((block) =>
        Array.from(
          { length: block.count },
          (_, slotNumber) => `asi-${block.amount}-${block.from.join('-')}-${slotNumber + 1}`,
        ),
      ),
    [raceAsiData.choices],
  )

  if (raceAsiData.fixed.length === 0 && raceAsiData.choices.length === 0) {
    return null
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Racial Bonuses
      </div>
      <div className="flex flex-wrap gap-2">
        {raceAsiData.fixed.map((fixedBonus) => (
          <span
            key={`${fixedBonus.ability}-${fixedBonus.value}`}
            className="rounded border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400"
          >
            {ABILITY_ABBREVIATIONS[fixedBonus.ability]} +{fixedBonus.value}
          </span>
        ))}

        {raceAsiData.choices.map((block, blockIdx) => {
          const selections = raceAsiChoices[blockIdx] ?? []

          return Array.from({ length: block.count }, (_, slotIdx) => {
            const selected = selections[slotIdx] ?? ''
            const takenByOthers = new Set(
              selections.filter(
                (selection, selectionIdx) => selectionIdx !== slotIdx && selection !== '',
              ),
            )

            return (
              <div
                key={
                  choiceSlotIds[blockIdx]?.[slotIdx] ?? `${block.amount}-${block.from.join('-')}`
                }
                className="flex items-center gap-1"
              >
                <span className="text-xs text-muted-foreground">+{block.amount}</span>
                <Select
                  value={selected}
                  onValueChange={(value) => onUpdateChoice(blockIdx, slotIdx, value)}
                >
                  <SelectTrigger className="h-7 w-24 px-2 text-xs">
                    <SelectValue placeholder="Choose..." />
                  </SelectTrigger>
                  <SelectContent>
                    {block.from.map((ability) => (
                      <SelectItem
                        key={ability}
                        value={ability}
                        disabled={takenByOthers.has(ability)}
                        className="text-xs"
                      >
                        {ABILITY_ABBREVIATIONS[ability]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })
        })}
      </div>
    </div>
  )
}
