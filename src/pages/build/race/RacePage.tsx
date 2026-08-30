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
import type { ActiveFilters } from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MasterDetail,
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
import { normalizeRaceSelectionForOriginSystem } from '@/lib/calculations/originSystem'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
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
import { collectKnownSpells, ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { getTotalCharacterLevel, matchesGameDataEntry } from '@/lib/characterUtils'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import type { Feat5e, Race5e, Spell5e } from '@/types/5etools'

export function BuildRacePage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const reconcileCharacter = useCharacterStore((s) => s.reconcileCharacter)
  const { races, feats, spells } = useFilteredGameData()
  const { applyRaceSelection, applySubraceChange } = useRaceProvenanceMutations()
  const { resolveFeatChoiceSelection, commitFeatWithOptions } = useFeatProvenanceMutations()
  const { ledger } = useProvenanceLedger()
  const [raceSearch, setRaceSearch] = useState('')
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
        reconcileCharacter(char.id, { subrace: undefined, subraceSource: undefined })
        applySubraceChange(race, undefined)
      }
      return
    }

    if (hasSelectedSubraceRef.current) return

    const firstSubrace = currentSubraces[0]
    if (!firstSubrace) return

    reconcileCharacter(char.id, {
      subrace: firstSubrace.name,
      subraceSource: firstSubrace.source ?? undefined,
    })
    applySubraceChange(race, firstSubrace)
  }, [selectedRaceKey, applySubraceChange, reconcileCharacter])

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

  const featModalFeats = useMemo(() => {
    if (!activeFeatChoice) return []
    const pool = activeFeatChoice.optionPool
    if (pool.length === 0) return feats as Feat5e[]
    const categoryPrefixes = pool.filter((p) => p.startsWith('category:'))
    if (categoryPrefixes.length > 0) {
      const allowedCategories = new Set(categoryPrefixes.map((p) => p.replace('category:', '')))
      return (feats as Feat5e[]).filter((f) => f.category && allowedCategories.has(f.category))
    }
    const poolLower = new Set(pool.map((p) => p.toLowerCase()))
    return (feats as Feat5e[]).filter((f) => poolLower.has(f.name.toLowerCase()))
  }, [activeFeatChoice, feats])

  const featModalInitialFilters = useMemo<ActiveFilters | undefined>(() => {
    if (!activeFeatChoice) return undefined
    const cats = activeFeatChoice.optionPool
      .filter((p) => p.startsWith('category:'))
      .map((p) => p.replace('category:', ''))
    if (cats.length > 0) return { featCategory: new Set(cats) }
    return undefined
  }, [activeFeatChoice])

  const profileSpells = character
    ? collectKnownSpells(ensureSpellProfiles(character))
    : { cantrips: [], spellsKnown: [], preparedSpells: [] }

  const characterSnapshot: PrereqCharacterSnapshot = {
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
  }

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

  if (!character) {
    return <NoCharCard icon={<PersonSimple weight="duotone" />} noun="choose a race" />
  }

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="overflow-hidden rounded-lg border border-border bg-background">
        <MasterDetail
          masterWidth="var(--workspace-master-width)"
          masterClassName="border-r-2 border-border bg-sidebar/70"
          detailClassName="bg-background"
          master={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader ariaLabel="Available races">
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
                          isSelected ? 'bg-secondary text-foreground' : 'hover:bg-secondary/45',
                        )}
                      >
                        {isSelected && (
                          <span className="absolute inset-y-1.5 left-0 w-0.5 bg-primary" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const firstSubrace = namedSubraces[0]
                            updateCharacter(character.id, {
                              race: race.name,
                              raceSource: race.source ?? undefined,
                              subrace: firstSubrace?.name,
                              subraceSource: firstSubrace?.source ?? undefined,
                              raceAsiChoices: [],
                              raceAsiBlockIndex: 0,
                            })
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

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isSelected && hasSubraces ? (
                            <Select
                              value={
                                character.subrace
                                  ? `${character.subrace}|${character.subraceSource ?? ''}`
                                  : ''
                              }
                              onValueChange={(v) => {
                                const [subraceNameOrFull, ...sourceParts] = v.split('|')
                                const subraceSource =
                                  sourceParts.length > 0 ? sourceParts.join('|') : undefined
                                const subraceNameFromKey = subraceNameOrFull
                                const sr = namedSubraces.find(
                                  (s) =>
                                    s.name === subraceNameFromKey &&
                                    (subraceSource ?? '') === (s.source ?? ''),
                                )
                                updateCharacter(character.id, {
                                  subrace: subraceNameFromKey,
                                  subraceSource: subraceSource ?? undefined,
                                  raceAsiChoices: [],
                                })
                                applySubraceChange(race, sr)
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs min-w-[120px] max-w-[180px]">
                                <SelectValue placeholder="Subrace…" />
                              </SelectTrigger>
                              <SelectContent>
                                {namedSubraces.map((sr) => (
                                  <SelectItem
                                    key={`${sr.name}|${sr.source ?? ''}`}
                                    value={`${sr.name}|${sr.source ?? ''}`}
                                    className="text-xs"
                                  >
                                    {sr.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <>
                              {hasSubraces && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                  {namedSubraces.length} subraces
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {race.source}
                              </Badge>
                            </>
                          )}
                        </div>
                        {isSelected &&
                          (() => {
                            const raceChoices = racialFeatChoices.filter(
                              (c) =>
                                c.sourceTag.sourceName === race.name ||
                                c.sourceTag.sourceName === character.subrace,
                            )
                            if (raceChoices.length === 0) return null
                            return raceChoices.map((choice) => {
                              const isResolved = choice.selected.length > 0
                              const poolLabel = choice.optionPool
                                .filter((p) => p.startsWith('category:'))
                                .map((p) => featCategoryToFull(p.replace('category:', '')))
                                .join(', ')
                              const resolvedFeat = isResolved
                                ? (feats as Feat5e[]).find(
                                    (f) =>
                                      f.name.toLowerCase() === choice.selected[0].toLowerCase(),
                                  )
                                : undefined
                              return (
                                <div
                                  key={choice.id}
                                  className="flex items-center gap-1.5 flex-shrink-0"
                                >
                                  {isResolved ? (
                                    <>
                                      <Badge
                                        variant="outline"
                                        className="text-xs px-1.5 py-0 h-5 text-success border-success/50 gap-1"
                                      >
                                        <Check className="h-2.5 w-2.5" />
                                        {resolvedFeat?.name ?? choice.selected[0]}
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-xs px-1.5"
                                        onClick={() => handleOpenFeatModal(choice.id)}
                                      >
                                        Change
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs gap-1"
                                      onClick={() => handleOpenFeatModal(choice.id)}
                                    >
                                      <Star className="h-3 w-3" weight="duotone" />
                                      {poolLabel ? `Choose ${poolLabel} Feat` : 'Choose Feat'}
                                    </Button>
                                  )}
                                </div>
                              )
                            })
                          })()}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          }
          detail={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader title="Race details">
                <div className="ml-auto flex min-w-0 items-center gap-2">
                  {displayRace ? (
                    <>
                      <span className="truncate text-sm font-semibold leading-tight">
                        {displayRace.name}
                      </span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {displayRace.source}
                      </Badge>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Select a race…</span>
                  )}
                </div>
              </WorkspacePaneHeader>
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
                                  className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
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
                        .filter((e) => typeof e === 'string')
                        .map((e) => (
                          <div
                            key={e as string}
                            className="text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1"
                            dangerouslySetInnerHTML={{
                              __html: renderEntry(e),
                            }}
                          />
                        ))}
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
