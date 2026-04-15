import { CaretDown, Plus, Sparkle, Star, Trash, WarningCircle } from '@phosphor-icons/react'
import { memo, useCallback, useMemo, useState } from 'react'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { featCategoryToFull } from '@/lib/5etools/classData'
import {
  checkAllPrerequisites,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { collectKnownSpells, ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { renderEntryCached } from '@/lib/entryRenderCache'
import { cn } from '@/lib/utils'
import { countTotalFeatSlots } from '@/pages/build/class/model/pageUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Feat5e, Raw5ePrereq } from '@/types/5etools'
import { NoCharCard } from '../_shared'

interface FeatDetailCardProps {
  feat: { id: string; name: string; source: string }
  featData: Feat5e | undefined
  characterSnapshot: PrereqCharacterSnapshot
  onRemove?: (name: string) => void
  isBonus?: boolean
  isOrigin?: boolean
  /** Shows a "Granted by …" badge instead of the remove button. */
  grantedBy?: string
}

const FeatDetailCard = memo(function FeatDetailCard({
  feat,
  featData,
  characterSnapshot,
  onRemove,
  isBonus,
  isOrigin,
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

  const originLabel: string | null = isOrigin
    ? grantedBy
      ? `Origin: ${grantedBy.split(': ').slice(1).join(': ') || grantedBy}`
      : 'Origin Feat'
    : null

  const grantLabel: string | null = !isOrigin && grantedBy ? grantedBy : null

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
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-colors hover:border-accent/30 max-w-sm">
      <div className="flex items-start gap-3 p-4">
        <Star className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" weight="duotone" />
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
            {isBonus && (
              <Badge className="text-xs px-1.5 py-0 h-5 bg-warning/20 text-warning border border-warning/40">
                Bonus
              </Badge>
            )}
            {originLabel && (
              <Badge className="text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary border border-primary/30">
                <Sparkle className="h-2.5 w-2.5 mr-0.5" weight="duotone" />
                {originLabel}
              </Badge>
            )}
            {grantLabel && (
              <Badge className="text-xs px-1.5 py-0 h-5 bg-accent/20 text-accent-foreground border border-accent/40">
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
              className="flex items-center gap-1 mt-1.5 text-xs text-accent-foreground hover:text-accent-foreground/80 transition-colors"
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
  const { feats, classes } = useFilteredGameData()
  const { replaceFeatSelections, removeFeatChoiceSelection, ledger } = useProvenance()
  const [bonusModalOpen, setBonusModalOpen] = useState(false)
  const classLookup = useClassLookup()

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

  // Split fixed grants by source type
  const originFixedFeats = useMemo(
    () => fixedGrantedFeats.filter((f) => f.sourceType === 'background'),
    [fixedGrantedFeats],
  )
  const racialFixedFeats = useMemo(
    () => fixedGrantedFeats.filter((f) => f.sourceType === 'race' || f.sourceType === 'subrace'),
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
    () => bonusFeats.map((f) => `${f.name}|${f.source ?? ''}`),
    [bonusFeats],
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

  const handleRemoveGrantedChoice = useCallback(
    (choiceId: string, featName: string) => {
      removeFeatChoiceSelection(choiceId, featName)
    },
    [removeFeatChoiceSelection],
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
    },
    [character, updateCharacter],
  )

  if (!character) {
    return <NoCharCard icon={<Star weight="duotone" />} noun="manage feats" />
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="font-display text-4xl font-bold flex items-center gap-3">
          <Star className="h-8 w-8 text-accent" weight="duotone" />
          Feats
        </h1>
      </div>

      <Card className="w-full">
        <CardContent className="pt-6">
          <Accordion
            type="multiple"
            defaultValue={['character-feats', 'bonus-feats']}
            className="space-y-4"
          >
            {/* Character Feats accordion */}
            <AccordionItem value="character-feats" className="-mx-6 -mt-6 border-b-0">
              <AccordionTrigger className="px-6 py-2.5 bg-muted/30 rounded-none hover:no-underline">
                <div className="flex items-center gap-2 text-left w-full min-w-0">
                  <span className="font-medium text-sm">Character Feats</span>
                  <div className="ml-auto flex items-center gap-2 pr-1">
                    {remainingASI > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-xs border-warning/40 bg-warning/10 text-warning"
                          >
                            <WarningCircle className="h-3.5 w-3.5 mr-1" weight="fill" />
                            {remainingASI} potential feat{remainingASI !== 1 ? 's' : ''}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                          <p>
                            You have {remainingASI} Ability Score Improvement
                            {remainingASI !== 1 ? 's' : ''} available from level-up.
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Each ASI can be used for a feat instead of a stat increase. Visit the
                            Class page to make your choice.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {pendingRacialChoices.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-xs border-warning/40 bg-warning/10 text-warning"
                          >
                            <WarningCircle className="h-3.5 w-3.5 mr-1" weight="fill" />
                            {pendingRacialChoices.length} potential racial feat
                            {pendingRacialChoices.length !== 1 ? 's' : ''}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                          <p>
                            You have {pendingRacialChoices.length} feat choice
                            {pendingRacialChoices.length !== 1 ? 's' : ''} from your race.
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Visit the Race page to select{' '}
                            {pendingRacialChoices.length !== 1 ? 'them' : 'it'}.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {pendingOriginChoices.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="text-xs border-warning/40 bg-warning/10 text-warning"
                          >
                            <WarningCircle className="h-3.5 w-3.5 mr-1" weight="fill" />
                            {pendingOriginChoices.length} potential origin feat
                            {pendingOriginChoices.length !== 1 ? 's' : ''}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                          <p>
                            You have {pendingOriginChoices.length} feat choice
                            {pendingOriginChoices.length !== 1 ? 's' : ''} from your background.
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Visit the Background page to select{' '}
                            {pendingOriginChoices.length !== 1 ? 'them' : 'it'}.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Total: {characterFeatCount}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                {hasCharacterSection ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-3.5">
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
                            grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                            onRemove={() => handleRemoveGrantedChoice(choice.id, selectedName)}
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
                            grantedBy={`${choice.sourceTag.sourceType}: ${choice.sourceTag.sourceName}`}
                            onRemove={() => handleRemoveGrantedChoice(choice.id, selectedName)}
                            isOrigin
                          />
                        )
                      }),
                    )}
                  </div>
                ) : (
                  <div className="px-6 pb-3.5">
                    <div className="min-h-52 flex flex-col items-center justify-center text-center p-6">
                      <Star className="h-6 w-6 text-muted-foreground mb-2" weight="duotone" />
                      <h3 className="text-sm font-semibold">No Character Feats</h3>
                      <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                        Feats are gained from class ASI selections, your race, or background.
                      </p>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Bonus Feats accordion */}
            <AccordionItem
              value="bonus-feats"
              className="-mx-6 -mb-6 border-b-0 data-[state=closed]:pb-6"
            >
              <AccordionTrigger className="px-6 py-2.5 bg-muted/30 rounded-none hover:no-underline">
                <div className="flex items-center gap-2 text-left w-full min-w-0">
                  <span className="font-medium text-sm">Bonus Feats</span>
                  <div className="ml-auto flex items-center gap-2 pr-1">
                    <Badge variant="outline" className="text-xs">
                      Total: {bonusFeats.length}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-1">
                {bonusFeats.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 py-3.5">
                    {bonusFeats.map((feat) => {
                      const featData = (feats as Feat5e[]).find((f) => f.name === feat.name)
                      return (
                        <FeatDetailCard
                          key={feat.id}
                          feat={feat}
                          featData={featData}
                          characterSnapshot={characterSnapshot}
                          onRemove={handleRemoveBonusFeat}
                          isBonus
                        />
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setBonusModalOpen(true)}
                      className="rounded-xl border border-dashed border-border bg-card p-4 min-h-40 flex flex-col items-center justify-center text-center transition-colors hover:border-accent/40 hover:bg-muted/20"
                    >
                      <Plus className="h-5 w-5 text-primary mb-2" />
                      <span className="text-sm font-semibold">Add Bonus Feat</span>
                      <span className="mt-1 text-xs text-muted-foreground max-w-xs">
                        Bonus feats are optional and don&apos;t use your normal feat slots.
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="pb-3.5">
                    <div className="min-h-52 flex flex-col items-center justify-center text-center p-6">
                      <Sparkle className="h-6 w-6 text-muted-foreground mb-2" weight="duotone" />
                      <h3 className="text-sm font-semibold">No Bonus Feats Selected</h3>
                      <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                        Bonus feats are optional and don&apos;t use your normal feat slots.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 mt-4"
                        onClick={() => setBonusModalOpen(true)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Feat
                      </Button>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Bonus feat modal  no selection limit */}
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
    </div>
  )
}
