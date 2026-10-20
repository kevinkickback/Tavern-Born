import { CaretRight, Check, Sparkle, Warning } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { decodeClassProficiencyChoiceId } from '@/lib/5etools/classProficiencyIdentity'
import { classProficiencyRule, isOwnedExpertiseTarget } from '@/lib/5etools/classProficiencyRules'
import { optionalClassProficiencyRule } from '@/lib/5etools/ownedClassProficiencyRules'
import { getHistoricalProficiencyRule } from '@/lib/character/historicalProficiencyChoices'
import { addReadinessFocus, classChoiceReadinessId } from '@/lib/navigation/readinessFocus'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'

interface ChosenItem {
  origin?: SelectedFeatureState['origin']
  name: string
  source?: string
  entries?: unknown[]
  masteries?: Array<{ name: string; source?: string; entries: unknown[] }>
  unavailable?: boolean
}

interface ProgressionChoiceCardProps {
  id: string
  label?: string
  feature?: ClassFeatureDisplay
  selectedCount: number
  totalAllowed?: number
  recovery?: boolean
  isFull: boolean
  chosenItems: ChosenItem[]
  detailCollapsed: boolean
  onChoose: () => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
  highlighted?: boolean
}

export function BuildClassProgressionChoiceCard({
  id,
  label,
  feature,
  selectedCount,
  totalAllowed,
  recovery = false,
  isFull,
  chosenItems,
  detailCollapsed,
  onChoose,
  onSelectFeature,
  onExpandDetails,
  highlighted = false,
}: ProgressionChoiceCardProps) {
  const { ref: routeFocusRef, highlighted: routeFocusHighlighted } =
    useRouteFocusTarget<HTMLFieldSetElement>(highlighted)
  const proficiencyChoice = decodeClassProficiencyChoiceId(id)
  const optionalSkill =
    proficiencyChoice?.domain === 'skills' &&
    !!optionalClassProficiencyRule(proficiencyChoice.target)
  const saved = useCharacterStore((state) => state.activeCharacter)
  const historical = !!getHistoricalProficiencyRule(id)
  const setup = historical
    ? saved?.classChoiceSelections?.find((row) => row.choiceId === id)?.proficiencyAtGain
    : undefined
  return (
    <fieldset
      aria-label={label ?? feature?.name}
      ref={routeFocusRef}
      className={cn(
        'rounded-lg border overflow-hidden',
        isFull ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5',
        routeFocusHighlighted && 'animate-route-focus',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <button
          type="button"
          disabled={!feature}
          className="group flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
          onClick={() => {
            if (!feature) return
            onSelectFeature({
              origin: feature.origin,
              name: feature.name,
              source: feature.source,
              entries: feature.entries ?? [],
            })
            if (detailCollapsed) onExpandDetails()
          }}
        >
          <Sparkle className="h-4 w-4 text-accent flex-shrink-0" weight="duotone" />
          <div className="min-w-0">
            {label && (
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {label}
                {isFull && <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {!label && isFull && <Check className="h-3.5 w-3.5 shrink-0 text-success" />}
              {recovery
                ? 'Saved choice — source rules unavailable'
                : historical && !setup
                  ? 'Confirm proficiency at acquisition'
                  : historical && setup?.alreadyProficient === false
                    ? 'Proficiency setup confirmed'
                    : `${selectedCount} / ${totalAllowed} chosen`}
            </div>
          </div>
          {feature && (feature.entries ?? []).length > 0 && (
            <CaretRight className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-accent" />
          )}
        </button>
        {optionalSkill ? (
          <Button
            asChild
            variant={selectedCount > 0 ? 'outline' : 'default'}
            size="sm"
            className="flex-shrink-0 ml-2 h-7 text-xs"
          >
            <Link to={addReadinessFocus('/build/proficiencies', classChoiceReadinessId(id))}>
              {recovery ? 'Review saved skill' : selectedCount > 0 ? 'Edit skill' : 'Choose skill'}
            </Link>
          </Button>
        ) : (
          <Button
            variant={selectedCount > 0 ? 'outline' : 'default'}
            size="sm"
            className="flex-shrink-0 ml-2 h-7 text-xs"
            onClick={onChoose}
          >
            {recovery
              ? 'Review saved choice'
              : historical && !setup
                ? 'Confirm setup'
                : historical && setup?.alreadyProficient === false
                  ? 'Edit setup'
                  : selectedCount > 0
                    ? 'Edit'
                    : 'Choose'}
          </Button>
        )}
      </div>

      {!isFull &&
        !recovery &&
        proficiencyChoice?.domain === 'expertise' &&
        isOwnedExpertiseTarget(proficiencyChoice.target) &&
        !classProficiencyRule(proficiencyChoice.target)?.domains.some(
          (domain) => domain.coupled,
        ) && <PendingProficiencyHint />}

      {chosenItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
          {chosenItems.map((item) => (
            <BuildClassChosenItemBadge
              key={`${id}|${item.name}|${item.source ?? ''}`}
              item={item}
              detailCollapsed={detailCollapsed}
              onSelectFeature={onSelectFeature}
              onExpandDetails={onExpandDetails}
            />
          ))}
        </div>
      )}
    </fieldset>
  )
}

function PendingProficiencyHint() {
  const savedCharacter = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(savedCharacter)
  const character = calculation?.character ?? savedCharacter
  const pending = character?.provenance?.choices.some(
    (choice) =>
      ['skills', 'tools', 'languages', 'armor', 'weapons'].includes(choice.domain) &&
      choice.selected.length < choice.chooseCount,
  )
  if (!pending) return null
  return (
    <p className="px-3 pb-3 text-xs text-muted-foreground">
      <Link className="text-primary underline" to="/build/proficiencies">
        You still have proficiency choices to make.
      </Link>
    </p>
  )
}

export function BuildClassChosenItemBadge({
  item,
  detailCollapsed,
  onSelectFeature,
  onExpandDetails,
}: {
  item: ChosenItem
  detailCollapsed: boolean
  onSelectFeature: ProgressionChoiceCardProps['onSelectFeature']
  onExpandDetails: () => void
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => {
        onSelectFeature({
          origin: item.origin,
          name: item.name,
          source: item.source,
          entries: item.entries ?? [],
        })
        if (detailCollapsed) onExpandDetails()
      }}
      onClick={() => {
        onSelectFeature({
          origin: item.origin,
          name: item.name,
          source: item.source,
          entries: item.entries ?? [],
        })
        if (detailCollapsed) onExpandDetails()
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs text-foreground transition-colors',
        item.unavailable
          ? 'border-warning/30 bg-warning/5 hover:border-warning/50 hover:bg-warning/15'
          : 'border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15',
      )}
      data-availability={item.unavailable ? 'unavailable' : 'eligible'}
    >
      {item.unavailable && <Warning className="size-3 text-warning" weight="fill" />}
      <span className="font-medium">{item.name}</span>
      {(item.masteries?.length ?? 0) > 0 && (
        <span className="text-muted-foreground">
          · {item.masteries?.map((mastery) => mastery.name).join(', ')}
        </span>
      )}
      {item.unavailable && <span className="text-warning-foreground">· Unavailable</span>}
    </button>
  )
}
