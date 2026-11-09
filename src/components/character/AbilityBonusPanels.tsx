import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatAbilityBonus, formatAbilityChoice } from '@/lib/calculations/abilityScoreDisplay'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  type BackgroundAbilityData,
  type RaceAbilityData,
  type RaceLineageAsiBlockIndex,
} from '@/lib/calculations/abilityScores'
import { updateRaceAsiChoices } from '@/lib/calculations/originAbilityChoices'
import { cn } from '@/lib/utils'

interface PanelFocus {
  sectionRef?: Ref<HTMLElement>
  highlighted?: boolean
}

function BonusPanel({
  title,
  description,
  controls,
  children,
  testId,
  sectionRef,
  highlighted,
}: PanelFocus & {
  title: string
  description?: string
  controls?: ReactNode
  children: ReactNode
  testId: string
}) {
  return (
    <section
      ref={sectionRef}
      className={cn(
        'mx-auto mt-6 w-full max-w-2xl rounded-lg border border-border-subtle bg-surface-raised/35 p-4',
        highlighted && 'animate-route-focus',
      )}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {controls}
      </div>
      {children && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{children}</div>
      )}
    </section>
  )
}

function DistributionPicker<T extends number>({
  label,
  options,
  active,
  onChange,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  active: number
  onChange: (value: T) => void
}) {
  return (
    <fieldset
      className="inline-flex w-fit flex-wrap gap-1 rounded-md border border-border bg-background/45 p-1"
      aria-label={label}
    >
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={active === value}
          onClick={() => {
            if (active !== value) onChange(value)
          }}
          className={cn(
            'flex h-8 items-center rounded px-3 text-xs font-semibold transition-colors',
            active === value
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </fieldset>
  )
}

function BonusSelect({
  label,
  amount,
  selected,
  abilities,
  taken,
  disabled,
  onChange,
}: {
  label: string
  amount: number
  selected: string
  abilities: AbilityName[]
  taken: Set<string>
  disabled?: boolean
  onChange: (ability: string) => void
}) {
  return (
    <div className="flex min-w-44 items-center gap-2 rounded-md border border-border bg-background/35 p-1 pl-3">
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">+{amount}</span>
      <Select value={selected} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger
          className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-xs shadow-none focus:ring-0"
          aria-label={label}
        >
          <SelectValue placeholder="Ability…" />
        </SelectTrigger>
        <SelectContent>
          {abilities.map((ability) => (
            <SelectItem
              key={ability}
              value={ability}
              disabled={taken.has(ability)}
              className="text-xs"
            >
              {ABILITY_ABBREVIATIONS[ability]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const RACIAL_DISTRIBUTIONS = [
  { value: 0, label: '+2 / +1' },
  { value: 1, label: '+1 / +1 / +1' },
] as const

export function RacialAbilityBonusPanel({
  data: { fixed, choices },
  selections,
  distribution,
  onDistributionChange,
  onChoicesChange,
  ...focus
}: PanelFocus & {
  data: RaceAbilityData
  selections: string[][]
  distribution: RaceLineageAsiBlockIndex
  onDistributionChange?: (value: RaceLineageAsiBlockIndex) => void
  onChoicesChange: (next: string[][]) => void
}) {
  if (fixed.length === 0 && choices.length === 0) return null

  return (
    <BonusPanel
      title="Racial bonuses"
      testId="race-ability-choices"
      {...focus}
      controls={
        onDistributionChange && (
          <DistributionPicker
            label="Racial bonus distribution"
            options={RACIAL_DISTRIBUTIONS}
            active={distribution}
            onChange={onDistributionChange}
          />
        )
      }
    >
      {fixed.map((bonus) => (
        <span
          key={`${bonus.source}|${bonus.ability}|${bonus.value}`}
          className="flex min-h-9 items-center rounded-md border border-border bg-background/35 px-3 text-xs font-semibold"
        >
          {formatAbilityBonus(bonus.ability, bonus.value)}
        </span>
      ))}
      {choices.flatMap((block, blockIndex) =>
        Array.from({ length: block.count }, (_, slotIndex) => {
          const taken = new Set(
            choices.flatMap((_, groupIndex) =>
              (selections[groupIndex] ?? []).filter(
                (_, index) => groupIndex !== blockIndex || index !== slotIndex,
              ),
            ),
          )
          return (
            <BonusSelect
              // biome-ignore lint/suspicious/noArrayIndexKey: ability choice slots are stored by block and slot position
              key={`${blockIndex}|${slotIndex}|${block.amount}|${block.from.join(',')}`}
              label={`Racial ability bonus +${block.amount}, group ${blockIndex + 1}, choice ${slotIndex + 1}`}
              amount={block.amount}
              selected={selections[blockIndex]?.[slotIndex] ?? ''}
              abilities={block.from}
              taken={taken}
              onChange={(ability) =>
                onChoicesChange(updateRaceAsiChoices(selections, blockIndex, slotIndex, ability))
              }
            />
          )
        }),
      )}
    </BonusPanel>
  )
}

export function BackgroundAbilityBonusPanel({
  data,
  block,
  blockIndex,
  choices,
  fixedAssignment,
  onChoicesChange,
  onClear,
  ...focus
}: PanelFocus & {
  data: BackgroundAbilityData
  block?: BackgroundAbilityData['blocks'][number]
  blockIndex: number
  choices: string[]
  fixedAssignment?: boolean
  onChoicesChange: (index: number, choices: string[]) => void
  onClear?: () => void
}) {
  const canClear = !fixedAssignment && choices.some(Boolean) && onClear
  if (data.blocks.length === 0 && !canClear) return null

  return (
    <BonusPanel
      title="Background bonuses"
      description={
        block
          ? formatAbilityChoice(block.weights.length, block.from, block.weights)
          : 'These bonuses are no longer available with the current source data.'
      }
      testId="background-ability-choices"
      {...focus}
      controls={
        <div className="flex flex-wrap items-center gap-2">
          {data.blocks.length > 1 && (
            <DistributionPicker
              label="Background bonus distribution"
              options={data.blocks.map((entry, value) => ({
                value,
                label: entry.weights.map((weight) => `+${weight}`).join(' / '),
              }))}
              active={blockIndex}
              onChange={(index) => onChoicesChange(index, [])}
            />
          )}
          {canClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear bonuses
            </Button>
          )}
        </div>
      }
    >
      {block?.weights.map((amount, slotIndex) => (
        <BonusSelect
          // biome-ignore lint/suspicious/noArrayIndexKey: duplicate weights are distinct positional slots
          key={`${amount}|${slotIndex}`}
          label={`Background ability bonus +${amount}${block.weights.filter((weight) => weight === amount).length > 1 ? `, choice ${slotIndex + 1}` : ''}`}
          amount={amount}
          selected={choices[slotIndex] ?? ''}
          abilities={block.from}
          taken={new Set(choices.filter((_, index) => index !== slotIndex))}
          disabled={fixedAssignment}
          onChange={(ability) =>
            onChoicesChange(
              blockIndex,
              block.weights.map((_, index) =>
                index === slotIndex ? ability : (choices[index] ?? ''),
              ),
            )
          }
        />
      ))}
    </BonusPanel>
  )
}
