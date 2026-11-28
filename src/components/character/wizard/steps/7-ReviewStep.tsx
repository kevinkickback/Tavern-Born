import { BookOpen, Eye, Sparkle } from '@phosphor-icons/react'
import { PortraitCardPreview } from '@/components/character/PortraitCardPreview'
import { Badge } from '@/components/ui/badge'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type BackgroundAbilityData,
  formatModifier,
} from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_ABSOLUTE_MAX, getAbilityModifier } from '@/lib/calculations/gameRules'
import { getOriginSystemLabel } from '@/lib/calculations/originSystem'
import { getRaceDisplayName } from '@/lib/calculations/raceDisplay'
import {
  getRaceSizeOptions,
  getSpeedDisplay,
  mergeRaceWithSubrace,
  RACE_SIZE_LABELS,
} from '@/lib/calculations/raceUtils'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import { projectDraftAbilityBonuses } from '../projectDraftAbilityBonuses'
import type { CharacterWizardData } from '../types'

interface ReviewStepProps {
  data: CharacterWizardData
  raceResolution: ResolvedRaceReference
  sources: SourceBook[]
  backgroundAbilityData?: BackgroundAbilityData
  variantRuleAvailability?: VariantRuleContentAvailability
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span
        className={cn(
          'min-w-0 text-sm font-semibold text-right wrap-anywhere',
          !value && 'text-muted-foreground italic font-normal',
        )}
      >
        {value || 'Not set'}
      </span>
    </div>
  )
}

export function ReviewStep({
  data,
  raceResolution,
  sources,
  backgroundAbilityData,
  variantRuleAvailability,
}: ReviewStepProps) {
  const { abilityBonuses, raceSelection } = projectDraftAbilityBonuses(
    data,
    raceResolution,
    backgroundAbilityData,
  )
  const displayRace =
    raceSelection.race && raceSelection.subrace
      ? mergeRaceWithSubrace(raceSelection.race, raceSelection.subrace)
      : raceSelection.race

  const sourceLabelByAbbreviation = new Map(
    sources.map((source) => [source.abbreviation, source.name]),
  )
  const allowedSources = data.allowedSources
  const hasRestrictedSources = allowedSources.length > 0

  const hasDarkvision = displayRace?.darkvision !== undefined && displayRace.darkvision > 0

  const speedValue = getSpeedDisplay(displayRace)
  const sizeOptions = getRaceSizeOptions(displayRace)
  const sizeValue =
    data.raceSize && sizeOptions.includes(data.raceSize)
      ? RACE_SIZE_LABELS[data.raceSize]
      : sizeOptions.length > 1
        ? 'Not selected'
        : (sizeOptions[0] && RACE_SIZE_LABELS[sizeOptions[0]]) ||
          displayRace?.size?.[0] ||
          'Not specified'

  const variantRuleRows = [
    {
      label: 'Allow Optional Class Features',
      enabled: data.variantRules.optionalClassFeatures,
      available: variantRuleAvailability?.optionalClassFeatures ?? true,
    },
    {
      label: 'Any-Race Subclasses',
      enabled: data.variantRules.anyRaceSubclasses,
      available: variantRuleAvailability?.anyRaceSubclasses ?? true,
    },
    {
      label: 'Average Hit Points',
      enabled: data.variantRules.averageHitPoints,
      available: true,
    },
    {
      label: 'Prefer Newer Printings',
      enabled: data.originSystem === '2024' || data.variantRules.preferNewerPrintings,
      available:
        data.originSystem === '2024' || (variantRuleAvailability?.preferNewerPrintings ?? true),
    },
  ]

  return (
    <div className="@container shrink-0">
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-12">
        <PortraitCardPreview
          className="@4xl:col-span-4"
          image={data.portrait}
          name={data.name}
          level={1}
          race={data.race}
          classes={data.class ? [{ name: data.class, source: data.classSource, levels: 1 }] : []}
          originSystem={data.originSystem}
          gender={data.gender}
          transform={data.portraitTransform}
        />

        <div className="min-w-0 rounded-lg border border-border bg-card/60 p-3 @4xl:col-span-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
            Character Snapshot
          </div>
          <InfoRow label="Background" value={data.background} />
          <InfoRow label="Ruleset" value={getOriginSystemLabel(data.originSystem)} />
          <InfoRow label="Size" value={sizeValue} />
          <InfoRow label="Speed" value={speedValue} />
          <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/50">
            <span className="text-xs text-muted-foreground">Darkvision</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-semibold',
                hasDarkvision ? 'text-success' : 'text-muted-foreground',
              )}
            >
              {hasDarkvision && <Eye className="h-3.5 w-3.5" />}
              {hasDarkvision ? `${displayRace?.darkvision} ft` : 'None'}
            </span>
          </div>
          <InfoRow
            label="Race"
            value={[getRaceDisplayName(data.race, data.subrace), data.raceSource]
              .filter(Boolean)
              .join(' · ')}
          />
        </div>

        <div className="min-w-0 space-y-2 rounded-lg border border-border bg-muted/20 p-3 @2xl:col-span-2 @4xl:col-span-4">
          <div className="flex items-center gap-2">
            <Sparkle className="h-4 w-4 text-primary" weight="fill" />
            <h4 className="text-sm font-semibold">Variant Rules</h4>
          </div>
          <div className="space-y-1">
            {variantRuleRows.map((row) => {
              const inactive = Boolean(row.enabled) && !row.available
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 last:border-0"
                >
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <Badge
                    variant={row.enabled && !inactive ? 'default' : 'outline'}
                    className={cn(
                      'text-[11px]',
                      row.enabled && !inactive && 'bg-accent text-accent-foreground',
                    )}
                  >
                    {inactive ? 'Inactive' : row.enabled ? 'On' : 'Off'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-2 rounded-lg border border-border bg-muted/20 p-3 @4xl:col-span-7">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkle className="h-4 w-4 text-primary" weight="fill" />
              <h4 className="text-sm font-semibold">Ability Scores</h4>
            </div>
            <Badge variant="secondary" className="font-mono">
              Method: {data.abilityScoreMethod.replace(/-/g, ' ')}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 @4xl:grid-cols-6">
            {ABILITY_NAMES.map((ability) => {
              const base = data.abilityScores[ability]
              const bonus = abilityBonuses[ability] ?? 0
              const total = Math.min(base + bonus, ABILITY_SCORE_ABSOLUTE_MAX)
              const mod = getAbilityModifier(total)
              return (
                <div
                  key={ability}
                  className="border rounded-lg bg-card/60 border-border flex flex-col items-center justify-center gap-0.5 p-2"
                >
                  <div className="text-xs font-semibold text-primary uppercase">
                    {ABILITY_ABBREVIATIONS[ability]}
                  </div>
                  <div className="text-2xl font-bold font-mono leading-none">{total}</div>
                  {bonus !== 0 && (
                    <div className="text-center text-xs font-semibold leading-none text-success-foreground">
                      {base}+{bonus}
                      {base + bonus > total && ' (capped)'}
                    </div>
                  )}
                  <div
                    className={cn(
                      'text-sm font-semibold',
                      mod >= 0 ? 'text-success-foreground' : 'text-destructive',
                    )}
                  >
                    {formatModifier(mod)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-2 rounded-lg border border-border bg-muted/20 p-3 @4xl:col-span-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" weight="fill" />
            <h4 className="text-sm font-semibold">Additional Content</h4>
            {hasRestrictedSources && (
              <Badge variant="secondary" className="font-mono">
                {allowedSources.length}
              </Badge>
            )}
          </div>

          {hasRestrictedSources ? (
            <div className="flex flex-wrap gap-2">
              {allowedSources.map((abbr) => {
                const sourceName = sourceLabelByAbbreviation.get(abbr)
                return (
                  <div
                    key={abbr}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1"
                  >
                    <span className="text-xs font-semibold font-mono">{abbr}</span>
                    {sourceName && (
                      <span className="text-xs text-muted-foreground">{sourceName}</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
              No additional sourcebooks selected. Core rules for this edition are included.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
