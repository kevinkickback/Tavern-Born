import { Warning } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
    <div className="flex min-h-[3.25rem] items-center justify-between gap-3 border-b border-border py-1.5">
      <div className="min-w-0 space-y-0.5">
        <h3 className="text-sm font-semibold leading-tight">{label}</h3>
        <div className="break-words text-xs leading-relaxed text-muted-foreground">{children}</div>
      </div>
      {onEdit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={onEdit}
        >
          Edit
        </Button>
      )}
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

      <div className="border-t border-border">
        <ReviewRow label="Identity" onEdit={onEditStep && (() => onEditStep('basics'))}>
          <span className="font-medium text-foreground">{data.name || 'Unnamed character'}</span>
          {' · Level 1'}
          {data.playerName && ` · Player: ${data.playerName}`}
        </ReviewRow>
        <ReviewRow label="Rules" onEdit={onEditStep && (() => onEditStep('rules'))}>
          <p>{data.originSystem ? getOriginSystemLabel(data.originSystem) : 'Not set'}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {variantRuleRows.map(({ label, enabled, available }) => (
              <span key={label}>
                <span>{label}</span>{' '}
                <strong>{enabled ? (available ? 'On' : 'Inactive') : 'Off'}</strong>
              </span>
            ))}
          </div>
        </ReviewRow>
        <ReviewRow label="Sourcebooks" onEdit={onEditStep && (() => onEditStep('content'))}>
          {hasRestrictedSources
            ? allowedSourceDisplay.join(' · ')
            : 'No content filter selected. All loaded content is currently available.'}
        </ReviewRow>
        <ReviewRow label="Race" onEdit={onEditStep && (() => onEditStep('race'))}>
          <p>{getRaceDisplayName(data.race, data.subrace) || 'Not set'}</p>
          <p className="text-xs">
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
        <ReviewRow label="Ability Scores" onEdit={onEditStep && (() => onEditStep('abilities'))}>
          <p className="capitalize">{data.abilityScoreMethod?.replace(/-/g, ' ') || 'Not set'}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {ABILITY_NAMES.map((ability) => {
              const base = data.abilityScores?.[ability] ?? 8
              const bonus = abilityBonuses[ability] ?? 0
              const total = Math.min(base + bonus, ABILITY_SCORE_ABSOLUTE_MAX)
              return (
                <div
                  key={ability}
                  className="flex flex-wrap items-baseline gap-x-1 text-xs tabular-nums"
                >
                  <span className="font-semibold text-foreground">
                    {ABILITY_ABBREVIATIONS[ability]} {total}
                  </span>
                  <span>({formatModifier(getAbilityModifier(total))})</span>
                  {bonus !== 0 && (
                    <span className="text-success-foreground">
                      {base}+{bonus}
                      {base + bonus > total && ' (capped)'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </ReviewRow>
      </div>
    </div>
  )
}
