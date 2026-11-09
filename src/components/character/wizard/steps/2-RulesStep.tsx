import { CheckCircle, Circle } from '@phosphor-icons/react'
import { type ReactNode, useId } from 'react'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { normalizeSelectableAllowedSources } from '@/lib/sourceCompatibility'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { StepProps } from '../types'
import { WizardVariantOptions } from '../WizardVariantOptions'

const RULESETS = [
  {
    value: '2014',
    label: '5e Legacy (2014)',
    highlights: [
      'Race usually provides ability score bonuses.',
      'Backgrounds grant proficiencies and a feature.',
      'Subclass levels vary by class.',
      'Feats are optional in the core rules.',
    ],
  },
  {
    value: '2024',
    label: '5.5e Revised (2024)',
    highlights: [
      'Backgrounds grant ability bonuses and an Origin feat.',
      'Species have revised traits.',
      'Revised classes choose subclasses at level 3.',
      'Weapon Mastery adds options for eligible classes.',
    ],
  },
] as const

export function RulesStep({
  data,
  onChange,
  intro,
  sources = [],
  variantRuleAvailability,
}: StepProps & {
  intro?: ReactNode
  sources?: SourceBook[]
  variantRuleAvailability?: VariantRuleContentAvailability
}) {
  const summaryId = useId()

  return (
    <div className="grid min-h-full md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="@container min-w-0 p-4 sm:p-6">
        {intro}
        <div className="grid gap-3 @min-[22rem]:grid-cols-2">
          {RULESETS.map((option) => {
            const selected = data.originSystem === option.value
            const descriptionId = `${summaryId}-${option.value}`
            return (
              <div
                key={option.value}
                className={cn(
                  'min-w-0 overflow-hidden rounded-lg border',
                  selected ? 'border-primary/50' : 'border-border',
                )}
              >
                <button
                  type="button"
                  aria-describedby={descriptionId}
                  aria-pressed={selected}
                  onClick={() =>
                    onChange({
                      originSystem: option.value,
                      allowedSources: normalizeSelectableAllowedSources(
                        data.allowedSources,
                        option.value,
                        sources,
                      ),
                      ...(option.value === '2024'
                        ? {
                            variantRules: {
                              ...data.variantRules,
                              preferNewerPrintings: true,
                            },
                          }
                        : {}),
                    })
                  }
                  className={cn(
                    'flex w-full items-center gap-2.5 border-b border-border px-3 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none',
                    selected ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                  )}
                >
                  {selected ? (
                    <CheckCircle
                      className="size-4 shrink-0 text-primary"
                      weight="fill"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  {option.label}
                </button>
                <ul
                  id={descriptionId}
                  className="list-disc space-y-2 py-3 pr-3 pl-7 text-sm text-muted-foreground"
                >
                  {option.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          The revised rules update many spells and still support compatible older options.
        </p>
      </section>

      <aside className="min-w-0 space-y-3 border-t border-border bg-workspace-canvas p-4 sm:p-6 md:border-t-0 md:border-l">
        <h3 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground after:h-px after:flex-1 after:bg-border">
          Rule Options
        </h3>
        <WizardVariantOptions
          data={data}
          onChange={onChange}
          contentAvailability={variantRuleAvailability}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Some options depend on sourcebooks. Revisit Rules after choosing them.
        </p>
      </aside>
    </div>
  )
}
