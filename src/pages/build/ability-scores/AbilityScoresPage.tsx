import {
  Barbell,
  CaretLeft,
  CaretRight,
  Coins,
  ListNumbers,
  PencilSimple,
} from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const { applyRaceSelection } = useRaceProvenanceMutations()
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [selectedAbility, setSelectedAbility] = useState<AbilityName>('charisma')

  const method = character?.variantRules?.abilityScoreMethod ?? 'standard-array'

  const { normalizedRaceSelection, raceAsiData, racialBonuses, backgroundBonuses, selectedRace, subraceData, raceAsiBlockIndex } =
    useTotalAbilityScores(character)

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
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Barbell className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Ability Scores</h1>
              <p className="text-sm text-muted-foreground">
                Set and assign your six core ability scores
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
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4">
                    <div className="max-w-2xl mx-auto w-full flex flex-col">
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
                        {/* Method switcher — segmented pill */}
                        <div className="flex bg-muted/50 border border-border rounded-xl p-1 gap-1 mb-5">
                          {(
                            [
                              {
                                value: 'point-buy',
                                label: 'Point Buy',
                                icon: Coins,
                                desc: '27 pts',
                              },
                              {
                                value: 'standard-array',
                                label: 'Standard Array',
                                icon: ListNumbers,
                                desc: 'Preset values',
                              },
                              {
                                value: 'custom',
                                label: 'Custom',
                                icon: PencilSimple,
                                desc: 'Any scores',
                              },
                            ] as const
                          ).map(({ value: v, label, icon: Icon, desc }) => {
                            const active = method === v
                            return (
                              <button
                                key={v}
                                type="button"
                                onClick={() =>
                                  updateCharacter(character.id, {
                                    variantRules: {
                                      ...character.variantRules,
                                      abilityScoreMethod: v,
                                    },
                                  })
                                }
                                className={cn(
                                  'flex-1 flex items-center justify-center gap-2.5 px-3 py-2 rounded-lg text-center transition-all duration-200',
                                  active
                                    ? 'bg-background shadow-sm border border-border text-foreground'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
                                )}
                              >
                                <Icon
                                  className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : '')}
                                  weight={active ? 'fill' : 'regular'}
                                />
                                <div className="min-w-0">
                                  <div
                                    className={cn(
                                      'text-xs font-semibold leading-tight truncate',
                                      active ? 'text-foreground' : '',
                                    )}
                                  >
                                    {label}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground leading-tight truncate">
                                    {desc}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>

                        <TabsContent value="point-buy">
                          <BuildAbilityScoresPointBuyPanel
                            scores={scores}
                            racialBonuses={displayBonuses}
                            pointBuyTotal={pointBuyTotal}
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
                        <div className="mt-4 border border-border rounded-xl overflow-hidden bg-card/50">
                          <div className="h-8 bg-gradient-to-r from-emerald-500/25 via-emerald-500/12 to-transparent border-b border-border/40 flex items-center px-3">
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                              Racial Bonuses
                            </span>
                          </div>
                          <div className="p-3 flex flex-col items-center gap-2">
                            {isLineageRaceAsiFallback && (
                              <Tabs
                                value={String(raceAsiBlockIndex)}
                                onValueChange={(value) => {
                                  const nextIndex = (Number(value) === 1 ? 1 : 0) as 0 | 1
                                  updateCharacter(character.id, {
                                    raceAsiBlockIndex: nextIndex,
                                    raceAsiChoices: [],
                                  })
                                  if (selectedRace) {
                                    applyRaceSelection(selectedRace, subraceData, nextIndex)
                                  }
                                }}
                              >
                                <TabsList className="h-9 w-full max-w-xs">
                                  <TabsTrigger value="0" className="text-xs px-3">
                                    +2/+1 (2 abilities)
                                  </TabsTrigger>
                                  <TabsTrigger value="1" className="text-xs px-3">
                                    +1/+1/+1 (3 abilities)
                                  </TabsTrigger>
                                </TabsList>
                              </Tabs>
                            )}
                            <div className="flex flex-wrap justify-center gap-2">
                              {raceAsiData.fixed.map((fb) => (
                                <span
                                  key={`${fb.ability}|${fb.value}`}
                                  className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded px-2 py-0.5 font-semibold"
                                >
                                  {ABILITY_ABBREVIATIONS[fb.ability]} +{fb.value}
                                </span>
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
                                    <div key={slotId} className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">
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
                                          updateCharacter(character.id, {
                                            raceAsiChoices: next,
                                          })
                                        }}
                                      >
                                        <SelectTrigger className="h-7 w-24 px-2 text-xs">
                                          <SelectValue placeholder="Choose…" />
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
                          </div>
                        </div>
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
              </div>

              <BuildAbilityScoresDetailsPanel
                detailCollapsed={detailCollapsed}
                selectedAbility={selectedAbility}
                selectedSkillDetails={selectedSkillDetails}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
