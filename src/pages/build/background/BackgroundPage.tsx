import { Scroll, Star } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { FeatSelectionModal } from '@/components/modals/FeatSelectionModal'
import type { ActiveFilters } from '@/components/modals/SelectionModal'
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
  WorkspacePage,
  WorkspacePaneHeader,
  WorkspacePaneSearch,
} from '@/components/workspace'
import { useBackgroundProvenanceMutations } from '@/hooks/character/useBackgroundProvenanceMutations'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { featCategoryToFull } from '@/lib/5etools/classData'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
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
import { getTotalCharacterLevel, matchesGameDataEntry } from '@/lib/characterUtils'
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
import type { Background5e, Feat5e, Item5e, Spell5e } from '@/types/5etools'

const EMPTY_ITEM_LOOKUP = new Map<string, Item5e>()

export function BuildBackgroundPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const reconcileCharacter = useCharacterStore((s) => s.reconcileCharacter)
  const { backgrounds, feats, spells } = useFilteredGameData()
  const itemLookup = useGameDataStore((s) => s.gameData?.lookups?.itemLookup) ?? EMPTY_ITEM_LOOKUP
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [bgSearch, setBgSearch] = useState('')
  const { applyBackgroundSelection, applyBackgroundAbilityChoices } =
    useBackgroundProvenanceMutations()
  const { resolveFeatChoiceSelection, commitFeatWithOptions } = useFeatProvenanceMutations()
  const { ledger } = useProvenanceLedger()
  const selectedBackgroundRef = useRef<HTMLDivElement | null>(null)
  const [featModalOpen, setFeatModalOpen] = useState(false)
  const [activeFeatChoiceId, setActiveFeatChoiceId] = useState<string | null>(null)
  const [optionsPendingFeat, setOptionsPendingFeat] = useState<Feat5e | null>(null)
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

  const bgAsiData = getBackgroundAbilityData(normalizedSelectedBg)

  const currentAsiBlock =
    bgAsiData.blocks[character?.backgroundAsiBlockIndex ?? 0] ?? bgAsiData.blocks[0]
  const isXphbAutoAssign =
    selectedBg?.source === 'XPHB' &&
    !!currentAsiBlock &&
    currentAsiBlock.from.length === currentAsiBlock.weights.length

  useEffect(() => {
    if (!isXphbAutoAssign || !character || !selectedBg || !currentAsiBlock) return
    const blockIndex = character.backgroundAsiBlockIndex ?? 0
    const choices = character.backgroundAsiChoices ?? []
    const alreadySet = currentAsiBlock.from.every((a, i) => choices[i] === a)
    if (alreadySet) return
    applyBackgroundAbilityChoices(selectedBg, blockIndex, [...currentAsiBlock.from])
    reconcileCharacter(character.id, {})
  }, [
    isXphbAutoAssign,
    character,
    selectedBg,
    currentAsiBlock,
    applyBackgroundAbilityChoices,
    reconcileCharacter,
  ])

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
  const chosenOriginFeat = originFeatChoices.find((c) => c.selected.length > 0)?.selected[0] ?? null
  const showBackgroundAsiPanel = character.originSystem === '2024'
  const showBackgroundAsiCard = !!selectedBg && bgAsiData.blocks.length > 0

  const backgroundConfigurationPanel = showBackgroundAsiPanel ? (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex items-start gap-6">
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
                    onClick={() => {
                      const block1 = bgAsiData.blocks[1]
                      const autoChoices =
                        selectedBg?.source === 'XPHB' &&
                        block1 &&
                        block1.from.length === block1.weights.length
                          ? [...block1.from]
                          : []
                      applyBackgroundAbilityChoices(selectedBg, 1, autoChoices)
                    }}
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
                    const currentChoice = (bgChoices[slotIndex] as AbilityName | undefined) ?? ''
                    return (
                      <div key={key} className="flex items-center gap-2 h-8 w-44">
                        <span className="text-xs font-semibold text-primary w-6 text-right shrink-0">
                          +{weight}
                        </span>
                        <Select
                          value={currentChoice}
                          disabled={isXphbAutoAssign}
                          onValueChange={(val) => {
                            const newChoices = Array.from<string>({
                              length: block.weights.length,
                            }).map((_, i) => bgChoices[i] ?? '')
                            newChoices[slotIndex] = val
                            applyBackgroundAbilityChoices(selectedBg, bgBlockIndex, newChoices)
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
                                disabled={bgChoices.includes(ability) && currentChoice !== ability}
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
                <Badge key={name} variant="outline" className="text-xs gap-1 opacity-70 w-fit">
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
    </div>
  ) : null

  return (
    <WorkspacePage className="p-3">
      <WorkspaceBody className="flex overflow-hidden">
        <SplitPane
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
          leftCollapsed={leftCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setLeftCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
          leftWidth="var(--workspace-master-width)"
          left={
            <div className="flex h-full min-h-0 flex-col">
              <WorkspacePaneHeader
                ariaLabel="Available backgrounds"
                className={detailCollapsed ? 'pr-20' : undefined}
              >
                <WorkspacePaneSearch
                  aria-label="Search backgrounds"
                  placeholder="Search available backgrounds"
                  value={bgSearch}
                  onChange={(event) => setBgSearch(event.target.value)}
                  containerClassName="min-w-0 flex-1 translate-y-px border-0 bg-transparent p-0"
                />
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {filteredBackgrounds.length} / {backgrounds.length}
                </span>
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div>
                  {filteredBackgrounds.map((bg) => {
                    const bgKey = `${bg.name}|${bg.source ?? ''}`
                    const isSelected = selectedBackgroundKey === bgKey
                    const bgOptionCount = optionCountByBackground.get(bgKey) ?? 0
                    return (
                      <div
                        key={bgKey}
                        ref={isSelected ? selectedBackgroundRef : null}
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
                          onClick={() => handleBackground(bg.name, bg.source ?? undefined)}
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
                            {bg.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{bg.name}</div>
                            <div className="text-xs text-muted-foreground">{bg.source}</div>
                          </div>
                        </button>
                        <div className="flex max-w-[50%] min-w-0 flex-wrap items-center justify-end gap-1">
                          {bgOptionCount > 0 && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                              {bgOptionCount} item option{bgOptionCount === 1 ? '' : 's'}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {bg.source}
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
              <WorkspacePaneHeader title="Background details" className="pr-20" />
              {selectedBg && (
                <section className="max-h-[45%] shrink-0 overflow-auto border-b border-border bg-surface-raised/60 px-5 py-4">
                  <div className="mx-auto w-full max-w-4xl">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-xl font-semibold leading-tight text-foreground">
                        {selectedBg.name}
                      </h3>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {selectedBg.source}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {selectedBg.edition === 'one' ? '2024 rules' : '2014 rules'}
                        </span>
                      </div>
                    </div>

                    {backgroundConfigurationPanel}

                    {choiceBlocks.length > 0 && (
                      <div className="mt-4 border-t border-border pt-3">
                        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Starting Equipment
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {choiceBlocks.map((block) => {
                            const currentChoice =
                              bgEquipmentChoices[block.index]?.toLowerCase() ??
                              block.choiceKeys[0] ??
                              'a'
                            return (
                              <div key={block.index} className="min-w-0 max-w-md flex-1 basis-72">
                                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Equipment choice {block.index + 1}
                                </div>
                                <Select
                                  value={currentChoice}
                                  onValueChange={(value) => {
                                    const next = [...bgEquipmentChoices]
                                    while (next.length <= block.index) next.push('a')
                                    next[block.index] = value
                                    applyBackgroundSelection(selectedBg, next)
                                    updateCharacter(character.id, {
                                      backgroundEquipmentChoices: next,
                                    })
                                  }}
                                >
                                  <SelectTrigger
                                    aria-label={`Equipment choice ${block.index + 1}`}
                                    className="h-8 w-full overflow-hidden bg-background text-xs [&_[data-slot=select-value]]:min-w-0"
                                  >
                                    <SelectValue placeholder={`Choice ${block.index + 1}…`} />
                                  </SelectTrigger>
                                  <SelectContent className="w-max max-w-[min(32rem,var(--radix-select-content-available-width))]">
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
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
              <BuildBackgroundDetailsPanel
                selectedBackground={selectedBg}
                skillNames={skills}
                languageNames={langs}
                toolNames={tools}
                equipmentBlocks={equipmentBlocks}
                bgEquipmentChoices={bgEquipmentChoices}
                fixedBgFeats={fixedBgFeats}
                chosenOriginFeat={chosenOriginFeat}
                bgAsiData={bgAsiData}
                bgBlockIndex={bgBlockIndex}
                bgChoices={bgChoices}
              />
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
