import { CheckCircle, Circle } from '@phosphor-icons/react'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { normalizeSelectableAllowedSources } from '@/lib/sourceCompatibility'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { StepProps } from '../types'
import { WizardVariantOptions } from '../WizardVariantOptions'

export function RulesStep({
  data,
  onChange,
  sources = [],
  invalidFields,
  variantRuleAvailability,
}: StepProps & {
  sources?: SourceBook[]
  variantRuleAvailability?: VariantRuleContentAvailability
}) {
  const configuredSources = data.allowedSources || []
  return (
    <div className="@container space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Ruleset</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose the edition for this character.
          </p>
        </div>

        <div
          className={cn(
            'grid gap-3 @min-[32rem]:grid-cols-2',
            invalidFields?.has('originSystem') && 'rounded-lg ring-1 ring-destructive',
          )}
        >
          {[
            {
              value: '2014' as const,
              label: '5e Legacy (2014)',
              description: 'Use the original 5th Edition rules and character options.',
            },
            {
              value: '2024' as const,
              label: '5.5e Revised (2024)',
              description: 'Use the revised rules and compatible earlier options.',
            },
          ].map((option) => {
            const selected = data.originSystem === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onChange({
                    originSystem: option.value,
                    allowedSources: normalizeSelectableAllowedSources(
                      configuredSources,
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
                  'flex items-start gap-3 rounded-md border border-border px-4 py-4 text-left transition-colors motion-reduce:transition-none',
                  selected ? 'border-primary/50 bg-surface-selected' : 'hover:bg-surface-hover',
                )}
              >
                {selected ? (
                  <CheckCircle
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    weight="fill"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <div className="text-sm font-semibold">{option.label}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
        {invalidFields?.has('originSystem') && (
          <p className="text-xs text-destructive">Please select a ruleset to continue.</p>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Rule Options</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Some options depend on the books you choose in Sourcebooks. You can return here after
            choosing them.
          </p>
        </div>
        <WizardVariantOptions
          data={data}
          onChange={onChange}
          contentAvailability={variantRuleAvailability}
        />
      </section>
    </div>
  )
}
