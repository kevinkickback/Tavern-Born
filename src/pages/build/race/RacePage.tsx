import {
  ArrowsOutCardinal,
  Check,
  Eye,
  Lightning,
  PersonSimple,
  Sparkle,
  Star,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  WorkspaceBody,
  WorkspaceDetailContent,
  WorkspacePage,
  WorkspacePaneHeader,
  WorkspacePaneSearch,
} from '@/components/workspace'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { featCategoryToFull } from '@/lib/5etools/classData'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { resolveFeatChoicePool } from '@/lib/calculations/featChoices'
import { normalizeRaceSelectionForOriginSystem } from '@/lib/calculations/originSystem'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import {
  getAsiDisplay,
  getAvailableSubraces,
  getDamageTraitDisplay,
  getDarkvisionDisplay,
  getLanguageDisplay,
  getRaceTraits,
  getSpeedDisplay,
  mergeRaceWithSubrace,
} from '@/lib/calculations/raceUtils'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import type { Feat5e, Race5e, Spell5e } from '@/types/5etools'

export function BuildRacePage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const { races, feats, spells } = useFilteredGameData()
  const { applyRaceSelection, applySubraceChange } = useRaceProvenanceMutations()
  const { resolveFeatChoiceSelection, commitFeatWithOptions } = useFeatProvenanceMutations()
  const { ledger } = useProvenanceLedger()
  const [raceSearch, setRaceSearch] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [featModalOpen, setFeatModalOpen] = useState(false)
  const [activeFeatChoiceId, setActiveFeatChoiceId] = useState<string | null>(null)
  const [optionsPendingFeat, setOptionsPendingFeat] = useState<Feat5e | null>(null)
  const selectedRaceRef = useRef<HTMLDivElement | null>(null)

  const filteredRaces = useMemo(() => {
    const q = raceSearch.trim().toLowerCase()
    if (!q) return races
    return races.filter((r) => r.name.toLowerCase().includes(q))
  }, [races, raceSearch])

  // Scroll to the selected race row on mount and whenever search changes.
  // Does not fire on race selection (raceSearch doesn't change when clicking).
  // biome-ignore lint/correctness/useExhaustiveDependencies: raceSearch is the DOM-update trigger
  useEffect(() => {
    selectedRaceRef.current?.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' })
  }, [raceSearch])

  const selectedRace = races.find((r) =>
    matchesGameDataEntry(character?.race, character?.raceSource, r),
  ) as Race5e | undefined
  const subraces = getAvailableSubraces(selectedRace)
  const selectedSubrace = subraces.find(
    (sr) =>
      sr.name === character?.subrace && (sr.source ?? '') === (character?.subraceSource ?? ''),
  )
  const normalizedSelection = normalizeRaceSelectionForOriginSystem(
    selectedRace,
    selectedSubrace,
    character?.originSystem ?? '2014',
  )
  const displayRace =
    normalizedSelection.race && normalizedSelection.subrace
      ? mergeRaceWithSubrace(normalizedSelection.race, normalizedSelection.subrace)
      : (normalizedSelection.subrace ?? normalizedSelection.race)
  const selectedRaceKey = selectedRace ? `${selectedRace.name}|${selectedRace.source ?? ''}` : null

  // Refs let the effect read the latest values without making them dependencies,
  // so the effect only fires when the selected race changes — not on every character update.
  const characterRef = useRef(character)
  characterRef.current = character
  const currentRaceDataRef = useRef(selectedRace)
  currentRaceDataRef.current = selectedRace
  const currentSubracesRef = useRef(subraces)
  currentSubracesRef.current = subraces
  const hasSelectedSubraceRef = useRef(!!selectedSubrace)
  hasSelectedSubraceRef.current = !!selectedSubrace

  // When the selected race changes, auto-select the first subrace if none is set,
  // or clear a stale subrace if the new race has none.
  useEffect(() => {
    const char = characterRef.current
    const race = currentRaceDataRef.current
    const currentSubraces = currentSubracesRef.current
    // selectedRaceKey being null means no race is selected — nothing to do.
    if (!char || !race || !selectedRaceKey) return

    if (currentSubraces.length === 0) {
      if (char.subrace || char.subraceSource) {
        applySubraceChange(race, undefined)
      }
      return
    }

    if (hasSelectedSubraceRef.current) return

    const firstSubrace = currentSubraces[0]
    if (!firstSubrace) return

    applySubraceChange(race, firstSubrace)
  }, [selectedRaceKey, applySubraceChange])

  // Racial feat choices from provenance
  const racialFeatChoices = useMemo(
    () =>
      ledger.choices.filter(
        (c) =>
          c.domain === 'feats' &&
          (c.sourceTag.sourceType === 'race' || c.sourceTag.sourceType === 'subrace'),
      ),
    [ledger.choices],
  )

  const activeFeatChoice = useMemo(
    () => racialFeatChoices.find((c) => c.id === activeFeatChoiceId),
    [racialFeatChoices, activeFeatChoiceId],
  )

  const { eligibleFeats: featModalFeats, initialFilters: featModalInitialFilters } = useMemo(() => {
    if (!activeFeatChoice) return { eligibleFeats: [], initialFilters: undefined }
    return resolveFeatChoicePool(feats as Feat5e[], activeFeatChoice.optionPool)
  }, [activeFeatChoice, feats])
  const characterSnapshot = buildPrerequisiteSnapshot({ character })

  const handleOpenFeatModal = useCallback((choiceId: string) => {
    setActiveFeatChoiceId(choiceId)
    setFeatModalOpen(true)
  }, [])

  const handleFeatModalConfirm = useCallback(
    (selectedFeats: Feat5e[]) => {
      if (!activeFeatChoiceId || selectedFeats.length === 0) return
      const feat = selectedFeats[0]
      resolveFeatChoiceSelection(activeFeatChoiceId, { name: feat.name, source: feat.source })
      setFeatModalOpen(false)
      setActiveFeatChoiceId(null)
      if (hasFeatOptions(feat)) setOptionsPendingFeat(feat)
    },
    [activeFeatChoiceId, resolveFeatChoiceSelection],
  )

  const selectedRaceFeatChoices = racialFeatChoices.filter(
    (choice) =>
      choice.sourceTag.sourceName === selectedRace?.name ||
      choice.sourceTag.sourceName === character?.subrace,
  )

  if (!character) {
    return <NoCharCard icon={<PersonSimple weight="duotone" />} noun="choose a race" />
  }

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="flex overflow-hidden">
        <SplitPane
          leftWidth="var(--workspace-master-width)"
          leftCollapsed={leftCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setLeftCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          className={cn(
            'my-0 h-full overflow-visible',
            !leftCollapsed && !detailCollapsed && 'gap-3',
          )}
          leftClassName={cn(
            'rounded-lg bg-workspace-pane',
            leftCollapsed ? 'border-0' : 'border border-border',
          )}
          rightClassName={cn(
            'rounded-lg bg-workspace-detail',
            detailCollapsed ? 'border-0' : 'border border-border',
          )}
          left={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader
                ariaLabel="Available races"
                className={detailCollapsed ? 'pr-20' : undefined}
              >
                <WorkspacePaneSearch
                  aria-label="Search races"
                  placeholder="Search available races"
                  value={raceSearch}
                  onChange={(event) => setRaceSearch(event.target.value)}
                  containerClassName="min-w-0 flex-1 translate-y-px border-0 bg-transparent p-0"
                />
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {filteredRaces.length} / {races.length}
                </span>
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div>
                  {filteredRaces.map((race) => {
                    const raceKey = `${race.name}|${race.source ?? ''}`
                    const isSelected = selectedRaceKey === raceKey
                    const namedSubraces = getAvailableSubraces(race)
                    const hasSubraces = namedSubraces.length > 0
                    return (
                      <div
                        key={raceKey}
                        ref={isSelected ? selectedRaceRef : null}
                        className={cn(
                          'relative flex w-full items-center gap-3 border-b border-border/70 px-3 py-2.5 transition-colors [scroll-margin-top:8px]',
                          isSelected
                            ? 'bg-surface-selected text-foreground'
                            : 'hover:bg-surface-hover',
                        )}
                      >
                        {isSelected && (
                          <span className="absolute inset-y-1.5 left-0 w-0.5 bg-primary" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const firstSubrace = namedSubraces[0]
                            applyRaceSelection(race, firstSubrace, 0)
                          }}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left"
                        >
                          <div
                            className={cn(
                              'flex size-8 shrink-0 select-none items-center justify-center rounded-md text-xs font-semibold',
                              isSelected
                                ? 'bg-primary/20 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {race.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{race.name}</div>
                            <div className="text-xs text-muted-foreground">{race.source}</div>
                          </div>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          {hasSubraces && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                              {namedSubraces.length} subraces
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {race.source}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          }
          right={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader title="Race details" className="pr-20" />
              {displayRace && (
                <section className="shrink-0 border-b border-border bg-surface-raised/60 px-5 py-4">
                  <div className="mx-auto flex w-full max-w-4xl flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-xl font-semibold leading-tight text-foreground">
                        {selectedRace?.name ?? displayRace.name}
                      </h3>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {selectedRace?.source ?? displayRace.source}
                        </Badge>
                        {character.subrace && (
                          <span className="truncate text-xs text-muted-foreground">
                            {character.subrace}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end justify-end gap-4">
                      {selectedRace && subraces.length > 0 && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Subrace
                          </span>
                          <Select
                            value={
                              character.subrace
                                ? `${character.subrace}|${character.subraceSource ?? ''}`
                                : ''
                            }
                            onValueChange={(value) => {
                              const [subraceName, ...sourceParts] = value.split('|')
                              const subraceSource =
                                sourceParts.length > 0 ? sourceParts.join('|') : undefined
                              const nextSubrace = subraces.find(
                                (candidate) =>
                                  candidate.name === subraceName &&
                                  (candidate.source ?? '') === (subraceSource ?? ''),
                              )
                              applySubraceChange(selectedRace, nextSubrace)
                            }}
                          >
                            <SelectTrigger
                              aria-label="Subrace"
                              className="h-8 min-w-44 max-w-60 bg-background text-xs"
                            >
                              <SelectValue placeholder="Choose a subrace" />
                            </SelectTrigger>
                            <SelectContent>
                              {subraces.map((subrace) => (
                                <SelectItem
                                  key={`${subrace.name}|${subrace.source ?? ''}`}
                                  value={`${subrace.name}|${subrace.source ?? ''}`}
                                  className="text-xs"
                                >
                                  {subrace.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {selectedRaceFeatChoices.map((choice) => {
                        const isResolved = choice.selected.length > 0
                        const poolLabel = choice.optionPool
                          .filter((option) => option.startsWith('category:'))
                          .map((option) => featCategoryToFull(option.replace('category:', '')))
                          .join(', ')
                        const resolvedFeat = isResolved
                          ? (feats as Feat5e[]).find(
                              (feat) =>
                                feat.name.toLowerCase() === choice.selected[0].toLowerCase(),
                            )
                          : undefined

                        return (
                          <div key={choice.id} className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Racial feat
                            </span>
                            <div className="flex items-center gap-2">
                              {isResolved ? (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="h-6 gap-1 border-success/50 px-2 text-xs text-success"
                                  >
                                    <Check className="size-3" />
                                    {resolvedFeat?.name ?? choice.selected[0]}
                                  </Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-xs"
                                    onClick={() => handleOpenFeatModal(choice.id)}
                                  >
                                    Change
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => handleOpenFeatModal(choice.id)}
                                >
                                  <Star className="size-3.5" weight="duotone" />
                                  {poolLabel ? `Choose ${poolLabel} feat` : 'Choose feat'}
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )}
              <ScrollArea className="flex-1 overflow-hidden">
                <WorkspaceDetailContent>
                  {displayRace ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 border-y border-border">
                        {[
                          {
                            icon: <Sparkle className="size-4 text-primary" weight="fill" />,
                            label: 'Ability Bonuses',
                            value: (() => {
                              const asi = getAsiDisplay(
                                displayRace,
                                (character.raceAsiBlockIndex ?? 0) as 0 | 1,
                                character.raceAsiChoices,
                              )
                              return asi.length > 0 ? asi.join(' · ') : '—'
                            })(),
                          },
                          {
                            icon: (
                              <ArrowsOutCardinal className="size-4 text-primary" weight="fill" />
                            ),
                            label: 'Size',
                            value: displayRace.size?.join(', ') ?? '—',
                          },
                          {
                            icon: <Lightning className="size-4 text-primary" weight="fill" />,
                            label: 'Speed',
                            value: getSpeedDisplay(displayRace),
                          },
                          {
                            icon: <Eye className="size-4 text-primary" weight="fill" />,
                            label: 'Darkvision',
                            value: getDarkvisionDisplay(displayRace),
                          },
                        ].map(({ icon, label, value }, index) => (
                          <div
                            key={label}
                            className={cn(
                              'flex min-h-16 items-center gap-3 px-3 py-2.5',
                              index % 2 === 0 && 'border-r border-border',
                              index < 2 && 'border-b border-border',
                            )}
                          >
                            {icon}
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {label}
                              </p>
                              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums">
                                {value}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-y border-border">
                        {[
                          { label: 'Languages', value: getLanguageDisplay(displayRace) || '—' },
                          {
                            label: 'Resistances',
                            value: getDamageTraitDisplay(displayRace.resist),
                          },
                          {
                            label: 'Immunities',
                            value: getDamageTraitDisplay(displayRace.immune),
                          },
                          {
                            label: 'Cond. Immune',
                            value: getDamageTraitDisplay(displayRace.conditionImmune),
                          },
                        ].map(({ label, value }, i, arr) => (
                          <div
                            key={label}
                            className={cn(
                              'flex items-start gap-3 px-4 py-2.5',
                              i < arr.length - 1 && 'border-b border-border/70',
                            )}
                          >
                            <span className="text-xs font-semibold text-foreground min-w-[90px] pt-0.5 shrink-0">
                              {label}
                            </span>
                            <span className="text-xs text-muted-foreground leading-relaxed">
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mx-auto w-full max-w-[72ch] space-y-6">
                        {getRaceTraits(displayRace).length > 0 && (
                          <section>
                            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Traits
                            </h4>
                            <div className="border-t border-border">
                              {getRaceTraits(displayRace).map((trait) => (
                                <div
                                  key={`${trait.name}|${trait.entries?.length ?? 0}`}
                                  className="border-b border-border py-3"
                                >
                                  <div className="mb-1.5 text-sm font-semibold">{trait.name}</div>
                                  <div
                                    className="text-sm leading-relaxed text-muted-foreground [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                                    dangerouslySetInnerHTML={{
                                      __html: trait.entries.map((e) => renderEntry(e)).join(''),
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        {(displayRace.entries ?? [])
                          .filter((entry) => typeof entry === 'string')
                          .map((entry) => (
                            <div
                              key={entry as string}
                              className="text-sm leading-relaxed [&_ul]:ml-4 [&_ul]:list-disc [&_li]:my-1"
                              dangerouslySetInnerHTML={{
                                __html: renderEntry(entry),
                              }}
                            />
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      Select a race to view details
                    </div>
                  )}
                </WorkspaceDetailContent>
              </ScrollArea>
            </div>
          }
        />
      </WorkspaceBody>

      <FeatSelectionModal
        open={featModalOpen}
        onOpenChange={(open) => {
          setFeatModalOpen(open)
          if (!open) setActiveFeatChoiceId(null)
        }}
        feats={featModalFeats}
        maxSelections={1}
        characterSnapshot={characterSnapshot}
        onConfirm={handleFeatModalConfirm}
        initialFilters={featModalInitialFilters}
        allowIgnoreLimit={false}
      />

      {optionsPendingFeat && (
        <FeatOptionsModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOptionsPendingFeat(null)
          }}
          feat={optionsPendingFeat}
          proficientSkillNames={character?.proficiencies?.skills ?? []}
          onFinish={(selections) => {
            commitFeatWithOptions(optionsPendingFeat, selections, spells as Spell5e[])
            setOptionsPendingFeat(null)
          }}
          onDismiss={() => setOptionsPendingFeat(null)}
        />
      )}
    </WorkspacePage>
  )
}
