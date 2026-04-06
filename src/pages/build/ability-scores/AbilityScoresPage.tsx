import { Barbell, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAbilityScores } from '@/hooks/character/useAbilityScores';
import { useProvenance } from '@/hooks/character/useProvenance';
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData';
import {
  type AbilityName,
  getRaceAbilityData,
} from '@/lib/calculations/abilityScores';
import { ALL_SKILLS, getSkillAbility } from '@/lib/calculations/skills';
import { matchesGameDataEntry } from '@/lib/characterUtils';
import { NoCharCard } from '@/pages/_shared';
import { BuildAbilityScoresDetailsPanel } from '@/pages/build/ability-scores/components/DetailsPanel';
import {
  BuildAbilityScoresCustomScoresPanel,
  BuildAbilityScoresPointBuyPanel,
  BuildAbilityScoresStandardArrayPanel,
} from '@/pages/build/ability-scores/components/MethodPanels';
import { BuildAbilityScoresRacialBonusesPanel } from '@/pages/build/ability-scores/components/RacialBonusesPanel';
import {
  buildRacialBonuses,
  buildSkillDetailsMap,
  selectSkillDetails,
  updateRaceAsiChoices,
} from '@/pages/build/ability-scores/model/data';
import { useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';
import type { Race5e } from '@/types/5etools';

export function BuildAbilityScoresPage() {
  const character = useCharacterStore((s) => s.activeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const gameData = useGameDataStore((s) => s.gameData);
  const { races } = useFilteredGameData();
  const { scores, setScore, setAllScores, pointBuyTotal, pointBuyRemaining } =
    useAbilityScores();
  const { getSourcesRowsBySection } = useProvenance();
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [selectedAbility, setSelectedAbility] =
    useState<AbilityName>('charisma');

  const method =
    character?.variantRules?.abilityScoreMethod ?? 'standard-array';

  const selectedRace = races.find((r) =>
    matchesGameDataEntry(character?.race, character?.raceSource, r),
  ) as Race5e | undefined;
  const subraceData = selectedRace?.subraces?.find(
    (sr: Race5e) =>
      sr.name === character?.subrace &&
      (sr.source ?? '') === (character?.subraceSource ?? ''),
  ) as Race5e | undefined;
  const raceAsiData = getRaceAbilityData(selectedRace, subraceData);
  const raceAsiChoices: string[][] = character?.raceAsiChoices ?? [];

  const racialBonuses = useMemo(
    () => buildRacialBonuses(raceAsiData, raceAsiChoices),
    [raceAsiChoices, raceAsiData],
  );

  const skillDetailsMap = useMemo(
    () => buildSkillDetailsMap(gameData?.skills),
    [gameData?.skills],
  );

  const selectedSkills = useMemo(
    () =>
      ALL_SKILLS.filter((skill) => getSkillAbility(skill) === selectedAbility),
    [selectedAbility],
  );

  const selectedSkillDetails = useMemo(
    () => selectSkillDetails(selectedSkills, skillDetailsMap),
    [selectedSkills, skillDetailsMap],
  );

  if (!character) {
    return (
      <NoCharCard
        icon={<Barbell weight="duotone" />}
        noun="assign ability scores"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Barbell className="h-6 w-6 text-accent" weight="duotone" />
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
                title={
                  detailCollapsed
                    ? 'Expand details panel'
                    : 'Collapse details panel'
                }
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
                    <Tabs defaultValue={method}>
                      <TabsList className="mb-6">
                        <TabsTrigger value="point-buy">Point Buy</TabsTrigger>
                        <TabsTrigger value="standard-array">
                          Standard Array
                        </TabsTrigger>
                        <TabsTrigger value="custom">Custom</TabsTrigger>
                      </TabsList>

                      <TabsContent value="point-buy">
                        <BuildAbilityScoresPointBuyPanel
                          scores={scores}
                          racialBonuses={racialBonuses}
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
                          racialBonuses={racialBonuses}
                          setAllScores={setAllScores}
                          selectedAbility={selectedAbility}
                          onSelectAbility={setSelectedAbility}
                        />
                      </TabsContent>

                      <TabsContent value="custom">
                        <BuildAbilityScoresCustomScoresPanel
                          scores={scores}
                          racialBonuses={racialBonuses}
                          setScore={setScore}
                          selectedAbility={selectedAbility}
                          onSelectAbility={setSelectedAbility}
                        />
                      </TabsContent>
                    </Tabs>

                    <BuildAbilityScoresRacialBonusesPanel
                      raceAsiData={raceAsiData}
                      raceAsiChoices={raceAsiChoices}
                      onUpdateChoice={(blockIdx, slotIdx, value) => {
                        const nextChoices = updateRaceAsiChoices(
                          raceAsiChoices,
                          blockIdx,
                          slotIdx,
                          value,
                        );
                        updateCharacter(character.id, {
                          raceAsiChoices: nextChoices,
                        });
                      }}
                    />
                  </div>
                </ScrollArea>

                <div className="px-4 pb-4 border-t border-border">
                  <SourcesAccordion
                    sectionId="build-ability-scores"
                    title="Racial & Bonus Sources"
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
  );
}
