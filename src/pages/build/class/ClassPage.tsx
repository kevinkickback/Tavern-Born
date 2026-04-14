import { CaretLeft, CaretRight, Sword, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { useProvenance } from '@/hooks/character/useProvenance'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup, useOptionalFeatureLookup, useSubclass } from '@/hooks/data/useGameData'
import type { OptionalFeatureLike } from '@/lib/5etools/classData'
import {
  getClassFeatureGroups,
  getClassSpellGainAtLevel,
  getFeatureTypes,
  getSubclassSelectionInfo,
  isNormallySelectableFeat,
  resolveSubclassFeatureRefs,
} from '@/lib/5etools/classData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
import { getOrdinalForm } from '@/lib/calculations/spellUtils'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { NoCharCard } from '@/pages/_shared'
import {
  BuildClassDetailsPanel,
  type ClassFeatureDisplay,
} from '@/pages/build/class/components/DetailsPanel'
import { BuildClassLevelsPanel } from '@/pages/build/class/components/LevelsPanel'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import { applyClassAsiChoice, resetClassAsiChoice } from '@/pages/build/class/model/asi'
import type {
  ClassFeatProgression,
  OptionalFeatureProgression,
} from '@/pages/build/class/model/levelsUtils'
import {
  buildClassSelectionPatch,
  buildSubclassSelectionPatch,
} from '@/pages/build/class/model/mutations'
import {
  buildCharacterSnapshot,
  buildClassProgression,
  buildFeatModalFeats,
  buildLevelsToShow,
  countTotalAsiAcrossClasses,
  countTotalFeatSlots,
} from '@/pages/build/class/model/pageUtils'
import { useClassPageState } from '@/pages/build/class/useClassPageState'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'

interface SubclassOption {
  name: string
  source?: string
  shortName?: string
  entries?: unknown[]
  levelFeatures?: { level: number; features: ClassFeatureDisplay[] }[]
}

const CLASS_LEVEL_UP_HINT_ID = 'class-level-up-banner'
const LEVEL_UP_BUTTON_SELECTOR = '[data-level-up-button="true"]'
const LEVEL_UP_HINT_WIDTH = 320

interface HintPosition {
  top: number
  left: number
  arrowLeft: number
}

export function BuildClassPage() {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const { classes, classFeatures, optionalfeatures, spells, feats } = useFilteredGameData()
  const classLookup = useClassLookup()
  const optionalFeatureLookup = useOptionalFeatureLookup()
  const {
    applyClassSelection,
    applyClassEquipmentChoice,
    applyOptionalFeatureSelection,
    replaceFeatSelections,
    applyBatchSpellSelections,
    removeSpellProvenance,
    swapSpellProvenance,
  } = useProvenance()
  const {
    selectedClassTab,
    classPickerOpen,
    classPickerSearch,
    subclassPickerOpen,
    spellPickerLevel,
    spellSwapLevel,
    spellSwapDrop,
    detailCollapsed,
    selectedFeature,
    optPickerState,
    featPickerOpen,
    classFeatPickerState,
    asiPickerLevel,
    asiModeByLevel,
    setClassPickerOpen,
    setClassPickerSearch,
    setSubclassPickerOpen,
    setSpellPickerLevel,
    setSpellSwapLevel,
    setSpellSwapDrop,
    setDetailCollapsed,
    setSelectedFeature,
    setOptPickerState,
    setFeatPickerOpen,
    setClassFeatPickerState,
    setAsiPickerLevel,
    handleSelectClassTab,
    handleClassSelectionApplied,
    handleSubclassSelectionApplied,
    setAsiMode,
    clearAsiMode,
  } = useClassPageState()
  const classProgression = buildClassProgression(character)

  const viewingEntry =
    classProgression.find((entry) => `${entry.name}|${entry.source ?? ''}` === selectedClassTab) ??
    classProgression[0]
  const viewingClass = viewingEntry?.name ?? character?.class
  const viewingClassSource = viewingEntry?.source ?? character?.classSource
  const viewingClassLevel = viewingEntry?.levels ?? character?.level ?? 1
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
  const classEquipmentChoiceKey =
    viewingClass && viewingClassData ? `${viewingClass}|${viewingClassData.source ?? ''}` : ''
  const classEquipmentBlockChoices: string[] =
    (classEquipmentChoiceKey
      ? character?.classEquipmentChoices?.[classEquipmentChoiceKey]
      : undefined) ?? []

  const handleClassChange = (className: string, classSource?: string) => {
    if (!character) return
    const { classEntity: cls, patch } = buildClassSelectionPatch({
      character,
      className,
      classSource,
      classLookup,
      fallbackClassByName,
    })
    if (cls) applyClassSelection(cls, undefined)
    updateCharacter(character.id, patch)
    handleClassSelectionApplied()
  }
  const allClassFeatures = useMemo(() => {
    if (!viewingClass) return []
    const src = viewingClassSource ?? viewingClassData?.source
    return classFeatures
      .filter((f) => f.className === viewingClass && (!src || f.classSource === src))
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  }, [classFeatures, viewingClass, viewingClassSource, viewingClassData])

  const featuresByLevel = useMemo(() => {
    return getClassFeatureGroups(allClassFeatures)
  }, [allClassFeatures])
  const { subclassLevel, subclassFeatureName } = useMemo(() => {
    return getSubclassSelectionInfo(viewingClassData)
  }, [viewingClassData])
  const asiLevels = getASILevelsFromClass(viewingClassData)
  const includeClassFeatureVariants = character?.variantRules?.optionalClassFeatures ?? false
  const optFeatures = useMemo(
    () =>
      (
        (optionalfeatures ?? []) as Array<OptionalFeatureLike & { isClassFeatureVariant?: boolean }>
      ).filter((f) => includeClassFeatureVariants || !f.isClassFeatureVariant),
    [optionalfeatures, includeClassFeatureVariants],
  )

  const isOptionalFeatureLike = (value: unknown): value is OptionalFeatureLike => {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { name?: unknown }).name === 'string'
    )
  }

  const findOptionalFeature = (name: string, source?: string): OptionalFeatureLike | undefined => {
    const fromLookup = optionalFeatureLookup[getEntityLookupKey(name, source)]
    if (isOptionalFeatureLike(fromLookup)) return fromLookup
    return optFeatures.find((f) => f.name === name && (source === undefined || f.source === source))
  }

  const selectedNames = new Set((character?.features ?? []).map((f) => f.name))

  const handleOptFeatureConfirm = (names: string[], featureTypes: string[]) => {
    if (!character) return
    // Keep features that belong to other types (spells, class features, feats, etc.).
    const existingNonOpt = character.features.filter((f) => {
      const of = findOptionalFeature(f.name, f.source)
      if (!of) return true
      const fTypes = getFeatureTypes(of)
      return !featureTypes.some((t) => fTypes.includes(t))
    })
    const newFeatures = names.map((name) => {
      const feat = findOptionalFeature(name)
      return {
        id: `${name}-opt`,
        name,
        source: feat?.source ?? '',
        description: '',
      }
    })
    updateCharacter(character.id, {
      features: [...existingNonOpt, ...newFeatures],
    })
    for (const name of names) {
      const feat = findOptionalFeature(name)
      applyOptionalFeatureSelection(name, feat?.source, viewingClass, 'class')
    }
  }
  const spellChoicesByLevel = useMemo(() => {
    const map = new Map<
      number,
      { cantrips: number; spells: number; maxSpellLevel: number; canSwap: boolean }
    >()
    if (!viewingClassData) return map
    for (let lv = 1; lv <= 20; lv++) {
      const gain = getClassSpellGainAtLevel(viewingClassData, lv)
      if (gain.cantrips > 0 || gain.spells > 0) map.set(lv, gain)
    }
    return map
  }, [viewingClassData])
  const optFeatureProgressions = useMemo(
    () => (viewingClassData?.optionalfeatureProgression ?? []) as OptionalFeatureProgression[],
    [viewingClassData],
  )
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
  const subclasses = useMemo(() => {
    const raw = (viewingClassData?.subclasses ?? []) as SubclassOption[]
    const allowedSources = character?.allowedSources
    const characterRace = (character?.race ?? '').toLowerCase()

    let filtered = raw
    if (allowedSources && allowedSources.length > 0) {
      filtered = filtered.filter((sc) => allowedSources.includes(sc.source ?? ''))
    }

    const isElf = characterRace.includes('elf') || characterRace.includes('half-elf')
    if (!character?.variantRules?.bladesingerAnyRace && !isElf && viewingClass === 'Wizard') {
      filtered = filtered.filter((sc) => sc.name !== 'Bladesinger')
    }

    const isDwarf = characterRace.includes('dwarf')
    if (!character?.variantRules?.battleragerAnyRace && !isDwarf && viewingClass === 'Barbarian') {
      filtered = filtered.filter((sc) => sc.name !== 'Battlerager')
    }

    return filtered
  }, [
    viewingClassData?.subclasses,
    character?.allowedSources,
    character?.race,
    character?.variantRules?.bladesingerAnyRace,
    character?.variantRules?.battleragerAnyRace,
    viewingClass,
  ])

  const subclassTitle =
    typeof viewingClassData?.subclassTitle === 'string'
      ? viewingClassData.subclassTitle
      : 'Subclass'
  const viewingSubclass = viewingEntry
    ? classProgression.length > 1
      ? viewingEntry.subclass
      : (viewingEntry.subclass ?? character?.subclass)
    : character?.subclass
  const viewingSubclassData = useSubclass(
    viewingClass ?? '',
    viewingClassSource,
    viewingSubclass ?? '',
    viewingEntry?.subclassSource ?? character?.subclassSource,
  )

  const handleSubclassSelect = (sc: SubclassOption) => {
    if (!character) return
    if (viewingClassData) applyClassSelection(viewingClassData, sc)
    const patch = buildSubclassSelectionPatch({
      character,
      classProgression,
      viewingEntry,
      subclassName: sc.name,
      subclassSource: sc.source,
    })
    updateCharacter(character.id, patch)
    handleSubclassSelectionApplied({
      name: sc.name,
      source: sc.source,
      entries: resolveSubclassFeatureRefs(sc.entries ?? [], sc.shortName),
      levelFeatures: sc.levelFeatures,
    })
  }
  const characterSnapshot: PrereqCharacterSnapshot = buildCharacterSnapshot({
    character,
    classProgression,
    viewingClass,
  })
  const totalASIAcrossClasses = useMemo(
    () =>
      countTotalAsiAcrossClasses({
        classProgression,
        character,
        classLookup,
        fallbackClassByName,
      }),
    [classLookup, classProgression, fallbackClassByName, character],
  )

  const usedASI = character?.feats?.length ?? 0

  // Feat slots = total ASI levels earned minus those committed to ability score increases
  const totalFeatSlots = useMemo(
    () =>
      countTotalFeatSlots({
        classProgression,
        character,
        classLookup,
        fallbackClassByName,
      }),
    [classLookup, classProgression, fallbackClassByName, character],
  )

  // Applied ASI choices for the currently-viewed class (used in the accordion rows)
  const appliedAsiChoicesForClass = useMemo(
    () => (character?.asiChoices ?? []).filter((ac) => ac.className === viewingClass),
    [character?.asiChoices, viewingClass],
  )

  const handleFeatConfirm = (selectedFeats: Feat5e[]) => {
    replaceFeatSelections(selectedFeats)
  }

  const handleAsiApply = (level: number, abilityChanges: Record<string, 1 | 2>) => {
    if (!character) return
    const next = applyClassAsiChoice({
      characterAbilityScores: character.abilityScores,
      currentAsiChoices: character.asiChoices ?? [],
      className: viewingClass,
      level,
      abilityChanges,
    })
    updateCharacter(character.id, {
      abilityScores: next.abilityScores,
      asiChoices: next.asiChoices,
    })
    setAsiPickerLevel(null)
  }

  const handleAsiReset = (level: number) => {
    if (!character) return
    const next = resetClassAsiChoice({
      characterAbilityScores: character.abilityScores,
      currentAsiChoices: character.asiChoices ?? [],
      className: viewingClass,
      level,
    })
    if (!next) return
    updateCharacter(character.id, {
      abilityScores: next.abilityScores,
      asiChoices: next.asiChoices,
    })
    const levelKey = `${level}|${viewingClass}`
    clearAsiMode(levelKey)
  }

  // Merged feat list for the picker: available + any saved feats outside allowed sources
  const featModalFeats = useMemo(() => {
    const available = ((feats ?? []) as Feat5e[]).filter(isNormallySelectableFeat)
    return buildFeatModalFeats({
      availableFeats: available,
      selectedFeats: character?.feats ?? [],
      createFallback: (selected) =>
        ({
          name: selected.name,
          source: selected.source,
          entries: [],
        }) as Feat5e,
    })
  }, [feats, character?.feats])

  const viewingClassEntries = useMemo(
    () => (Array.isArray(viewingClassData?.entries) ? (viewingClassData.entries as unknown[]) : []),
    [viewingClassData?.entries],
  )
  const allSpells = spells as Spell5e[]
  const [showLevelUpHint, setShowLevelUpHint] = useState(
    () => !isHintDismissed(CLASS_LEVEL_UP_HINT_ID),
  )
  const [hintPosition, setHintPosition] = useState<HintPosition | null>(null)

  const handleDismissLevelUpHint = () => {
    setShowLevelUpHint(false)
    setHintDismissed(CLASS_LEVEL_UP_HINT_ID, true)
  }

  useEffect(() => {
    if (!showLevelUpHint) {
      setHintPosition(null)
      return
    }

    const updateHintPosition = () => {
      const levelUpButton = document.querySelector<HTMLElement>(LEVEL_UP_BUTTON_SELECTOR)
      if (!levelUpButton) {
        setHintPosition(null)
        return
      }

      const rect = levelUpButton.getBoundingClientRect()
      const maxLeft = Math.max(16, window.innerWidth - LEVEL_UP_HINT_WIDTH - 16)
      const left = Math.min(Math.max(rect.right - LEVEL_UP_HINT_WIDTH, 16), maxLeft)
      const top = rect.bottom + 12
      const centerX = rect.left + rect.width / 2
      const arrowLeft = Math.min(Math.max(centerX - left, 18), LEVEL_UP_HINT_WIDTH - 18)

      setHintPosition({ top, left, arrowLeft })
    }

    updateHintPosition()
    window.addEventListener('resize', updateHintPosition)
    window.addEventListener('scroll', updateHintPosition, true)

    return () => {
      window.removeEventListener('resize', updateHintPosition)
      window.removeEventListener('scroll', updateHintPosition, true)
    }
  }, [showLevelUpHint])

  if (!character) {
    return <NoCharCard icon={<Sword weight="duotone" />} noun="configure your class" />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-display text-2xl font-bold flex items-center gap-3">
            <Sword className="h-6 w-6 text-accent" weight="duotone" />
            Class
          </h1>
        </div>
      </div>

      {showLevelUpHint && hintPosition ? (
        <div
          className="pointer-events-none fixed z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-300"
          style={{ top: hintPosition.top, left: hintPosition.left }}
        >
          <div className="pointer-events-auto animate-hint-bounce relative w-[320px] rounded-lg border border-accent/50 bg-accent px-3 py-2 text-sm text-accent-foreground shadow-2xl ring-1 ring-accent/20">
            <div
              className="absolute -top-[7px] h-3.5 w-3.5 rotate-45 border-l border-t border-accent/50 bg-accent"
              style={{ left: hintPosition.arrowLeft - 7 }}
            />
            <button
              type="button"
              className="absolute top-1.5 right-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/35 bg-black/25 text-accent-foreground shadow-sm transition-colors hover:bg-black/40 hover:text-white"
              onClick={handleDismissLevelUpHint}
              aria-label="Dismiss class page hint"
              title="Dismiss hint"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="leading-snug text-accent-foreground/95 pr-8">
              Use the Level Up button to add, remove, or change your classes.
            </p>
          </div>
        </div>
      ) : null}

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
                asiModeByLevel={asiModeByLevel}
                usedASI={usedASI}
                totalASIAcrossClasses={totalASIAcrossClasses}
                onOpenClassPicker={() => setClassPickerOpen(true)}
                onOpenSubclassPicker={() => setSubclassPickerOpen(true)}
                onOpenSpellPicker={setSpellPickerLevel}
                onOpenSpellSwap={setSpellSwapLevel}
                onOpenFeatPicker={() => setFeatPickerOpen(true)}
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
                onClearFeatSelectionsForAsi={() => replaceFeatSelections([])}
                getOrdinalForm={getOrdinalForm}
              />
              <BuildClassDetailsPanel
                detailCollapsed={detailCollapsed}
                selectedFeature={selectedFeature}
                viewingClassData={viewingClassData}
                viewingClassEntries={viewingClassEntries}
                viewingSubclass={viewingSubclass}
                onClearSelection={() => setSelectedFeature(null)}
              />
            </div>
          </Card>
        </div>
      </div>
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
        onFeatPickerOpenChange={setFeatPickerOpen}
        featModalFeats={featModalFeats}
        totalFeatSlots={totalFeatSlots}
        usedASI={usedASI}
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
    </div>
  )
}
