import { Certificate } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SourcesAccordion } from '@/components/provenance/SourcesAccordion'
import { type CompactPane, SplitPane } from '@/components/ui/SplitPane'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceBody, WorkspacePage, WorkspacePaneHeader } from '@/components/workspace'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useSavingThrows } from '@/hooks/character/useSavingThrows'
import { useSkills } from '@/hooks/character/useSkills'
import { useAvailableProficiencies } from '@/hooks/data/useAvailableProficiencies'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useRouteFocusTarget } from '@/hooks/ui/useRouteFocusTarget'
import { getProficiencyCheckNoteRows } from '@/lib/calculations/proficiencyCheckNotes'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { applySkillExpertiseActionCommand } from '@/lib/character/commands/skillExpertiseCommands'
import {
  applySkillProficiencyActionCommand,
  removeSavedSkillProficiencyCommand,
} from '@/lib/character/commands/skillProficiencyCommands'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { getSkillProficiencyChoices } from '@/lib/character/skillProficiencyChoices'
import {
  classChoiceReadinessId,
  findFocusedProvenanceChoice,
  getReadinessFocus,
} from '@/lib/navigation/readinessFocus'
import { normalizeKey } from '@/lib/provenance'
import { getImplicitSource } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { BuildProficienciesDetailsPanel } from '@/pages/build/proficiencies/components/DetailsPanel'
import {
  BuildProficienciesCategorySwitcher,
  BuildProficienciesTabsPanel,
  type ProficiencyTabValue,
} from '@/pages/build/proficiencies/components/TabsPanel'
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
import { useGameDataStore } from '@/store/gameDataStore'

export function BuildProficienciesPage() {
  const [searchParams] = useSearchParams()
  const savedCharacter = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(savedCharacter)
  const character = calculation?.character ?? savedCharacter
  const data = useFilteredGameData()
  const sourceData = useGameDataStore((state) => state.gameData)
  const { skills: skillDefs, items, itemsBase, languages } = data
  const { skills, toggleExpertise, availableExpertiseSlots, usedExpertiseSlots } = useSkills()
  const { savingThrows } = useSavingThrows()
  const { ledger, getSourcesRowsBySection } = useProvenanceLedger()
  const { resolveChoiceSelection } = useFeatProvenanceMutations()
  const availableProficiencies = useAvailableProficiencies()
  const expertiseAuthority = useMemo(
    () => ({
      classes: data.classes,
      feats: data.feats,
      catalogs: buildClassChoiceFeatureCatalogs(data),
    }),
    [data],
  )
  const expertise = useMemo(
    () => (savedCharacter ? getSkillExpertiseChoices(savedCharacter, expertiseAuthority) : null),
    [savedCharacter, expertiseAuthority],
  )
  const classSkills = useMemo(
    () =>
      savedCharacter
        ? getSkillProficiencyChoices(savedCharacter, expertiseAuthority, ledger)
        : null,
    [savedCharacter, expertiseAuthority, ledger],
  )
  const handleProficiencyAction = useCallback(
    (skill: string, actionId: string) => {
      const current = useCharacterStore.getState().activeCharacter
      if (!current || current.id !== savedCharacter?.id) return
      const currentAuthority = hasCurrentCharacterSourceContext(
        current,
        savedCharacter,
        useGameDataStore.getState().gameData,
        sourceData,
      )
      const result = currentAuthority
        ? applySkillProficiencyActionCommand(
            current,
            current.provenance,
            skill,
            actionId,
            expertiseAuthority,
          )
        : removeSavedSkillProficiencyCommand(current, current.provenance, skill, actionId)
      if (
        !Object.keys(result.characterPatch).length &&
        result.provenanceUpdate === current.provenance
      )
        return
      useCharacterStore.getState().updateCharacter(current.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [savedCharacter, sourceData, expertiseAuthority],
  )
  const handleExpertiseAction = useCallback(
    (skill: string, actionId: string) => {
      const current = useCharacterStore.getState().activeCharacter
      if (!current) return
      const result = applySkillExpertiseActionCommand(current, skill, actionId, expertiseAuthority)
      if (
        !Object.keys(result.characterPatch).length &&
        result.provenanceUpdate === current.provenance
      )
        return
      useCharacterStore.getState().updateCharacter(current.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [expertiseAuthority],
  )

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [compactPane, setCompactPane] = useState<CompactPane>('left')
  const [focused, setFocused] = useState<ProfFocus | null>(null)
  const [activeTab, setActiveTab] = useState<ProficiencyTabValue>('skills')
  const readinessFocus = getReadinessFocus(searchParams)
  const focusedChoice = findFocusedProvenanceChoice(readinessFocus, ledger.choices)
  const focusedClassSkill = classSkills?.classOwners.find(
    (owner) => readinessFocus === classChoiceReadinessId(owner.id),
  )
  const focusProficiencyChoice =
    (!!focusedClassSkill ||
      focusedChoice?.domain === 'skills' ||
      focusedChoice?.domain === 'languages' ||
      focusedChoice?.domain === 'tools' ||
      focusedChoice?.domain === 'armor' ||
      focusedChoice?.domain === 'weapons') ??
    false
  const focusedChoiceTarget =
    focusProficiencyChoice && (focusedChoice || focusedClassSkill)
      ? `${readinessFocus ?? ''}\0${focusedClassSkill ? 'skills' : focusedChoice!.domain}`
      : null
  const { ref: choicePanelRef, highlighted: choicePanelHighlighted } =
    useRouteFocusTarget<HTMLDivElement>(focusProficiencyChoice)

  useEffect(() => {
    if (!focusedChoiceTarget) return
    setActiveTab(focusedChoiceTarget.split('\0')[1] as ProficiencyTabValue)
  }, [focusedChoiceTarget])

  const { itemsByName, weaponInfoMap } = useMemo(() => {
    const byName = new Map<string, (typeof itemsBase)[0]>()
    const weaponInfo = new Map<string, { category?: string; ranged?: boolean }>()
    for (const item of [...itemsBase, ...items]) {
      if (!item.name) continue
      const normalizedName = item.name.toLowerCase()
      byName.set(normalizedName, item)
      const category = item.weaponCategory
      const typeCode = item.type?.split('|')[0]
      const ranged = typeCode === 'R' ? true : typeCode === 'M' ? false : undefined
      if (category || ranged !== undefined) {
        weaponInfo.set(normalizedName, { category, ranged })
      }
    }
    return { itemsByName: byName, weaponInfoMap: weaponInfo }
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
      setCompactPane('right')
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
      const expertise =
        category === 'tools' &&
        character.proficiencies.expertise.some((value) => normalizeKey(value) === norm)
      return { ...focused, isProficient, expertise }
    }
    return focused
  }, [focused, skills, savingThrows, character, ledger])

  const skillDescriptions = useMemo(() => buildSkillDescriptions(skillDefs), [skillDefs])

  const choiceCounts = useMemo(() => {
    const counts = buildChoiceCounts(ledger.choices)
    return { ...counts, skills: counts.skills + (classSkills?.remaining ?? 0) }
  }, [ledger.choices, classSkills?.remaining])
  const expertiseChoiceCount = expertise?.remaining ?? 0

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
        selection: character,
        selectedTools: character?.proficiencies.tools ?? [],
        toolSubtypeOptionsByKind,
      }),
    [character, ledger.choices, toolSubtypeOptionsByKind],
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
          compactLeftLabel="Proficiencies"
          compactRightLabel="Proficiency details"
          rightFixedWidth="var(--workspace-master-width)"
          left={
            <>
              <WorkspacePaneHeader
                ariaLabel="Proficiency category"
                className={detailCollapsed ? 'pr-20' : undefined}
              >
                <BuildProficienciesCategorySwitcher
                  activeTab={activeTab}
                  choiceCounts={choiceCounts}
                  expertiseChoiceCount={expertiseChoiceCount}
                  onActiveTabChange={setActiveTab}
                />
              </WorkspacePaneHeader>
              <ScrollArea className="flex-1 overflow-hidden">
                <div
                  ref={choicePanelRef}
                  className={cn(
                    'mx-auto w-full max-w-5xl rounded-lg p-4',
                    choicePanelHighlighted && 'animate-route-focus',
                  )}
                >
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
                      expertise: character.proficiencies.expertise,
                      languages: character.proficiencies.languages,
                    }}
                    ledger={ledger}
                    activeTab={activeTab}
                    onActiveTabChange={setActiveTab}
                    dropdownToolSlots={dropdownToolSlots}
                    artisanToolSlots={artisanToolSlots}
                    visibleToolCandidates={visibleToolCandidates}
                    artisanChoiceByNorm={artisanChoiceByNorm}
                    languageTypes={languageTypes}
                    toolTypeMap={toolTypeMap}
                    weaponInfoMap={weaponInfoMap}
                    onFocusChange={handleFocusChange}
                    onExpandDetails={() => {
                      if (detailCollapsed) setDetailCollapsed(false)
                      setCompactPane('right')
                    }}
                    onResolveChoiceSelection={resolveChoiceSelection}
                    onToggleExpertise={toggleExpertise}
                    availableExpertiseSlots={availableExpertiseSlots}
                    usedExpertiseSlots={usedExpertiseSlots}
                    expertiseActions={expertise?.actions}
                    onExpertiseAction={handleExpertiseAction}
                    proficiencyActions={classSkills?.actions}
                    onProficiencyAction={handleProficiencyAction}
                    classSkillChoicesRemaining={classSkills?.remaining}
                  />
                </div>
              </ScrollArea>
              <div className="border-t border-border px-4 pb-4">
                <SourcesAccordion
                  sectionId="build-proficiencies"
                  title="Sources"
                  rows={[
                    ...getSourcesRowsBySection('build-proficiencies'),
                    ...(expertise?.rows ?? []),
                    ...(classSkills?.rows ?? []),
                    ...getProficiencyCheckNoteRows(
                      calculation?.effects.sourceDeclarations ?? [],
                      calculation?.effects.resolutionContext,
                    ).map((row) => ({
                      itemName: row.text,
                      category: 'Conditional proficiency',
                      attribution: 'Class',
                      sourceTypes: ['class' as const],
                      isPending: false,
                    })),
                  ]}
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
      </WorkspaceBody>
    </WorkspacePage>
  )
}
