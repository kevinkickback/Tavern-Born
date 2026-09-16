import { Lightning, Plus, Star, WarningCircle } from '@phosphor-icons/react'
import { useSearchParams } from 'react-router-dom'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AnchoredHint,
  WorkspaceBody,
  WorkspacePage,
  WorkspacePaneHeader,
} from '@/components/workspace'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { getFixedFeatOptionKey } from '@/lib/featGrants'
import { featSetupReadinessId, getReadinessFocus } from '@/lib/navigation/readinessFocus'
import { cn } from '@/lib/utils'
import type { Feat5e } from '@/types/5etools'
import { NoCharCard } from '../_shared'
import { FeatDetailCard, FeatDetailsInspector } from './components/FeatCards'
import {
  FEATS_HINT_WIDTH,
  type FeatView,
  getChoiceFeatSelections,
  isSelectedFeat,
  useFeatsPageController,
} from './hooks/useFeatsPageController'

export function FeatsPage() {
  const [searchParams] = useSearchParams()
  const readinessFocus = getReadinessFocus(searchParams)
  const controller = useFeatsPageController()
  const {
    activeFeatData,
    activeFeatName,
    bonusFeats,
    bonusInitialSelectedIds,
    bonusModalOpen,
    character,
    characterFeatCount,
    characterSnapshot,
    classProgressionFeats,
    compactPane,
    detailCollapsed,
    featEditCandidate,
    featEditTarget,
    featOptionsTarget,
    feats,
    featView,
    getSourcesRowsBySection,
    handleBonusModalConfirm,
    handleCompleteSetup,
    handleDismissEditHint,
    handleEditBonusSetup,
    handleEditConfirm,
    handleEditFinish,
    handleEditSetup,
    handleFeatOptionsFinish,
    handleRemoveBonusFeat,
    handleRemoveFeat,
    handleRemoveGrantedChoice,
    handleSelectFeat,
    hasCharacterSection,
    hasPendingWarnings,
    hintPosition,
    listCollapsed,
    originFixedFeats,
    pendingOptionBonusFeatIds,
    pendingOptionCount,
    pendingOptionFeatIds,
    pendingOriginChoices,
    pendingRacialChoices,
    proficientSkillNames,
    racialFixedFeats,
    remainingASI,
    resolvedOriginChoices,
    resolvedRacialChoices,
    selectedFeat,
    setBonusModalOpen,
    setCompactPane,
    setDetailCollapsed,
    setFeatEditCandidate,
    setFeatEditTarget,
    setFeatOptionsTarget,
    setFeatView,
    setListCollapsed,
    showBonusGroup,
    showCharacterGroup,
    showEditHint,
  } = controller

  const isFocusedFeat = (name: string, source: string) =>
    [...(character?.feats ?? []), ...(character?.specialFeats ?? [])].some(
      (feat) =>
        getEntityLookupKey(feat.name, feat.source) === getEntityLookupKey(name, source) &&
        readinessFocus ===
          featSetupReadinessId(
            getEntityLookupKey(feat.name, feat.source),
            feat.className,
            feat.classLevel,
          ),
    )

  if (!character) {
    return <NoCharCard icon={<Star weight="duotone" />} noun="manage feats" />
  }

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="flex overflow-hidden">
        <SplitPane
          className={cn(
            'my-0 h-full overflow-visible',
            !listCollapsed && !detailCollapsed && 'gap-3',
          )}
          leftClassName={cn(
            'rounded-lg bg-workspace-pane',
            listCollapsed ? 'border-0' : 'border border-border',
          )}
          rightClassName={cn(
            'rounded-lg bg-workspace-detail',
            detailCollapsed ? 'border-0' : 'border border-border',
          )}
          leftCollapsed={listCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setListCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          compactPane={compactPane}
          onCompactPaneChange={setCompactPane}
          compactLeftLabel="Feats"
          compactRightLabel="Feat details"
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader ariaLabel="Feat view">
                <div className="h-full min-w-0 flex-1 overflow-x-auto">
                  <div
                    className="inline-flex h-full min-w-max items-stretch gap-5"
                    role="tablist"
                    aria-label="Feat view"
                  >
                    {(
                      [
                        {
                          value: 'all',
                          label: 'All',
                          count: characterFeatCount + bonusFeats.length,
                        },
                        { value: 'character', label: 'Character', count: characterFeatCount },
                        { value: 'bonus', label: 'Bonus', count: bonusFeats.length },
                      ] as Array<{ value: FeatView; label: string; count: number }>
                    ).map(({ value, label, count }) => {
                      const active = featView === value
                      return (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setFeatView(value)}
                          className={cn(
                            'relative flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                            active
                              ? 'border-primary text-foreground'
                              : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                          )}
                        >
                          <span>{label}</span>
                          <span
                            className={cn(
                              'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none',
                              'bg-primary/15 text-primary',
                            )}
                          >
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
                  <AnchoredHint
                    position={showEditHint ? hintPosition : null}
                    width={FEATS_HINT_WIDTH}
                    onDismiss={handleDismissEditHint}
                  >
                    You can revise a configured feat's spells, skills, or other choices later. Click{' '}
                    <strong>Edit Setup</strong> to change its selections.
                  </AnchoredHint>

                  {/* Pending choice warnings */}
                  {hasPendingWarnings && featView !== 'bonus' && (
                    <div className="divide-y divide-warning/20 border-l-2 border-warning bg-warning/5">
                      {remainingASI > 0 && (
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <WarningCircle
                            className="h-4 w-4 text-warning flex-shrink-0"
                            weight="fill"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-warning">
                              {remainingASI} ASI slot{remainingASI !== 1 ? 's' : ''} available
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              Visit the Class page to choose feats or stat increases.
                            </span>
                          </div>
                        </div>
                      )}
                      {pendingRacialChoices.length > 0 && (
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <WarningCircle
                            className="h-4 w-4 text-warning flex-shrink-0"
                            weight="fill"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-warning">
                              {pendingRacialChoices.length} racial feat
                              {pendingRacialChoices.length !== 1 ? 's' : ''} pending
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              Visit the Race page to make your selection.
                            </span>
                          </div>
                        </div>
                      )}
                      {pendingOriginChoices.length > 0 && (
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <WarningCircle
                            className="h-4 w-4 text-warning flex-shrink-0"
                            weight="fill"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-warning">
                              {pendingOriginChoices.length} origin feat
                              {pendingOriginChoices.length !== 1 ? 's' : ''} pending
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              Visit the Background page to make your selection.
                            </span>
                          </div>
                        </div>
                      )}
                      {pendingOptionCount > 0 && (
                        <div className="flex items-center gap-3 px-4 py-2.5">
                          <WarningCircle
                            className="h-4 w-4 text-warning flex-shrink-0"
                            weight="fill"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-warning">
                              {pendingOptionCount} feat{pendingOptionCount !== 1 ? 's' : ''} need
                              setup
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              Use the "Complete Setup" button on each feat below.
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {showCharacterGroup && (
                    <section className="w-full">
                      <div className="flex h-10 items-center justify-between border-b border-border px-1">
                        <div className="flex items-center gap-2">
                          <Star
                            className="h-4 w-4 text-violet-600 dark:text-violet-400"
                            weight="duotone"
                          />
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Character Feats
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs h-5 px-2">
                          {characterFeatCount} total
                        </Badge>
                      </div>
                      <div className="mt-3">
                        {hasCharacterSection ? (
                          <div className="space-y-3">
                            {(character.feats ?? []).map((feat) => {
                              const featData = (feats as Feat5e[]).find(
                                (candidate) =>
                                  candidate.name === feat.name &&
                                  (candidate.source ?? '') === feat.source,
                              )
                              const isPending = pendingOptionFeatIds.has(
                                `${feat.name}|${feat.source}`,
                              )
                              const isConfigured = !isPending && !!feat.options
                              return (
                                <FeatDetailCard
                                  key={feat.id}
                                  feat={feat}
                                  featData={featData}
                                  characterSnapshot={characterSnapshot}
                                  highlighted={isFocusedFeat(feat.name, feat.source)}
                                  selected={isSelectedFeat(selectedFeat, feat.name, feat.source)}
                                  onSelect={handleSelectFeat}
                                  onRemove={handleRemoveFeat}
                                  onCompleteSetup={isPending ? handleCompleteSetup : undefined}
                                  onEditSetup={isConfigured ? handleEditSetup : undefined}
                                  optionsPending={isPending}
                                  optionsConfigured={isConfigured}
                                />
                              )
                            })}
                            {classProgressionFeats.map(({ choice, feat }) => {
                              const featData = (feats as Feat5e[]).find(
                                (candidate) =>
                                  candidate.name === feat.name &&
                                  (candidate.source ?? '') === feat.source,
                              )
                              const needsOptions = !!featData && hasFeatOptions(featData)
                              return (
                                <FeatDetailCard
                                  key={`class-${choice.id}-${feat.id}`}
                                  feat={feat}
                                  featData={featData}
                                  characterSnapshot={characterSnapshot}
                                  highlighted={isFocusedFeat(feat.name, feat.source)}
                                  selected={isSelectedFeat(selectedFeat, feat.name, feat.source)}
                                  onSelect={handleSelectFeat}
                                  grantedBy={`${choice.className}: ${choice.progressionName}`}
                                  classFeatChoiceId={choice.id}
                                  optionsPending={needsOptions && !feat.options}
                                  optionsConfigured={!!feat.options}
                                  onCompleteSetup={handleCompleteSetup}
                                  onEditSetup={handleEditSetup}
                                />
                              )
                            })}
                            {racialFixedFeats.map((granted) => (
                              <FeatDetailCard
                                key={`fixed-${granted.name}|${granted.source}|${granted.grantVariant ?? ''}|${granted.sourceLabel}`}
                                feat={{
                                  id: `fixed-${granted.name}`,
                                  name: granted.name,
                                  source: granted.source,
                                }}
                                featData={granted.featData}
                                characterSnapshot={characterSnapshot}
                                selected={isSelectedFeat(
                                  selectedFeat,
                                  granted.name,
                                  granted.source,
                                )}
                                highlighted={
                                  (searchParams.get('focus') === 'feat' &&
                                    isSelectedFeat(selectedFeat, granted.name, granted.source)) ||
                                  isFocusedFeat(granted.name, granted.source)
                                }
                                onSelect={handleSelectFeat}
                                grantedBy={granted.sourceLabel}
                                grantVariant={granted.grantVariant}
                                grantVariantLabel={granted.variantLabel}
                                optionsPending={
                                  !!granted.featData &&
                                  hasFeatOptions(granted.featData) &&
                                  !character.fixedFeatOptions?.[
                                    getFixedFeatOptionKey(
                                      granted.name,
                                      granted.source,
                                      granted.grantVariant,
                                    )
                                  ]
                                }
                                optionsConfigured={
                                  !!character.fixedFeatOptions?.[
                                    getFixedFeatOptionKey(
                                      granted.name,
                                      granted.source,
                                      granted.grantVariant,
                                    )
                                  ]
                                }
                                onCompleteSetup={handleCompleteSetup}
                                onEditSetup={handleEditSetup}
                              />
                            ))}
                            {resolvedRacialChoices.flatMap((choice) =>
                              getChoiceFeatSelections(choice).map((selection) => {
                                const data = (feats as Feat5e[]).find(
                                  (feat) =>
                                    feat.name.toLowerCase() === selection.name.toLowerCase() &&
                                    (selection.source == null || feat.source === selection.source),
                                )
                                const selectedName = data?.name ?? selection.name
                                const selectedSource = selection.source ?? data?.source ?? ''
                                const needsOptions = !!data && hasFeatOptions(data)
                                return (
                                  <FeatDetailCard
                                    key={`choice-${choice.id}-${selectedName}|${selectedSource}`}
                                    feat={{
                                      id: `choice-${choice.id}-${selectedName}|${selectedSource}`,
                                      name: selectedName,
                                      source: selectedSource,
                                    }}
                                    featData={data}
                                    characterSnapshot={characterSnapshot}
                                    selected={isSelectedFeat(
                                      selectedFeat,
                                      selectedName,
                                      selectedSource,
                                    )}
                                    highlighted={
                                      (searchParams.get('focus') === 'feat' &&
                                        isSelectedFeat(
                                          selectedFeat,
                                          selectedName,
                                          selectedSource,
                                        )) ||
                                      isFocusedFeat(selectedName, selectedSource)
                                    }
                                    onSelect={handleSelectFeat}
                                    grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                                    onRemove={() =>
                                      handleRemoveGrantedChoice(
                                        choice.id,
                                        selectedName,
                                        selectedSource,
                                      )
                                    }
                                    provenanceChoiceId={choice.id}
                                    optionsPending={needsOptions && !selection.options}
                                    optionsConfigured={!!selection.options}
                                    onCompleteSetup={handleCompleteSetup}
                                    onEditSetup={handleEditSetup}
                                  />
                                )
                              }),
                            )}
                            {originFixedFeats.map((granted) => (
                              <FeatDetailCard
                                key={`fixed-${granted.name}|${granted.source}|${granted.grantVariant ?? ''}|${granted.sourceLabel}`}
                                feat={{
                                  id: `fixed-${granted.name}`,
                                  name: granted.name,
                                  source: granted.source,
                                }}
                                featData={granted.featData}
                                characterSnapshot={characterSnapshot}
                                selected={isSelectedFeat(
                                  selectedFeat,
                                  granted.name,
                                  granted.source,
                                )}
                                highlighted={
                                  (searchParams.get('focus') === 'feat' &&
                                    isSelectedFeat(selectedFeat, granted.name, granted.source)) ||
                                  isFocusedFeat(granted.name, granted.source)
                                }
                                onSelect={handleSelectFeat}
                                grantedBy={granted.sourceLabel}
                                grantVariant={granted.grantVariant}
                                grantVariantLabel={granted.variantLabel}
                                optionsPending={
                                  !!granted.featData &&
                                  hasFeatOptions(granted.featData) &&
                                  !character.fixedFeatOptions?.[
                                    getFixedFeatOptionKey(
                                      granted.name,
                                      granted.source,
                                      granted.grantVariant,
                                    )
                                  ]
                                }
                                optionsConfigured={
                                  !!character.fixedFeatOptions?.[
                                    getFixedFeatOptionKey(
                                      granted.name,
                                      granted.source,
                                      granted.grantVariant,
                                    )
                                  ]
                                }
                                onCompleteSetup={handleCompleteSetup}
                                onEditSetup={handleEditSetup}
                                isOrigin
                              />
                            ))}
                            {resolvedOriginChoices.flatMap((choice) =>
                              getChoiceFeatSelections(choice).map((selection) => {
                                const data = (feats as Feat5e[]).find(
                                  (feat) =>
                                    feat.name.toLowerCase() === selection.name.toLowerCase() &&
                                    (selection.source == null || feat.source === selection.source),
                                )
                                const selectedName = data?.name ?? selection.name
                                const selectedSource = selection.source ?? data?.source ?? ''
                                const needsOptions = !!data && hasFeatOptions(data)
                                return (
                                  <FeatDetailCard
                                    key={`choice-${choice.id}-${selectedName}|${selectedSource}`}
                                    feat={{
                                      id: `choice-${choice.id}-${selectedName}|${selectedSource}`,
                                      name: selectedName,
                                      source: selectedSource,
                                    }}
                                    featData={data}
                                    characterSnapshot={characterSnapshot}
                                    selected={isSelectedFeat(
                                      selectedFeat,
                                      selectedName,
                                      selectedSource,
                                    )}
                                    highlighted={
                                      (searchParams.get('focus') === 'feat' &&
                                        isSelectedFeat(
                                          selectedFeat,
                                          selectedName,
                                          selectedSource,
                                        )) ||
                                      isFocusedFeat(selectedName, selectedSource)
                                    }
                                    onSelect={handleSelectFeat}
                                    grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                                    onRemove={() =>
                                      handleRemoveGrantedChoice(
                                        choice.id,
                                        selectedName,
                                        selectedSource,
                                      )
                                    }
                                    provenanceChoiceId={choice.id}
                                    optionsPending={needsOptions && !selection.options}
                                    optionsConfigured={!!selection.options}
                                    onCompleteSetup={handleCompleteSetup}
                                    onEditSetup={handleEditSetup}
                                    isOrigin
                                  />
                                )
                              }),
                            )}
                          </div>
                        ) : (
                          <div className="min-h-48 flex flex-col items-center justify-center text-center p-6">
                            <Star
                              className="h-8 w-8 text-muted-foreground/30 mb-3"
                              weight="duotone"
                            />
                            <h3 className="text-sm font-semibold">No Character Feats</h3>
                            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                              Feats are gained from class ASI selections, your race, or background.
                            </p>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {showBonusGroup && (
                    <section className="w-full">
                      <div className="flex min-h-10 items-center justify-between border-b border-border px-1 pt-1 pb-2">
                        <div className="flex items-center gap-2">
                          <Lightning className="h-4 w-4 text-primary" weight="duotone" />
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Bonus Feats
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="h-5 px-2 text-xs">
                            {bonusFeats.length} total
                          </Badge>
                          {bonusFeats.length > 0 && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 cursor-pointer px-3 text-xs"
                              onClick={() => setBonusModalOpen(true)}
                            >
                              <Plus className="mr-1 h-3.5 w-3.5" />
                              Add Feat
                            </Button>
                          )}
                        </div>
                      </div>
                      {bonusFeats.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {bonusFeats.map((feat) => {
                            const featData = (feats as Feat5e[]).find(
                              (entry) =>
                                entry.name === feat.name && (entry.source ?? '') === feat.source,
                            )
                            const isPending = pendingOptionBonusFeatIds.has(
                              `${feat.name}|${feat.source}`,
                            )
                            const isConfigured = !isPending && !!feat.options
                            return (
                              <FeatDetailCard
                                key={feat.id}
                                feat={feat}
                                featData={featData}
                                characterSnapshot={characterSnapshot}
                                highlighted={isFocusedFeat(feat.name, feat.source)}
                                selected={isSelectedFeat(selectedFeat, feat.name, feat.source)}
                                onSelect={handleSelectFeat}
                                onRemove={handleRemoveBonusFeat}
                                onCompleteSetup={isPending ? handleCompleteSetup : undefined}
                                onEditSetup={isConfigured ? handleEditBonusSetup : undefined}
                                optionsPending={isPending}
                                optionsConfigured={isConfigured}
                                isBonus
                              />
                            )
                          })}
                        </div>
                      ) : (
                        <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
                          <Lightning
                            className="mb-2 h-6 w-6 text-muted-foreground"
                            weight="duotone"
                          />
                          <h3 className="text-sm font-semibold">No Bonus Feats</h3>
                          <p className="mt-1 max-w-md text-xs text-muted-foreground">
                            Track feats granted outside normal progression, such as a free feat from
                            your DM or one provided by a legendary item. These do not use normal
                            feat slots.
                          </p>
                          <Button
                            size="sm"
                            variant="default"
                            className="mt-4 h-8 cursor-pointer px-3 text-xs"
                            onClick={() => setBonusModalOpen(true)}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" />
                            Add Bonus Feat
                          </Button>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              </ScrollArea>
              <div className="border-t border-border px-4 pb-4">
                <SourcesAccordion
                  sectionId="feats"
                  title="Sources"
                  rows={getSourcesRowsBySection('feats')}
                />
              </div>
            </>
          }
          right={
            <FeatDetailsInspector
              featName={activeFeatName}
              featData={activeFeatData}
              characterSnapshot={characterSnapshot}
            />
          }
        />
      </WorkspaceBody>

      {/* Bonus feat modal — no selection limit */}
      <FeatSelectionModal
        open={bonusModalOpen}
        onOpenChange={setBonusModalOpen}
        feats={feats as Feat5e[]}
        maxSelections={999}
        initialSelectedIds={bonusInitialSelectedIds}
        characterSnapshot={characterSnapshot}
        onConfirm={handleBonusModalConfirm}
      />

      {/* Feat options wizard — opened via "Complete Setup" on a pending feat */}
      {featOptionsTarget && (
        <FeatOptionsModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setFeatOptionsTarget(null)
          }}
          feat={featOptionsTarget}
          fixedSpellcastingClass={featOptionsTarget.fixedSpellcastingClass}
          proficientSkillNames={proficientSkillNames}
          onFinish={handleFeatOptionsFinish}
          onDismiss={() => setFeatOptionsTarget(null)}
        />
      )}

      {/* Edit Setup confirmation dialog */}
      <AlertDialog
        open={!!featEditCandidate}
        onOpenChange={(open) => {
          if (!open) setFeatEditCandidate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit feat setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing spell or proficiency selections may affect your prepared spells. Your current
              choices will be replaced. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEditConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Feat options wizard — opened after confirming Edit Setup */}
      {featEditTarget && (
        <FeatOptionsModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setFeatEditTarget(null)
          }}
          feat={featEditTarget.feat5e}
          fixedSpellcastingClass={featEditTarget.feat5e.fixedSpellcastingClass}
          proficientSkillNames={proficientSkillNames}
          initialSelections={featEditTarget.priorOptions}
          onFinish={handleEditFinish}
          onDismiss={() => setFeatEditTarget(null)}
        />
      )}
    </WorkspacePage>
  )
}
