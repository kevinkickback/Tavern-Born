import { WarningCircle } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import {
  type ClassChoiceDiagnostic,
  getRequiredChoiceSelectionCount,
  type NormalizedCharacterChoice,
} from '@/lib/5etools/classChoiceNormalization'
import type { ClassChoiceOptionView } from '@/lib/character/classChoiceOptions'
import type { CharacterClassChoiceSelection } from '@/types/character'
import type { SelectedFeatureState } from './DetailsPanel'
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
}: ClassChoicesSectionProps) {
  const completed = choices.filter((choice) => {
    const required = getRequiredChoiceSelectionCount(choice, classLevel)
    return (selectionByChoiceId.get(choice.id)?.selected.length ?? 0) >= required
  }).length

  return (
    <div className="space-y-2 px-1 pb-2 pt-1">
      {choices.map((choice) => {
        const required = getRequiredChoiceSelectionCount(choice, classLevel)
        const selected = selectionByChoiceId.get(choice.id)?.selected ?? []
        const views = selectedViewsByChoiceId.get(choice.id) ?? []
        return (
          <BuildClassProgressionChoiceCard
            key={choice.id}
            id={choice.id}
            label={choice.label}
            selectedCount={selected.length}
            totalAllowed={required}
            isFull={selected.length >= required}
            chosenItems={views.map((view) => ({
              name: view.reference.name,
              source: view.reference.source,
              entries: view.entries,
            }))}
            detailCollapsed={detailCollapsed}
            onChoose={() => onChoose(choice)}
            onSelectFeature={onSelectFeature}
            onExpandDetails={onExpandDetails}
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
                <span>{diagnostic.featureName}</span>
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

      {choices.length > 0 && (
        <p className="px-1 text-xs text-muted-foreground">
          {completed} of {choices.length} required {choices.length === 1 ? 'choice' : 'choices'}
          complete
        </p>
      )}
    </div>
  )
}
