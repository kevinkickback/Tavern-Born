import { WarningCircle } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import { cn } from '@/lib/utils'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { ClassChoiceDiagnostic, NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'
import { BuildClassProgressionChoiceCard } from './ProgressionChoiceCard'

interface ClassChoicesSectionProps {
  choices: NormalizedCharacterChoice[]
  diagnostics: ClassChoiceDiagnostic[]
  classLevel: number
  selectionByChoiceId: ReadonlyMap<string, CharacterClassChoiceSelection>
  selectedViewsByChoiceId: ReadonlyMap<string, ClassChoiceOptionView[]>
  detailCollapsed: boolean
  onChoose: (choice: NormalizedCharacterChoice) => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
  feature?: ClassFeatureDisplay
  className?: string
  readinessFocus?: string | null
}

export function BuildClassChoicesSection({
  choices,
  diagnostics,
  classLevel,
  selectionByChoiceId,
  selectedViewsByChoiceId,
  detailCollapsed,
  onChoose,
  onSelectFeature,
  onExpandDetails,
  feature,
  className,
  readinessFocus,
}: ClassChoicesSectionProps) {
  const focusDiagnostic = readinessFocus?.startsWith('class-choice-diagnostic:') ?? false
  const { ref: diagnosticRef, highlighted: diagnosticHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(focusDiagnostic)
  return (
    <div
      ref={diagnosticRef}
      className={cn(
        'space-y-2 rounded-lg px-1 pb-2 pt-1',
        diagnosticHighlighted && 'animate-route-focus',
        className,
      )}
    >
      {choices.map((choice) => {
        const required = getRequiredChoiceSelectionCount(choice, classLevel)
        const views = selectedViewsByChoiceId.get(choice.id) ?? []
        const selected = selectionByChoiceId.get(choice.id)?.selected ?? []
        const selectedCount = Math.min(selected.length, views.length)
        return (
          <BuildClassProgressionChoiceCard
            key={choice.id}
            id={choice.id}
            label={choice.label}
            feature={feature}
            selectedCount={selectedCount}
            totalAllowed={required}
            isFull={selectedCount >= required}
            chosenItems={views.map((view) => ({
              name: view.reference.name,
              source: view.reference.source,
              entries: view.entries,
              masteries: view.masteries,
            }))}
            detailCollapsed={detailCollapsed}
            onChoose={() => onChoose(choice)}
            onSelectFeature={onSelectFeature}
            onExpandDetails={onExpandDetails}
            highlighted={readinessFocus === `class-choice:${choice.id}`}
          />
        )
      })}

      {diagnostics.map((diagnostic) => (
        <div
          key={`${diagnostic.featureName}|${diagnostic.level ?? ''}|${diagnostic.code}|${diagnostic.message}`}
          className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <WarningCircle className="mt-0.5 size-4 shrink-0 text-warning" weight="fill" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                {(!feature?.name ||
                  diagnostic.featureName.trim().toLowerCase() !==
                    feature.name.trim().toLowerCase()) && <span>{diagnostic.featureName}</span>}
                <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px]">
                  Needs review
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                This choice is present in the source data, but Tavern Born could not safely
                determine its options or count. No rule was guessed.
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
