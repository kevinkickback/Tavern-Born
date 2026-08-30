import { Barbell, Coins, ListNumbers, PencilSimple } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Progress } from '@/components/ui/progress'
import { SplitPane } from '@/components/ui/SplitPane'
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
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useTotalAbilityScores } from '@/hooks/character/useTotalAbilityScores'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  hasFlexibleRaceOriginAsi,
} from '@/lib/calculations/abilityScores'
import { POINT_BUY_BUDGET } from '@/lib/calculations/gameRules'
import { ALL_SKILLS, getSkillAbility } from '@/lib/calculations/skills'
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

export function BuildAbilityScoresPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { skills } = useFilteredGameData()
  const { scores, setScore, setAllScores, pointBuyTotal, pointBuyRemaining } = useAbilityScores()
  const { getSourcesRowsBySection } = useProvenanceLedger()
  const { applyRaceSelection, applyRaceAsiChoices } = useRaceProvenanceMutations()
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [selectedAbility, setSelectedAbility] = useState<AbilityName>('charisma')

  const method = character?.variantRules?.abilityScoreMethod ?? 'standard-array'

  const {
    normalizedRaceSelection,
    raceAsiData,
    racialBonuses,
    backgroundBonuses,
    selectedRace,
    subraceData,
    raceAsiBlockIndex,
  } = useTotalAbilityScores(character)

  const raceAsiChoices: string[][] = character?.raceAsiChoices ?? EMPTY_RACE_ASI_CHOICES
  const isLineageRaceAsiFallback = hasFlexibleRaceOriginAsi(normalizedRaceSelection.race)

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
    () => ALL_SKILLS.filter((skill) => getSkillAbility(skill) === selectedAbility),
    [selectedAbility],
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
      <WorkspaceBody className="flex overflow-hidden rounded-lg border border-border bg-background">
        <SplitPane
          className="my-0 h-full"
          leftClassName="bg-background"
          rightClassName="border-l-2 border-border bg-sidebar/50"
          leftCollapsed={leftCollapsed}
          rightCollapsed={detailCollapsed}
          onLeftCollapsedChange={setLeftCollapsed}
          onRightCollapsedChange={setDetailCollapsed}
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
                  <div className="mx-auto flex w-full max-w-5xl flex-col">
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
                      <div className="mb-5 flex flex-wrap items-center justify-end gap-3 border-b border-border pb-3">
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
                          onSelectAbility={setSelectedAbility}
                        />
                      </TabsContent>

                      <TabsContent value="standard-array">
                        <BuildAbilityScoresStandardArrayPanel
                          scores={scores}
                          racialBonuses={displayBonuses}
                          setAllScores={setAllScores}
                          selectedAbility={selectedAbility}
                          onSelectAbility={setSelectedAbility}
                        />
                      </TabsContent>

                      <TabsContent value="custom">
                        <BuildAbilityScoresCustomScoresPanel
                          scores={scores}
                          racialBonuses={displayBonuses}
                          setScore={setScore}
                          selectedAbility={selectedAbility}
                          onSelectAbility={setSelectedAbility}
                        />
                      </TabsContent>
                    </Tabs>
                    {raceAsiData.choices.length > 0 && (
                      <section className="mx-auto mt-6 w-full max-w-xl border-t border-border pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Racial bonuses
                          </span>
                          {isLineageRaceAsiFallback && (
                            <fieldset
                              className="inline-flex w-fit gap-1 rounded-md border border-border bg-sidebar/40 p-1"
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
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                          {raceAsiData.fixed.map((fb) => (
                            <div
                              key={`${fb.ability}|${fb.value}`}
                              className="flex items-center gap-2"
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
                                <div key={slotId} className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-muted-foreground">
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
                                    <SelectTrigger className="h-7 w-28 px-2 text-xs">
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
                  </div>
                </div>
              </ScrollArea>

              <div className="px-4 pb-4 border-t border-border">
                <SourcesAccordion
                  sectionId="build-ability-scores"
                  title="Sources"
                  rows={getSourcesRowsBySection('build-ability-scores')}
                  emptyText="No ability bonus sources recorded. Select a race to get started."
                />
              </div>
            </>
          }
          right={
            <BuildAbilityScoresDetailsPanel
              selectedAbility={selectedAbility}
              selectedSkillDetails={selectedSkillDetails}
            />
          }
        />
      </WorkspaceBody>
    </WorkspacePage>
  )
}
