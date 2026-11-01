import { Sword } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { type CompactPane, SplitPane } from '@/components/ui/SplitPane'
import { AnchoredHint, WorkspaceBody, WorkspacePage } from '@/components/workspace'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useClassChoiceFeatureCatalogs } from '@/hooks/character/useClassChoiceFeatureCatalogs'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useUnifiedClassSelection } from '@/hooks/character/useUnifiedClassSelection'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup, useSpellLookup } from '@/hooks/data/useGameData'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import {
  getClassFeatureGroups,
  getSelectedSubclassData,
  getSubclassSelectionInfo,
} from '@/lib/5etools/classData'
import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { getOrdinalForm } from '@/lib/calculations/spellUtils'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  type ClassFeatureDetailOrigin,
  effectiveClassDisplayData,
  effectiveDeclaredEntries,
  resolveActiveClassChoiceDetail,
} from '@/lib/character/classFeatureActivityView'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { optionalClassOwner } from '@/lib/character/optionalClassFeatureIdentity'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { getReadinessFocus } from '@/lib/navigation/readinessFocus'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { cn } from '@/lib/utils'
import { NoCharCard } from '@/pages/_shared'
import { ClassChoiceSelectionModal } from '@/pages/build/class/components/ClassChoiceSelectionModal'
import { BuildClassDetailsPanel } from '@/pages/build/class/components/DetailsPanel'
import { BuildClassLevelsPanel } from '@/pages/build/class/components/LevelsPanel'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import { getVisibleOptionalClassFeatures } from '@/pages/build/class/components/OptionalClassFeatures'
import { useClassAsiFeatController } from '@/pages/build/class/hooks/useClassAsiFeatController'
import { useClassChoiceController } from '@/pages/build/class/hooks/useClassChoiceController'
import { useClassSpellChoiceController } from '@/pages/build/class/hooks/useClassSpellChoiceController'
import { useSubclassSelectionController } from '@/pages/build/class/hooks/useSubclassSelectionController'
import {
  buildLevelsToShow,
  type ClassDetailsSelection,
  resolveSubclassDetailsSelection,
} from '@/pages/build/class/model/pageUtils'
import { useClassPageState } from '@/pages/build/class/useClassPageState'
import { useCharacterStore } from '@/store/characterStore'
import type {
  Class5e,
  Creature5e,
  Feat5e,
  Item5e,
  OptionalFeatureLike,
  Spell5e,
} from '@/types/5etools'

const CLASS_LEVEL_UP_HINT_ID = 'class-level-up-banner'
const LEVEL_UP_BUTTON_SELECTOR = '[data-level-up-button="true"]'
const LEVEL_UP_HINT_WIDTH = 320

export function BuildClassPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const character = useCharacterStore((s) => s.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const {
    classes,
    classFeatures,
    creatures,
    optionalfeatures,
    spells,
    feats,
    items,
    itemsBase,
    itemMasteries,
  } = useFilteredGameData()
  const featureCatalogs = useClassChoiceFeatureCatalogs()
  const classLookup = useClassLookup()
  const spellLookup = useSpellLookup()
  const { selectClass } = useUnifiedClassSelection()
  const { applyClassEquipmentChoice } = useClassProvenanceMutations()
  const [compactPane, setCompactPane] = useState<CompactPane>('left')
  const {
    selectedClassTab,
    classPickerOpen,
    classPickerSearch,
    detailCollapsed,
    leftCollapsed,
    selectedFeature: featureSelection,
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
  const requestedClassKey = searchParams.get('class')
  const requestedChoiceId = searchParams.get('choice')
  const readinessFocus = getReadinessFocus(searchParams)
  const requestedLevelValue = Number.parseInt(searchParams.get('level') ?? '', 10)
  const requestedLevel = Number.isNaN(requestedLevelValue) ? undefined : requestedLevelValue
  const spellByReference = useMemo(
    () =>
      new Map(
        Object.values(spellLookup).map((spell) => [
          getSpellReferenceKey(spell.name, spell.source),
          spell,
        ]),
      ),
    [spellLookup],
  )
  const viewingClassData = useMemo(() => {
    return findClassReference({ name: viewingClass, source: viewingClassSource }, classes)
  }, [classes, viewingClass, viewingClassSource])
  const includeClassFeatureVariants = character?.variantRules?.optionalClassFeatures ?? false
  const activity = useMemo(
    () => character && createOptionalClassFeatureActivity(character, featureCatalogs),
    [character, featureCatalogs],
  )
  const viewingClassDisplayData = useMemo(
    () => (activity ? effectiveClassDisplayData(viewingClassData, activity) : undefined),
    [viewingClassData, activity],
  )
  const classChoiceCatalogs = useMemo(
    () => ({
      ...featureCatalogs,
      creatures: creatures as Creature5e[],
      feats: feats as Feat5e[],
      items: items as Item5e[],
      itemsBase: itemsBase as Item5e[],
      itemMasteries,
      optionalFeatures: optionalfeatures as OptionalFeatureLike[],
    }),
    [
      featureCatalogs,
      creatures,
      feats,
      includeClassFeatureVariants,
      itemMasteries,
      items,
      itemsBase,
      optionalfeatures,
    ],
  )
  const selectedFeature = useMemo(() => {
    const resolved = resolveSubclassDetailsSelection(featureSelection, viewingClassDisplayData)
    const origin = resolved?.origin
    if (!resolved || !activity || !origin || origin.kind === 'independent') return resolved
    if (origin.kind === 'declared') {
      const addition = activity.states.find(
        ({ root, state, offered, current }) =>
          !root.original &&
          state === 'unselected' &&
          root.target === origin.target &&
          root.level === origin.earnedLevel &&
          JSON.stringify(root.owner) === JSON.stringify(origin.owner) &&
          offered &&
          !!current,
      )
      if (addition?.current)
        return {
          ...resolved,
          name: addition.current.name,
          source: addition.current.source,
          entries: addition.current.entries ?? [],
        }
      if (!activity.declared(origin.owner, origin.target, origin.earnedLevel)) return null
      const rows =
        origin.owner[0] === 'class'
          ? featureCatalogs.classFeatures
          : scopeClassChoiceFeatureCatalogs(
              featureCatalogs,
              getFeatureOwnerKey(
                origin.owner[1],
                origin.owner[2],
                origin.owner[3],
                origin.owner[4],
              ),
            ).subclassFeatures
      const current =
        activity.currentOptionalFeature(origin.owner, origin.target) ??
        rows.find(
          (row) =>
            (origin.owner[0] === 'class'
              ? getClassFeatureIdentity(row)
              : getSubclassFeatureIdentity(row)) === origin.target,
        )
      return current
        ? {
            ...resolved,
            entries: effectiveDeclaredEntries(
              current.entries ?? [],
              activity,
              origin.owner,
              origin.target,
            ),
          }
        : null
    }
    const current =
      character &&
      resolveActiveClassChoiceDetail(
        character,
        classChoiceCatalogs,
        origin,
        calculation?.character.spells.spellProfiles,
      )
    return current
      ? { ...resolved, ...current }
      : {
          ...resolved,
          entries: ['This saved choice is inactive or its current source is unavailable.'],
        }
  }, [
    featureSelection,
    viewingClassDisplayData,
    viewingClassData,
    includeClassFeatureVariants,
    classFeatures,
    viewingClass,
    viewingClassSource,
    activity,
    featureCatalogs,
    classChoiceCatalogs,
    calculation,
    character,
  ])
  const viewingSubclassSpellcastingData = useMemo(
    () => (viewingEntry ? getSelectedSubclassData(viewingClassData, viewingEntry) : undefined),
    [viewingClassData, viewingEntry],
  )
  const spellController = useClassSpellChoiceController(
    viewingClassData,
    viewingSubclassSpellcastingData,
  )
  const {
    choicesByLevel: spellChoicesByLevel,
    pickerLevel: spellPickerLevel,
    setPickerLevel: setSpellPickerLevel,
    finishClassSpellChoices,
  } = spellController
  const classEquipmentChoiceKey =
    viewingClass && viewingClassSource ? `${viewingClass}|${viewingClassSource}` : ''
  const classEquipmentBlockChoices: string[] =
    (classEquipmentChoiceKey
      ? character?.classEquipmentChoices?.[classEquipmentChoiceKey]
      : undefined) ?? []
  const classEquipmentItemChoices =
    (classEquipmentChoiceKey
      ? character?.classEquipmentItemChoices?.[classEquipmentChoiceKey]
      : undefined) ?? {}
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
      setCompactPane('right')
    },
  })

  const handleSelectFeature = (feature: ClassDetailsSelection) => {
    setSelectedFeature(feature)
    setCompactPane('right')
  }

  const handleClassChange = (className: string, classSource: string) => {
    if (!character) return
    selectClass(className, classSource, classLookup)
    handleClassSelectionApplied()
  }
  const asiFeatController = useClassAsiFeatController({
    character,
    viewingClass,
    viewingClassSource,
    classLookup,
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
  const classChoiceController = useClassChoiceController({
    character,
    viewingClassData,
    viewingClassEntry: viewingEntry,
    viewingSubclassData: viewingSubclassSpellcastingData,
    viewingClassLevel,
    includeClassFeatureVariants,
    catalogs: classChoiceCatalogs,
    configurationPaused: !!optionsPendingFeat,
    onFeatOptionsRequired: (feat, choiceId) =>
      setOptionsPendingFeat({ ...feat, classFeatChoiceId: choiceId }),
  })
  const viewingClassKey = viewingEntry
    ? `${viewingEntry.name}|${viewingEntry.source ?? ''}`
    : undefined

  useEffect(() => {
    if (!requestedClassKey || requestedClassKey === viewingClassKey) return
    if (
      classProgression.some((entry) => `${entry.name}|${entry.source ?? ''}` === requestedClassKey)
    ) {
      handleSelectClassTab(requestedClassKey)
    }
  }, [classProgression, handleSelectClassTab, requestedClassKey, viewingClassKey])

  useEffect(() => {
    if (!requestedChoiceId || (requestedClassKey && requestedClassKey !== viewingClassKey)) return
    const requestedChoice = classChoiceController.choices.find(
      (choice) => choice.id === requestedChoiceId,
    )
    const requestedRecovery = classChoiceController.recoveries.find(
      (state) => state.selection.choiceId === requestedChoiceId,
    )
    if (!requestedChoice && !requestedRecovery) return
    if (requestedChoice) classChoiceController.open(requestedChoice)
    else if (requestedRecovery) classChoiceController.openRecovery(requestedRecovery)
    const next = new URLSearchParams(searchParams)
    next.delete('choice')
    next.delete('class')
    next.delete('level')
    setSearchParams(next, { replace: true })
  }, [
    classChoiceController.choices,
    classChoiceController.open,
    classChoiceController.recoveries,
    classChoiceController.openRecovery,
    requestedChoiceId,
    requestedClassKey,
    searchParams,
    setSearchParams,
    viewingClassKey,
  ])
  const allClassFeatures = useMemo(() => {
    if (!viewingClass || !activity || !viewingClassData) return []
    const owner = optionalClassOwner(viewingClassData)
    const src = viewingClassSource ?? viewingClassData?.source
    return classFeatures
      .filter((f) => {
        if (f.className !== viewingClass) return false
        if (src && f.classSource !== src) return false
        const target = getClassFeatureIdentity(f)
        return (
          !!target &&
          activity.declared(
            owner,
            target,
            f.level ?? 1,
            undefined,
            f.isClassFeatureVariant === true,
          )
        )
      })
      .map((feature) => ({
        ...feature,
        origin: {
          kind: 'declared',
          owner,
          target: getClassFeatureIdentity(feature)!,
          earnedLevel: feature.level ?? 1,
        } as ClassFeatureDetailOrigin,
        entries: effectiveDeclaredEntries(
          feature.entries ?? [],
          activity,
          owner,
          getClassFeatureIdentity(feature),
        ),
      }))
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  }, [
    classFeatures,
    viewingClass,
    viewingClassSource,
    viewingClassData,
    includeClassFeatureVariants,
    activity,
  ])

  const featuresByLevel = useMemo(() => {
    return getClassFeatureGroups(allClassFeatures)
  }, [allClassFeatures])
  const { subclassLevel, subclassFeatureName } = useMemo(() => {
    return getSubclassSelectionInfo(viewingClassData)
  }, [viewingClassData])
  const asiLevels = viewingClassData ? getASILevelsFromClass(viewingClassData) : []
  const levelsToShow = useMemo(
    () =>
      buildLevelsToShow({
        allClassFeatures,
        asiLevels,
        subclassLevel,
        viewingClassLevel,
        spellChoicesByLevel,
        classChoiceLevels: [
          ...classChoiceController.choices.map((choice) => choice.level),
          ...classChoiceController.diagnostics.map((diagnostic) => diagnostic.level ?? 1),
          ...classChoiceController.recoveries.map((state) => state.selection.classLevel),
          ...(character && activity && viewingClass
            ? getVisibleOptionalClassFeatures({
                character,
                className: viewingClass,
                classSource: viewingClassSource,
                activity,
              }).map((row) => row.root.level)
            : []),
        ],
      }),
    [
      allClassFeatures,
      asiLevels,
      subclassLevel,
      viewingClassLevel,
      spellChoicesByLevel,
      classChoiceController.choices,
      classChoiceController.diagnostics,
      classChoiceController.recoveries,
      character,
      activity,
      viewingClass,
      viewingClassSource,
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
    () =>
      Array.isArray(viewingClassDisplayData?.entries)
        ? (viewingClassDisplayData.entries as unknown[])
        : [],
    [viewingClassDisplayData?.entries],
  )
  const viewingSubclassDisplayData = viewingClassDisplayData?.subclasses?.find(
    (subclass) =>
      subclass.name === viewingSubclassData?.name && subclass.source === viewingSubclassData.source,
  )
  const allSpells = spells as Spell5e[]
  const [showLevelUpHint, setShowLevelUpHint] = useState(
    () => !isHintDismissed(CLASS_LEVEL_UP_HINT_ID),
  )
  const hintPosition = useAnchoredHintPosition({
    enabled: showLevelUpHint,
    selector: LEVEL_UP_BUTTON_SELECTOR,
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
        dismissOnReferenceAction
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
          compactPane={compactPane}
          onCompactPaneChange={setCompactPane}
          compactLeftLabel="Class levels"
          compactRightLabel="Class details"
          leftWidth="var(--workspace-master-width)"
          left={
            <BuildClassLevelsPanel
              managedSpellStatuses={calculation?.managedClassSpellStatuses}
              optionalClassActivity={activity ?? undefined}
              classProgression={classProgression}
              selectedClassTab={selectedClassTab}
              onSelectClassTab={handleSelectClassTab}
              character={character}
              levelsToShow={levelsToShow}
              subclassLevel={subclassLevel}
              asiLevels={asiLevels}
              spellChoicesByLevel={spellChoicesByLevel}
              featuresByLevel={featuresByLevel}
              subclassFeatureName={subclassFeatureName}
              selectedFeature={selectedFeature}
              viewingClassData={viewingClassDisplayData}
              viewingSubclass={viewingSubclass}
              viewingSubclassData={viewingSubclassDisplayData}
              detailCollapsed={detailCollapsed}
              viewingClass={viewingClass ?? ''}
              viewingClassSource={viewingClassSource}
              viewingClassLevel={viewingClassLevel}
              focusLevel={requestedLevel}
              readinessFocus={readinessFocus}
              classEquipmentBlockChoices={classEquipmentBlockChoices}
              classEquipmentItemChoices={classEquipmentItemChoices}
              feats={(feats ?? []) as Feat5e[]}
              spellByReference={spellByReference}
              appliedAsiChoicesForClass={appliedAsiChoicesForClass}
              classAsiFeats={classAsiFeats}
              asiModeByLevel={asiModeByLevel}
              usedASI={usedASI}
              totalASIAcrossClasses={totalASIAcrossClasses}
              classChoices={classChoiceController.choices}
              classChoiceRecoveries={classChoiceController.recoveries}
              onRecoverClassChoice={classChoiceController.openRecovery}
              classChoiceDiagnostics={classChoiceController.diagnostics}
              selectedClassChoiceViewsById={classChoiceController.selectedViewsByChoiceId}
              onOpenClassPicker={() => setClassPickerOpen(true)}
              onOpenSubclassPicker={() => setSubclassPickerOpen(true)}
              onOpenSpellPicker={setSpellPickerLevel}
              onOpenFeatPicker={(level) => {
                setFeatPickerLevel(level)
                setFeatPickerOpen(true)
              }}
              onOpenAsiPicker={setAsiPickerLevel}
              onOpenClassChoice={classChoiceController.open}
              onBlockChoiceChange={(blockIndex, choice) => {
                if (!viewingClassData) return
                applyClassEquipmentChoice(viewingClassData, blockIndex, choice)
              }}
              onItemChoiceChange={(blockIndex, choice, key, itemRef) => {
                if (!viewingClassData) return
                applyClassEquipmentChoice(viewingClassData, blockIndex, choice, {
                  ...classEquipmentItemChoices,
                  [key]: itemRef,
                })
              }}
              onSelectFeature={handleSelectFeature}
              onExpandDetails={() => {
                setDetailCollapsed(false)
                setCompactPane('right')
              }}
              onAsiReset={handleAsiReset}
              onSetAsiModeByLevel={setAsiMode}
              onClearFeatSelectionsForAsi={clearFeatSelectionForAsi}
              getOrdinalForm={getOrdinalForm}
            />
          }
          right={
            <BuildClassDetailsPanel
              selectedFeature={selectedFeature}
              viewingClassData={viewingClassDisplayData}
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
        viewingEntry={viewingEntry}
        onFinishClassSpellChoices={finishClassSpellChoices}
        subclassPickerOpen={subclassPickerOpen}
        onSubclassPickerOpenChange={setSubclassPickerOpen}
        subclassTitle={subclassTitle}
        subclasses={subclasses}
        viewingSubclass={viewingSubclass}
        onSubclassConfirm={(subclass) => {
          handleSubclassSelect(subclass)
          classChoiceController.configureSubclass(subclass)
        }}
        characterSnapshot={characterSnapshot}
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
      />

      {classChoiceController.activeChoice && (
        <ClassChoiceSelectionModal
          key={
            classChoiceController.activeChoice.id +
            ':' +
            String(classChoiceController.activeRemovalOnly)
          }
          choice={classChoiceController.activeChoice}
          removalOnly={classChoiceController.activeRemovalOnly}
          options={classChoiceController.activeOptionViews}
          maximumSelections={classChoiceController.activeRequiredCount}
          initialSelectedIds={classChoiceController.activeInitialSelectedIds}
          characterSnapshot={characterSnapshot}
          className={viewingClass}
          classSource={viewingClassSource}
          onClose={classChoiceController.close}
          onConfirm={classChoiceController.confirm}
          historicalSetup={classChoiceController.historicalSetup}
        />
      )}

      {optionsPendingFeat && (
        <FeatOptionsModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) setOptionsPendingFeat(null)
          }}
          feat={optionsPendingFeat}
          initialSelections={optionsPendingFeat.initialOptions}
          optionTarget={optionsPendingFeat}
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
