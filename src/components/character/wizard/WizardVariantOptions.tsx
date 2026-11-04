import { Question } from '@phosphor-icons/react'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { cn } from '@/lib/utils'
import type { StepProps } from './types'

export const NO_CONTENT_SPECIFIC_RULES: VariantRuleContentAvailability = {
  optionalClassFeatures: false,
  anyRaceSubclasses: false,
  preferNewerPrintings: false,
}

export function WizardVariantOptions({
  data,
  onChange,
  keys,
  contentAvailability = NO_CONTENT_SPECIFIC_RULES,
}: StepProps & {
  keys: readonly (keyof StepProps['data']['variantRules'])[]
  contentAvailability?: VariantRuleContentAvailability
}) {
  const optionalClassFeaturesId = useId(),
    averageHitPointsId = useId(),
    anyRaceSubclassesId = useId(),
    preferNewerPrintingsId = useId()
  const preferNewerPrintingsEnabled =
    data.originSystem === '2024' || (data.variantRules?.preferNewerPrintings ?? false)
  const VARIANT_RULE_DESCRIPTIONS: Record<string, string> = {
    optionalClassFeatures:
      'Allow individual optional class features. Choose which features to use on the Class page after creation.',
    averageHitPoints:
      'Choose whether later levels use the fixed average automatically or ask you to roll or enter the hit-die result.',
    anyRaceSubclasses:
      'Allow any character to choose a subclass even when its source limits that subclass to a particular race.',

    preferNewerPrintings:
      'When enabled, older printings are hidden when a newer reprint exists in your selected sources. This reduces duplicate races, classes, feats, and spells.',
  }

  const CONTENT_REQUIREMENTS: Record<keyof VariantRuleContentAvailability, string> = {
    optionalClassFeatures:
      'No optional or replacement class features are available from your selected content.',
    anyRaceSubclasses: 'No race-restricted subclasses are available from your selected content.',
    preferNewerPrintings: 'No alternate printings are available from your selected content.',
  }

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {[
          {
            id: optionalClassFeaturesId,
            key: 'optionalClassFeatures' as const,
            label: 'Allow Optional Class Features',
            available: contentAvailability.optionalClassFeatures,
          },
          {
            id: anyRaceSubclassesId,
            key: 'anyRaceSubclasses' as const,
            label: 'Any-Race Subclasses',
            available: contentAvailability.anyRaceSubclasses,
          },
          {
            id: averageHitPointsId,
            key: 'averageHitPoints' as const,
            label: 'Average Hit Points',
            available: true,
          },
          {
            id: preferNewerPrintingsId,
            key: 'preferNewerPrintings' as const,
            label: 'Prefer Newer Printings',
            available: data.originSystem === '2024' || contentAvailability.preferNewerPrintings,
          },
        ]
          .filter((option) => keys.includes(option.key))
          .map(({ id, key, label, available }) => {
            const lockedByRuleset = key === 'preferNewerPrintings' && data.originSystem === '2024'
            const checked =
              key === 'preferNewerPrintings'
                ? preferNewerPrintingsEnabled
                : data.variantRules?.[key] || false
            const contentRequirement =
              key in contentAvailability
                ? CONTENT_REQUIREMENTS[key as keyof VariantRuleContentAvailability]
                : undefined
            const unavailable = !available && Boolean(contentRequirement)
            const unavailableText = lockedByRuleset
              ? 'Revised replacements are always preferred for 2024 characters.'
              : checked
                ? `Currently inactive. ${contentRequirement}`
                : contentRequirement

            return (
              <div
                key={key}
                className="flex items-center justify-between py-1.5 break-inside-avoid gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <Label
                      htmlFor={id}
                      className={cn(
                        'text-sm cursor-pointer',
                        unavailable && !checked && 'cursor-not-allowed text-muted-foreground',
                      )}
                    >
                      {label}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                          aria-label={`Info: ${label}`}
                        >
                          <Question className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px] text-wrap">
                        <p>{VARIANT_RULE_DESCRIPTIONS[key]}</p>
                        {(unavailable || lockedByRuleset) && (
                          <p className="mt-1">{unavailableText}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {(unavailable || lockedByRuleset) && (
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      {lockedByRuleset
                        ? 'Always on for 2024 characters'
                        : checked
                          ? 'Currently inactive'
                          : 'Unavailable with selected content'}
                    </p>
                  )}
                </div>
                <Switch
                  id={id}
                  checked={checked}
                  disabled={lockedByRuleset || (unavailable && !checked)}
                  onCheckedChange={(checked) =>
                    onChange({
                      variantRules: { ...data.variantRules, [key]: checked },
                    })
                  }
                />
              </div>
            )
          })}
      </div>
    </TooltipProvider>
  )
}
