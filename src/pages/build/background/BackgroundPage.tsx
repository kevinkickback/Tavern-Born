import { CaretLeft, CaretRight, Scroll, Star } from '@phosphor-icons/react'
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
import {
  formatEquipmentOptionEntries,
  resolveBackgroundEquipmentBlocks,
} from '@/lib/5etools/startingEquipment'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  getBackgroundAbilityData,
} from '@/lib/calculations/abilityScores'
import { normalizeBackgroundForOriginSystem } from '@/lib/calculations/originSystem'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
import { collectKnownSpells, ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { BuildBackgroundDetailsPanel } from '@/pages/build/background/components/DetailsPanel'
import {
  getBackgroundLanguageNames,
  getBackgroundSkillNames,
  getBackgroundToolNames,
} from '@/pages/build/background/model/data'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Feat5e } from '@/types/5etools'

export function BuildBackgroundPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { backgrounds, feats } = useFilteredGameData()
  const itemLookup = useGameDataStore((s) => s.itemLookup)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [bgSearch, setBgSearch] = useState('')
  const {
    applyBackgroundSelection,
    applyBackgroundAbilityChoices,
    resolveFeatChoiceSelection,
    ledger,
  } = useProvenance()
  const selectedBackgroundRef = useRef<HTMLDivElement | null>(null)
  const [featModalOpen, setFeatModalOpen] = useState(false)
  const [activeFeatChoiceId, setActiveFeatChoiceId] = useState<string | null>(null)
  const isInitialLoadRef = useRef(true)
  const previousSearchRef = useRef('')

  const filteredBackgrounds = useMemo(() => {
    const q = bgSearch.trim().toLowerCase()
    if (!q) return backgrounds
    return backgrounds.filter((b) => b.name.toLowerCase().includes(q))
  }, [backgrounds, bgSearch])

  useEffect(() => {
    // Only scroll on initial mount or when search changes, not on selection change
    const isSearchChanged = previousSearchRef.current !== bgSearch
    const shouldScroll = isInitialLoadRef.current || isSearchChanged

    if (shouldScroll && selectedBackgroundRef.current) {
      selectedBackgroundRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'start',
        inline: 'nearest',
      })
    }

    isInitialLoadRef.current = false
    previousSearchRef.current = bgSearch
  }, [bgSearch])

  const selectedBg = character
    ? (backgrounds.find((b) =>
        matchesGameDataEntry(character.background, character.backgroundSource, b),
      ) as Background5e | undefined)
    : undefined
  const normalizedSelectedBg = normalizeBackgroundForOriginSystem(
    selectedBg,
    character?.originSystem ?? '2014',
  )
  const selectedBackgroundKey = selectedBg ? `${selectedBg.name}|${selectedBg.source ?? ''}` : null

  const equipmentBlocks = useMemo(
    () => resolveBackgroundEquipmentBlocks(selectedBg?.startingEquipment, itemLookup),
    [selectedBg?.startingEquipment, itemLookup],
  )
  const choiceBlocks = equipmentBlocks.filter((b) => !b.isFixed)
  const optionCountByBackground = useMemo(() => {
    const counts = new Map<string, number>()
    for (const bg of backgrounds) {
      const key = `${bg.name}|${bg.source ?? ''}`
      const count = resolveBackgroundEquipmentBlocks(bg.startingEquipment, itemLookup).reduce(
        (total, block) => total + block.choiceKeys.length,
        0,
      )
      counts.set(key, count)
    }
    return counts
  }, [backgrounds, itemLookup])

  // Origin feat choices from provenance
  const originFeatChoices = useMemo(
    () =>
      ledger.choices.filter((c) => c.domain === 'feats' && c.sourceTag.sourceType === 'background'),
    [ledger.choices],
  )

  // Fixed feats granted directly by the selected background (no player choice)
  const fixedBgFeats = useMemo(() => {
    if (!selectedBg) return []
    return Object.entries(ledger.feats)
      .filter(([, tags]) =>
        tags.some((t) => t.sourceType === 'background' && t.grantType === 'fixed'),
      )
      .map(([name]) => name)
  }, [selectedBg, ledger.feats])

  const activeFeatChoice = useMemo(
    () => originFeatChoices.find((c) => c.id === activeFeatChoiceId),
    [originFeatChoices, activeFeatChoiceId],
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

  const bgAsiData = getBackgroundAbilityData(normalizedSelectedBg)

  if (!character) {
    return <NoCharCard icon={<Scroll weight="duotone" />} noun="choose a background" />
  }

  const handleBackground = (name: string, bgSource?: string) => {
    const bg = backgrounds.find((b) => matchesGameDataEntry(name, bgSource, b)) as
      | Background5e
      | undefined
    if (!bg) return
    applyBackgroundSelection(bg)
    updateCharacter(character.id, {
      background: name,
      backgroundSource: bgSource ?? undefined,
      backgroundEquipmentChoices: [],
    })
    if (detailCollapsed) setDetailCollapsed(false)
  }

  const skills = getBackgroundSkillNames(selectedBg)
  const langs = getBackgroundLanguageNames(selectedBg)
  const tools = getBackgroundToolNames(selectedBg)
  const bgBlockIndex = character.backgroundAsiBlockIndex ?? 0
  const bgChoices = character.backgroundAsiChoices ?? []
  const bgEquipmentChoices = character.backgroundEquipmentChoices ?? []
  const showBackgroundAsiPanel = character.originSystem === '2024'
  const showBackgroundAsiCard = !!selectedBg && bgAsiData.blocks.length > 0

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex items-center gap-3">
            <Scroll className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Background</h1>
              <p className="text-sm text-muted-foreground">
                Your character's origin, skills, and starting equipment
              </p>
            </div>
          </div>
          {showBackgroundAsiPanel ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4 flex items-start gap-6">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Ability Score Improvements
                </div>
                {showBackgroundAsiCard ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {bgAsiData.blocks.length > 1 && (
                      <div className="inline-flex shrink-0 rounded-md border border-border overflow-hidden text-xs h-8">
                        <button
                          type="button"
                          onClick={() => applyBackgroundAbilityChoices(selectedBg, 0, [])}
                          className={cn(
                            'px-3 h-full transition-colors',
                            bgBlockIndex === 0
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-card hover:bg-muted',
                          )}
                        >
                          +2 / +1
                        </button>
                        <button
                          type="button"
                          onClick={() => applyBackgroundAbilityChoices(selectedBg, 1, [])}
                          className={cn(
                            'px-3 h-full border-l border-border transition-colors',
                            bgBlockIndex === 1
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-card hover:bg-muted',
                          )}
                        >
                          +1 / +1 / +1
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const block = bgAsiData.blocks[bgBlockIndex] ?? bgAsiData.blocks[0]
                        const slotLabels = ['first', 'second', 'third']
                        const slots = block.weights.map((weight, i) => ({
                          weight,
                          key: slotLabels[i] ?? `slot${i + 1}`,
                          index: i,
                        }))
                        return slots.map(({ weight, key, index: slotIndex }) => {
                          const currentChoice =
                            (bgChoices[slotIndex] as AbilityName | undefined) ?? ''
                          return (
                            <div key={key} className="flex items-center gap-2 h-8 w-44">
                              <span className="text-xs font-semibold text-primary w-6 text-right shrink-0">
                                +{weight}
                              </span>
                              <Select
                                value={currentChoice}
                                onValueChange={(val) => {
                                  const newChoices = Array.from<string>({
                                    length: block.weights.length,
                                  }).map((_, i) => bgChoices[i] ?? '')
                                  newChoices[slotIndex] = val
                                  applyBackgroundAbilityChoices(
                                    selectedBg,
                                    bgBlockIndex,
                                    newChoices,
                                  )
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs flex-1 bg-background">
                                  <SelectValue placeholder="Choose ability…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {block.from.map((ability) => (
                                    <SelectItem
                                      key={ability}
                                      value={ability}
                                      disabled={
                                        bgChoices.includes(ability) && currentChoice !== ability
                                      }
                                    >
                                      {ABILITY_ABBREVIATIONS[ability]} -{' '}
                                      {ability.charAt(0).toUpperCase() + ability.slice(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Select a background to assign origin ability scores here.
                  </div>
                )}
              </div>

              <div className="self-stretch w-px bg-border shrink-0" />

              <div className="shrink-0 min-w-[200px]">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Origin Feat
                </div>
                {fixedBgFeats.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {fixedBgFeats.map((name) => (
                      <Badge
                        key={name}
                        variant="outline"
                        className="text-xs gap-1 opacity-70 w-fit"
                      >
                        <Star className="h-3 w-3" weight="duotone" />
                        {name}
                      </Badge>
                    ))}
                    <p className="text-xs text-muted-foreground mt-0.5">Provided by background</p>
                  </div>
                ) : originFeatChoices.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {originFeatChoices.map((choice) => {
                      const isResolved = choice.selected.length > 0
                      const poolLabel = choice.optionPool
                        .filter((p) => p.startsWith('category:'))
                        .map((p) => featCategoryToFull(p.replace('category:', '')))
                        .join(', ')
                      const resolvedFeat = isResolved
                        ? (feats as Feat5e[]).find(
                            (f) => f.name.toLowerCase() === choice.selected[0].toLowerCase(),
                          )
                        : undefined
                      return (
                        <div key={choice.id}>
                          {isResolved ? (
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-xs gap-1 opacity-70 w-fit">
                                <Star className="h-3 w-3" weight="duotone" />
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
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1.5"
                              onClick={() => handleOpenFeatModal(choice.id)}
                            >
                              <Star className="h-3 w-3" weight="duotone" />
                              {poolLabel ? `Choose ${poolLabel} Feat` : 'Choose Origin Feat'}
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Select a background to assign origin feat here.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <div className="relative flex flex-row flex-1 overflow-hidden min-h-0 -my-6">
              {' '}
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
              </button>{' '}
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="bg-gradient-to-r from-accent/20 to-accent/10 border-b border-border px-4 py-3 flex flex-col gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Backgrounds ({filteredBackgrounds.length}
                    {bgSearch ? ` of ${backgrounds.length}` : ''})
                  </span>
                  <Input
                    placeholder="Search backgrounds…"
                    value={bgSearch}
                    onChange={(e) => setBgSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 space-y-1 pr-8">
                    {filteredBackgrounds.map((bg) => {
                      const bgKey = `${bg.name}|${bg.source ?? ''}`
                      const isSelected = selectedBackgroundKey === bgKey
                      const rowChoiceBlocks = isSelected ? choiceBlocks : []
                      const bgOptionCount = optionCountByBackground.get(bgKey) ?? 0
                      return (
                        <div
                          key={bgKey}
                          ref={isSelected ? selectedBackgroundRef : null}
                          className={cn(
                            'w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors border-l-4',
                            isSelected
                              ? 'bg-accent/10 border-accent'
                              : 'border-transparent hover:bg-muted/40',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleBackground(bg.name, bg.source ?? undefined)}
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
                              {bg.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{bg.name}</div>
                              <div className="text-xs text-muted-foreground">{bg.source}</div>
                            </div>
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isSelected && rowChoiceBlocks.length > 0 ? (
                              <div className="flex flex-col gap-1.5">
                                {rowChoiceBlocks.map((block) => {
                                  const currentChoice =
                                    bgEquipmentChoices[block.index]?.toLowerCase() ??
                                    block.choiceKeys[0] ??
                                    'a'
                                  return (
                                    <Select
                                      key={block.index}
                                      value={currentChoice}
                                      onValueChange={(val) => {
                                        if (!selectedBg) return
                                        const next = [...bgEquipmentChoices]
                                        while (next.length <= block.index) next.push('a')
                                        next[block.index] = val
                                        applyBackgroundSelection(selectedBg, next)
                                        updateCharacter(character.id, {
                                          backgroundEquipmentChoices: next,
                                        })
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-xs max-w-[260px]">
                                        <SelectValue placeholder={`Choice ${block.index + 1}…`} />
                                      </SelectTrigger>
                                      <SelectContent className="w-[420px]" align="end">
                                        {block.choiceKeys.map((key) => {
                                          const optionData = block.options[key]
                                          const label =
                                            formatEquipmentOptionEntries(optionData).join(', ')
                                          return (
                                            <SelectItem key={key} value={key} className="text-xs">
                                              ({key.toUpperCase()}) {label}
                                            </SelectItem>
                                          )
                                        })}
                                      </SelectContent>
                                    </Select>
                                  )
                                })}
                              </div>
                            ) : (
                              <>
                                {bgOptionCount > 0 && (
                                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                    {bgOptionCount} item option{bgOptionCount === 1 ? '' : 's'}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {bg.source}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>{' '}
              <BuildBackgroundDetailsPanel
                detailCollapsed={detailCollapsed}
                selectedBackground={selectedBg}
                skillNames={skills}
                languageNames={langs}
                toolNames={tools}
              />
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
