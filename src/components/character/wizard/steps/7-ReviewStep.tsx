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
import { getSpeedDisplay, mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
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
  const sizeValue = displayRace?.size?.join(', ') || 'Not specified'

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
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-4 md:flex-row">
        <div className="w-full max-w-[420px] shrink-0">
          <PortraitCardPreview
            image={data.portrait}
            name={data.name}
            level={1}
            race={getRaceDisplayName(data.race, data.subrace)}
            characterClass={data.class}
            gender={data.gender}
            transform={data.portraitTransform}
            showActions={false}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="rounded-lg border border-border bg-card/60 p-3 h-full">
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
            <InfoRow label="Race Source" value={data.raceSource} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkle className="h-4 w-4 text-primary" weight="fill" />
              <h4 className="text-sm font-semibold">Ability Scores</h4>
            </div>
            <Badge variant="secondary" className="font-mono">
              Method: {data.abilityScoreMethod.replace(/-/g, ' ')}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 xl:grid-cols-3 gap-2">
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
                    <div className="text-xs font-semibold leading-none text-success-foreground">
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

        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
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
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
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
  )
}
