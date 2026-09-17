import { ArrowRight, Lightning, PencilSimple, Sparkle, Star, Trash } from '@phosphor-icons/react'
import { memo, useMemo } from 'react'
import { GameContent } from '@/components/editor/GameContent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { WorkspaceDetailContent, WorkspacePaneHeader } from '@/components/workspace'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { featCategoryToFull } from '@/lib/5etools/classData'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import type { Feat5e, Raw5ePrereq } from '@/types/5etools'

interface FeatDetailCardProps {
  feat: { id: string; name: string; source: string }
  featData: Feat5e | undefined
  characterSnapshot: PrereqCharacterSnapshot
  onRemove?: (name: string, source: string) => void
  onCompleteSetup?: (
    name: string,
    source: string,
    grantVariant?: string,
    provenanceChoiceId?: string,
    classFeatChoiceId?: string,
    fixedGrant?: boolean,
  ) => void
  onEditSetup?: (
    name: string,
    source: string,
    grantVariant?: string,
    provenanceChoiceId?: string,
    classFeatChoiceId?: string,
    fixedGrant?: boolean,
  ) => void
  isBonus?: boolean
  isOrigin?: boolean
  grantedBy?: string
  grantVariant?: string
  fixedGrant?: boolean
  grantVariantLabel?: string
  provenanceChoiceId?: string
  classFeatChoiceId?: string
  optionsPending?: boolean
  optionsConfigured?: boolean
  selected?: boolean
  highlighted?: boolean
  onSelect?: (name: string, source: string) => void
}

export const FeatDetailCard = memo(function FeatDetailCard({
  feat,
  featData,
  characterSnapshot,
  onRemove,
  onCompleteSetup,
  onEditSetup,
  isBonus,
  isOrigin,
  grantedBy,
  grantVariant,
  fixedGrant,
  grantVariantLabel,
  provenanceChoiceId,
  classFeatChoiceId,
  optionsPending,
  optionsConfigured,
  selected,
  highlighted,
  onSelect,
}: FeatDetailCardProps) {
  const { ref: routeFocusRef, highlighted: routeFocusHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(!!highlighted)
  const categoryLabel =
    typeof featData?.category === 'string' && featData.category.length > 0
      ? featCategoryToFull(featData.category)
      : null
  const { met, failures } = useMemo(
    () =>
      featData
        ? checkAllPrerequisites(featData as { prerequisite?: Raw5ePrereq[] }, characterSnapshot)
        : { met: true, failures: [] },
    [featData, characterSnapshot],
  )
  const originLabel = isOrigin
    ? grantedBy
      ? `Origin: ${grantedBy.split(': ').slice(1).join(': ') || grantedBy}`
      : 'Origin Feat'
    : null
  const grantLabel = !isOrigin && grantedBy ? grantedBy : null
  const visibleEntries = (featData?.entries ?? []).slice(0, 1)
  const descHtml = useMemo(
    () =>
      visibleEntries
        .map((entry) => renderEntryCached(entry))
        .filter(Boolean)
        .join('<br/>'),
    [visibleEntries],
  )
  const iconBg = isBonus
    ? 'bg-primary/10'
    : isOrigin
      ? 'bg-amber-500/10'
      : grantedBy
        ? 'bg-violet-500/10'
        : 'bg-accent/10'
  const iconColor = isBonus
    ? 'text-primary'
    : isOrigin
      ? 'text-amber-500'
      : grantedBy
        ? 'text-violet-600 dark:text-violet-400'
        : 'text-accent-foreground'

  return (
    <div
      ref={routeFocusRef}
      className={cn(
        'relative min-w-0 cursor-default rounded-xl border border-border bg-workspace-pane transition-colors hover:bg-surface-hover',
        selected && 'bg-surface-selected ring-1 ring-inset ring-primary/45',
        routeFocusHighlighted && 'animate-route-focus',
      )}
    >
      <button
        type="button"
        aria-label={`Select ${feat.name}`}
        aria-pressed={selected}
        className="absolute inset-0 z-0 cursor-default rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onSelect?.(feat.name, feat.source)}
      />
      <div className="pointer-events-none relative z-10 p-4">
        <div className="flex items-start gap-4">
          <div className={cn('mt-0.5 shrink-0 rounded p-1.5', iconBg)}>
            {isBonus ? (
              <Lightning className={cn('size-4', iconColor)} weight="duotone" />
            ) : isOrigin || grantedBy ? (
              <Sparkle className={cn('size-4', iconColor)} weight="duotone" />
            ) : (
              <Star className={cn('size-4', iconColor)} weight="duotone" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-start gap-2">
              <h3 className="text-left text-base font-semibold leading-tight">{feat.name}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {isBonus && (
                  <Badge className="h-5 border border-primary/30 bg-primary/10 px-1.5 py-0 text-xs text-primary">
                    Bonus
                  </Badge>
                )}
                {originLabel && (
                  <Badge className="h-5 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-xs text-amber-600 dark:text-amber-400">
                    <Sparkle className="mr-0.5 size-2.5" weight="duotone" />
                    {originLabel}
                  </Badge>
                )}
                {grantLabel && (
                  <Badge className="h-5 border border-violet-500/30 bg-violet-500/10 px-1.5 py-0 text-xs text-violet-600 dark:text-violet-400">
                    <Sparkle className="mr-0.5 size-2.5" weight="duotone" />
                    {grantLabel}
                  </Badge>
                )}
                {grantVariantLabel && <Badge variant="outline">{grantVariantLabel}</Badge>}
                {!met && (
                  <Badge
                    variant="outline"
                    className="h-5 border-destructive/50 px-1.5 py-0 text-xs text-destructive"
                  >
                    Prereqs unmet
                  </Badge>
                )}
                {optionsPending && (
                  <Badge className="h-5 border border-warning/30 bg-warning/10 px-1.5 py-0 text-xs text-warning">
                    Setup pending
                  </Badge>
                )}
              </div>
            </div>

            {(categoryLabel || feat.source) && (
              <p className="mb-2 text-xs text-muted-foreground">
                {[categoryLabel, feat.source].filter(Boolean).join(' · ')}
              </p>
            )}
            {!met && failures.length > 0 && (
              <p className="mb-2 text-sm text-warning/90">{failures.join(' · ')}</p>
            )}
            {descHtml ? (
              <div
                className="line-clamp-2 text-sm leading-relaxed text-muted-foreground"
                // renderEntryCached returns sanitized HTML from structured source entries.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: descHtml }}
              />
            ) : (
              <p className="text-sm italic text-muted-foreground">No description available.</p>
            )}

            {optionsPending && onCompleteSetup && (
              <Button
                size="sm"
                variant="outline"
                className="pointer-events-auto mt-3 h-8 gap-1.5 border-warning/40 text-sm text-warning hover:border-warning/60 hover:bg-warning/10"
                onClick={(event) => {
                  event.stopPropagation()
                  onCompleteSetup(
                    feat.name,
                    feat.source,
                    grantVariant,
                    provenanceChoiceId,
                    classFeatChoiceId,
                    fixedGrant,
                  )
                }}
              >
                Complete Setup
                <ArrowRight className="size-3" />
              </Button>
            )}
            {optionsConfigured && onEditSetup && (
              <Button
                size="sm"
                variant="accentOutline"
                data-feat-edit-setup-btn="true"
                className="pointer-events-auto mt-3 h-8 gap-1.5 text-sm"
                onClick={(event) => {
                  event.stopPropagation()
                  onEditSetup(
                    feat.name,
                    feat.source,
                    grantVariant,
                    provenanceChoiceId,
                    classFeatChoiceId,
                    fixedGrant,
                  )
                }}
              >
                <PencilSimple className="size-3" />
                Edit Setup
              </Button>
            )}
          </div>

          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="pointer-events-auto size-9 shrink-0 cursor-pointer p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(feat.name, feat.source)
              }}
              title="Remove feat"
              aria-label={`Remove ${feat.name}`}
            >
              <Trash className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})

interface FeatDetailsInspectorProps {
  featName: string | null
  featData: Feat5e | undefined
  characterSnapshot: PrereqCharacterSnapshot
}

export function FeatDetailsInspector({
  featName,
  featData,
  characterSnapshot,
}: FeatDetailsInspectorProps) {
  const categoryLabel =
    typeof featData?.category === 'string' && featData.category.length > 0
      ? featCategoryToFull(featData.category)
      : null
  const prerequisiteResult = featData
    ? checkAllPrerequisites(featData as { prerequisite?: Raw5ePrereq[] }, characterSnapshot)
    : { met: true, failures: [] }
  const descriptionEntries = featData?.entries ?? []

  return (
    <>
      <WorkspacePaneHeader title="Feat details" className="pr-20" />
      <ScrollArea className="flex-1 overflow-hidden">
        <WorkspaceDetailContent className="space-y-4">
          {!featName ? (
            <div className="flex h-32 items-center justify-center text-center text-sm text-muted-foreground">
              Select a feat to inspect its rules.
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-display text-xl font-bold">{featName}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {featData?.source && <Badge variant="outline">{featData.source}</Badge>}
                  {categoryLabel && <Badge variant="secondary">{categoryLabel}</Badge>}
                  <Badge
                    variant="outline"
                    className={cn(
                      prerequisiteResult.met
                        ? 'border-success/40 text-success'
                        : 'border-warning/50 text-warning',
                    )}
                  >
                    {prerequisiteResult.met ? 'Prerequisites met' : 'Prerequisites unmet'}
                  </Badge>
                </div>
              </div>
              <Separator />
              {!prerequisiteResult.met && prerequisiteResult.failures.length > 0 && (
                <div className="border-warning border-l-2 bg-warning/5 px-3 py-2 text-sm text-warning">
                  {prerequisiteResult.failures.join(' · ')}
                </div>
              )}
              {descriptionEntries.length > 0 ? (
                <GameContent
                  entry={descriptionEntries}
                  className="space-y-2 text-sm leading-relaxed [&_li]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:ml-4 [&_ul]:list-disc"
                />
              ) : (
                <p className="text-sm italic text-muted-foreground">No description available.</p>
              )}
            </>
          )}
        </WorkspaceDetailContent>
      </ScrollArea>
    </>
  )
}
