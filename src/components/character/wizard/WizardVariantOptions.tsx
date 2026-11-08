import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
    description:
      'Use fixed hit points when leveling up. Turn this off to roll or enter the result.',
  },
  {
    key: 'optionalClassFeatures',
    label: 'Allow Optional Class Features',
    description:
      'Enable optional features. Choose individual features on the Class page after creation.',
  },
  {
    key: 'anyRaceSubclasses',
    label: 'Any-Race Subclasses',
    description: 'Allow subclasses that normally require a particular race.',
  },
  {
    key: 'preferNewerPrintings',
    label: 'Prefer Newer Printings',
    description:
      'Show the newest printing when multiple versions are available in your selected books.',
  },
] as const

export function WizardVariantOptions({
  data,
  onChange,
  contentAvailability = NO_CONTENT_SPECIFIC_RULES,
}: StepProps & { contentAvailability?: VariantRuleContentAvailability }) {
  const baseId = useId()

  return (
    <div className="divide-y divide-border border-y border-border">
      {RULE_OPTIONS.map(({ key, label, description }) => {
        const id = baseId + key
        const detailsId = `${id}-details`
        const lockedByRuleset = key === 'preferNewerPrintings' && data.originSystem === '2024'
        const checked = lockedByRuleset || data.variantRules[key]
        const available = key === 'averageHitPoints' || contentAvailability[key]
        return (
          <div key={key} className="flex items-center justify-between gap-5 min-h-13 py-2.5">
            <div className="min-w-0">
              <Label htmlFor={id} className="text-sm font-semibold">
                {label}
              </Label>
              <div
                id={detailsId}
                className="mt-1 space-y-1 text-xs leading-relaxed text-muted-foreground"
              >
                <p>{description}</p>
                {lockedByRuleset ? (
                  <p className="font-medium">Always on for 2024 characters</p>
                ) : !available ? (
                  <p className="font-medium">
                    {checked ? 'Currently inactive' : 'Unavailable with selected content'}
                  </p>
                ) : null}
              </div>
            </div>
            <Switch
              id={id}
              aria-describedby={detailsId}
              checked={checked}
              disabled={lockedByRuleset || (!available && !checked)}
              onCheckedChange={(checked) =>
                onChange({ variantRules: { ...data.variantRules, [key]: checked } })
              }
              className="mt-0.5 shrink-0"
            />
          </div>
        )
      })}
    </div>
  )
}
