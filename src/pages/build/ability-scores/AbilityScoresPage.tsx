import { Barbell } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  BackgroundAbilityBonusPanel,
  RacialAbilityBonusPanel,
} from '@/components/character/AbilityBonusPanels'
import {
  AbilityScoreEditor,
  AbilityScoreMethodTabs,
} from '@/components/character/AbilityScoreEditor'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { type CompactPane, SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs } from '@/components/ui/tabs'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useAbilityScores } from '@/hooks/character/useAbilityScores'
import { useBackgroundProvenanceMutations } from '@/hooks/character/useBackgroundProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useTotalAbilityScores } from '@/hooks/character/useTotalAbilityScores'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useSkillList, useSkillToAbilityMap } from '@/hooks/data/useGameData'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import type { AbilityScoreMethod } from '@/lib/calculations/abilityScoreMethods'
import { type AbilityName, hasFlexibleRaceOriginAsi } from '@/lib/calculations/abilityScores'
import { isFixedBackgroundAbilityBlock } from '@/lib/calculations/originAbilityChoices'
import {
  findFocusedProvenanceChoice,
  getReadinessFocus,
  isBaseAbilityScoreReadinessFocus,
  isRaceAbilityChoiceReadinessFocus,
} from '@/lib/navigation/readinessFocus'
import { getPendingBackgroundAbilityRows } from '@/lib/provenance/abilityBonusRows'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { BuildAbilityScoresDetailsPanel } from '@/pages/build/ability-scores/components/DetailsPanel'
import { buildSkillDetailsMap, selectSkillDetails } from '@/pages/build/ability-scores/model/data'
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
  const { scores, setScore, setAllScores } = useAbilityScores()
  const { getSourcesRowsBySection } = useProvenanceLedger()
  const { applyRaceAsiDistribution, applyRaceAsiChoices } = useRaceProvenanceMutations()
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

  const savedMethod = character?.variantRules?.abilityScoreMethod
  const method = savedMethod ?? 'standard-array'

  const {
    normalizedRaceSelection,
    raceAsiData,
    racialBonuses,
    backgroundBonuses,
    featBonuses,
    bgAsiData,
    normalizedBackground,
    selectedRace,
    subraceData,
    raceAsiBlockIndex,
    raceAsiChoices: projectedRaceAsiChoices,
  } = useTotalAbilityScores(character)

  const raceAsiChoices: string[][] = projectedRaceAsiChoices ?? EMPTY_RACE_ASI_CHOICES
  const isLineageRaceAsiFallback = hasFlexibleRaceOriginAsi(
    normalizedRaceSelection.race,
    normalizedRaceSelection.subrace,
  )
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
  const hasFixedBackgroundAssignment = isFixedBackgroundAbilityBlock(currentBackgroundBlock)
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
    for (const ability of Object.keys(featBonuses) as AbilityName[]) {
      merged[ability] = (merged[ability] ?? 0) + (featBonuses[ability] ?? 0)
    }
    return merged
  }, [asiBonuses, backgroundBonuses, featBonuses, racialBonuses])

  const skillDetailsMap = useMemo(() => buildSkillDetailsMap(skills), [skills])

  const selectedSkills = useMemo(
    () => skillList.filter((skill) => skillToAbilityMap[skill] === selectedAbility),
    [selectedAbility, skillList, skillToAbilityMap],
  )

  const selectedSkillDetails = useMemo(
    () => selectSkillDetails(selectedSkills, skillDetailsMap),
    [selectedSkills, skillDetailsMap],
  )

  if (!character) {
    return <NoCharCard icon={<Barbell weight="duotone" />} noun="assign ability scores" />
  }

  const setMethod = (method: AbilityScoreMethod) => {
    updateCharacter(character.id, {
      variantRules: { ...character.variantRules, abilityScoreMethod: method },
    })
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
            <Tabs
              value={method}
              activationMode="manual"
              onValueChange={(value) => setMethod(value as AbilityScoreMethod)}
              className="min-h-0 flex-1 gap-0"
            >
              <WorkspacePaneHeader
                ariaLabel="Ability score method"
                className={detailCollapsed ? 'pr-20' : undefined}
              >
                <AbilityScoreMethodTabs
                  // Older characters may be previewing Standard Array without a saved method.
                  onConfirmStandardArray={
                    savedMethod ? undefined : () => setMethod('standard-array')
                  }
                />
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
                    <AbilityScoreEditor
                      method={method}
                      scores={scores}
                      bonuses={displayBonuses}
                      setScore={setScore}
                      setAllScores={setAllScores}
                      selectedAbility={selectedAbility}
                      onSelectAbility={handleSelectAbility}
                    />
                    <RacialAbilityBonusPanel
                      data={raceAsiData}
                      selections={raceAsiChoices}
                      distribution={raceAsiBlockIndex}
                      onDistributionChange={
                        isLineageRaceAsiFallback && selectedRace
                          ? (value) => applyRaceAsiDistribution(selectedRace, subraceData, value)
                          : undefined
                      }
                      onChoicesChange={applyRaceAsiChoices}
                      sectionRef={raceBonusesRef}
                      highlighted={raceBonusesHighlighted}
                    />
                    {backgroundAbilityEntity && (
                      <BackgroundAbilityBonusPanel
                        data={bgAsiData}
                        block={currentBackgroundBlock}
                        blockIndex={backgroundBlockIndex}
                        choices={backgroundChoices}
                        fixedAssignment={hasFixedBackgroundAssignment}
                        onChoicesChange={(index, choices) => {
                          const block = bgAsiData.blocks[index]
                          applyBackgroundAbilityChoices(
                            backgroundAbilityEntity,
                            index,
                            block && isFixedBackgroundAbilityBlock(block)
                              ? [...block.from]
                              : choices,
                          )
                        }}
                        onClear={
                          bgAsiData.blocks[backgroundBlockIndex]
                            ? () =>
                                applyBackgroundAbilityChoices(
                                  backgroundAbilityEntity,
                                  backgroundBlockIndex,
                                  [],
                                )
                            : undefined
                        }
                        sectionRef={backgroundBonusesRef}
                        highlighted={backgroundBonusesHighlighted}
                      />
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
            </Tabs>
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
