import { BookOpen, Question, Sparkle, Warning } from '@phosphor-icons/react'
import { useId } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getAbilityScoreMethodOptions } from '@/lib/calculations/abilityScoreMethods'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import {
  getSourceCompatibility,
  normalizeAllowedSources,
  normalizeSelectableAllowedSources,
} from '@/lib/sourceCompatibility'
import { IMPLICIT_SOURCES, SOURCE_PRESETS, type SourcePreset } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { StepProps } from '../types'

interface RulesStepProps extends StepProps {
  sources?: SourceBook[]
  contentAvailability?: VariantRuleContentAvailability
  isBundledSrd?: boolean
}

const NO_CONTENT_SPECIFIC_RULES: VariantRuleContentAvailability = {
  optionalClassFeatures: false,
  bladesingerAnyRace: false,
  battleragerAnyRace: false,
  preferNewerPrintings: false,
}

export function RulesStep({
  data,
  onChange,
  sources = [],
  contentAvailability = NO_CONTENT_SPECIFIC_RULES,
  isBundledSrd = false,
  invalidFields,
}: RulesStepProps) {
  const optionalClassFeaturesId = useId()
  const averageHitPointsId = useId()
  const bladesingerAnyRaceId = useId()
  const battleragerAnyRaceId = useId()

  const preferNewerPrintingsId = useId()
  const selectableSources = sources.filter((source) => source.hasCharacterOptions !== false)
  const configuredSources = data.allowedSources || []
  const allowedSources = data.originSystem
    ? normalizeSelectableAllowedSources(configuredSources, data.originSystem, sources)
    : configuredSources
  const availableSourceSet = new Set(selectableSources.map((source) => source.abbreviation))

  const sourcesByGroup = selectableSources.reduce<Record<string, SourceBook[]>>((acc, source) => {
    if (!acc[source.group]) {
      acc[source.group] = []
    }
    acc[source.group].push(source)
    return acc
  }, {})

  const groupLabels: Record<string, string> = {
    core: 'Core Rulebooks',
    supplement: 'Supplements',
    setting: 'Setting Books',
    adventure: 'Adventure Books',
    playtest: 'Playtest & Unofficial',
    other: 'Other Sources',
  }

  const groupOrder = ['core', 'supplement', 'setting', 'adventure', 'playtest', 'other']

  const toggleSource = (sourceAbbr: string) => {
    const source =
      selectableSources.find((candidate) => candidate.abbreviation === sourceAbbr) ?? sourceAbbr
    if (data.originSystem && !getSourceCompatibility(source, data.originSystem).compatible) return
    const currentSources = allowedSources
    const nextSources = currentSources.includes(sourceAbbr)
      ? currentSources.filter((source) => source !== sourceAbbr)
      : [...currentSources, sourceAbbr]
    const normalizedSources = data.originSystem
      ? normalizeAllowedSources(nextSources, data.originSystem, sources)
      : nextSources
    onChange({ allowedSources: normalizedSources })
  }

  const applySourcePreset = (preset: SourcePreset) => {
    const presetSources = preset.abbreviations.filter((abbreviation) =>
      availableSourceSet.has(abbreviation),
    )
    onChange({
      allowedSources: data.originSystem
        ? normalizeAllowedSources(presetSources, data.originSystem, sources)
        : presetSources,
    })
  }

  const selectNoneSources = () => {
    onChange({ allowedSources: [] })
  }

  const isPresetActive = (preset: SourcePreset) => {
    const availablePresetSources = preset.abbreviations.filter((abbreviation) =>
      availableSourceSet.has(abbreviation),
    )
    const presetSources = data.originSystem
      ? normalizeSelectableAllowedSources(availablePresetSources, data.originSystem, sources)
      : availablePresetSources
    if (presetSources.length !== allowedSources.length) {
      return false
    }
    return presetSources.every((abbreviation) => allowedSources.includes(abbreviation))
  }

  const presetSourceAbbreviations = new Set(
    SOURCE_PRESETS.flatMap((preset) => preset.abbreviations),
  )
  const hasNonPresetSourcesSelected = allowedSources.some(
    (abbreviation) => !presetSourceAbbreviations.has(abbreviation),
  )
  const preferNewerPrintingsEnabled =
    data.originSystem === '2024' || (data.variantRules?.preferNewerPrintings ?? false)

  const abilityScoreMethods = getAbilityScoreMethodOptions(
    data.originSystem === '2024' ? '2024' : '2014',
  )
  const VARIANT_RULE_DESCRIPTIONS: Record<string, string> = {
    optionalClassFeatures:
      "Unlocks Tasha's optional class features for your class, such as additional spells, feature replacements, and expanded options from TCE.",
    averageHitPoints:
      'Choose whether later levels use the fixed average automatically or ask you to roll or enter the hit-die result.',
    bladesingerAnyRace:
      'By default Bladesinger (Wizard) is restricted to elves. Enable this to allow any race to take the Bladesinger subclass.',
    battleragerAnyRace:
      'By default Battlerager (Barbarian) is restricted to dwarves. Enable this to allow any race to take the Battlerager subclass.',

    preferNewerPrintings:
      'When enabled, older printings are hidden when a newer reprint exists in your selected sources. This reduces duplicate races, classes, feats, and spells.',
  }

  const CONTENT_REQUIREMENTS: Record<keyof VariantRuleContentAvailability, string> = {
    optionalClassFeatures:
      'No optional or replacement class features are available from your selected content.',
    bladesingerAnyRace: 'The Bladesinger subclass is not available from your selected content.',
    battleragerAnyRace: 'The Battlerager subclass is not available from your selected content.',
    preferNewerPrintings: 'No alternate printings are available from your selected content.',
  }

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-workspace-pane">
        <section className="shrink-0 space-y-3 border-b border-border p-4">
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

        <div className="grid shrink-0 w-full border-b border-border md:grid-cols-2">
          <section className="space-y-3 p-4 md:border-r md:border-border">
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

          <section className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Sparkle className="h-4 w-4 text-primary" weight="fill" />
              <h3 className="text-sm font-semibold">Variant Rules</h3>
            </div>

            <div className="columns-2 gap-x-6">
              {(
                [
                  {
                    id: optionalClassFeaturesId,
                    key: 'optionalClassFeatures' as const,
                    label: 'Optional Class Features',
                    available: contentAvailability.optionalClassFeatures,
                  },
                  {
                    id: bladesingerAnyRaceId,
                    key: 'bladesingerAnyRace' as const,
                    label: 'Bladesinger Any Race',
                    available: contentAvailability.bladesingerAnyRace,
                  },
                  {
                    id: battleragerAnyRaceId,
                    key: 'battleragerAnyRace' as const,
                    label: 'Battlerager Any Race',
                    available: contentAvailability.battleragerAnyRace,
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
                    available:
                      data.originSystem === '2024' || contentAvailability.preferNewerPrintings,
                  },
                ] as const
              ).map(({ id, key, label, available }) => {
                const lockedByRuleset =
                  key === 'preferNewerPrintings' && data.originSystem === '2024'
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
          </section>
        </div>

        <section className="flex min-h-0 flex-1 flex-col p-4">
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" weight="fill" />
              <h4 className="font-semibold text-lg">Additional Content</h4>
              {!isBundledSrd && allowedSources.length > 0 && (
                <span
                  data-allowed-sources-count
                  className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold px-2 py-0.5 min-w-[1.5rem]"
                >
                  {allowedSources.length}
                </span>
              )}
            </div>
            {!isBundledSrd && (
              <div className="flex items-center gap-2 text-sm flex-wrap justify-end">
                {[
                  ...SOURCE_PRESETS.map((preset) => ({
                    key: preset.id,
                    label: preset.label,
                    title: preset.description,
                    onClick: () => applySourcePreset(preset),
                    active: isPresetActive(preset),
                  })),
                  {
                    key: 'none',
                    label: 'None',
                    title: 'Clear all selected content',
                    onClick: selectNoneSources,
                    active: false,
                  },
                ].map((action, index, allActions) => (
                  <div key={action.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={action.onClick}
                      className={cn(
                        'font-medium text-primary hover:underline',
                        action.active && 'underline',
                      )}
                      title={action.title}
                    >
                      {action.label}
                    </button>
                    {index < allActions.length - 1 && (
                      <span className="text-muted-foreground">|</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isBundledSrd ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm font-semibold text-foreground">Using the included SRD</p>
              <p className="mx-auto mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
                The included SRD does not provide additional sourcebooks to enable. To add more
                options, open Settings → Game Data and add compatible 5etools data.
              </p>
            </div>
          ) : selectableSources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border border-border rounded-lg">
              No additional content is available. Load game data in Settings first.
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <section
                aria-label="Additional Content"
                className="flex-1 overflow-y-auto pr-1 space-y-4"
              >
                {groupOrder.map((group) => {
                  const groupSources = sourcesByGroup[group]?.filter(
                    (s) => !IMPLICIT_SOURCES.has(s.abbreviation),
                  )
                  if (!groupSources || groupSources.length === 0) return null

                  return (
                    <div key={group} className="space-y-1.5">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {groupLabels[group]}
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        {groupSources.map((source) => {
                          const compatibility = data.originSystem
                            ? getSourceCompatibility(source, data.originSystem)
                            : { compatible: true as const, reason: undefined }
                          return (
                            <button
                              type="button"
                              key={source.abbreviation}
                              onClick={() => toggleSource(source.abbreviation)}
                              disabled={!compatibility.compatible}
                              title={compatibility.reason}
                              className={cn(
                                'px-3 py-2.5 rounded-md border text-left transition-all text-sm flex items-start gap-2',
                                !compatibility.compatible &&
                                  'cursor-not-allowed opacity-50 hover:border-border hover:text-muted-foreground',
                                allowedSources.includes(source.abbreviation)
                                  ? 'border-accent bg-accent/10 text-foreground'
                                  : 'border-border hover:border-accent/50 text-muted-foreground hover:text-foreground',
                              )}
                            >
                              <BookOpen
                                className={cn(
                                  'h-4 w-4 flex-shrink-0 mt-0.5',
                                  allowedSources.includes(source.abbreviation)
                                    ? 'text-primary'
                                    : 'text-muted-foreground',
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold truncate">{source.name}</div>
                                <div className="text-xs font-mono text-muted-foreground">
                                  {source.abbreviation}
                                  {source.year && ` (${source.year})`}
                                </div>
                                {!compatibility.compatible && (
                                  <div className="mt-0.5 text-[11px] text-warning">
                                    {compatibility.reason}
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </section>

              <div aria-live="polite" className="contents">
                {hasNonPresetSourcesSelected && (
                  <div className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                    <Warning className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
                    <span>
                      Non-recommended sources often contain DM-only or outdated content. These may
                      clutter your options with material not intended for players.
                    </span>
                  </div>
                )}

                {data.originSystem === '2024' && (
                  <div className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                    <Warning className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
                    <span>
                      {preferNewerPrintingsEnabled
                        ? 'Revised replacements are always used. Compatible older options remain available when no revised version exists.'
                        : ''}
                    </span>
                  </div>
                )}

                {data.originSystem === '2014' && (
                  <div className="flex flex-shrink-0 items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning-foreground">
                    <Warning className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
                    <span>
                      {preferNewerPrintingsEnabled
                        ? 'Older printings are hidden where a newer version exists in your selected sources. Disable "Prefer Newer Printings" to see all options.'
                        : 'Some races and features appear in multiple printings across your selected sources (e.g., ERLW content updated in MPMM). Enable "Prefer Newer Printings" to automatically hide older versions.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </TooltipProvider>
  )
}
