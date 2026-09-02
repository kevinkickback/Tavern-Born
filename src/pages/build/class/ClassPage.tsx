import { Sword } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { SplitPane } from '@/components/ui/SplitPane'
import { AnchoredHint, WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useUnifiedClassSelection } from '@/hooks/character/useUnifiedClassSelection'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { getClassFeatureGroups, getSubclassSelectionInfo } from '@/lib/5etools/classData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { getOrdinalForm } from '@/lib/calculations/spellUtils'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { BuildClassDetailsPanel } from '@/pages/build/class/components/DetailsPanel'
import { BuildClassLevelsPanel } from '@/pages/build/class/components/LevelsPanel'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useClassOptionalFeatureController } from '@/pages/build/class/hooks/useClassOptionalFeatureController'
import { useClassSpellChoiceController } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { useSubclassSelectionController } from '@/pages/build/class/hooks/useSubclassSelectionController'
import type { ClassFeatProgression } from '@/pages/build/class/model/levelsUtils'
import { buildLevelsToShow } from '@/pages/build/class/model/pageUtils'
import { useClassPageState } from '@/pages/build/class/useClassPageState'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'

const CLASS_LEVEL_UP_HINT_ID = 'class-level-up-banner'
const LEVEL_UP_BUTTON_SELECTOR = '[data-level-up-button="true"]'
const LEVEL_UP_HINT_WIDTH = 320

export function BuildClassPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { classes, classFeatures, optionalfeatures, spells, feats } = useFilteredGameData()
  const classLookup = useClassLookup()
  const { selectClass } = useUnifiedClassSelection()
  const { applyClassEquipmentChoice } = useClassProvenanceMutations()
  const {
    selectedClassTab,
    classPickerOpen,
    classPickerSearch,
    detailCollapsed,
    leftCollapsed,
    selectedFeature,
    setClassPickerOpen,
    setClassPickerSearch,
    setDetailCollapsed,
    setLeftCollapsed,
    setSelectedFeature,
    handleSelectClassTab,
    handleClassSelectionApplied,
  } = useClassPageState()
  const classProgression = getCharacterClassEntries(character)

  const viewingEntry =
    classProgression.find((entry) => `${entry.name}|${entry.source ?? ''}` === selectedClassTab) ??
    classProgression[0]
  const viewingClass = viewingEntry?.name
  const viewingClassSource = viewingEntry?.source
  const viewingClassLevel = viewingEntry?.levels ?? 1
  const fallbackClassByName = useMemo(
    () => new Map((classes as Class5e[]).map((cls) => [cls.name, cls])),
    [classes],
  )
  const spellByName = useMemo(
    () => new Map((spells as Spell5e[]).map((s) => [s.name, s])),
    [spells],
  )
  const featByCompositeId = useMemo(
    () => new Map(((feats ?? []) as Feat5e[]).map((f) => [`${f.name}|${f.source ?? ''}`, f])),
    [feats],
  )

  const viewingClassData = viewingClassSource
    ? classLookup[getEntityLookupKey(viewingClass, viewingClassSource)]
    : fallbackClassByName.get(viewingClass ?? '')
  const spellController = useClassSpellChoiceController(viewingClassData)
  const {
    choicesByLevel: spellChoicesByLevel,
    pickerLevel: spellPickerLevel,
    setPickerLevel: setSpellPickerLevel,
    swapLevel: spellSwapLevel,
    setSwapLevel: setSpellSwapLevel,
    swapDrop: spellSwapDrop,
    setSwapDrop: setSpellSwapDrop,
    applyBatchSpellSelections,
    removeSpellProvenance,
    swapSpellProvenance,
  } = spellController
  const classEquipmentChoiceKey =
    viewingClass && viewingClassData ? `${viewingClass}|${viewingClassData.source ?? ''}` : ''
  const classEquipmentBlockChoices: string[] =
    (classEquipmentChoiceKey
      ? character?.classEquipmentChoices?.[classEquipmentChoiceKey]
      : undefined) ?? []
  const subclassController = useSubclassSelectionController({
    character,
    viewingClassData,
    viewingClass,
    viewingClassSource,
    viewingEntry,
    classProgression,
    onSelectionApplied: (feature) => {
      setSelectedFeature(feature)
      setDetailCollapsed(false)
    },
  })

  const handleClassChange = (className: string, classSource?: string) => {
    if (!character) return
    selectClass(className, classSource, classLookup, fallbackClassByName)
    handleClassSelectionApplied()
  }
  const includeClassFeatureVariants = character?.variantRules?.optionalClassFeatures ?? false
  const optionalFeatureController = useClassOptionalFeatureController({
    character,
    viewingClass,
    viewingClassData,
    optionalFeatures: optionalfeatures,
    includeClassFeatureVariants,
  })
  const {
    features: optFeatures,
    progressions: optFeatureProgressions,
    selectedNames,
    pickerState: optPickerState,
    setPickerState: setOptPickerState,
    confirm: handleOptFeatureConfirm,
  } = optionalFeatureController
  const asiFeatController = useClassAsiFeatController({
    character,
    viewingClass,
    viewingClassSource,
    classLookup,
    fallbackClassByName,
    feats: feats as Feat5e[],
  })
  const {
    characterSnapshot,
    totalAsi: totalASIAcrossClasses,
    usedAsi: usedASI,
    appliedAsiChoicesForClass,
    classAsiFeats,
    featModalFeats,
    featPickerInitialSelectedIds,
    featPickerOpen,
    setFeatPickerOpen,
    setFeatPickerLevel,
    classFeatPickerState,
    setClassFeatPickerState,
    asiPickerLevel,
    setAsiPickerLevel,
    asiModeByLevel,
    optionsPendingFeat,
    setOptionsPendingFeat,
    confirmFeat: handleFeatConfirm,
    clearFeatSelection: clearFeatSelectionForAsi,
    applyAsi: handleAsiApply,
    resetAsi: handleAsiReset,
    setAsiMode,
    commitFeatWithOptions,
  } = asiFeatController
  const allClassFeatures = useMemo(() => {
    if (!viewingClass) return []
    const src = viewingClassSource ?? viewingClassData?.source
    return classFeatures
      .filter((f) => {
        if (f.className !== viewingClass) return false
        if (src && f.classSource !== src) return false
        if (!includeClassFeatureVariants && f.name.startsWith('Optional Rule:')) return false
        return true
      })
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  }, [
    classFeatures,
    viewingClass,
    viewingClassSource,
    viewingClassData,
    includeClassFeatureVariants,
  ])

  const featuresByLevel = useMemo(() => {
    return getClassFeatureGroups(allClassFeatures)
  }, [allClassFeatures])
  const { subclassLevel, subclassFeatureName } = useMemo(() => {
    return getSubclassSelectionInfo(viewingClassData)
  }, [viewingClassData])
  const asiLevels = viewingClassData ? getASILevelsFromClass(viewingClassData) : []
  const classFeatProgressions = useMemo(
    () => (viewingClassData?.featProgression ?? []) as ClassFeatProgression[],
    [viewingClassData],
  )
  const levelsToShow = useMemo(
    () =>
      buildLevelsToShow({
        allClassFeatures,
        asiLevels,
        subclassLevel,
        viewingClassLevel,
        spellChoicesByLevel,
        optFeatureProgressions,
        classFeatProgressions,
      }),
    [
      allClassFeatures,
      asiLevels,
      subclassLevel,
      viewingClassLevel,
      spellChoicesByLevel,
      optFeatureProgressions,
      classFeatProgressions,
    ],
  )
  const {
    pickerOpen: subclassPickerOpen,
    setPickerOpen: setSubclassPickerOpen,
    subclasses,
    subclassTitle,
    viewingSubclass,
    viewingSubclassData,
    select: handleSubclassSelect,
  } = subclassController
  const viewingClassEntries = useMemo(
    () => (Array.isArray(viewingClassData?.entries) ? (viewingClassData.entries as unknown[]) : []),
    [viewingClassData?.entries],
  )
  const allSpells = spells as Spell5e[]
  const [showLevelUpHint, setShowLevelUpHint] = useState(
    () => !isHintDismissed(CLASS_LEVEL_UP_HINT_ID),
  )
  const hintPosition = useAnchoredHintPosition({
    enabled: showLevelUpHint,
    selector: LEVEL_UP_BUTTON_SELECTOR,
    width: LEVEL_UP_HINT_WIDTH,
    horizontalAlign: 'end',
  })

  const handleDismissLevelUpHint = () => {
    setShowLevelUpHint(false)
    setHintDismissed(CLASS_LEVEL_UP_HINT_ID, true)
  }

  if (!character) {
    return <NoCharCard icon={<Sword weight="duotone" />} noun="configure your class" />
  }

  return (
    <WorkspacePage className="p-3">
      <AnchoredHint
        position={showLevelUpHint ? hintPosition : null}
        width={LEVEL_UP_HINT_WIDTH}
        onDismiss={handleDismissLevelUpHint}
        dismissLabel="Dismiss class page hint"
      >
        Use the Level Up button to add, remove, or change your classes.
      </AnchoredHint>

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
            <BuildClassLevelsPanel
              classProgression={classProgression}
              selectedClassTab={selectedClassTab}
              onSelectClassTab={handleSelectClassTab}
              character={character}
              levelsToShow={levelsToShow}
              subclassLevel={subclassLevel}
              asiLevels={asiLevels}
              spellChoicesByLevel={spellChoicesByLevel}
              optFeatureProgressions={optFeatureProgressions}
              classFeatProgressions={classFeatProgressions}
              featuresByLevel={featuresByLevel}
              subclassFeatureName={subclassFeatureName}
              selectedFeature={selectedFeature}
              viewingClassData={viewingClassData}
              viewingSubclass={viewingSubclass}
              viewingSubclassData={viewingSubclassData}
              detailCollapsed={detailCollapsed}
              viewingClass={viewingClass ?? ''}
              viewingClassSource={viewingClassSource}
              viewingClassLevel={viewingClassLevel}
              classEquipmentBlockChoices={classEquipmentBlockChoices}
              selectedNames={selectedNames}
              optFeatures={optFeatures}
              featByCompositeId={featByCompositeId}
              feats={(feats ?? []) as Feat5e[]}
              spellByName={spellByName}
              appliedAsiChoicesForClass={appliedAsiChoicesForClass}
              classAsiFeats={classAsiFeats}
              asiModeByLevel={asiModeByLevel}
              usedASI={usedASI}
              totalASIAcrossClasses={totalASIAcrossClasses}
              onOpenClassPicker={() => setClassPickerOpen(true)}
              onOpenSubclassPicker={() => setSubclassPickerOpen(true)}
              onOpenSpellPicker={setSpellPickerLevel}
              onOpenSpellSwap={setSpellSwapLevel}
              onOpenFeatPicker={(level) => {
                setFeatPickerLevel(level)
                setFeatPickerOpen(true)
              }}
              onOpenAsiPicker={setAsiPickerLevel}
              onOpenOptPicker={setOptPickerState}
              onOpenClassFeatPicker={setClassFeatPickerState}
              onBlockChoiceChange={(blockIndex, choice) => {
                if (!viewingClassData) return
                applyClassEquipmentChoice(viewingClassData, blockIndex, choice)
              }}
              onSelectFeature={setSelectedFeature}
              onExpandDetails={() => setDetailCollapsed(false)}
              onAsiReset={handleAsiReset}
              onSetAsiModeByLevel={setAsiMode}
              onClearFeatSelectionsForAsi={clearFeatSelectionForAsi}
              getOrdinalForm={getOrdinalForm}
            />
          }
          right={
            <BuildClassDetailsPanel
              selectedFeature={selectedFeature}
              viewingClassData={viewingClassData}
              viewingClassLevel={viewingClassLevel}
              viewingClassEntries={viewingClassEntries}
              viewingSubclass={viewingSubclass}
              onClearSelection={() => setSelectedFeature(null)}
            />
          }
        />
      </WorkspaceBody>
      <BuildClassModals
        character={character}
        classes={classes as Class5e[]}
        classPickerOpen={classPickerOpen}
        classPickerSearch={classPickerSearch}
        onClassPickerOpenChange={setClassPickerOpen}
        onClassPickerSearchChange={setClassPickerSearch}
        onClassSelect={handleClassChange}
        spellPickerLevel={spellPickerLevel}
        onSpellPickerLevelChange={setSpellPickerLevel}
        spellChoicesByLevel={spellChoicesByLevel}
        classSpells={allSpells}
        spellByName={spellByName}
        viewingClass={viewingClass}
        viewingClassSource={viewingClassSource}
        onUpdateCharacter={(patch) => updateCharacter(character.id, patch)}
        subclassPickerOpen={subclassPickerOpen}
        onSubclassPickerOpenChange={setSubclassPickerOpen}
        subclassTitle={subclassTitle}
        subclasses={subclasses}
        viewingSubclass={viewingSubclass}
        onSubclassConfirm={handleSubclassSelect}
        optPickerState={optPickerState}
        onOptPickerStateChange={setOptPickerState}
        optFeatures={optFeatures}
        characterSnapshot={characterSnapshot}
        onOptFeatureConfirm={handleOptFeatureConfirm}
        asiPickerLevel={asiPickerLevel}
        onAsiPickerLevelChange={setAsiPickerLevel}
        appliedAsiChoicesForClass={appliedAsiChoicesForClass}
        onAsiApply={handleAsiApply}
        featPickerOpen={featPickerOpen}
        onFeatPickerOpenChange={(open) => {
          setFeatPickerOpen(open)
          if (!open) setFeatPickerLevel(null)
        }}
        featModalFeats={featModalFeats}
        featPickerInitialSelectedIds={featPickerInitialSelectedIds}
        onFeatConfirm={handleFeatConfirm}
        classFeatPickerState={classFeatPickerState}
        onClassFeatPickerStateChange={setClassFeatPickerState}
        feats={(feats ?? []) as Feat5e[]}
        featByCompositeId={featByCompositeId}
        onApplyBatchSpellSelections={applyBatchSpellSelections}
        onRemoveSpellProvenance={removeSpellProvenance}
        onSwapSpellProvenance={swapSpellProvenance}
        spellSwapLevel={spellSwapLevel}
        spellSwapDrop={spellSwapDrop}
        onSpellSwapLevelChange={setSpellSwapLevel}
        onSpellSwapDropChange={setSpellSwapDrop}
      />

      {optionsPendingFeat && (
        <FeatOptionsModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOptionsPendingFeat(null)
          }}
          feat={optionsPendingFeat}
          proficientSkillNames={character.proficiencies?.skills ?? []}
          onFinish={(selections) => {
            commitFeatWithOptions(optionsPendingFeat, selections, allSpells)
            setOptionsPendingFeat(null)
          }}
          onDismiss={() => setOptionsPendingFeat(null)}
        />
      )}
    </WorkspacePage>
  )
}
