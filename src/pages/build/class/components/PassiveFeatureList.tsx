import { CaretRight } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import { cn } from '@/lib/utils'
import type { Subclass5e } from '@/types/5etools'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'

interface BuildClassPassiveFeatureListProps {
  passiveFeatures: ClassFeatureDisplay[]
  selectedFeature: SelectedFeatureState | null
  viewingSubclassData?: Subclass5e
  detailCollapsed: boolean
  onSelectFeature: (feature: SelectedFeatureState) => void
  onExpandDetails: () => void
  renderFeature?: (feature: ClassFeatureDisplay) => ReactNode | undefined
  renderAfterFeature?: (feature: ClassFeatureDisplay) => ReactNode
}

export function BuildClassPassiveFeatureList({
  passiveFeatures,
  selectedFeature,
  viewingSubclassData,
  detailCollapsed,
  onSelectFeature,
  onExpandDetails,
  renderFeature,
  renderAfterFeature,
}: BuildClassPassiveFeatureListProps) {
  return (
    <>
      {passiveFeatures.map((feature) => {
        const replacement = renderFeature?.(feature)
        const selected =
          feature.origin || selectedFeature?.origin
            ? JSON.stringify(feature.origin) === JSON.stringify(selectedFeature?.origin)
            : selectedFeature?.name === feature.name && selectedFeature?.source === feature.source
        return (
          <div
            key={
              feature.origin
                ? JSON.stringify(feature.origin)
                : `${feature.name}|${feature.source ?? ''}`
            }
          >
            {replacement !== undefined ? (
              replacement
            ) : (
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  onSelectFeature({
                    origin: feature.origin,
                    name: feature.name,
                    source: feature.source,
                    entries: resolveSubclassFeatureRefs(
                      feature.entries ?? [],
                      viewingSubclassData?.shortName,
                    ),
                  })
                  if (detailCollapsed) onExpandDetails()
                }}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md hover:bg-accent/10 hover:text-accent transition-colors group flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                  selected && 'bg-accent/10 text-accent',
                )}
              >
                <span className="text-sm font-medium">{feature.name}</span>
                {(feature.entries ?? []).length > 0 && (
                  <CaretRight className="h-3 w-3 text-muted-foreground group-hover:text-accent flex-shrink-0" />
                )}
              </button>
            )}
            {renderAfterFeature?.(feature)}
          </div>
        )
      })}
    </>
  )
}
