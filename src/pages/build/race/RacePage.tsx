import { CaretLeft, CaretRight, Check, PersonSimple, Star } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import type { ActiveFilters } from '@/components/modals/SelectionModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { featCategoryToFull } from '@/lib/5etools/classData'
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
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { renderEntry } from '@/lib/renderer'
import { cn } from '@/lib/utils'
import { InfoTile, NoCharCard } from '@/pages/_shared'
import { useCharacterStore } from '@/store/characterStore'
import type { Feat5e, Race5e } from '@/types/5etools'

export function BuildRacePage() {
  const character = useCharacterStore((s) => {
    if (s.activeCharacter) return s.activeCharacter
    if (!s.activeCharacterId) return null
    return s.characters.find((c) => c.id === s.activeCharacterId) ?? null
  })
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { races, feats } = useFilteredGameData()
  const { applyRaceSelection, applySubraceChange, resolveFeatChoiceSelection, ledger } =
    useProvenance()
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [raceSearch, setRaceSearch] = useState('')
  const [featModalOpen, setFeatModalOpen] = useState(false)
  const [activeFeatChoiceId, setActiveFeatChoiceId] = useState<string | null>(null)
  const selectedRaceRef = useRef<HTMLDivElement | null>(null)
  const isInitialLoadRef = useRef(true)
  const previousSearchRef = useRef('')

  const filteredRaces = useMemo(() => {
    const q = raceSearch.trim().toLowerCase()
    if (!q) return races
    return races.filter((r) => r.name.toLowerCase().includes(q))
  }, [races, raceSearch])

  useEffect(() => {
    // Only scroll on initial mount or when search changes, not on selection change
    const isSearchChanged = previousSearchRef.current !== raceSearch
    const shouldScroll = isInitialLoadRef.current || isSearchChanged

    if (shouldScroll && selectedRaceRef.current) {
      selectedRaceRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'start',
        inline: 'nearest',
      })
    }

    isInitialLoadRef.current = false
    previousSearchRef.current = raceSearch
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

  useEffect(() => {
    if (!character) return
    if (!selectedRace) return

    if (subraces.length === 0) {
      if (character.subrace || character.subraceSource) {
        updateCharacter(character.id, {
          subrace: undefined,
          subraceSource: undefined,
        })
        applySubraceChange(selectedRace, undefined)
      }
      return
    }

    if (selectedSubrace) return

    const firstSubrace = subraces[0]
    if (!firstSubrace) return

    updateCharacter(character.id, {
      subrace: firstSubrace.name,
      subraceSource: firstSubrace.source ?? undefined,
    })
    applySubraceChange(selectedRace, firstSubrace)
  }, [applySubraceChange, character, selectedRace, selectedSubrace, subraces, updateCharacter])

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
    },
    [activeFeatChoiceId, resolveFeatChoiceSelection],
  )

  if (!character) {
    return <NoCharCard icon={<PersonSimple weight="duotone" />} noun="choose a race" />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <PersonSimple className="h-6 w-6 text-primary" weight="duotone" />
            Race
          </h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
              <button
                type="button"
                onClick={() => setDetailCollapsed((c) => !c)}
                title={detailCollapsed ? 'Expand details panel' : 'Collapse details panel'}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-md hover:bg-accent/80 transition-all"
              >
                {detailCollapsed ? (
                  <CaretLeft className="h-3.5 w-3.5" />
                ) : (
                  <CaretRight className="h-3.5 w-3.5" />
                )}
              </button>

              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col gap-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Races ({filteredRaces.length}
                    {raceSearch ? ` of ${races.length}` : ''})
                  </span>
                  <Input
                    placeholder="Search races…"
                    value={raceSearch}
                    onChange={(e) => setRaceSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 space-y-1 pr-8">
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
                            'w-full p-3 rounded-lg border transition-colors hover:border-accent flex items-center justify-between gap-2',
                            isSelected ? 'border-accent bg-accent/10' : 'border-border bg-card',
                          )}
                        >
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
                              if (detailCollapsed) setDetailCollapsed(false)
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <div
                              className={cn(
                                'h-3.5 w-3.5 rounded-full border-2 flex-shrink-0',
                                isSelected
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground',
                              )}
                            />
                            <span className="font-medium text-sm truncate">{race.name}</span>
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

              <div
                className={cn(
                  'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                  detailCollapsed
                    ? 'w-0 min-w-0 opacity-0 pointer-events-none'
                    : 'w-1/2 min-w-[320px]',
                )}
              >
                <div className="p-4 border-b border-border">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Details
                  </span>
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    {displayRace ? (
                      <div className="space-y-4">
                        <div>
                          <h2 className="text-2xl font-display font-bold">{displayRace.name}</h2>
                          <Badge variant="outline" className="mt-2">
                            {displayRace.source}
                          </Badge>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-4 gap-3">
                          <InfoTile title="Ability Bonuses">
                            {getAsiDisplay(
                              displayRace,
                              (character.raceAsiBlockIndex ?? 0) as 0 | 1,
                              character.raceAsiChoices,
                            ).length > 0 ? (
                              getAsiDisplay(
                                displayRace,
                                (character.raceAsiBlockIndex ?? 0) as 0 | 1,
                                character.raceAsiChoices,
                              ).map((t) => (
                                <div key={t} className="text-sm font-mono">
                                  {t}
                                </div>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </InfoTile>
                          <InfoTile title="Size">
                            <span className="text-sm font-mono">
                              {displayRace.size?.join(', ') ?? '—'}
                            </span>
                          </InfoTile>
                          <InfoTile title="Speed">
                            <span className="text-sm font-mono">
                              {getSpeedDisplay(displayRace)}
                            </span>
                          </InfoTile>
                          <InfoTile title="Darkvision">
                            <span className="text-sm font-mono">
                              {getDarkvisionDisplay(displayRace)}
                            </span>
                          </InfoTile>
                        </div>

                        <InfoTile title="Languages">
                          <span className="text-sm">{getLanguageDisplay(displayRace) || '—'}</span>
                        </InfoTile>

                        <div className="grid grid-cols-3 gap-3">
                          <InfoTile title="Damage Resistances">
                            <span className="text-sm">
                              {getDamageTraitDisplay(displayRace.resist)}
                            </span>
                          </InfoTile>
                          <InfoTile title="Damage Immunities">
                            <span className="text-sm">
                              {getDamageTraitDisplay(displayRace.immune)}
                            </span>
                          </InfoTile>
                          <InfoTile title="Condition Immunities">
                            <span className="text-sm">
                              {getDamageTraitDisplay(displayRace.conditionImmune)}
                            </span>
                          </InfoTile>
                        </div>

                        {getRaceTraits(displayRace).length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold text-accent-foreground uppercase tracking-wider mb-3">
                              Traits
                            </h4>
                            <div className="space-y-3">
                              {getRaceTraits(displayRace).map((trait) => (
                                <div key={`${trait.name}|${trait.entries?.length ?? 0}`}>
                                  <div className="font-semibold text-sm mb-1">{trait.name}</div>
                                  <div
                                    className="text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:ml-4 [&_li]:my-1 [&_p]:my-1 [&_strong]:font-semibold [&_em]:italic"
                                    dangerouslySetInnerHTML={{
                                      __html: trait.entries.map((e) => renderEntry(e)).join(''),
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
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
                  </div>
                </ScrollArea>
              </div>
            </div>
          </Card>
        </div>
      </div>

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
    </div>
  )
}
