import { Warning } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import {
  ABILITY_ABBREVIATIONS,
  ABILITY_NAMES,
  type BackgroundAbilityData,
  buildBackgroundBonuses,
  buildRacialBonuses,
  formatModifier,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_ABSOLUTE_MAX, getAbilityModifier } from '@/lib/calculations/gameRules'
import {
  getOriginSystemLabel,
  normalizeRaceSelectionForOriginSystem,
  usesRaceOriginBenefits,
} from '@/lib/calculations/originSystem'
import { getRaceDisplayName } from '@/lib/calculations/raceDisplay'
import { getSpeedDisplay, mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import type { VariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { cn } from '@/lib/utils'
import type { SourceBook } from '@/types/5etools'
import type { CharacterWizardData, WizardStepId } from '../types'

interface ReviewStepProps {
  data: CharacterWizardData
  raceResolution: ResolvedRaceReference
  sources: SourceBook[]
  backgroundAbilityData?: BackgroundAbilityData
  variantRuleAvailability?: VariantRuleContentAvailability
  onEditStep?: (step: WizardStepId) => void
}

function EditButton({ label, onEdit }: { label: string; onEdit?: () => void }) {
  return (
    onEdit && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Edit ${label.toLowerCase()}`}
        onClick={onEdit}
      >
        Edit
      </Button>
    )
  )
}

function ReviewRow({
  label,
  children,
  onEdit,
}: {
  label: string
  children: ReactNode
  onEdit?: () => void
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 py-1.5">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 break-words text-sm font-semibold">{children}</div>
      <EditButton label={label} onEdit={onEdit} />
    </div>
  )
}

export function ReviewStep({
  data,
  raceResolution,
  sources,
  backgroundAbilityData,
  variantRuleAvailability,
  onEditStep,
}: ReviewStepProps) {
  const showRaceOriginBonuses = usesRaceOriginBenefits(
    (data.originSystem || '2014') as '2014' | '2024',
  )

  const missingFields: string[] = []
  if (!data.name) missingFields.push('Name')
  if (!data.race) missingFields.push('Race')
  if (!data.class) missingFields.push('Class')
  if (!data.background) missingFields.push('Background')

  const raceObj = raceResolution.parentRace
  const subraceObj = raceResolution.subraceData
  const normalizedSelection = normalizeRaceSelectionForOriginSystem(
    raceObj,
    subraceObj,
    (data.originSystem || '2014') as '2014' | '2024',
  )
  const displayRace =
    normalizedSelection.race && normalizedSelection.subrace
      ? mergeRaceWithSubrace(normalizedSelection.race, normalizedSelection.subrace)
      : normalizedSelection.race

  const abilityBonuses = showRaceOriginBonuses
    ? buildRacialBonuses(
        getRaceAbilityData(
          normalizedSelection.race,
          normalizedSelection.subrace,
          data.raceAsiBlockIndex ?? 0,
        ),
        data.raceAsiChoices ?? [],
      )
    : backgroundAbilityData && data.backgroundAsi
      ? buildBackgroundBonuses(
          backgroundAbilityData,
          data.backgroundAsi.blockIndex,
          data.backgroundAsi.choices,
        )
      : {}

  const sourceLabelByAbbreviation = new Map(
    sources.map((source) => [source.abbreviation, source.name]),
  )
  const allowedSources = data.allowedSources ?? []
  const hasRestrictedSources = allowedSources.length > 0
  const allowedSourceDisplay = hasRestrictedSources
    ? allowedSources.map(
        (abbreviation) =>
          `${abbreviation}${sourceLabelByAbbreviation.has(abbreviation) ? ` - ${sourceLabelByAbbreviation.get(abbreviation)}` : ''}`,
      )
    : []

  const darkvision = displayRace?.darkvision

  const speedValue = getSpeedDisplay(displayRace)
  const sizeValue = displayRace?.size?.join(', ') || 'Not specified'

  const variantRuleRows = [
    {
      label: 'Allow Optional Class Features',
      enabled: data.variantRules?.optionalClassFeatures,
      available: variantRuleAvailability?.optionalClassFeatures ?? true,
    },
    {
      label: 'Any-Race Subclasses',
      enabled: data.variantRules?.anyRaceSubclasses,
      available: variantRuleAvailability?.anyRaceSubclasses ?? true,
    },
    {
      label: 'Average Hit Points',
      enabled: data.variantRules?.averageHitPoints,
      available: true,
    },
    {
      label: 'Prefer Newer Printings',
      enabled: data.originSystem === '2024' || data.variantRules?.preferNewerPrintings,
      available:
        data.originSystem === '2024' || (variantRuleAvailability?.preferNewerPrintings ?? true),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {missingFields.length > 0 && (
        <Alert variant="destructive" className="shrink-0 py-2">
          <Warning className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Missing: {missingFields.join(', ')}. You can configure these after creation.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid overflow-hidden rounded-lg border border-border bg-workspace-canvas md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col justify-center p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Character snapshot
          </p>
          <h3 className="mt-2 break-words text-2xl font-semibold">
            {data.name || 'Unnamed character'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Level 1{data.playerName && ` · Player: ${data.playerName}`}
          </p>
          <div className="mt-2 self-start">
            <EditButton label="Identity" onEdit={onEditStep && (() => onEditStep('basics'))} />
          </div>
        </div>
        <div className="min-w-0 divide-y divide-border border-t border-border bg-workspace-pane px-4 py-2 md:border-t-0 md:border-l">
          <ReviewRow label="Race" onEdit={onEditStep && (() => onEditStep('race'))}>
            <p>{getRaceDisplayName(data.race, data.subrace) || 'Not set'}</p>
            <p className="text-xs font-normal text-muted-foreground">
              {[
                data.raceSource,
                sizeValue,
                speedValue,
                darkvision ? `Darkvision ${darkvision} ft` : 'No darkvision',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </ReviewRow>
          <ReviewRow label="Class" onEdit={onEditStep && (() => onEditStep('class'))}>
            {data.class || 'Not set'}
          </ReviewRow>
          <ReviewRow label="Background" onEdit={onEditStep && (() => onEditStep('background'))}>
            {data.background || 'Not set'}
          </ReviewRow>
          <ReviewRow label="Ruleset">
            {data.originSystem ? getOriginSystemLabel(data.originSystem) : 'Not set'}
          </ReviewRow>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-lg border border-border bg-workspace-canvas p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Ability Scores</h3>
              <Badge variant="secondary" className="capitalize">
                {data.abilityScoreMethod?.replace(/-/g, ' ') || 'Not set'}
              </Badge>
            </div>
            <EditButton
              label="Ability scores"
              onEdit={onEditStep && (() => onEditStep('abilities'))}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
            {ABILITY_NAMES.map((ability) => {
              const base = data.abilityScores?.[ability] ?? 8
              const bonus = abilityBonuses[ability] ?? 0
              const total = Math.min(base + bonus, ABILITY_SCORE_ABSOLUTE_MAX)
              const mod = getAbilityModifier(total)
              return (
                <div
                  key={ability}
                  className="rounded-md border border-border bg-workspace-pane p-2 text-center tabular-nums"
                >
                  <div className="text-xs font-semibold text-muted-foreground">
                    {ABILITY_ABBREVIATIONS[ability]}
                  </div>
                  <div className="font-mono text-xl font-bold">{total}</div>
                  <div
                    className={cn(
                      'text-xs font-semibold',
                      mod >= 0 ? 'text-success-foreground' : 'text-destructive',
                    )}
                  >
                    {formatModifier(mod)}
                  </div>
                  {bonus !== 0 && (
                    <div className="text-xs text-muted-foreground">
                      {base}+{bonus}
                      {base + bonus > total && ' (capped)'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
        <section className="min-w-0 rounded-lg border border-border bg-workspace-canvas p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Variant Rules</h3>
            <EditButton label="Rules" onEdit={onEditStep && (() => onEditStep('rules'))} />
          </div>
          <div className="divide-y divide-border">
            {variantRuleRows.map(({ label, enabled, available }) => (
              <div key={label} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span>{label}</span>
                <Badge variant={enabled && available ? 'secondary' : 'outline'}>
                  {enabled ? (available ? 'On' : 'Inactive') : 'Off'}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="rounded-lg border border-border bg-workspace-canvas p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Sourcebooks</h3>
          <EditButton label="Sourcebooks" onEdit={onEditStep && (() => onEditStep('content'))} />
        </div>
        {hasRestrictedSources ? (
          <div className="flex flex-wrap gap-1.5">
            {allowedSourceDisplay.map((source) => (
              <Badge key={source} variant="outline" className="whitespace-normal">
                {source}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No additional sourcebooks selected. Core rules for this edition are included.
          </p>
        )}
      </section>
    </div>
  )
}
