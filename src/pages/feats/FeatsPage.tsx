import { CaretDown, Check, Sparkle, Star, Trash } from '@phosphor-icons/react'
import { memo, useCallback, useMemo, useState } from 'react'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import type { ActiveFilters } from '@/components/modals/SelectionModal'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClass } from '@/hooks/data/useGameData'
import { featCategoryToFull, isNormallySelectableFeat } from '@/lib/5etools/classData'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { collectKnownSpells, ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import { buildFeatModalFeats, partitionSelectedFeats } from '@/pages/feats/model/selection'
import { useCharacterStore } from '@/store/characterStore'
import type { Feat5e, Raw5ePrereq } from '@/types/5etools'
import { NoCharCard } from '../_shared'

interface FeatDetailCardProps {
  feat: { id: string; name: string; source: string }
  featData: Feat5e | undefined
  characterSnapshot: PrereqCharacterSnapshot
  onRemove?: (name: string) => void
  isSpecial?: boolean
  /** Shows a "Granted by …" badge instead of the remove button. */
  grantedBy?: string
}

const FeatDetailCard = memo(function FeatDetailCard({
  feat,
  featData,
  characterSnapshot,
  onRemove,
  isSpecial,
  grantedBy,
}: FeatDetailCardProps) {
  const [expanded, setExpanded] = useState(false)
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

  const allEntries = featData?.entries ?? []
  const visibleEntries = expanded ? allEntries : allEntries.slice(0, 2)
  const descHtml = useMemo(
    () =>
      visibleEntries
        .map((e) => renderEntryCached(e))
        .filter(Boolean)
        .join('<br/>'),
    // `renderEntryCached` is a stable shared utility; include only entry visibility changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleEntries],
  )
  const hasMore = allEntries.length > 2

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-accent/30">
      <div className="flex items-start gap-3 p-4">
        <Star className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" weight="duotone" />
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-sm">{feat.name}</span>
            {feat.source && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
                {feat.source}
              </Badge>
            )}
            {categoryLabel && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-muted-foreground">
                {categoryLabel}
              </Badge>
            )}
            {isSpecial && (
              <Badge className="text-xs px-1.5 py-0 h-5 bg-warning/20 text-warning border border-warning/40">
                Special
              </Badge>
            )}
            {grantedBy && (
              <Badge className="text-xs px-1.5 py-0 h-5 bg-accent/20 text-accent border border-accent/40">
                <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="duotone" />
                {grantedBy}
              </Badge>
            )}
            {met ? (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0 h-5 text-success border-success/50"
              >
                <Check className="h-2.5 w-2.5 mr-0.5" />
                Prereqs met
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0 h-5 text-warning border-warning/50"
              >
                Prereqs unmet
              </Badge>
            )}
          </div>

          {/* Prereq failure detail */}
          {!met && failures.length > 0 && (
            <p className="text-xs text-warning/80 mb-1.5">{failures.join(' · ')}</p>
          )}

          {/* Description */}
          {descHtml ? (
            <div
              className="text-xs text-muted-foreground leading-relaxed"
              // renderEntry outputs safe HTML from structured 5etools entries.
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: descHtml }}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">No description available.</p>
          )}

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              <CaretDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
            onClick={() => onRemove(feat.name)}
            title="Remove feat"
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
})

export function FeatsPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { feats } = useFilteredGameData()
  const {
    replaceFeatSelections,
    resolveFeatChoiceSelection,
    removeFeatChoiceSelection,
    getSourcesRowsBySection,
    ledger,
  } = useProvenance()
  const [modalOpen, setModalOpen] = useState(false)
  const [grantedModalOpen, setGrantedModalOpen] = useState(false)
  const [activeChoiceId, setActiveChoiceId] = useState<string | null>(null)

  const primaryClassData = useClass(character?.class ?? '', character?.classSource)
  const asiLevels = getASILevelsFromClass(primaryClassData)
  const earnedASILevels = asiLevels.filter((l) => l <= (character?.level ?? 0))
  const appliedAsiCount = (character?.asiChoices ?? []).filter((ac) =>
    earnedASILevels.includes(ac.level),
  ).length
  const totalASI = earnedASILevels.length - appliedAsiCount
  const usedASI = character?.feats?.length ?? 0
  const specialFeatCount = character?.specialFeats?.length ?? 0
  const remainingASI = totalASI - usedASI
  const profileSpells = character
    ? collectKnownSpells(ensureSpellProfiles(character))
    : { cantrips: [], spellsKnown: [], preparedSpells: [] }

  const characterSnapshot: PrereqCharacterSnapshot = {
    level: character?.level ?? 0,
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
  }

  const modalFeats = useMemo(() => {
    const available = (feats as Feat5e[]).filter(isNormallySelectableFeat)
    return buildFeatModalFeats({
      availableFeats: available,
      selectedFeats: character?.feats ?? [],
      selectedSpecialFeats: character?.specialFeats ?? [],
    })
  }, [feats, character?.feats, character?.specialFeats])

  // Granted feats from race/background provenance
  const featChoices = useMemo(
    () => ledger.choices.filter((c) => c.domain === 'feats'),
    [ledger.choices],
  )

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
          sourceLabel: `${tag.sourceType}: ${tag.sourceName}`,
          featData: data,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [ledger.feats, feats])

  const activeChoice = useMemo(
    () => featChoices.find((c) => c.id === activeChoiceId),
    [featChoices, activeChoiceId],
  )

  const grantedModalFeats = useMemo(() => {
    if (!activeChoice) return []
    const pool = activeChoice.optionPool
    if (pool.length === 0) return feats as Feat5e[]
    const categoryPrefixes = pool.filter((p) => p.startsWith('category:'))
    if (categoryPrefixes.length > 0) {
      const allowedCategories = new Set(categoryPrefixes.map((p) => p.replace('category:', '')))
      return (feats as Feat5e[]).filter((f) => f.category && allowedCategories.has(f.category))
    }
    // Specific feat names in pool
    const poolLower = new Set(pool.map((p) => p.toLowerCase()))
    return (feats as Feat5e[]).filter((f) => poolLower.has(f.name.toLowerCase()))
  }, [activeChoice, feats])

  const grantedModalInitialFilters = useMemo<ActiveFilters | undefined>(() => {
    if (!activeChoice) return undefined
    const cats = activeChoice.optionPool
      .filter((p) => p.startsWith('category:'))
      .map((p) => p.replace('category:', ''))
    if (cats.length > 0) return { featCategory: new Set(cats) }
    return undefined
  }, [activeChoice])

  const handleOpenGrantedModal = useCallback((choiceId: string) => {
    setActiveChoiceId(choiceId)
    setGrantedModalOpen(true)
  }, [])

  const handleGrantedModalConfirm = useCallback(
    (selectedFeats: Feat5e[]) => {
      if (!activeChoiceId || selectedFeats.length === 0) return
      const feat = selectedFeats[0]
      resolveFeatChoiceSelection(activeChoiceId, { name: feat.name, source: feat.source })
      setGrantedModalOpen(false)
      setActiveChoiceId(null)
    },
    [activeChoiceId, resolveFeatChoiceSelection],
  )

  const handleRemoveGrantedChoice = useCallback(
    (choiceId: string, featName: string) => {
      removeFeatChoiceSelection(choiceId, featName)
    },
    [removeFeatChoiceSelection],
  )

  const hasGrantedFeats = fixedGrantedFeats.length > 0 || featChoices.length > 0

  // Both normal and special feats are pre-selected when the modal opens.
  const initialSelectedIds = [
    ...(character?.feats ?? []).map((f) => `${f.name}|${f.source ?? ''}`),
    ...(character?.specialFeats ?? []).map((f) => `${f.name}|${f.source ?? ''}`),
  ]
  const initialSpecialIds = (character?.specialFeats ?? []).map(
    (f) => `${f.name}|${f.source ?? ''}`,
  )

  const handleModalConfirm = useCallback(
    (selectedFeats: Feat5e[]) => {
      if (!character) return
      const { normalFeats, specialFeats } = partitionSelectedFeats({
        selectedFeats,
        existingNormalFeats: character.feats ?? [],
        existingSpecialFeats: character.specialFeats ?? [],
        totalNormalSlots: totalASI,
      })

      replaceFeatSelections(normalFeats)
      updateCharacter(character.id, {
        specialFeats: specialFeats.map((f) => {
          const existing = (character.specialFeats ?? []).find(
            (sf) => sf.name === f.name && sf.source === (f.source ?? ''),
          )
          return (
            existing ?? {
              id: `special-${f.name}-${f.source ?? ''}`,
              name: f.name,
              source: f.source ?? '',
              description: '',
            }
          )
        }),
      })
    },
    [character, totalASI, replaceFeatSelections, updateCharacter],
  )

  const handleRemoveFeat = useCallback(
    (featName: string) => {
      if (!character) return
      const remaining = (character.feats ?? [])
        .filter((f) => f.name !== featName)
        .map((f) => ({ name: f.name, source: f.source }) as Feat5e)
      replaceFeatSelections(remaining)
    },
    [character, replaceFeatSelections],
  )

  const handleRemoveSpecialFeat = useCallback(
    (featName: string) => {
      if (!character) return
      updateCharacter(character.id, {
        specialFeats: (character.specialFeats ?? []).filter((f) => f.name !== featName),
      })
    },
    [character, updateCharacter],
  )

  if (!character) {
    return <NoCharCard icon={<Star weight="duotone" />} noun="manage feats" />
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-4xl font-bold flex items-center gap-3">
          <Star className="h-8 w-8 text-accent" weight="duotone" />
          Feats
        </h1>
        <Button onClick={() => setModalOpen(true)} className="gap-2">
          <Star className="h-4 w-4" weight="duotone" />
          {usedASI > 0 || specialFeatCount > 0 ? 'Edit Feats' : 'Choose Feats'}
        </Button>
      </div>
      <Card className="w-full">
        <CardContent className="pt-6">
          {/* Stat tiles */}
          <div className="flex items-center gap-8 flex-wrap mb-5">
            <div className="text-center">
              <div className="text-3xl font-bold font-mono text-accent">{totalASI}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                Total Slots
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold font-mono">{usedASI}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                Feats Taken
              </div>
            </div>
            <div className="text-center">
              <div
                className={cn(
                  'text-3xl font-bold font-mono',
                  remainingASI > 0
                    ? 'text-success'
                    : remainingASI < 0
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                )}
              >
                {remainingASI}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
                Remaining
              </div>
            </div>
          </div>

          {/* ASI level slot grid */}
          {earnedASILevels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {earnedASILevels.map((level, i) => {
                const feat = (character.feats ?? [])[i]
                return (
                  <div
                    key={level}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm',
                      feat
                        ? 'border-accent/40 bg-accent/10'
                        : 'border-border bg-muted/30 text-muted-foreground',
                    )}
                  >
                    <span className="text-xs font-mono text-muted-foreground">Lv {level}</span>
                    {feat ? (
                      <>
                        <Check className="h-3 w-3 text-accent flex-shrink-0" />
                        <span className="font-medium text-xs">{feat.name}</span>
                      </>
                    ) : (
                      <span className="text-xs italic">Open</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {character?.class
                ? `No ASI slots unlocked yet at level ${character?.level}.`
                : 'Select a class to see your ASI schedule.'}
            </p>
          )}
          {usedASI + specialFeatCount > 0 ? (
            <div className="mt-6 pt-5 border-t border-border space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Selected Feats
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(character.feats ?? []).map((feat) => {
                  const featData = (feats as Feat5e[]).find((f) => f.name === feat.name)
                  return (
                    <FeatDetailCard
                      key={feat.id}
                      feat={feat}
                      featData={featData}
                      characterSnapshot={characterSnapshot}
                      onRemove={handleRemoveFeat}
                    />
                  )
                })}
                {(character.specialFeats ?? []).map((feat) => {
                  const featData = (feats as Feat5e[]).find((f) => f.name === feat.name)
                  return (
                    <FeatDetailCard
                      key={feat.id}
                      feat={feat}
                      featData={featData}
                      characterSnapshot={characterSnapshot}
                      onRemove={handleRemoveSpecialFeat}
                      isSpecial
                    />
                  )
                })}
              </div>
            </div>
          ) : earnedASILevels.length > 0 ? (
            <div className="mt-6 pt-5 border-t border-border flex flex-col items-center gap-3 py-6 text-center">
              <Star className="h-10 w-10 text-muted-foreground/30" weight="duotone" />
              <p className="text-muted-foreground">No feats chosen yet.</p>
              <p className="text-sm text-muted-foreground/70">
                You have {remainingASI} feat slot{remainingASI !== 1 ? 's' : ''} available.
              </p>
              <Button onClick={() => setModalOpen(true)} className="mt-1">
                Choose Feats
              </Button>
            </div>
          ) : null}
        </CardContent>

        {/* Sources accordion — tracks provenance of normal feats only */}
        {(character.feats?.length ?? 0) > 0 && (
          <div className="px-6 pb-3 border-t border-border">
            <SourcesAccordion
              sectionId="feats"
              rows={getSourcesRowsBySection('feats')}
              emptyText="Add feats to see their source attribution."
            />
          </div>
        )}
      </Card>

      {/* Granted Feats — from race/background provenance */}
      {hasGrantedFeats && (
        <Card className="w-full">
          <CardContent className="pt-6">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-4">
              <Sparkle className="h-3.5 w-3.5 text-accent" weight="duotone" />
              Granted Feats
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Fixed grants (e.g. "Feat X" given by race/bg) */}
              {fixedGrantedFeats.map((granted) => (
                <FeatDetailCard
                  key={`fixed-${granted.name}|${granted.source}`}
                  feat={{ id: `fixed-${granted.name}`, name: granted.name, source: granted.source }}
                  featData={granted.featData}
                  characterSnapshot={characterSnapshot}
                  grantedBy={granted.sourceLabel}
                />
              ))}

              {/* Choice-based grants (pending and resolved) */}
              {featChoices.map((choice) => {
                if (choice.selected.length > 0) {
                  // Resolved — show the selected feat with a change option
                  return choice.selected.map((selectedName) => {
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
                        grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                        onRemove={() => handleRemoveGrantedChoice(choice.id, selectedName)}
                      />
                    )
                  })
                }
                // Pending — show placeholder with choose button
                const poolLabel = choice.optionPool
                  .filter((p) => p.startsWith('category:'))
                  .map((p) => featCategoryToFull(p.replace('category:', '')))
                  .join(', ')
                return (
                  <div
                    key={`pending-${choice.id}`}
                    className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4 flex items-center gap-3"
                  >
                    <Sparkle className="h-4 w-4 text-accent flex-shrink-0" weight="duotone" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Choose {poolLabel || 'a'} Feat</p>
                      <p className="text-xs text-muted-foreground">
                        Granted by {choice.sourceTag.sourceType}: {choice.sourceTag.sourceName}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenGrantedModal(choice.id)}
                    >
                      Choose
                    </Button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <FeatSelectionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        feats={modalFeats}
        maxSelections={totalASI}
        initialSelectedIds={initialSelectedIds}
        initialSpecialIds={initialSpecialIds}
        characterSnapshot={characterSnapshot}
        onConfirm={handleModalConfirm}
      />

      {/* Granted feat choice modal */}
      <FeatSelectionModal
        open={grantedModalOpen}
        onOpenChange={(open) => {
          setGrantedModalOpen(open)
          if (!open) setActiveChoiceId(null)
        }}
        feats={grantedModalFeats}
        maxSelections={1}
        characterSnapshot={characterSnapshot}
        onConfirm={handleGrantedModalConfirm}
        initialFilters={grantedModalInitialFilters}
        allowIgnoreLimit={false}
      />
    </div>
  )
}
