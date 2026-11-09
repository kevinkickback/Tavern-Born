import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import type { StepProps } from './types'

const NO_CONTENT_SPECIFIC_RULES: VariantRuleContentAvailability = {
  optionalClassFeatures: false,
  anyRaceSubclasses: false,
  preferNewerPrintings: false,
}

const RULE_OPTIONS = [
  {
    key: 'averageHitPoints',
    label: 'Average Hit Points',
    description: 'Use fixed HP at level-up. Turn off to roll or enter HP.',
  },
  {
    key: 'optionalClassFeatures',
    label: 'Allow Optional Class Features',
    description: 'Enable optional features for selection in Builder.',
  },
  {
    key: 'anyRaceSubclasses',
    label: 'Any-Race Subclasses',
    description: 'Ignore race requirements for subclasses.',
  },
  {
    key: 'preferNewerPrintings',
    label: 'Prefer Newer Printings',
    description: 'Prefer newer versions in your selected books.',
  },
] as const

export function WizardVariantOptions({
  data,
  onChange,
  contentAvailability = NO_CONTENT_SPECIFIC_RULES,
}: StepProps & { contentAvailability?: VariantRuleContentAvailability }) {
  const baseId = useId()

  return (
    <TooltipProvider>
      <div className="divide-y divide-border">
        {RULE_OPTIONS.map(({ key, label, description }) => {
          const id = baseId + key
          const detailsId = `${id}-details`
          const lockedByRuleset = key === 'preferNewerPrintings' && data.originSystem === '2024'
          const checked = lockedByRuleset || data.variantRules[key]
          const available = key === 'averageHitPoints' || contentAvailability[key]
          const unavailable = !lockedByRuleset && !available && !checked
          const lockReason = lockedByRuleset
            ? 'Always on for 2024 characters'
            : unavailable
              ? 'Unavailable with selected content'
              : undefined
          const control = (
            <Switch
              id={id}
              aria-describedby={detailsId}
              checked={checked}
              disabled={lockedByRuleset || unavailable}
              onCheckedChange={(checked) =>
                onChange({ variantRules: { ...data.variantRules, [key]: checked } })
              }
              className={lockReason ? 'pointer-events-none' : 'shrink-0'}
            />
          )
          return (
            <div key={key} className="flex min-h-13 items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor={id} className="text-sm font-semibold">
                  {label}
                </Label>
                <div
                  id={detailsId}
                  className="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground"
                >
                  <p>{description}</p>
                  {!lockedByRuleset && !available && checked && (
                    <p className="font-medium">Currently inactive</p>
                  )}
                </div>
              </div>
              {lockReason ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <fieldset
                      // biome-ignore lint/a11y/noNoninteractiveTabindex: Disabled switches need a keyboard target for their tooltip.
                      tabIndex={0}
                      aria-label={label}
                      className="inline-flex shrink-0 rounded-full focus-visible:outline-ring"
                    >
                      {control}
                    </fieldset>
                  </TooltipTrigger>
                  <TooltipContent side="left">{lockReason}</TooltipContent>
                </Tooltip>
              ) : (
                control
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
