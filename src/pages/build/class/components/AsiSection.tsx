import { Check, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import { cn } from '@/lib/utils'
import type { Feat5e, Subclass5e } from '@/types/5etools'
import type { AsiChoice, Character } from '@/types/character'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'

interface BuildClassAsiSectionProps {
  level: number
  viewingClass: string
  viewingSubclassData?: Subclass5e
  featuresByLevel: Map<number, ClassFeatureDisplay[]>
  appliedAsiChoicesForClass: AsiChoice[]
  asiModeByLevel: Record<string, 'asi' | 'feat'>
  usedASI: number
  totalASIAcrossClasses: number
  character: Character
  feats: Feat5e[]
  detailCollapsed: boolean
  onExpandDetails: () => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onAsiReset: (level: number) => void
  onOpenAsiPicker: (level: number) => void
  onOpenFeatPicker: () => void
  onSetAsiModeByLevel: (levelKey: string, mode: 'asi' | 'feat') => void
  onClearFeatSelectionsForAsi: () => void
}

export function BuildClassAsiSection({
  level,
  viewingClass,
  viewingSubclassData,
  featuresByLevel,
  appliedAsiChoicesForClass,
  asiModeByLevel,
  usedASI,
  totalASIAcrossClasses,
  character,
  feats,
  detailCollapsed,
  onExpandDetails,
  onSelectFeature,
  onAsiReset,
  onOpenAsiPicker,
  onOpenFeatPicker,
  onSetAsiModeByLevel,
  onClearFeatSelectionsForAsi,
}: BuildClassAsiSectionProps) {
  const existingAsi = appliedAsiChoicesForClass.find((ac) => ac.level === level)
  const levelKey = `${level}|${viewingClass}`
  const mode = existingAsi ? 'asi' : (asiModeByLevel[levelKey] ?? 'feat')
  const isApplied = !!existingAsi
  const featsTaken = character.feats ?? []

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden',
        isApplied
          ? 'border-success/30 bg-success/5'
          : mode === 'asi'
            ? 'border-warning/30 bg-warning/5'
            : 'border-info/30 bg-info/5',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Star className="h-4 w-4 text-info flex-shrink-0" weight="duotone" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              Ability Score Improvement
              {isApplied && <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />}
            </div>
            <div className="text-xs text-muted-foreground">
              {isApplied
                ? Object.entries(existingAsi?.abilityChanges ?? {})
                  .map(
                    ([ability, bonus]) =>
                      `+${bonus} ${ability.charAt(0).toUpperCase() + ability.slice(1)}`,
                  )
                  .join(', ')
                : mode === 'asi'
                  ? 'Select ability scores to increase'
                  : usedASI > 0
                    ? `${usedASI} of ${totalASIAcrossClasses} feat slot${totalASIAcrossClasses !== 1 ? 's' : ''} used`
                    : 'Choose an ability score increase or take a feat'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isApplied ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 h-7 text-xs"
              onClick={() => onAsiReset(level)}
            >
              Change
            </Button>
          ) : mode === 'asi' ? (
            <Button
              size="sm"
              className="flex-shrink-0 h-7 text-xs"
              onClick={() => onOpenAsiPicker(level)}
            >
              Apply
            </Button>
          ) : (
            <Button
              variant={usedASI > 0 ? 'outline' : 'default'}
              size="sm"
              className="flex-shrink-0 h-7 text-xs"
              onClick={onOpenFeatPicker}
            >
              {usedASI > 0 ? 'Edit Feats' : 'Choose Feat'}
            </Button>
          )}
        </div>
      </div>

      {!isApplied && (
        <div className="px-3 pb-2.5 pt-1 flex items-center gap-4 border-t border-info/20">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="radio"
              name={`asiChoice_${level}_${viewingClass}`}
              value="feat"
              checked={mode === 'feat'}
              onChange={() => onSetAsiModeByLevel(levelKey, 'feat')}
              className="accent-accent-9"
            />
            Take a Feat
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="radio"
              name={`asiChoice_${level}_${viewingClass}`}
              value="asi"
              checked={mode === 'asi'}
              onChange={() => {
                onSetAsiModeByLevel(levelKey, 'asi')
                onClearFeatSelectionsForAsi()
              }}
              className="accent-accent-9"
            />
            Ability Score Increase
          </label>
        </div>
      )}

      {isApplied &&
        (() => {
          const asiFeature = (featuresByLevel.get(level) ?? []).find(
            (f) => f.name === 'Ability Score Improvement',
          )
          return (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
              {Object.entries(existingAsi?.abilityChanges ?? {}).map(([ability, bonus]) => (
                <button
                  key={ability}
                  type="button"
                  onMouseEnter={() => {
                    if (!asiFeature) return
                    onSelectFeature({
                      name: asiFeature.name,
                      source: asiFeature.source,
                      entries: resolveSubclassFeatureRefs(
                        asiFeature.entries ?? [],
                        viewingSubclassData?.shortName,
                      ),
                    })
                    if (detailCollapsed) onExpandDetails()
                  }}
                  onClick={() => {
                    if (!asiFeature) return
                    onSelectFeature({
                      name: asiFeature.name,
                      source: asiFeature.source,
                      entries: resolveSubclassFeatureRefs(
                        asiFeature.entries ?? [],
                        viewingSubclassData?.shortName,
                      ),
                    })
                    if (detailCollapsed) onExpandDetails()
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
                >
                  <span className="font-medium">
                    +{bonus} {ability.charAt(0).toUpperCase() + ability.slice(1)}
                  </span>
                </button>
              ))}
            </div>
          )
        })()}

      {!isApplied && mode === 'feat' && featsTaken.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
          {featsTaken.map((feat) => {
            const featData = feats.find((f) => f.name === feat.name)
            return (
              <button
                key={feat.id}
                type="button"
                onMouseEnter={() => {
                  if (!featData) return
                  onSelectFeature({
                    name: featData.name,
                    source: featData.source,
                    entries: featData.entries ?? [],
                  })
                  if (detailCollapsed) onExpandDetails()
                }}
                onClick={() => {
                  if (!featData) return
                  onSelectFeature({
                    name: featData.name,
                    source: featData.source,
                    entries: featData.entries ?? [],
                  })
                  if (detailCollapsed) onExpandDetails()
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-success/30 bg-success/5 hover:border-success/50 hover:bg-success/15 text-foreground transition-colors"
              >
                <span className="font-medium">{feat.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
