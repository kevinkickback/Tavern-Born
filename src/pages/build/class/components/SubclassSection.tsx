import { CaretRight, Check, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import {
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
} from '@/lib/character/classChoiceOptions'
import { cn } from '@/lib/utils'
import {
  type ClassDetailsSelection,
  createSubclassDetailsSelection,
} from '@/pages/build/class/model/pageUtils'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'
import { BuildClassChosenItemBadge } from './ProgressionChoiceCard'

interface BuildClassSubclassSectionProps {
  level: number
  subclassFeatureName: string | null
  featuresByLevel: Map<number, ClassFeatureDisplay[]>
  viewingClassData?: Class5e
  viewingSubclass?: string
  viewingSubclassData?: Subclass5e
  selectedFeature: SelectedFeatureState | null
  detailCollapsed: boolean
  onSelectFeature: (feature: ClassDetailsSelection) => void
  onExpandDetails: () => void
  onOpenSubclassPicker: () => void
  hasUnavailableConfiguration: boolean
  configurations: NormalizedCharacterChoice[]
  separateConfigurationIds?: ReadonlySet<string>
  classLevel: number
  selectedViewsByChoiceId: ReadonlyMap<string, ClassChoiceOptionView[]>
  onConfigure: (choice: NormalizedCharacterChoice) => void
  highlighted?: boolean
}

export function BuildClassSubclassSection({
  level,
  subclassFeatureName,
  featuresByLevel,
  viewingClassData,
  viewingSubclass,
  viewingSubclassData,
  selectedFeature,
  detailCollapsed,
  onSelectFeature,
  onExpandDetails,
  onOpenSubclassPicker,
  configurations,
  separateConfigurationIds = new Set(),
  hasUnavailableConfiguration,
  classLevel,
  selectedViewsByChoiceId,
  onConfigure,
  highlighted = false,
}: BuildClassSubclassSectionProps) {
  const inlineConfigurations = configurations.filter(
    (choice) => !separateConfigurationIds.has(choice.id),
  )
  const { ref: routeFocusRef, highlighted: routeFocusHighlighted } =
    useRouteFocusTarget<HTMLFieldSetElement>(highlighted)
  const subclassFeature = subclassFeatureName
    ? (featuresByLevel.get(level) ?? []).find((feature) => feature.name === subclassFeatureName)
    : undefined

  const title = (viewingClassData as { subclassTitle?: string })?.subclassTitle ?? 'Subclass'
  const showSubclassDetails = () => {
    if (viewingClassData && viewingSubclassData) {
      onSelectFeature(createSubclassDetailsSelection(viewingClassData, viewingSubclassData))
    }
  }

  const complete =
    !!viewingSubclass &&
    !!viewingSubclassData &&
    !hasUnavailableConfiguration &&
    configurations.every(
      (choice) =>
        (selectedViewsByChoiceId.get(choice.id) ?? []).filter(isClassChoiceOptionEligible).length >=
        getRequiredChoiceSelectionCount(choice, classLevel),
    )
  return (
    <fieldset
      aria-label={title}
      ref={routeFocusRef}
      className={cn(
        'rounded-lg border overflow-hidden',
        complete ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5',
        routeFocusHighlighted && 'animate-route-focus',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 min-w-0 text-left transition-colors hover:text-accent group',
            subclassFeature && selectedFeature?.name === subclassFeature.name && 'text-accent',
          )}
          onClick={() => {
            if (!subclassFeature) return
            onSelectFeature({
              name: subclassFeature.name,
              source: subclassFeature.source,
              entries: resolveSubclassFeatureRefs(
                subclassFeature.entries ?? [],
                viewingSubclassData?.shortName,
              ),
            })
            if (detailCollapsed) onExpandDetails()
          }}
        >
          <Star className="h-4 w-4 text-accent flex-shrink-0" weight="duotone" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {title}
              {complete && <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />}
            </div>
            {!viewingSubclass && <div className="text-xs text-muted-foreground">None selected</div>}
          </div>
          {subclassFeature && (subclassFeature.entries ?? []).length > 0 && (
            <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
          )}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          {inlineConfigurations.map((choice) => (
            <Button
              key={choice.id}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onConfigure(choice)}
            >
              {(selectedViewsByChoiceId.get(choice.id)?.length ?? 0) > 0 ? 'Edit' : 'Choose'}{' '}
              {choice.label}
            </Button>
          ))}
          <Button
            variant={viewingSubclass ? 'outline' : 'default'}
            size="sm"
            className="flex-shrink-0 ml-2 h-7 text-xs"
            onClick={onOpenSubclassPicker}
          >
            {viewingSubclass ? 'Change' : 'Choose'}
          </Button>
        </div>
      </div>
      {viewingSubclass && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
          <button
            type="button"
            onMouseEnter={() => {
              showSubclassDetails()
              if (detailCollapsed) onExpandDetails()
            }}
            onClick={showSubclassDetails}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
          >
            <span className="font-medium">{viewingSubclass}</span>
          </button>
          {inlineConfigurations.flatMap((choice) =>
            (selectedViewsByChoiceId.get(choice.id) ?? []).map((view) => (
              <BuildClassChosenItemBadge
                key={`${choice.id}|${getClassChoiceOptionKey(view.reference)}`}
                item={{
                  name: view.reference.name,
                  source: view.reference.source,
                  entries: view.entries,
                  masteries: view.masteries,
                  unavailable: !isClassChoiceOptionEligible(view),
                }}
                detailCollapsed={detailCollapsed}
                onSelectFeature={onSelectFeature}
                onExpandDetails={onExpandDetails}
              />
            )),
          )}
        </div>
      )}
    </fieldset>
  )
}
