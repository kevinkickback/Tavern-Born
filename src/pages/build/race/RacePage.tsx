import {
  ArrowsOutCardinal,
  CaretLeft,
  CaretRight,
  Check,
  Eye,
  Lightning,
  PersonSimple,
  Sparkle,
  Star,
} from '@phosphor-icons/react'
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
import { NoCharCard } from '@/pages/_shared'
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
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <PersonSimple className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Race</h1>
              <p className="text-sm text-muted-foreground">
                Choose your character's ancestry and traits
              </p>
            </div>
          </div>
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
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 border-b border-border px-4 py-3 flex flex-col gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
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
                            'w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors border-l-4',
                            isSelected
                              ? 'bg-accent/10 border-accent'
                              : 'border-transparent hover:bg-muted/40',
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
                            className="flex items-center gap-3 min-w-0 flex-1 text-left"
                          >
                            <div
                              className={cn(
                                'h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold shadow-sm select-none',
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

              <div
                className={cn(
                  'flex flex-col overflow-hidden border-l border-border bg-muted/30 transition-all duration-300 ease-in-out',
                  detailCollapsed
                    ? 'w-0 min-w-0 opacity-0 pointer-events-none'
                    : 'w-1/2 min-w-[320px]',
                )}
              >
                <div className="bg-gradient-to-r from-accent/10 to-transparent border-b border-border px-4 py-3 flex flex-col gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Details
                  </span>
                  <div className="flex items-center gap-2 min-h-8">
                    {displayRace ? (
                      <>
                        <span className="text-sm font-bold font-display leading-tight">
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
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    {displayRace ? (
                      <div className="space-y-5">
                        {/* Stat tiles — material statistics-card style */}
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            {
                              icon: <Sparkle className="h-5 w-5 text-white" weight="fill" />,
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
                                <ArrowsOutCardinal className="h-5 w-5 text-white" weight="fill" />
                              ),
                              label: 'Size',
                              value: displayRace.size?.join(', ') ?? '—',
                            },
                            {
                              icon: <Lightning className="h-5 w-5 text-white" weight="fill" />,
                              label: 'Speed',
                              value: getSpeedDisplay(displayRace),
                            },
                            {
                              icon: <Eye className="h-5 w-5 text-white" weight="fill" />,
                              label: 'Darkvision',
                              value: getDarkvisionDisplay(displayRace),
                            },
                          ].map(({ icon, label, value }) => (
                            <div key={label} className="border border-border shadow-sm rounded-xl">
                              <div className="flex items-center justify-between p-3.5">
                                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 shadow-md flex items-center justify-center flex-shrink-0">
                                  {icon}
                                </div>
                                <div className="text-right min-w-0">
                                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                    {label}
                                  </p>
                                  <p className="text-sm font-bold mt-0.5 font-mono truncate">
                                    {value}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Key-value rows — profile-info-card style */}
                        <div className="rounded-xl border border-border shadow-sm overflow-hidden">
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
                                i < arr.length - 1 && 'border-b border-border/50',
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
                          <div>
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 border-l-2 border-accent pl-2">
                              Traits
                            </h4>
                            <div className="space-y-2">
                              {getRaceTraits(displayRace).map((trait) => (
                                <div
                                  key={`${trait.name}|${trait.entries?.length ?? 0}`}
                                  className="border border-border/60 shadow-sm rounded-lg p-3"
                                >
                                  <div className="font-semibold text-sm mb-1.5">{trait.name}</div>
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
