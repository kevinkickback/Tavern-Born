import {
  ArrowRight,
  Lightning,
  PencilSimple,
  Plus,
  Sparkle,
  Star,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { memo, useCallback, useMemo, useState } from 'react'
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
import { Separator } from '@/components/ui/separator'
import {
  WorkspaceBody,
  WorkspaceDetailContent,
  WorkspacePage,
  WorkspacePaneHeader,
} from '@/components/workspace'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { featCategoryToFull } from '@/lib/5etools/classData'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { collectKnownSpells, ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { getCharacterClassEntries, getTotalCharacterLevel } from '@/lib/characterUtils'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { countTotalFeatSlots } from '@/pages/build/class/model/pageUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Feat5e, Raw5ePrereq, Spell5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'
import { NoCharCard } from '../_shared'

const FEATS_SETUP_HINT_ID = 'feats-complete-setup'
const FEATS_SETUP_BTN_SELECTOR = '[data-feat-setup-btn="true"]'
const FEATS_HINT_WIDTH = 300

const EMPTY_STRINGS: string[] = []

interface FeatDetailCardProps {
  feat: { id: string; name: string; source: string }
  featData: Feat5e | undefined
  characterSnapshot: PrereqCharacterSnapshot
  onRemove?: (name: string) => void
  onCompleteSetup?: (name: string) => void
  /** Triggered when user clicks "Edit Setup" on a feat with existing options. */
  onEditSetup?: (name: string) => void
  isBonus?: boolean
  isOrigin?: boolean
  /** Shows a "Granted by …" badge instead of the remove button. */
  grantedBy?: string
  /** True when this feat requires option selections that haven't been made yet. */
  optionsPending?: boolean
  /** True when this feat has been configured and can be re-edited. */
  optionsConfigured?: boolean
  selected?: boolean
  onSelect?: (name: string) => void
}

const FeatDetailCard = memo(function FeatDetailCard({
  feat,
  featData,
  characterSnapshot,
  onRemove,
  onCompleteSetup,
  onEditSetup,
  isBonus,
  isOrigin,
  grantedBy,
  optionsPending,
  optionsConfigured,
  selected,
  onSelect,
}: FeatDetailCardProps) {
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

  const originLabel: string | null = isOrigin
    ? grantedBy
      ? `Origin: ${grantedBy.split(': ').slice(1).join(': ') || grantedBy}`
      : 'Origin Feat'
    : null

  const grantLabel: string | null = !isOrigin && grantedBy ? grantedBy : null

  const visibleEntries = (featData?.entries ?? []).slice(0, 1)
  const descHtml = useMemo(
    () =>
      visibleEntries
        .map((e) => renderEntryCached(e))
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
      className={cn(
        'relative min-w-0 cursor-default rounded-xl border border-border bg-background transition-colors hover:bg-secondary/25',
        selected && 'bg-primary/5 ring-1 ring-inset ring-primary/40',
      )}
    >
      <button
        type="button"
        aria-label={`Select ${feat.name}`}
        aria-pressed={selected}
        className="absolute inset-0 z-0 cursor-default rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => onSelect?.(feat.name)}
      />
      <div className="pointer-events-none relative z-10 p-4">
        <div className="flex items-start gap-4">
          {/* Type icon square */}
          <div className={cn('rounded p-1.5 flex-shrink-0 mt-0.5', iconBg)}>
            {isBonus ? (
              <Lightning className={cn('h-4 w-4', iconColor)} weight="duotone" />
            ) : isOrigin ? (
              <Sparkle className={cn('h-4 w-4', iconColor)} weight="duotone" />
            ) : grantedBy ? (
              <Sparkle className={cn('h-4 w-4', iconColor)} weight="duotone" />
            ) : (
              <Star className={cn('h-4 w-4', iconColor)} weight="duotone" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + badges */}
            <div className="flex items-start gap-2 flex-wrap mb-1.5">
              <h3 className="text-left text-base font-semibold leading-tight">{feat.name}</h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {isBonus && (
                  <Badge className="text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary border border-primary/30">
                    Bonus
                  </Badge>
                )}
                {originLabel && (
                  <Badge className="text-xs px-1.5 py-0 h-5 bg-amber-500/10 text-amber-600 border border-amber-500/30 dark:text-amber-400">
                    <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="duotone" />
                    {originLabel}
                  </Badge>
                )}
                {grantLabel && (
                  <Badge className="text-xs px-1.5 py-0 h-5 bg-violet-500/10 text-violet-600 border border-violet-500/30 dark:text-violet-400">
                    <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="duotone" />
                    {grantLabel}
                  </Badge>
                )}
                {!met && (
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 h-5 text-destructive border-destructive/50"
                  >
                    Prereqs unmet
                  </Badge>
                )}
                {optionsPending && (
                  <Badge className="text-xs px-1.5 py-0 h-5 bg-warning/10 text-warning border border-warning/30">
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

            {/* Prereq failure detail */}
            {!met && failures.length > 0 && (
              <p className="mb-2 text-sm text-warning/90">{failures.join(' · ')}</p>
            )}

            {/* Description */}
            {descHtml ? (
              <div
                className="line-clamp-2 text-sm leading-relaxed text-muted-foreground"
                // renderEntry outputs safe HTML from structured 5etools entries.
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
                data-feat-setup-btn="true"
                className="pointer-events-auto mt-3 h-8 gap-1.5 border-warning/40 text-sm text-warning hover:border-warning/60 hover:bg-warning/10"
                onClick={(event) => {
                  event.stopPropagation()
                  onCompleteSetup(feat.name)
                }}
              >
                Complete Setup
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
            {optionsConfigured && onEditSetup && (
              <Button
                size="sm"
                variant="ghost"
                className="pointer-events-auto mt-3 h-8 gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation()
                  onEditSetup(feat.name)
                }}
              >
                <PencilSimple className="h-3 w-3" />
                Edit Setup
              </Button>
            )}
          </div>

          {onRemove && (
            <Button
              variant="ghost"
              size="sm"
              className="pointer-events-auto size-9 cursor-pointer p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(feat.name)
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

function FeatDetailsInspector({
  featName,
  featData,
  characterSnapshot,
}: {
  featName: string | null
  featData: Feat5e | undefined
  characterSnapshot: PrereqCharacterSnapshot
}) {
  const categoryLabel =
    typeof featData?.category === 'string' && featData.category.length > 0
      ? featCategoryToFull(featData.category)
      : null
  const prerequisiteResult = featData
    ? checkAllPrerequisites(featData as { prerequisite?: Raw5ePrereq[] }, characterSnapshot)
    : { met: true, failures: [] }
  const description = (featData?.entries ?? [])
    .map((entry) => renderEntryCached(entry))
    .filter(Boolean)
    .join('<br/>')

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
                <h2 className="text-xl font-display font-bold">{featName}</h2>
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
                <div className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-sm text-warning">
                  {prerequisiteResult.failures.join(' · ')}
                </div>
              )}
              {description ? (
                <div
                  className="space-y-2 text-sm leading-relaxed [&_li]:my-1 [&_ol]:ml-4 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:ml-4 [&_ul]:list-disc"
                  dangerouslySetInnerHTML={{ __html: description }}
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

export function FeatsPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { feats, spells, classes } = useFilteredGameData()
  const {
    replaceFeatSelections,
    removeFeatChoiceSelection,
    commitFeatWithOptions,
    editFeatWithOptions,
  } = useFeatProvenanceMutations()
  const { ledger, getSourcesRowsBySection } = useProvenanceLedger()
  const [listCollapsed, setListCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [selectedFeatName, setSelectedFeatName] = useState<string | null>(null)
  const [bonusModalOpen, setBonusModalOpen] = useState(false)
  const [featOptionsTarget, setFeatOptionsTarget] = useState<Feat5e | null>(null)
  const [featEditCandidate, setFeatEditCandidate] = useState<{
    feat5e: Feat5e
    priorOptions: FeatOptionSelections
  } | null>(null)
  const [featEditTarget, setFeatEditTarget] = useState<{
    feat5e: Feat5e
    priorOptions: FeatOptionSelections
  } | null>(null)
  const classLookup = useClassLookup()

  const handleSelectFeat = useCallback((featName: string) => {
    setSelectedFeatName(featName)
    setDetailCollapsed(false)
  }, [])

  // ASI calculations for the warning banner (multiclass-aware)
  const classProgression = useMemo(() => getCharacterClassEntries(character), [character])
  const fallbackClassByName = useMemo(
    () => new Map((classes as Class5e[]).map((cls) => [cls.name, cls])),
    [classes],
  )
  const totalFeatSlots = useMemo(
    () => countTotalFeatSlots({ classProgression, character, classLookup, fallbackClassByName }),
    [classProgression, character, classLookup, fallbackClassByName],
  )
  const usedASI = character?.feats?.length ?? 0
  const remainingASI = totalFeatSlots - usedASI

  const profileSpells = useMemo(
    () =>
      character
        ? collectKnownSpells(ensureSpellProfiles(character))
        : { cantrips: [], spellsKnown: [], preparedSpells: [] },
    [character],
  )

  const characterSnapshot = useMemo<PrereqCharacterSnapshot>(
    () => ({
      level: getTotalCharacterLevel(character),
      class: character?.class ?? '',
      race: character?.race ?? '',
      abilityScores: character?.abilityScores ?? {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      features: character?.features ?? [],
      spells: {
        cantrips: profileSpells.cantrips,
        spellsKnown: profileSpells.spellsKnown,
        preparedSpells: profileSpells.preparedSpells,
      },
    }),
    [character, profileSpells],
  )

  // Feat choices from provenance and partitioned by source type and selection status
  const {
    resolvedOriginChoices,
    resolvedRacialChoices,
    pendingOriginChoices,
    pendingRacialChoices,
  } = useMemo(() => {
    const origin = ledger.choices.filter(
      (c) => c.domain === 'feats' && c.sourceTag.sourceType === 'background',
    )
    const racial = ledger.choices.filter(
      (c) =>
        c.domain === 'feats' &&
        (c.sourceTag.sourceType === 'race' || c.sourceTag.sourceType === 'subrace'),
    )
    return {
      resolvedOriginChoices: origin.filter((c) => c.selected.length > 0),
      resolvedRacialChoices: racial.filter((c) => c.selected.length > 0),
      pendingOriginChoices: origin.filter((c) => c.selected.length === 0),
      pendingRacialChoices: racial.filter((c) => c.selected.length === 0),
    }
  }, [ledger.choices])

  // Fixed grants with sourceType info
  const fixedGrantedFeats = useMemo(() => {
    return Object.entries(ledger.feats)
      .filter(([, tags]) => tags.some((t) => t.grantType === 'fixed'))
      .map(([name, tags]) => {
        const tag = tags.find((t) => t.grantType === 'fixed')
        if (!tag) return null
        const data = (feats as Feat5e[]).find((f) => f.name.toLowerCase() === name.toLowerCase())
        return {
          name: data?.name ?? name,
          source: data?.source ?? tag.sourceRef ?? '',
          sourceType: tag.sourceType,
          sourceLabel: `${tag.sourceType}: ${tag.sourceName}`,
          featData: data,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [ledger.feats, feats])

  // Split fixed grants by source type — one pass over the same array
  const { originFixedFeats, racialFixedFeats } = useMemo(
    () => ({
      originFixedFeats: fixedGrantedFeats.filter((f) => f.sourceType === 'background'),
      racialFixedFeats: fixedGrantedFeats.filter(
        (f) => f.sourceType === 'race' || f.sourceType === 'subrace',
      ),
    }),
    [fixedGrantedFeats],
  )

  const hasCharacterSection =
    (character?.feats?.length ?? 0) > 0 ||
    racialFixedFeats.length > 0 ||
    resolvedRacialChoices.length > 0 ||
    originFixedFeats.length > 0 ||
    resolvedOriginChoices.length > 0
  const characterFeatCount =
    (character?.feats?.length ?? 0) +
    racialFixedFeats.length +
    resolvedRacialChoices.reduce((sum, c) => sum + c.selected.length, 0) +
    originFixedFeats.length +
    resolvedOriginChoices.reduce((sum, c) => sum + c.selected.length, 0)

  // Bonus feats — DM-granted, stored in specialFeats, no selection limit
  const bonusFeats = character?.specialFeats ?? []
  const bonusInitialSelectedIds = useMemo(
    () => (character?.specialFeats ?? []).map((f) => `${f.name}|${f.source ?? ''}`),
    [character?.specialFeats],
  )

  const handleRemoveFeat = useCallback(
    (featName: string) => {
      if (!character) return
      const remaining = (character.feats ?? [])
        .filter((f) => f.name !== featName)
        .map((f) => ({ name: f.name, source: f.source }) as Feat5e)
      replaceFeatSelections(remaining)
      if (selectedFeatName === featName) setSelectedFeatName(null)
    },
    [character, replaceFeatSelections, selectedFeatName],
  )

  const handleRemoveGrantedChoice = useCallback(
    (choiceId: string, featName: string) => {
      removeFeatChoiceSelection(choiceId, featName)
      if (selectedFeatName === featName) setSelectedFeatName(null)
    },
    [removeFeatChoiceSelection, selectedFeatName],
  )

  const handleBonusModalConfirm = useCallback(
    (selectedFeats: Feat5e[]) => {
      if (!character) return
      updateCharacter(character.id, {
        specialFeats: selectedFeats.map((f) => {
          const existing = (character.specialFeats ?? []).find(
            (sf) => sf.name === f.name && sf.source === (f.source ?? ''),
          )
          return (
            existing ?? {
              id: `bonus-${f.name}-${f.source ?? ''}`,
              name: f.name,
              source: f.source ?? '',
              description: '',
            }
          )
        }),
      })
    },
    [character, updateCharacter],
  )

  const handleRemoveBonusFeat = useCallback(
    (featName: string) => {
      if (!character) return
      updateCharacter(character.id, {
        specialFeats: (character.specialFeats ?? []).filter((f) => f.name !== featName),
      })
      if (selectedFeatName === featName) setSelectedFeatName(null)
    },
    [character, selectedFeatName, updateCharacter],
  )

  // Open the options wizard for a feat that needs setup
  const handleCompleteSetup = useCallback(
    (featName: string) => {
      const feat5e = (feats as Feat5e[]).find((f) => f.name === featName)
      if (feat5e) setFeatOptionsTarget(feat5e)
    },
    [feats],
  )

  const handleFeatOptionsFinish = useCallback(
    (selections: FeatOptionSelections) => {
      if (!featOptionsTarget) return
      commitFeatWithOptions(featOptionsTarget, selections, spells as Spell5e[])
      setFeatOptionsTarget(null)
    },
    [featOptionsTarget, commitFeatWithOptions, spells],
  )

  // Open edit confirmation for a feat that already has options
  const handleEditSetup = useCallback(
    (featName: string) => {
      const feat5e = (feats as Feat5e[]).find((f) => f.name === featName)
      const existing = (character?.feats ?? []).find((f) => f.name === featName)
      if (feat5e && existing?.options) {
        setFeatEditCandidate({ feat5e, priorOptions: existing.options })
      }
    },
    [feats, character?.feats],
  )

  const handleEditConfirm = useCallback(() => {
    if (!featEditCandidate) return
    setFeatEditTarget(featEditCandidate)
    setFeatEditCandidate(null)
  }, [featEditCandidate])

  const handleEditFinish = useCallback(
    (selections: FeatOptionSelections) => {
      if (!featEditTarget) return
      editFeatWithOptions(
        featEditTarget.feat5e,
        featEditTarget.priorOptions,
        selections,
        spells as Spell5e[],
      )
      setFeatEditTarget(null)
    },
    [featEditTarget, editFeatWithOptions, spells],
  )

  // Feats with option-requiring data but no selections yet
  const pendingOptionFeatNames = useMemo(() => {
    return new Set(
      (character?.feats ?? [])
        .filter((f) => {
          if (f.options) return false
          const data = (feats as Feat5e[]).find((fd) => fd.name === f.name)
          return data ? hasFeatOptions(data) : false
        })
        .map((f) => f.name),
    )
  }, [character?.feats, feats])

  const proficientSkillNames = character?.proficiencies?.skills ?? EMPTY_STRINGS

  const [showSetupHint, setShowSetupHint] = useState(() => !isHintDismissed(FEATS_SETUP_HINT_ID))
  const hintPosition = useAnchoredHintPosition({
    enabled: showSetupHint && pendingOptionFeatNames.size > 0,
    selector: FEATS_SETUP_BTN_SELECTOR,
    width: FEATS_HINT_WIDTH,
  })

  const handleDismissSetupHint = () => {
    setShowSetupHint(false)
    setHintDismissed(FEATS_SETUP_HINT_ID, true)
  }

  if (!character) {
    return <NoCharCard icon={<Star weight="duotone" />} noun="manage feats" />
  }

  const pendingOptionCount = pendingOptionFeatNames.size
  const hasPendingWarnings =
    remainingASI > 0 ||
    pendingRacialChoices.length > 0 ||
    pendingOriginChoices.length > 0 ||
    pendingOptionCount > 0
  const activeFeatName = selectedFeatName
  const activeFeatData = (feats as Feat5e[]).find((feat) => feat.name === activeFeatName)
  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="flex overflow-hidden rounded-lg border border-border bg-background">
        <SplitPane
          className="my-0 h-full"
          leftClassName="bg-background"
          rightClassName="border-l-2 border-border bg-sidebar/50"
          leftCollapsed={listCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setListCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader title="Feats">
                <span className="ml-auto text-xs text-muted-foreground">
                  {characterFeatCount + bonusFeats.length} selected
                </span>
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
                  {showSetupHint && hintPosition ? (
                    <div
                      className="pointer-events-none fixed z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300"
                      style={{ top: hintPosition.top, left: hintPosition.left }}
                    >
                      <div className="pointer-events-auto animate-hint-bounce relative w-[300px] rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20">
                        <div
                          className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-accent/50 bg-accent"
                          style={{ left: hintPosition.arrowLeft - 7 }}
                        />
                        <button
                          type="button"
                          className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white"
                          onClick={handleDismissSetupHint}
                          aria-label="Dismiss hint"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <p className="leading-snug text-accent-foreground/95 pr-8">
                          Some feats need extra setup — like choosing a cantrip, skill, or spell.
                          Click <strong>Complete Setup</strong> to finish configuring this feat.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {/* Pending choice warnings */}
                  {hasPendingWarnings && (
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

                  <section className="w-full overflow-hidden rounded-md border border-border">
                    <div className="flex h-10 items-center justify-between border-b border-border bg-sidebar/50 px-4">
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
                    <div>
                      {hasCharacterSection ? (
                        <div className="space-y-3 p-3">
                          {(character.feats ?? []).map((feat) => {
                            const featData = (feats as Feat5e[]).find((f) => f.name === feat.name)
                            const isPending = pendingOptionFeatNames.has(feat.name)
                            const isConfigured = !isPending && !!feat.options
                            return (
                              <FeatDetailCard
                                key={feat.id}
                                feat={feat}
                                featData={featData}
                                characterSnapshot={characterSnapshot}
                                selected={activeFeatName === feat.name}
                                onSelect={handleSelectFeat}
                                onRemove={handleRemoveFeat}
                                onCompleteSetup={isPending ? handleCompleteSetup : undefined}
                                onEditSetup={isConfigured ? handleEditSetup : undefined}
                                optionsPending={isPending}
                                optionsConfigured={isConfigured}
                              />
                            )
                          })}
                          {racialFixedFeats.map((granted) => (
                            <FeatDetailCard
                              key={`fixed-${granted.name}|${granted.source}`}
                              feat={{
                                id: `fixed-${granted.name}`,
                                name: granted.name,
                                source: granted.source,
                              }}
                              featData={granted.featData}
                              characterSnapshot={characterSnapshot}
                              selected={activeFeatName === granted.name}
                              onSelect={handleSelectFeat}
                              grantedBy={granted.sourceLabel}
                            />
                          ))}
                          {resolvedRacialChoices.flatMap((choice) =>
                            choice.selected.map((selectedName) => {
                              const data = (feats as Feat5e[]).find(
                                (f) => f.name.toLowerCase() === selectedName.toLowerCase(),
                              )
                              return (
                                <FeatDetailCard
                                  key={`choice-${choice.id}-${selectedName}`}
                                  feat={{
                                    id: `choice-${choice.id}-${selectedName}`,
                                    name: data?.name ?? selectedName,
                                    source: data?.source ?? '',
                                  }}
                                  featData={data}
                                  characterSnapshot={characterSnapshot}
                                  selected={activeFeatName === selectedName}
                                  onSelect={handleSelectFeat}
                                  grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                                  onRemove={() =>
                                    handleRemoveGrantedChoice(choice.id, selectedName)
                                  }
                                />
                              )
                            }),
                          )}
                          {originFixedFeats.map((granted) => (
                            <FeatDetailCard
                              key={`fixed-${granted.name}|${granted.source}`}
                              feat={{
                                id: `fixed-${granted.name}`,
                                name: granted.name,
                                source: granted.source,
                              }}
                              featData={granted.featData}
                              characterSnapshot={characterSnapshot}
                              selected={activeFeatName === granted.name}
                              onSelect={handleSelectFeat}
                              grantedBy={granted.sourceLabel}
                              isOrigin
                            />
                          ))}
                          {resolvedOriginChoices.flatMap((choice) =>
                            choice.selected.map((selectedName) => {
                              const data = (feats as Feat5e[]).find(
                                (f) => f.name.toLowerCase() === selectedName.toLowerCase(),
                              )
                              return (
                                <FeatDetailCard
                                  key={`choice-${choice.id}-${selectedName}`}
                                  feat={{
                                    id: `choice-${choice.id}-${selectedName}`,
                                    name: data?.name ?? selectedName,
                                    source: data?.source ?? '',
                                  }}
                                  featData={data}
                                  characterSnapshot={characterSnapshot}
                                  selected={activeFeatName === selectedName}
                                  onSelect={handleSelectFeat}
                                  grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                                  onRemove={() =>
                                    handleRemoveGrantedChoice(choice.id, selectedName)
                                  }
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

                  <section className="w-full overflow-hidden rounded-md border border-border">
                    <div className="flex h-10 items-center justify-between border-b border-border bg-sidebar/50 px-4">
                      <div className="flex items-center gap-2">
                        <Lightning className="h-4 w-4 text-primary" weight="duotone" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          Bonus Feats
                        </span>
                      </div>
                      <Badge variant="outline" className="text-xs h-5 px-2">
                        {bonusFeats.length} total
                      </Badge>
                    </div>
                    <div className="space-y-3 p-3">
                      {bonusFeats.map((feat) => {
                        const featData = (feats as Feat5e[]).find((f) => f.name === feat.name)
                        return (
                          <FeatDetailCard
                            key={feat.id}
                            feat={feat}
                            featData={featData}
                            characterSnapshot={characterSnapshot}
                            selected={activeFeatName === feat.name}
                            onSelect={handleSelectFeat}
                            onRemove={handleRemoveBonusFeat}
                            isBonus
                          />
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => setBonusModalOpen(true)}
                        className="group flex min-h-24 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background px-5 py-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                          <Plus className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-base font-semibold">Add Bonus Feat</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            Optional feats that do not use normal feat slots.
                          </span>
                        </span>
                      </button>
                    </div>
                  </section>
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
        allowIgnoreLimit={false}
      />

      {/* Feat options wizard — opened via "Complete Setup" on a pending feat */}
      {featOptionsTarget && (
        <FeatOptionsModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setFeatOptionsTarget(null)
          }}
          feat={featOptionsTarget}
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
          proficientSkillNames={proficientSkillNames}
          initialSelections={featEditTarget.priorOptions}
          onFinish={handleEditFinish}
          onDismiss={() => setFeatEditTarget(null)}
        />
      )}
    </WorkspacePage>
  )
}
