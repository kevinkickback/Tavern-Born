import { Certificate } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { Card } from '@/components/ui/card'
import { SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useSkills } from '@/hooks/character/useSkills'
import { useAvailableProficiencies } from '@/hooks/data/useAvailableProficiencies'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { normalizeKey } from '@/lib/provenance'
import { getImplicitSource } from '@/lib/sourcePresets'
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
  hasProfInArray,
  isArtisanToolSlot,
} from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'
import { useCharacterStore } from '@/store/characterStore'

export function BuildProficienciesPage() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const { skills: skillDefs, items, itemsBase, languages } = useFilteredGameData()
  const { skills, toggleExpertise, availableExpertiseSlots, usedExpertiseSlots } = useSkills()
  const { savingThrows } = useSavingThrows()
  const { ledger, getSourcesRowsBySection } = useProvenanceLedger()
  const { resolveChoiceSelection } = useFeatProvenanceMutations()
  const availableProficiencies = useAvailableProficiencies()

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [focused, setFocused] = useState<ProfFocus | null>(null)

  const itemsByName = useMemo(() => {
    const map = new Map<string, (typeof itemsBase)[0]>()
    for (const item of [...itemsBase, ...items]) {
      if (item.name) map.set(item.name.toLowerCase(), item)
    }
    return map
  }, [itemsBase, items])

  const weaponInfoMap = useMemo(() => {
    const map = new Map<string, { category?: string; ranged?: boolean }>()
    for (const item of [...itemsBase, ...items]) {
      if (!item.name) continue
      const category = item.weaponCategory
      const typeCode = item.type?.split('|')[0]
      const ranged = typeCode === 'R' ? true : typeCode === 'M' ? false : undefined
      if (category || ranged !== undefined) {
        map.set(item.name.toLowerCase(), { category, ranged })
      }
    }
    return map
  }, [itemsBase, items])

  const languagesByName = useMemo(() => {
    const map = new Map<string, (typeof languages)[0]>()
    for (const lang of languages) {
      if (lang.name) map.set(lang.name.toLowerCase(), lang)
    }
    return map
  }, [languages])

  const handleFocusChange = useCallback(
    (focus: ProfFocus) => {
      if (focus.type === 'item') {
        const cat = focus.category.toLowerCase()
        if (cat === 'languages') {
          const languageData = languagesByName.get(focus.name.toLowerCase()) ?? null
          setFocused({ ...focus, languageData })
        } else {
          const itemData = itemsByName.get(focus.name.toLowerCase()) ?? null
          setFocused({ ...focus, itemData })
        }
      } else {
        setFocused(focus)
      }
    },
    [itemsByName, languagesByName],
  )

  const activeFocused = useMemo(() => {
    if (!focused) return null
    if (focused.type === 'skill') {
      const skill = skills.find((s) => s.name === focused.name)
      if (!skill) return focused
      return {
        ...focused,
        proficient: skill.proficient,
        expertise: skill.expertise,
        modifierString: skill.modifierString,
      }
    }
    if (focused.type === 'save') {
      const save = savingThrows.find((s) => s.ability === focused.ability)
      if (!save) return focused
      return { ...focused, proficient: save.proficient, modifierString: save.modifierString }
    }
    if (focused.type === 'item' && character) {
      const { category, name } = focused
      const norm = normalizeKey(name)
      const ledgerGrants = ledger.proficiencies[category as keyof typeof ledger.proficiencies]
      const hasGrant = ((ledgerGrants as Record<string, unknown[]>)[norm] ?? []).length > 0
      const isProficient =
        hasProfInArray(
          character.proficiencies[category as keyof typeof character.proficiencies] as string[],
          name,
        ) || hasGrant
      return { ...focused, isProficient }
    }
    return focused
  }, [focused, skills, savingThrows, character, ledger])

  const skillDescriptions = useMemo(() => buildSkillDescriptions(skillDefs), [skillDefs])

  const choiceCounts = useMemo(() => buildChoiceCounts(ledger.choices), [ledger.choices])

  const toolSubtypeOptionsByKind = useMemo(() => {
    const rawAllowed = character?.allowedSources
    let effectiveSources: string[] | undefined
    if (rawAllowed) {
      const implicit = getImplicitSource(character?.originSystem ?? '2014')
      effectiveSources = rawAllowed.includes(implicit) ? rawAllowed : [...rawAllowed, implicit]
    }
    return buildToolSubtypeOptionsByKind({ itemsBase, items, allowedSources: effectiveSources })
  }, [character?.allowedSources, character?.originSystem, items, itemsBase])

  const languageTypes = useMemo(() => {
    const map = new Map<string, string>()
    for (const lang of languages) {
      if (lang.name && lang.type) map.set(lang.name.toLowerCase(), lang.type)
    }
    return map
  }, [languages])

  const toolTypeMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [kind, toolNames] of Object.entries(toolSubtypeOptionsByKind)) {
      if (kind === 'tool') continue // 'tool' is a superset of all subtypes; skip to avoid overwriting specific-kind entries
      for (const toolName of toolNames) {
        map.set(toolName.toLowerCase(), kind)
      }
    }
    return map
  }, [toolSubtypeOptionsByKind])

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
      <div className="px-6 py-5 page-header-band mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Certificate className="h-6 w-6 text-primary" weight="duotone" />
            <div>
              <h1 className="text-2xl font-display font-bold">Proficiencies</h1>
              <p className="text-sm text-muted-foreground">
                Armor, weapon, tool, and language proficiencies
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        <div className="max-w-7xl mx-auto h-full">
          <Card className="h-full overflow-hidden flex flex-col">
            <SplitPane
              leftCollapsed={leftCollapsed}
              rightCollapsed={detailCollapsed}
              onLeftCollapsedChange={setLeftCollapsed}
              onRightCollapsedChange={setDetailCollapsed}
              rightWidth="w-[40%] min-w-[280px]"
              left={
                <>
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
                        languageTypes={languageTypes}
                        toolTypeMap={toolTypeMap}
                        weaponInfoMap={weaponInfoMap}
                        focused={focused}
                        onFocusChange={handleFocusChange}
                        onExpandDetails={() => {
                          if (detailCollapsed) setDetailCollapsed(false)
                        }}
                        onResolveChoiceSelection={resolveChoiceSelection}
                        onToggleExpertise={toggleExpertise}
                        availableExpertiseSlots={availableExpertiseSlots}
                        usedExpertiseSlots={usedExpertiseSlots}
                        expertiseChoiceCount={Math.max(
                          0,
                          availableExpertiseSlots - usedExpertiseSlots,
                        )}
                      />
                    </div>
                  </ScrollArea>
                  <div className="px-4 pb-4 border-t border-border">
                    <SourcesAccordion
                      sectionId="build-proficiencies"
                      rows={getSourcesRowsBySection('build-proficiencies')}
                    />
                  </div>
                </>
              }
              right={
                <BuildProficienciesDetailsPanel
                  focused={activeFocused}
                  skillDescriptions={skillDescriptions}
                  weaponItemsBase={itemsBase}
                />
              }
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
