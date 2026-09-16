import { Barbell, Coins, ListNumbers, PencilSimple } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Progress } from '@/components/ui/progress'
import { type CompactPane, SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useAbilityScores } from '@/hooks/character/useAbilityScores'
import { useBackgroundProvenanceMutations } from '@/hooks/character/useBackgroundProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useTotalAbilityScores } from '@/hooks/character/useTotalAbilityScores'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useSkillList, useSkillToAbilityMap } from '@/hooks/data/useGameData'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  hasFlexibleRaceOriginAsi,
} from '@/lib/calculations/abilityScores'
import { POINT_BUY_BUDGET } from '@/lib/calculations/gameRules'
import {
  findFocusedProvenanceChoice,
  getReadinessFocus,
  isBaseAbilityScoreReadinessFocus,
  isRaceAbilityChoiceReadinessFocus,
} from '@/lib/navigation/readinessFocus'
import { getPendingBackgroundAbilityRows } from '@/lib/provenance'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { BuildAbilityScoresDetailsPanel } from '@/pages/build/ability-scores/components/DetailsPanel'
import {
  BuildAbilityScoresCustomScoresPanel,
  BuildAbilityScoresPointBuyPanel,
  BuildAbilityScoresStandardArrayPanel,
} from '@/pages/build/ability-scores/components/MethodPanels'
import {
  buildSkillDetailsMap,
  selectSkillDetails,
  updateRaceAsiChoices,
} from '@/pages/build/ability-scores/model/data'
import { useCharacterStore } from '@/store/characterStore'

const EMPTY_RACE_ASI_CHOICES: string[][] = []
const EMPTY_BACKGROUND_ASI_CHOICES: string[] = []

export function BuildAbilityScoresPage() {
  const [searchParams] = useSearchParams()
  const character = useCharacterStore((s) => s.activeCharacter)
  const readinessFocus = getReadinessFocus(searchParams)
  const focusedChoice = findFocusedProvenanceChoice(
    readinessFocus,
    character?.provenance?.choices ?? [],
  )
  const focusedAbilityChoice =
    focusedChoice?.domain === 'abilityBonuses' ? focusedChoice : undefined
  const focusRaceBonuses =
    searchParams.get('focus') === 'race-bonuses' ||
    isRaceAbilityChoiceReadinessFocus(readinessFocus) ||
    focusedAbilityChoice?.sourceTag.sourceType === 'race' ||
    focusedAbilityChoice?.sourceTag.sourceType === 'subrace'
  const focusBackgroundBonuses =
    searchParams.get('focus') === 'background-bonuses' ||
    readinessFocus === 'background:ability-choices' ||
    focusedAbilityChoice?.sourceTag.sourceType === 'background'
  const focusBaseScores =
    readinessFocus === 'rules:ability-score-method' ||
    isBaseAbilityScoreReadinessFocus(readinessFocus)
  const { ref: baseScoresRef, highlighted: baseScoresHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(focusBaseScores)
  const { ref: raceBonusesRef, highlighted: raceBonusesHighlighted } =
    useRouteFocusTarget<HTMLElement>(focusRaceBonuses)
  const { ref: backgroundBonusesRef, highlighted: backgroundBonusesHighlighted } =
    useRouteFocusTarget<HTMLElement>(focusBackgroundBonuses)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { skills } = useFilteredGameData()
  const skillList = useSkillList()
  const skillToAbilityMap = useSkillToAbilityMap()
  const { scores, setScore, setAllScores, pointBuyTotal, pointBuyRemaining } = useAbilityScores()
  const { getSourcesRowsBySection } = useProvenanceLedger()
  const { applyRaceSelection, applyRaceAsiChoices } = useRaceProvenanceMutations()
  const { applyBackgroundAbilityChoices, reconcileBackgroundAbilityChoices } =
    useBackgroundProvenanceMutations()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [compactPane, setCompactPane] = useState<CompactPane>('left')
  const [selectedAbility, setSelectedAbility] = useState<AbilityName>('charisma')

  const handleSelectAbility = (ability: AbilityName) => {
    setSelectedAbility(ability)
    setCompactPane('right')
  }

  const method = character?.variantRules?.abilityScoreMethod ?? 'standard-array'

  const {
    normalizedRaceSelection,
    raceAsiData,
    racialBonuses,
    backgroundBonuses,
    bgAsiData,
    normalizedBackground,
    selectedRace,
    subraceData,
    raceAsiBlockIndex,
  } = useTotalAbilityScores(character)

  const raceAsiChoices: string[][] = character?.raceAsiChoices ?? EMPTY_RACE_ASI_CHOICES
  const isLineageRaceAsiFallback = hasFlexibleRaceOriginAsi(normalizedRaceSelection.race)
  const backgroundAbilityEntity = useMemo(
    () =>
      character && normalizedBackground
        ? {
            name: character.background,
            source: character.backgroundSource,
            ability: normalizedBackground.ability,
          }
        : null,
    [character, normalizedBackground],
  )
  const backgroundBlockIndex = character?.backgroundAsiBlockIndex ?? 0
  const backgroundChoices = character?.backgroundAsiChoices ?? EMPTY_BACKGROUND_ASI_CHOICES
  const currentBackgroundBlock = bgAsiData.blocks[backgroundBlockIndex] ?? bgAsiData.blocks[0]
  const hasFixedBackgroundAssignment =
    !!currentBackgroundBlock &&
    currentBackgroundBlock.from.length === currentBackgroundBlock.weights.length
  const abilitySourceRows = useMemo(() => {
    const rows = getSourcesRowsBySection('build-ability-scores')
    if (character?.originSystem !== '2024' || !backgroundAbilityEntity) return rows
    return [
      ...rows,
      ...getPendingBackgroundAbilityRows(bgAsiData, backgroundBlockIndex, backgroundChoices),
    ]
  }, [
    backgroundAbilityEntity,
    backgroundBlockIndex,
    backgroundChoices,
    bgAsiData,
    character?.originSystem,
    getSourcesRowsBySection,
  ])

  useEffect(() => {
    if (!backgroundAbilityEntity || !currentBackgroundBlock || !hasFixedBackgroundAssignment) {
      return
    }
    const alreadySet = currentBackgroundBlock.from.every(
      (ability, index) => backgroundChoices[index] === ability,
    )
    if (!alreadySet) {
      reconcileBackgroundAbilityChoices(backgroundAbilityEntity, backgroundBlockIndex, [
        ...currentBackgroundBlock.from,
      ])
    }
  }, [
    backgroundAbilityEntity,
    backgroundBlockIndex,
    backgroundChoices,
    currentBackgroundBlock,
    hasFixedBackgroundAssignment,
    reconcileBackgroundAbilityChoices,
  ])

  const asiBonuses = useMemo(() => {
    const bonuses: Partial<Record<AbilityName, number>> = {}
    for (const choice of character?.asiChoices ?? []) {
      for (const [abilityName, amount] of Object.entries(choice.abilityChanges)) {
        const ability = abilityName as AbilityName
        bonuses[ability] = (bonuses[ability] ?? 0) + amount
      }
    }
    return bonuses
  }, [character])

  const displayBonuses = useMemo(() => {
    const merged: Partial<Record<AbilityName, number>> = {}
    for (const ability of Object.keys(racialBonuses) as AbilityName[]) {
      merged[ability] = (merged[ability] ?? 0) + (racialBonuses[ability] ?? 0)
    }
    for (const ability of Object.keys(backgroundBonuses) as AbilityName[]) {
      merged[ability] = (merged[ability] ?? 0) + (backgroundBonuses[ability] ?? 0)
    }
    for (const ability of Object.keys(asiBonuses) as AbilityName[]) {
      merged[ability] = (merged[ability] ?? 0) + (asiBonuses[ability] ?? 0)
    }
    return merged
  }, [asiBonuses, backgroundBonuses, racialBonuses])

  const skillDetailsMap = useMemo(() => buildSkillDetailsMap(skills), [skills])

  const selectedSkills = useMemo(
    () => skillList.filter((skill) => skillToAbilityMap[skill] === selectedAbility),
    [selectedAbility, skillList, skillToAbilityMap],
  )

  const selectedSkillDetails = useMemo(
    () => selectSkillDetails(selectedSkills, skillDetailsMap),
    [selectedSkills, skillDetailsMap],
  )

  const raceAsiChoiceRenderBlocks = useMemo(() => {
    const signatureCounts = new Map<string, number>()
    return raceAsiData.choices.map((block, blockIndex) => {
      const blockSignature = `${block.amount}|${block.count}|${block.from.join(',')}`
      const occurrence = (signatureCounts.get(blockSignature) ?? 0) + 1
      signatureCounts.set(blockSignature, occurrence)
      const blockId = `${blockSignature}|${occurrence}`
      const slots = Array.from({ length: block.count }, (_, slotIndex) => ({
        slotId: `${blockId}|slot-${slotIndex + 1}`,
        slotIndex,
      }))
      return { block, blockIndex, slots }
    })
  }, [raceAsiData.choices])

  if (!character) {
    return <NoCharCard icon={<Barbell weight="duotone" />} noun="assign ability scores" />
  }

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
          compactPane={compactPane}
          onCompactPaneChange={setCompactPane}
          compactLeftLabel="Ability scores"
          compactRightLabel="Ability details"
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader
                ariaLabel="Ability score method"
                className={detailCollapsed ? 'pr-20' : undefined}
              >
                <div className="h-full min-w-0 flex-1 overflow-x-auto">
                  <fieldset className="inline-flex h-full min-w-max items-stretch gap-5 border-0 p-0">
                    <legend className="sr-only">Ability score method</legend>
                    {(
                      [
                        { value: 'point-buy', label: 'Point Buy', icon: Coins },
                        {
                          value: 'standard-array',
                          label: 'Standard Array',
                          icon: ListNumbers,
                        },
                        { value: 'custom', label: 'Custom', icon: PencilSimple },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => {
                      const active = method === value
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            updateCharacter(character.id, {
                              variantRules: {
                                ...character.variantRules,
                                abilityScoreMethod: value,
                              },
                            })
                          }
                          className={cn(
                            'flex h-full cursor-pointer items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors',
                            active
                              ? 'border-primary text-foreground'
                              : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                          )}
                        >
                          <Icon
                            className={cn('size-4 shrink-0', active && 'text-primary')}
                            weight={active ? 'fill' : 'regular'}
                          />
                          {label}
                        </button>
                      )
                    })}
                  </fieldset>
                </div>
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div className="p-4">
                  <div
                    ref={baseScoresRef}
                    className={cn(
                      'mx-auto flex w-full max-w-5xl flex-col rounded-lg',
                      baseScoresHighlighted && 'animate-route-focus',
                    )}
                  >
                    <Tabs
                      value={method}
                      onValueChange={(v) =>
                        updateCharacter(character.id, {
                          variantRules: {
                            ...character.variantRules,
                            abilityScoreMethod: v as 'point-buy' | 'standard-array' | 'custom',
                          },
                        })
                      }
                    >
                      <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
                        {method === 'point-buy' && (
                          <div className="ml-auto min-w-72">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1.5 flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <span>Ability points</span>
                                <span className="font-mono text-sm font-bold text-foreground">
                                  {pointBuyTotal} / {POINT_BUY_BUDGET}
                                </span>
                              </div>
                              <Progress
                                value={Math.min(100, (pointBuyTotal / POINT_BUY_BUDGET) * 100)}
                                className="h-2"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <TabsContent value="point-buy">
                        <BuildAbilityScoresPointBuyPanel
                          scores={scores}
                          racialBonuses={displayBonuses}
                          pointBuyRemaining={pointBuyRemaining}
                          setScore={setScore}
                          selectedAbility={selectedAbility}
                          onSelectAbility={handleSelectAbility}
                        />
                      </TabsContent>

                      <TabsContent value="standard-array">
                        <BuildAbilityScoresStandardArrayPanel
                          scores={scores}
                          racialBonuses={displayBonuses}
                          setAllScores={setAllScores}
                          selectedAbility={selectedAbility}
                          onSelectAbility={handleSelectAbility}
                        />
                      </TabsContent>

                      <TabsContent value="custom">
                        <BuildAbilityScoresCustomScoresPanel
                          scores={scores}
                          racialBonuses={displayBonuses}
                          setScore={setScore}
                          selectedAbility={selectedAbility}
                          onSelectAbility={handleSelectAbility}
                        />
                      </TabsContent>
                    </Tabs>
                    {raceAsiData.choices.length > 0 && (
                      <section
                        ref={raceBonusesRef}
                        className={cn(
                          'mx-auto mt-6 w-full max-w-2xl rounded-lg border border-border-subtle bg-surface-raised/35 p-4',
                          raceBonusesHighlighted && 'animate-route-focus',
                        )}
                        data-testid="race-ability-choices"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground">
                              Racial bonuses
                            </h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Assign the ability increases granted by your race.
                            </p>
                          </div>
                          {isLineageRaceAsiFallback && (
                            <fieldset
                              className="inline-flex w-fit shrink-0 gap-1 rounded-md border border-border bg-background/45 p-1"
                              aria-label="Racial bonus distribution"
                            >
                              {(
                                [
                                  { value: 0, label: '+2 / +1' },
                                  { value: 1, label: '+1 / +1 / +1' },
                                ] as const
                              ).map(({ value, label }) => {
                                const active = raceAsiBlockIndex === value
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                      updateCharacter(character.id, {
                                        raceAsiBlockIndex: value,
                                        raceAsiChoices: [],
                                      })
                                      if (selectedRace) {
                                        applyRaceSelection(selectedRace, subraceData, value)
                                      }
                                    }}
                                    className={cn(
                                      'flex h-8 items-center rounded px-3 text-xs font-semibold transition-colors',
                                      active
                                        ? 'bg-secondary text-foreground'
                                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                                    )}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </fieldset>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                          {raceAsiData.fixed.map((fb) => (
                            <div
                              key={`${fb.ability}|${fb.value}`}
                              className="flex min-h-9 items-center gap-2 rounded-md border border-border bg-background/35 px-3"
                            >
                              <span className="text-xs font-semibold text-muted-foreground">
                                +{fb.value}
                              </span>
                              <span className="text-xs font-semibold">
                                {ABILITY_ABBREVIATIONS[fb.ability]}
                              </span>
                            </div>
                          ))}
                          {raceAsiChoiceRenderBlocks.map(({ block, blockIndex, slots }) => {
                            const selections = raceAsiChoices[blockIndex] ?? []
                            return slots.map(({ slotId, slotIndex }) => {
                              const selected = selections[slotIndex] ?? ''
                              const takenByOthers = new Set([
                                ...selections.filter((s, si) => si !== slotIndex && s !== ''),
                                ...raceAsiData.choices.flatMap((_, bi) =>
                                  bi !== blockIndex
                                    ? (raceAsiChoices[bi] ?? []).filter((s) => s !== '')
                                    : [],
                                ),
                              ])
                              return (
                                <div
                                  key={slotId}
                                  className="flex min-w-44 items-center gap-2 rounded-md border border-border bg-background/35 p-1 pl-3"
                                >
                                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                    +{block.amount}
                                  </span>
                                  <Select
                                    value={selected}
                                    onValueChange={(v) => {
                                      const next = updateRaceAsiChoices(
                                        raceAsiChoices,
                                        blockIndex,
                                        slotIndex,
                                        v,
                                      )
                                      applyRaceAsiChoices(next)
                                    }}
                                  >
                                    <SelectTrigger className="h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-xs shadow-none focus:ring-0">
                                      <SelectValue placeholder="Ability…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {block.from.map((ab) => (
                                        <SelectItem
                                          key={ab}
                                          value={ab}
                                          disabled={takenByOthers.has(ab)}
                                          className="text-xs"
                                        >
                                          {ABILITY_ABBREVIATIONS[ab]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )
                            })
                          })}
                        </div>
                      </section>
                    )}
                    {backgroundAbilityEntity && bgAsiData.blocks.length > 0 && (
                      <section
                        ref={backgroundBonusesRef}
                        className={cn(
                          'mx-auto mt-6 w-full max-w-2xl rounded-lg border border-border-subtle bg-surface-raised/35 p-4',
                          backgroundBonusesHighlighted && 'animate-route-focus',
                        )}
                        data-testid="background-ability-choices"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground">
                              Background bonuses
                            </h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Assign the origin ability increases supplied by the selected
                              background.
                            </p>
                          </div>
                          {bgAsiData.blocks.length > 1 && (
                            <fieldset
                              className="inline-flex w-fit shrink-0 gap-1 rounded-md border border-border bg-background/45 p-1"
                              aria-label="Background bonus distribution"
                            >
                              {bgAsiData.blocks.map((block, blockIndex) => {
                                const active = backgroundBlockIndex === blockIndex
                                return (
                                  <button
                                    // biome-ignore lint/suspicious/noArrayIndexKey: source ability blocks are positional alternatives
                                    key={`${block.weights.join('|')}|${blockIndex}`}
                                    type="button"
                                    onClick={() =>
                                      applyBackgroundAbilityChoices(
                                        backgroundAbilityEntity,
                                        blockIndex,
                                        block.from.length === block.weights.length
                                          ? [...block.from]
                                          : [],
                                      )
                                    }
                                    className={cn(
                                      'flex h-8 items-center rounded px-3 text-xs font-semibold transition-colors',
                                      active
                                        ? 'bg-secondary text-foreground'
                                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                                    )}
                                  >
                                    {block.weights.map((weight) => `+${weight}`).join(' / ')}
                                  </button>
                                )
                              })}
                            </fieldset>
                          )}
                        </div>
                        {currentBackgroundBlock && (
                          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                            {currentBackgroundBlock.weights.map((weight, slotIndex) => {
                              const selected = backgroundChoices[slotIndex] ?? ''
                              return (
                                <div
                                  // biome-ignore lint/suspicious/noArrayIndexKey: duplicate bonus weights are distinct positional slots
                                  key={`${weight}|${slotIndex}`}
                                  className="flex min-w-44 items-center gap-2 rounded-md border border-border bg-background/35 p-1 pl-3"
                                >
                                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                    +{weight}
                                  </span>
                                  <Select
                                    value={selected}
                                    disabled={hasFixedBackgroundAssignment}
                                    onValueChange={(ability) => {
                                      const nextChoices = Array.from<string>({
                                        length: currentBackgroundBlock.weights.length,
                                      }).map((_, index) => backgroundChoices[index] ?? '')
                                      nextChoices[slotIndex] = ability
                                      applyBackgroundAbilityChoices(
                                        backgroundAbilityEntity,
                                        backgroundBlockIndex,
                                        nextChoices,
                                      )
                                    }}
                                  >
                                    <SelectTrigger
                                      className="h-8 flex-1 border-0 bg-transparent px-2 text-xs shadow-none focus:ring-0"
                                      aria-label={`Background ability bonus +${weight}`}
                                    >
                                      <SelectValue placeholder="Ability…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {currentBackgroundBlock.from.map((ability) => (
                                        <SelectItem
                                          key={ability}
                                          value={ability}
                                          disabled={
                                            backgroundChoices.includes(ability) &&
                                            selected !== ability
                                          }
                                          className="text-xs"
                                        >
                                          {ABILITY_ABBREVIATIONS[ability]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                </div>
              </ScrollArea>

              <div className="px-4 pb-4 border-t border-border">
                <SourcesAccordion
                  sectionId="build-ability-scores"
                  title="Sources"
                  rows={abilitySourceRows}
                  emptyText={`No ability bonus sources recorded. Select a ${character.originSystem === '2024' ? 'background' : 'race'} to get started.`}
                />
              </div>
            </>
          }
          right={
            <BuildAbilityScoresDetailsPanel
              selectedAbility={selectedAbility}
              selectedSkillNames={selectedSkills}
              selectedSkillDetails={selectedSkillDetails}
            />
          }
        />
      </WorkspaceBody>
    </WorkspacePage>
  )
}
