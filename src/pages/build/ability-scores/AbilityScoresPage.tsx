import { Barbell, CaretLeft, CaretRight } from '@phosphor-icons/react'
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
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import {
  ABILITY_ABBREVIATIONS,
  type AbilityName,
  buildBackgroundBonuses,
  getBackgroundAbilityData,
  getRaceAbilityData,
  hasFlexibleRaceOriginAsi,
} from '@/lib/calculations/abilityScores'
import {
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { ALL_SKILLS, getSkillAbility } from '@/lib/calculations/skills'
import { matchesGameDataEntry } from '@/lib/characterUtils'
import { NoCharCard } from '@/pages/_shared'
import { BuildAbilityScoresDetailsPanel } from '@/pages/build/ability-scores/components/DetailsPanel'
import {
  BuildAbilityScoresCustomScoresPanel,
  BuildAbilityScoresPointBuyPanel,
  BuildAbilityScoresStandardArrayPanel,
} from '@/pages/build/ability-scores/components/MethodPanels'
import {
  buildRacialBonuses,
  buildSkillDetailsMap,
  selectSkillDetails,
  updateRaceAsiChoices,
} from '@/pages/build/ability-scores/model/data'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'

export function BuildAbilityScoresPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const gameData = useGameDataStore((s) => s.gameData)
  const { races, backgrounds } = useFilteredGameData()
  const { scores, setScore, setAllScores, pointBuyTotal, pointBuyRemaining } = useAbilityScores()
  const { getSourcesRowsBySection, applyRaceSelection } = useProvenance()
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [selectedAbility, setSelectedAbility] = useState<AbilityName>('charisma')

  const method = character?.variantRules?.abilityScoreMethod ?? 'standard-array'

  const selectedRace = races.find((r) =>
    matchesGameDataEntry(character?.race, character?.raceSource, r),
  ) as Race5e | undefined
  const subraceData = selectedRace?.subraces?.find(
    (sr: Race5e) =>
      sr.name === character?.subrace && (sr.source ?? '') === (character?.subraceSource ?? ''),
  ) as Race5e | undefined
  const normalizedRaceSelection = normalizeRaceSelectionForOriginSystem(
    selectedRace,
    subraceData,
    character?.originSystem ?? '2014',
  )
  const raceAsiBlockIndex = (character?.raceAsiBlockIndex ?? 0) as 0 | 1
  const raceAsiData = getRaceAbilityData(
    normalizedRaceSelection.race,
    normalizedRaceSelection.subrace,
    raceAsiBlockIndex,
  )
  const raceAsiChoices: string[][] = character?.raceAsiChoices ?? []
  const isLineageRaceAsiFallback = hasFlexibleRaceOriginAsi(normalizedRaceSelection.race)
  const hasDataDrivenRacialBonuses = raceAsiData.fixed.length > 0 || raceAsiData.choices.length > 0

  const selectedBg = backgrounds.find((b) =>
    matchesGameDataEntry(character?.background, character?.backgroundSource, b),
  )
  const normalizedBackground = normalizeBackgroundForOriginSystem(
    selectedBg,
    character?.originSystem ?? '2014',
  )
  const bgAsiData = getBackgroundAbilityData(
    normalizedBackground as { ability?: unknown[] } | undefined,
  )
  const backgroundBonuses = useMemo(
    () =>
      buildBackgroundBonuses(
        bgAsiData,
        character?.backgroundAsiBlockIndex ?? 0,
        character?.backgroundAsiChoices ?? [],
      ),
    [bgAsiData, character?.backgroundAsiBlockIndex, character?.backgroundAsiChoices],
  )

  const provenanceRacialBonuses = useMemo(() => {
    const bonuses: Partial<Record<AbilityName, number>> = {}
    const records = character?.provenance?.abilityBonuses ?? []
    for (const record of records) {
      const tag = record.sourceTag
      const isRelevantSource =
        (tag.sourceType === 'race' &&
          tag.sourceName === character?.race &&
          (tag.sourceRef ?? '') === (character?.raceSource ?? '')) ||
        (tag.sourceType === 'subrace' &&
          tag.sourceName === (character?.subrace ?? '') &&
          (tag.sourceRef ?? '') === (character?.subraceSource ?? ''))

      if (!isRelevantSource) continue
      const ability = record.ability as AbilityName
      bonuses[ability] = (bonuses[ability] ?? 0) + record.value
    }
    return bonuses
  }, [
    character?.provenance?.abilityBonuses,
    character?.race,
    character?.raceSource,
    character?.subrace,
    character?.subraceSource,
  ])

  const racialBonuses = useMemo(
    () =>
      hasDataDrivenRacialBonuses
        ? buildRacialBonuses(raceAsiData, raceAsiChoices)
        : provenanceRacialBonuses,
    [hasDataDrivenRacialBonuses, provenanceRacialBonuses, raceAsiChoices, raceAsiData],
  )

  const asiBonuses = useMemo(() => {
    const bonuses: Partial<Record<AbilityName, number>> = {}
    for (const choice of character?.asiChoices ?? []) {
      for (const [abilityName, amount] of Object.entries(choice.abilityChanges)) {
        const ability = abilityName as AbilityName
        bonuses[ability] = (bonuses[ability] ?? 0) + amount
      }
    }
    return bonuses
  }, [character?.asiChoices])

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

  const skillDetailsMap = useMemo(() => buildSkillDetailsMap(gameData?.skills), [gameData?.skills])

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
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Barbell className="h-6 w-6 text-primary" weight="duotone" />
            Ability Scores
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
                        <TabsList className="mb-6">
                          <TabsTrigger value="point-buy">Point Buy</TabsTrigger>
                          <TabsTrigger value="standard-array">Standard Array</TabsTrigger>
                          <TabsTrigger value="custom">Custom</TabsTrigger>
                        </TabsList>

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
                        <div className="mt-3 p-3 rounded-lg bg-muted/20 border border-border flex flex-col items-center gap-2">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Racial Bonuses
                          </div>
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
