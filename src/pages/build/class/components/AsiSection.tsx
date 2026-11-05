import { Check, Star } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { resolveSubclassFeatureRefs } from '@/lib/5etools/classData'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { formatAbilityBonus } from '@/lib/calculations/abilityScoreDisplay'
import type { EpicBoonSlot } from '@/lib/character/epicBoonSlots'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import { cn } from '@/lib/utils'
import type { Feat5e, Subclass5e } from '@/types/5etools'
import type { AsiChoice, Feat } from '@/types/character'
import type { ClassFeatureDisplay, SelectedFeatureState } from './DetailsPanel'

interface BuildClassAsiSectionProps {
  level: number
  viewingClass: string
  viewingClassSource?: string
  viewingSubclassData?: Subclass5e
  featuresByLevel: Map<number, ClassFeatureDisplay[]>
  appliedAsiChoicesForClass: AsiChoice[]
  featForLevel?: Feat
  epicBoon?: EpicBoonSlot
  onEditEpicBoonOptions?: () => void
  asiModeByLevel: Record<string, 'asi' | 'feat'>
  usedASI: number
  totalASIAcrossClasses: number
  feats: Feat5e[]
  detailCollapsed: boolean
  onExpandDetails: () => void
  onSelectFeature: (feature: SelectedFeatureState) => void
  onAsiReset: (level: number) => void
  onOpenAsiPicker: (level: number) => void
  onOpenFeatPicker: (level: number) => void
  onSetAsiModeByLevel: (levelKey: string, mode: 'asi' | 'feat') => void
  onClearFeatSelectionsForAsi: (level: number) => void
  highlighted?: boolean
}

export function BuildClassAsiSection({
  level,
  viewingClass,
  viewingClassSource,
  viewingSubclassData,
  featuresByLevel,
  appliedAsiChoicesForClass,
  featForLevel: ordinaryFeat,
  epicBoon,
  onEditEpicBoonOptions,
  asiModeByLevel,
  usedASI,
  totalASIAcrossClasses,
  feats,
  detailCollapsed,
  onExpandDetails,
  onSelectFeature,
  onAsiReset,
  onOpenAsiPicker,
  onOpenFeatPicker,
  onSetAsiModeByLevel,
  onClearFeatSelectionsForAsi,
  highlighted = false,
}: BuildClassAsiSectionProps) {
  const { ref: routeFocusRef, highlighted: routeFocusHighlighted } =
    useRouteFocusTarget<HTMLFieldSetElement>(highlighted)
  const existingAsi = epicBoon
    ? epicBoon.asi
    : appliedAsiChoicesForClass.find((ac) => ac.level === level)
  const featForLevel = epicBoon ? epicBoon.feat : ordinaryFeat
  const epicFeat =
    epicBoon &&
    featForLevel &&
    feats.find((feat) => getFeatSelectionKey(feat) === getFeatSelectionKey(featForLevel))
  const levelKey = `${level}|${viewingClass}|${viewingClassSource ?? ''}`
  const mode = existingAsi ? 'asi' : featForLevel ? 'feat' : (asiModeByLevel[levelKey] ?? 'feat')
  const isApplied = !!existingAsi || !!featForLevel
  const needsRecovery = epicBoon?.state === 'unavailable' || epicBoon?.state === 'conflict'
  const increases =
    existingAsi &&
    Object.entries(existingAsi.abilityChanges)
      .map(([ability, bonus]) => formatAbilityBonus(ability, bonus))
      .join(', ')
  const epicSummary =
    epicBoon?.state === 'conflict'
      ? 'Multiple saved choices claim this Epic Boon. Choose one replacement or clear the slot.'
      : epicBoon?.state === 'unavailable'
        ? epicBoon.hasClaims
          ? 'This Epic Boon is unavailable. Restore its source or clear the saved choice.'
          : 'Restore the source to choose an Epic Boon for this level.'
        : existingAsi
          ? `Ability Score Improvement · ${increases}`
          : (featForLevel?.name ?? 'Choose an Epic Boon or another feat you qualify for.')

  return (
    <fieldset
      ref={routeFocusRef}
      aria-label={epicBoon ? 'Epic Boon' : 'Ability Score Improvement'}
      className={cn(
        'min-w-0 rounded-lg border overflow-hidden',
        isApplied
          ? 'border-success/30 bg-success/5'
          : mode === 'asi' || needsRecovery
            ? 'border-warning/30 bg-warning/5'
            : 'border-info/30 bg-info/5',
        routeFocusHighlighted && 'animate-route-focus',
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2.5',
          epicBoon && 'flex-wrap gap-2',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Star className="h-4 w-4 text-info flex-shrink-0" weight="duotone" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {epicBoon ? 'Epic Boon' : 'Ability Score Improvement'}
              {isApplied && <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />}
            </div>
            <div className="text-xs text-muted-foreground">
              {epicBoon
                ? epicSummary
                : isApplied
                  ? existingAsi
                    ? increases
                    : featForLevel?.name
                  : mode === 'asi'
                    ? 'Select ability scores to increase'
                    : usedASI > 0
                      ? `${usedASI} of ${totalASIAcrossClasses} feat slot${totalASIAcrossClasses !== 1 ? 's' : ''} used`
                      : 'Choose an ability score increase or take a feat'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {epicBoon ? (
            <>
              {epicFeat && hasFeatOptions(epicFeat) && (
                <Button variant="outline" size="sm" onClick={onEditEpicBoonOptions}>
                  Edit Feat Options
                </Button>
              )}
              {epicBoon.current && (
                <Button
                  variant={isApplied ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => onOpenFeatPicker(level)}
                >
                  {isApplied || needsRecovery ? 'Replace with Feat' : 'Choose Feat'}
                </Button>
              )}
              {epicBoon.allowsAsi && (
                <Button variant="outline" size="sm" onClick={() => onOpenAsiPicker(level)}>
                  {existingAsi ? 'Edit Ability Score Improvement' : 'Ability Score Improvement'}
                </Button>
              )}
              {epicBoon.hasClaims && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onClearFeatSelectionsForAsi(level)}
                >
                  Clear Epic Boon
                </Button>
              )}
            </>
          ) : isApplied ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-shrink-0 h-7 text-xs"
              onClick={() => (existingAsi ? onAsiReset(level) : onOpenFeatPicker(level))}
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
              variant="default"
              size="sm"
              className="flex-shrink-0 h-7 text-xs"
              onClick={() => onOpenFeatPicker(level)}
            >
              Choose Feat
            </Button>
          )}
        </div>
      </div>

      {!epicBoon && !isApplied && (
        <div className="px-3 pb-2.5 pt-1 flex items-center gap-4 border-t border-info/20">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="radio"
              name={`asiChoice_${level}_${viewingClass}_${viewingClassSource ?? ''}`}
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
              name={`asiChoice_${level}_${viewingClass}_${viewingClassSource ?? ''}`}
              value="asi"
              checked={mode === 'asi'}
              onChange={() => {
                onSetAsiModeByLevel(levelKey, 'asi')
                onClearFeatSelectionsForAsi(level)
              }}
              className="accent-accent-9"
            />
            Ability Score Increase
          </label>
        </div>
      )}

      {!epicBoon &&
        existingAsi &&
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
                  <span className="font-medium">{formatAbilityBonus(ability, bonus)}</span>
                </button>
              ))}
            </div>
          )
        })()}

      {!existingAsi && featForLevel && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 border-t border-success/20 pt-2">
          {(() => {
            const featData =
              epicFeat ??
              feats.find(
                (feat) => feat.name === featForLevel.name && feat.source === featForLevel.source,
              )
            return (
              <button
                key={featForLevel.id}
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
                <span className="font-medium">{featForLevel.name}</span>
              </button>
            )
          })()}
        </div>
      )}
    </fieldset>
  )
}
