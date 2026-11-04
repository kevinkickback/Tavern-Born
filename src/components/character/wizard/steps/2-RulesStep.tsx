import { Sparkle } from '@phosphor-icons/react'
import { getAbilityScoreMethodOptions } from '@/lib/calculations/abilityScoreMethods'
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
}: StepProps & { sources?: SourceBook[] }) {
  const configuredSources = data.allowedSources || []
  const abilityScoreMethods = getAbilityScoreMethodOptions(
    data.originSystem === '2024' ? '2024' : '2014',
  )
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkle className="h-4 w-4 text-primary" weight="fill" />
          <div>
            <h3 className="text-sm font-semibold">Ruleset</h3>
            <p className="text-xs text-muted-foreground">
              Choose the rules foundation for this character.
            </p>
          </div>
        </div>

        <div
          className={cn(
            'grid gap-3 md:grid-cols-2',
            invalidFields?.has('originSystem') && 'rounded-lg ring-1 ring-destructive',
          )}
        >
          {[
            {
              value: '2014' as const,
              label: '5e Legacy (2014)',
              description:
                'The original 5th Edition ruleset. Widely supported, highly stable, and compatible with a large library of adventures and supplements.',
            },
            {
              value: '2024' as const,
              label: '5.5e Revised (2024)',
              description:
                'An updated version of 5th Edition with rebalanced classes, improved feats, and streamlined mechanics. Broadly compatible with earlier content.',
            },
          ].map((option) => {
            const selected = data.originSystem === option.value
            return (
              <button
                key={option.value}
                type="button"
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
                  'relative rounded-md border px-4 py-3 pl-10 text-left transition-colors',
                  selected
                    ? 'border-primary/60 bg-surface-selected'
                    : 'border-border bg-surface-raised/45 hover:border-primary/40 hover:bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'absolute left-4 top-4 size-3.5 rounded-full border',
                    selected ? 'border-primary bg-primary' : 'border-muted-foreground/60',
                  )}
                  aria-hidden="true"
                />
                <div className="font-semibold text-sm">{option.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
              </button>
            )
          })}
        </div>
        {invalidFields?.has('originSystem') && (
          <p className="text-xs text-destructive">Please select a ruleset to continue.</p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-primary" weight="fill" />
            <h3 className="text-sm font-semibold">Ability Score Generation</h3>
          </div>

          <div className="flex rounded-lg overflow-hidden border border-border">
            {abilityScoreMethods.map(({ value, label }, i) => (
              <button
                key={value}
                type="button"
                onClick={() => onChange({ abilityScoreMethod: value })}
                className={cn(
                  'flex-1 px-3 py-2 text-sm font-semibold transition-all',
                  i > 0 && 'border-l border-border',
                  data.abilityScoreMethod === value
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-transparent hover:bg-accent/10',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed min-h-[2.5rem]">
            {abilityScoreMethods.find((method) => method.value === data.abilityScoreMethod)
              ?.description ?? ''}
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Hit Points</h3>
          <WizardVariantOptions data={data} onChange={onChange} keys={['averageHitPoints']} />
        </section>
      </div>
    </div>
  )
}
