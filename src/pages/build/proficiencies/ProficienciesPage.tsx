import { CaretLeft, CaretRight, Certificate } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useSkills } from '@/hooks/character/useSkills'
import { useAvailableProficiencies } from '@/hooks/data/useAvailableProficiencies'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { NoCharCard } from '@/pages/_shared'
import { BuildProficienciesDetailsPanel } from '@/pages/build/proficiencies/components/DetailsPanel'
import { BuildProficienciesTabsPanel } from '@/pages/build/proficiencies/components/TabsPanel'
import {
  buildArtisanChoiceMap,
  buildArtisanToolNamesFromSlots,
  buildChoiceCounts,
  buildOptionalToolNamesFromChoices,
  buildSkillDescriptions,
  buildToolChoiceSlots,
  buildToolSubtypeOptionsByKind,
  buildVisibleToolCandidates,
  getSelectedToolNames,
  isArtisanToolSlot,
} from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'
import { useCharacterStore } from '@/store/characterStore'

export function BuildProficienciesPage() {
  const character = useCharacterStore((state) => {
    if (state.activeCharacter) return state.activeCharacter
    if (!state.activeCharacterId) return null
    return state.characters.find((entry) => entry.id === state.activeCharacterId) ?? null
  })
  const { skills: skillDefs, items, itemsBase } = useFilteredGameData()
  const { skills } = useSkills()
  const { savingThrows } = useSavingThrows()
  const { ledger, resolveChoiceSelection, getSourcesRowsBySection } = useProvenance()
  const availableProficiencies = useAvailableProficiencies()

  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [focused, setFocused] = useState<ProfFocus | null>(null)

  const skillDescriptions = useMemo(() => buildSkillDescriptions(skillDefs), [skillDefs])

  const choiceCounts = useMemo(() => buildChoiceCounts(ledger.choices), [ledger.choices])

  const toolSubtypeOptionsByKind = useMemo(
    () =>
      buildToolSubtypeOptionsByKind({
        itemsBase,
        items,
        allowedSources: character?.allowedSources,
      }),
    [character?.allowedSources, items, itemsBase],
  )

  const toolChoiceSlots = useMemo(
    () =>
      buildToolChoiceSlots({
        choices: ledger.choices,
        selectedTools: character?.proficiencies.tools ?? [],
        toolSubtypeOptionsByKind,
      }),
    [character?.proficiencies.tools, ledger.choices, toolSubtypeOptionsByKind],
  )

  const artisanToolSlots = useMemo(
    () => toolChoiceSlots.filter(isArtisanToolSlot),
    [toolChoiceSlots],
  )

  const dropdownToolSlots = useMemo(
    () => toolChoiceSlots.filter((s) => !isArtisanToolSlot(s)),
    [toolChoiceSlots],
  )

  const artisanToolNames = useMemo(
    () => buildArtisanToolNamesFromSlots(artisanToolSlots),
    [artisanToolSlots],
  )

  const optionalToolNames = useMemo(
    () => buildOptionalToolNamesFromChoices(ledger.choices, toolSubtypeOptionsByKind),
    [ledger.choices, toolSubtypeOptionsByKind],
  )

  const availableTools = useMemo(
    () => availableProficiencies.tools.filter((t): t is string => typeof t === 'string'),
    [availableProficiencies.tools],
  )

  const selectedToolNames = useMemo(() => getSelectedToolNames(ledger.choices), [ledger.choices])

  const visibleToolCandidates = useMemo(
    () =>
      buildVisibleToolCandidates({
        availableTools,
        optionalToolNames,
        artisanToolNames,
        currentTools: character?.proficiencies.tools ?? [],
        selectedToolNames,
      }),
    [
      availableTools,
      optionalToolNames,
      artisanToolNames,
      character?.proficiencies.tools,
      selectedToolNames,
    ],
  )

  const artisanChoiceByNorm = useMemo(
    () => buildArtisanChoiceMap(artisanToolSlots),
    [artisanToolSlots],
  )

  if (!character) {
    return <NoCharCard icon={<Certificate weight="duotone" />} noun="view proficiencies" />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Certificate className="h-6 w-6 text-primary" weight="duotone" />
            Proficiencies
          </h1>
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
                <ScrollArea className="flex-1 overflow-hidden">
                  <div className="p-4 pr-8">
                    <BuildProficienciesTabsPanel
                      skills={skills}
                      savingThrows={savingThrows}
                      availableArmor={availableProficiencies.armor.filter(
                        (armorKey): armorKey is string => typeof armorKey === 'string',
                      )}
                      availableWeapons={availableProficiencies.weapons.filter(
                        (weaponKey): weaponKey is string => typeof weaponKey === 'string',
                      )}
                      availableLanguages={availableProficiencies.languages.filter(
                        (langName): langName is string => typeof langName === 'string',
                      )}
                      currentProficiencies={{
                        armor: character.proficiencies.armor,
                        weapons: character.proficiencies.weapons,
                        tools: character.proficiencies.tools,
                        languages: character.proficiencies.languages,
                      }}
                      ledger={ledger}
                      choiceCounts={choiceCounts}
                      dropdownToolSlots={dropdownToolSlots}
                      artisanToolSlots={artisanToolSlots}
                      visibleToolCandidates={visibleToolCandidates}
                      artisanChoiceByNorm={artisanChoiceByNorm}
                      focused={focused}
                      onFocusChange={setFocused}
                      onExpandDetails={() => {
                        if (detailCollapsed) setDetailCollapsed(false)
                      }}
                      onResolveChoiceSelection={resolveChoiceSelection}
                      isStandardLanguage={availableProficiencies.isStandardLanguage}
                    />
                  </div>
                </ScrollArea>
                <div className="px-4 pb-4 border-t border-border">
                  <SourcesAccordion
                    sectionId="build-proficiencies"
                    rows={getSourcesRowsBySection('build-proficiencies')}
                  />
                </div>
              </div>{' '}
              <BuildProficienciesDetailsPanel
                focused={focused}
                detailCollapsed={detailCollapsed}
                character={character}
                skillDescriptions={skillDescriptions}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
