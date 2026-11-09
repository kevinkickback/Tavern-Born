import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { isNormallySelectableFeat } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { deriveFeatOptionSteps, hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import {
  createCharacterCalculationContext,
  getIntrinsicAbilityScores,
} from '@/lib/calculations/characterCalculationContext'
import { buildFeatModalFeats } from '@/lib/calculations/featChoices'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import { getFeatOptionOwnerKey } from '@/lib/character/commands/featCommandIdentity'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  type FeatOptionTarget,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import {
  countReservedEpicBoonFeatSlots,
  EPIC_BOON_LEVEL,
  type EpicBoonSlot,
  isEpicBoonAsiFeat,
  replaceEpicBoonSelection,
  withoutEpicBoonSelection,
} from '@/lib/character/epicBoonSlots'
import { getFeatSetupOwners } from '@/lib/character/featSetupOwners'
import { getRevisedClassFeatSlot } from '@/lib/character/revisedClassFeatSlot'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { getFeatSelectionKey } from '@/lib/provenance/featSelectionIdentity'
import {
  applyClassAsiChoice,
  isClassAsiFeatForSlot,
  resetClassAsiChoice,
} from '@/pages/build/class/model/asi'
import { countTotalAsiAcrossClasses } from '@/pages/build/class/model/pageUtils'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'

function epicBoonEditContext(character: Character, slot: EpicBoonSlot) {
  return { character, choiceId: slot.choiceId, data: useGameDataStore.getState().gameData }
}

type EpicBoonEditContext = ReturnType<typeof epicBoonEditContext>
type PendingFeat = Feat5e &
  FeatOptionTarget & { initialOptions?: FeatOptionSelections; epicBoon?: EpicBoonEditContext }

interface ClassAsiFeatControllerParams {
  character: Character | null
  viewingClass?: string
  viewingClassSource?: string
  classLookup: Record<string, Class5e | undefined>
  feats: Feat5e[]
}

export function useClassAsiFeatController({
  character,
  viewingClass,
  viewingClassSource,
  classLookup,
  feats,
}: ClassAsiFeatControllerParams) {
  const calculationContext = useCharacterCalculationContext(character)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const { replaceFeatSelections, editFeatWithOptions } = useFeatProvenanceMutations()
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [featPickerLevel, setFeatLevel] = useState<number | null>(null)
  const [asiPickerLevel, setAsiLevel] = useState<number | null>(null)
  const [asiModeByLevel, setAsiModeByLevel] = useState<Record<string, 'asi' | 'feat'>>({})
  const [optionsPendingFeat, setPendingFeat] = useState<PendingFeat | null>(null)
  const featPickerOrigin = useRef<EpicBoonEditContext | null>(null)
  const asiPickerOrigin = useRef<EpicBoonEditContext | null>(null)
  const viewed = { name: viewingClass, source: viewingClassSource }
  const epicBoonSlot = calculationContext?.classChoices.epicBoonSlots.find((slot) =>
    findClassReference(viewed, [slot.owner]),
  )
  const isEpicBoonEditCurrent = (edit: EpicBoonEditContext | null | undefined) =>
    !!edit &&
    edit.character === character &&
    edit.character === useCharacterStore.getState().activeCharacter &&
    edit.choiceId === epicBoonSlot?.choiceId &&
    edit.data === useGameDataStore.getState().gameData
  const setFeatPickerLevel = (level: number | null) => {
    featPickerOrigin.current =
      level === EPIC_BOON_LEVEL && epicBoonSlot && character
        ? epicBoonEditContext(character, epicBoonSlot)
        : null
    setFeatLevel(level)
  }
  const setAsiPickerLevel = (level: number | null) => {
    asiPickerOrigin.current =
      level === EPIC_BOON_LEVEL && epicBoonSlot && character
        ? epicBoonEditContext(character, epicBoonSlot)
        : null
    setAsiLevel(level)
  }
  const currentOptions = (target: FeatOptionTarget) => {
    const current = useCharacterStore.getState().activeCharacter
    return current
      ? getFeatSetupOwners(current, feats).find(
          (owner) =>
            getFeatSelectionKey(owner.target) === getFeatSelectionKey(target) &&
            getFeatOptionOwnerKey(owner.target) === getFeatOptionOwnerKey(target),
        )?.options
      : undefined
  }
  const setOptionsPendingFeat = (target: PendingFeat | null) =>
    setPendingFeat(target ? { ...target, initialOptions: currentOptions(target) } : null)
  const editEpicBoonOptions = () => {
    const selected = epicBoonSlot?.feat
    if (
      !character ||
      !epicBoonSlot ||
      !selected ||
      useCharacterStore.getState().activeCharacter !== character
    )
      return
    const feat = feats.find((row) => getFeatSelectionKey(row) === getFeatSelectionKey(selected))
    if (!feat || !hasFeatOptions(feat)) return
    setOptionsPendingFeat({
      ...feat,
      selectionKind: 'ordinary',
      epicBoon: epicBoonEditContext(character, epicBoonSlot),
    })
  }
  const classProgression = getCharacterClassEntries(character)
  const effectiveFeats = character?.feats ?? []

  const appliedAsiChoicesForClass = useMemo(
    () =>
      (character?.asiChoices ?? []).filter(
        (choice) => choice.className === viewingClass && choice.classSource === viewingClassSource,
      ),
    [character?.asiChoices, viewingClass, viewingClassSource],
  )
  const classAsiFeats = useMemo(
    () =>
      effectiveFeats.filter(
        (feat) =>
          Boolean(viewingClass) &&
          feat.classLevel != null &&
          isClassAsiFeatForSlot(feat, viewingClass ?? '', viewingClassSource),
      ),
    [effectiveFeats, viewingClass, viewingClassSource],
  )
  const characterSnapshot = useMemo(
    () =>
      buildPrerequisiteSnapshot({
        character,
        classProgression,
        classLookup,
        effectiveAbilityScores: calculationContext?.abilityScores.total,
        classChoiceFeatureCatalogs: calculationContext?.classChoices.catalogs,
        classChoicePrerequisites: calculationContext?.classChoices.prerequisites,
        effectiveSpellProfiles: calculationContext?.character.spells.spellProfiles,
      }),
    [character, calculationContext, classProgression, classLookup],
  )
  const totalAsi = useMemo(
    () =>
      countTotalAsiAcrossClasses({
        classProgression,
        character,
        classLookup,
      }),
    [classProgression, character, classLookup],
  )
  const viewedClass = findClassReference(
    { name: viewingClass, source: viewingClassSource },
    Object.values(classLookup),
  )
  const revisedFeatSlot =
    viewedClass?.edition === 'one' ||
    viewingClassSource?.toUpperCase() === 'XPHB' ||
    (!viewedClass && character?.originSystem === '2024')
  const epicFeatPicker = featPickerLevel === EPIC_BOON_LEVEL ? epicBoonSlot : undefined
  const epicAsiPicker = asiPickerLevel === EPIC_BOON_LEVEL ? epicBoonSlot : undefined
  const epicPicker = epicFeatPicker ?? epicAsiPicker
  const withoutEpicPick = useMemo(
    () =>
      epicPicker && character ? withoutEpicBoonSelection(character, epicPicker.owner) : character,
    [epicPicker, character],
  )
  const epicReplacementContext = useMemo(
    () =>
      withoutEpicPick && withoutEpicPick !== character && calculationContext
        ? createCharacterCalculationContext(
            withoutEpicPick,
            calculationContext.lookups.primary,
            calculationContext.lookups.raw,
          )
        : calculationContext,
    [withoutEpicPick, character, calculationContext],
  )
  const epicBoonAsiBefore = useMemo(
    () =>
      epicAsiPicker && epicReplacementContext
        ? getIntrinsicAbilityScores(epicReplacementContext.abilityScores)
        : undefined,
    [epicAsiPicker, epicReplacementContext],
  )
  const slot = useMemo(() => {
    const catalogs = calculationContext?.classChoices.catalogs
    if (epicPicker)
      return epicPicker.current && withoutEpicPick && catalogs
        ? getRevisedClassFeatSlot(
            withoutEpicPick,
            { ...epicPicker.owner, level: EPIC_BOON_LEVEL },
            catalogs,
          )
        : undefined
    if (
      !revisedFeatSlot ||
      !character ||
      !viewingClass ||
      !viewingClassSource ||
      featPickerLevel == null ||
      !catalogs ||
      appliedAsiChoicesForClass.some((choice) => choice.level === featPickerLevel)
    )
      return undefined
    return getRevisedClassFeatSlot(
      character,
      { name: viewingClass, source: viewingClassSource, level: featPickerLevel },
      catalogs,
    )
  }, [
    revisedFeatSlot,
    character,
    viewingClass,
    viewingClassSource,
    featPickerLevel,
    calculationContext,
    appliedAsiChoicesForClass,
    epicPicker,
    withoutEpicPick,
  ])
  const featPickerSnapshot = useMemo(() => {
    if (!slot || !character || !viewingClass || !calculationContext) return characterSnapshot
    const otherFeats = character.feats.filter(
      (feat) =>
        !isClassAsiFeatForSlot(
          feat,
          viewingClass,
          viewingClassSource,
          featPickerLevel ?? undefined,
        ),
    )
    const remaining =
      epicReplacementContext && epicPicker
        ? epicReplacementContext
        : otherFeats.length === character.feats.length
          ? calculationContext
          : createCharacterCalculationContext(
              applyCharacterCommandResult(
                character,
                replaceFeatSelectionsCommand(character, character.provenance, otherFeats),
              ),
              calculationContext.lookups.primary,
              calculationContext.lookups.raw,
            )
    return {
      ...characterSnapshot,
      ...slot,
      abilityScores: remaining.abilityScores.total,
      features: remaining.character.features,
      spells:
        remaining === calculationContext
          ? characterSnapshot.spells
          : buildPrerequisiteSnapshot({
              character: remaining.character,
              effectiveSpellProfiles: remaining.character.spells.spellProfiles,
            }).spells,
      progression: slot.progression.map((entry) => ({
        ...findClassReference(entry, characterSnapshot.progression),
        ...entry,
      })),
    }
  }, [
    slot,
    character,
    viewingClass,
    viewingClassSource,
    featPickerLevel,
    calculationContext,
    characterSnapshot,
    epicPicker,
    epicReplacementContext,
  ])
  const featModalFeats = useMemo(() => {
    const counts = new Map<string, number>()
    if (slot)
      for (const feat of feats) {
        const key = getFeatSelectionKey(feat)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    const owned = new Set(
      slot && character
        ? getFeatSetupOwners(epicFeatPicker ? (withoutEpicPick ?? character) : character, []).map(
            (owner) => getFeatSelectionKey(owner.target),
          )
        : [],
    )
    const current = new Set(
      classAsiFeats.filter((feat) => feat.classLevel === featPickerLevel).map(getFeatSelectionKey),
    )
    const available = feats.filter((feat) => {
      if (!revisedFeatSlot) return isNormallySelectableFeat(feat)
      if (!slot) return false
      const key = getFeatSelectionKey(feat)
      return (
        !!feat.source?.trim() &&
        feat.sourceIdentityConflict !== true &&
        counts.get(key) === 1 &&
        (!epicFeatPicker || !isEpicBoonAsiFeat(feat)) &&
        (current.has(key) ||
          !owned.has(key) ||
          (feat.repeatable === true &&
            !deriveFeatOptionSteps(feat).some((step) => step.kind === 'spellcastingClass'))) &&
        (isNormallySelectableFeat(feat) ||
          (slot.openFeatCategories && (feat.category === 'O' || feat.category === 'EB')))
      )
    })
    if (epicFeatPicker) {
      const ordinaryElsewhere = new Set(withoutEpicPick?.feats.map(getFeatSelectionKey))
      return available.filter((feat) => !ordinaryElsewhere.has(getFeatSelectionKey(feat)))
    }
    const merged = buildFeatModalFeats({
      availableFeats: available,
      selectedFeats: effectiveFeats,
      createFallback: (selected) =>
        ({ name: selected.name, source: selected.source, entries: [] }) as Feat5e,
    })
    const assignedElsewhere = new Set(
      effectiveFeats
        .filter(
          (feat) =>
            !viewingClass ||
            !isClassAsiFeatForSlot(
              feat,
              viewingClass,
              viewingClassSource,
              featPickerLevel ?? undefined,
            ),
        )
        .map(getFeatSelectionKey),
    )
    return merged.filter((feat) => !assignedElsewhere.has(getFeatSelectionKey(feat)))
  }, [
    feats,
    effectiveFeats,
    featPickerLevel,
    viewingClass,
    viewingClassSource,
    revisedFeatSlot,
    character,
    classAsiFeats,
    slot,
    epicFeatPicker,
    withoutEpicPick,
  ])
  const featPickerInitialSelectedIds = useMemo(() => {
    if (epicFeatPicker) return epicFeatPicker.feat ? [getFeatSelectionKey(epicFeatPicker.feat)] : []
    return classAsiFeats
      .filter((feat) => feat.classLevel === featPickerLevel)
      .map(getFeatSelectionKey)
  }, [classAsiFeats, featPickerLevel, epicFeatPicker])

  const updateEpicBoon = (
    slot: EpicBoonSlot,
    replacement: Parameters<typeof replaceEpicBoonSelection>[2],
  ) => {
    if (!character || useCharacterStore.getState().activeCharacter !== character) return false
    const catalogs = calculationContext?.classChoices.catalogs
    const next = replaceEpicBoonSelection(
      character,
      slot,
      replacement,
      catalogs
        ? {
            catalogs,
            feats,
            prerequisites: featPickerSnapshot,
            rawClasses: calculationContext?.lookups.raw.classesByKey,
          }
        : undefined,
    )
    if (next === character) return false
    const patch: Partial<Character> = {}
    if (next.feats !== character.feats) patch.feats = next.feats
    if (next.classFeatChoices !== character.classFeatChoices)
      patch.classFeatChoices = next.classFeatChoices
    if (next.classChoiceSelections !== character.classChoiceSelections)
      patch.classChoiceSelections = next.classChoiceSelections
    if (next.asiChoices !== character.asiChoices) patch.asiChoices = next.asiChoices
    if (next.spells !== character.spells) patch.spells = next.spells
    if (next.proficiencies !== character.proficiencies) patch.proficiencies = next.proficiencies
    if (next.provenance !== character.provenance) patch.provenance = next.provenance
    updateCharacter(character.id, patch)
    return true
  }

  const confirmFeat = (selectedFeats: Feat5e[]) => {
    if (!character || !viewingClass || !viewingClassSource || featPickerLevel == null) return
    if (epicFeatPicker || featPickerOrigin.current) {
      if (
        !epicFeatPicker ||
        !isEpicBoonEditCurrent(featPickerOrigin.current) ||
        selectedFeats.length > 1
      ) {
        toast.info('This Epic Boon slot changed. Reopen it to see the current choices.')
        return
      }
      const selected = selectedFeats[0]
      const key = selected && getFeatSelectionKey(selected)
      if (key && featPickerInitialSelectedIds.includes(key)) {
        setFeatPickerOpen(false)
        setFeatPickerLevel(null)
        return
      }
      const live = key && featModalFeats.find((feat) => getFeatSelectionKey(feat) === key)
      if (
        !live ||
        !checkAllPrerequisites(live, featPickerSnapshot).met ||
        !updateEpicBoon(epicFeatPicker, { feat: live })
      ) {
        toast.info('Choose a currently eligible feat for this Epic Boon slot.')
        return
      }
      const active = useCharacterStore.getState().activeCharacter
      if (active && active !== character && hasFeatOptions(live)) {
        setOptionsPendingFeat({
          ...live,
          selectionKind: 'ordinary',
          epicBoon: epicBoonEditContext(active, epicFeatPicker),
        })
      }
      setFeatPickerOpen(false)
      setFeatPickerLevel(null)
      return
    }
    if (revisedFeatSlot) {
      if (useCharacterStore.getState().activeCharacter !== character || selectedFeats.length > 1)
        return
      const selected = selectedFeats[0]
      if (selected) {
        const key = getFeatSelectionKey(selected)
        if (featPickerInitialSelectedIds.includes(key)) {
          setFeatPickerOpen(false)
          setFeatPickerLevel(null)
          return
        }
        const live = featModalFeats.find((feat) => getFeatSelectionKey(feat) === key)
        if (!slot || !live || !checkAllPrerequisites(live, featPickerSnapshot).met) {
          toast.info('Review this slot’s feat prerequisites and try again.')
          return
        }
        selectedFeats = [live]
      }
    }
    const previousKeys = new Set(effectiveFeats.map(getFeatSelectionKey))
    const otherFeats = effectiveFeats.filter(
      (feat) => !isClassAsiFeatForSlot(feat, viewingClass, viewingClassSource, featPickerLevel),
    )
    const scopedSelections = selectedFeats.slice(0, 1).map((feat) => ({
      ...feat,
      className: viewingClass,
      classSource: viewingClassSource,
      classLevel: featPickerLevel,
    }))
    replaceFeatSelections([...otherFeats, ...scopedSelections])
    const newlyAdded = selectedFeats.find(
      (feat) => !previousKeys.has(getFeatSelectionKey(feat)) && hasFeatOptions(feat),
    )
    if (newlyAdded) setOptionsPendingFeat({ ...newlyAdded, selectionKind: 'ordinary' })
    setFeatPickerOpen(false)
    setFeatPickerLevel(null)
  }
  const clearFeatSelection = (level: number) => {
    if (!viewingClass) return
    if (level === EPIC_BOON_LEVEL && epicBoonSlot) {
      updateEpicBoon(epicBoonSlot, null)
      return
    }
    replaceFeatSelections(
      effectiveFeats.filter(
        (feat) => !isClassAsiFeatForSlot(feat, viewingClass, viewingClassSource, level),
      ),
    )
  }
  const applyAsi = (level: number, abilityChanges: Record<string, 1 | 2>) => {
    if (!character || !viewingClass || !viewingClassSource) return
    if (epicAsiPicker || asiPickerOrigin.current) {
      const feat = feats.find(isEpicBoonAsiFeat)
      if (
        !epicAsiPicker?.allowsAsi ||
        !isEpicBoonEditCurrent(asiPickerOrigin.current) ||
        !slot ||
        !epicBoonAsiBefore ||
        !feat ||
        !checkAllPrerequisites(feat, featPickerSnapshot).met ||
        !updateEpicBoon(epicAsiPicker, { abilityChanges, before: epicBoonAsiBefore })
      ) {
        toast.info('Review the Ability Score Improvement prerequisites and score limits.')
        return
      }
      setAsiPickerLevel(null)
      return
    }
    updateCharacter(character.id, {
      asiChoices: applyClassAsiChoice({
        currentAsiChoices: character.asiChoices ?? [],
        className: viewingClass,
        classSource: viewingClassSource,
        level,
        abilityChanges,
      }),
    })
    setAsiPickerLevel(null)
  }
  const resetAsi = (level: number) => {
    if (!character || !viewingClass || !viewingClassSource) return
    if (level === EPIC_BOON_LEVEL && epicBoonSlot) {
      updateEpicBoon(epicBoonSlot, null)
      return
    }
    const asiChoices = resetClassAsiChoice({
      currentAsiChoices: character.asiChoices ?? [],
      className: viewingClass,
      classSource: viewingClassSource,
      level,
    })
    if (!asiChoices) return
    updateCharacter(character.id, { asiChoices })
    clearAsiMode(`${level}|${viewingClass}|${viewingClassSource ?? ''}`)
  }
  const setAsiMode = (levelKey: string, mode: 'asi' | 'feat') => {
    setAsiModeByLevel((previous) => ({ ...previous, [levelKey]: mode }))
  }
  const clearAsiMode = (levelKey: string) => {
    setAsiModeByLevel((previous) => {
      const next = { ...previous }
      delete next[levelKey]
      return next
    })
  }

  return {
    characterSnapshot,
    featPickerSnapshot,
    epicBoonSlot,
    editEpicBoonOptions,
    epicBoonAsiPicker:
      epicAsiPicker && epicBoonAsiBefore
        ? { before: epicBoonAsiBefore, existing: epicAsiPicker.asi?.abilityChanges }
        : undefined,
    revisedFeatSlot,
    totalAsi,
    usedAsi:
      (calculationContext?.character.feats.length ?? character?.feats.length ?? 0) +
      countReservedEpicBoonFeatSlots(calculationContext?.classChoices.epicBoonSlots),
    effectiveFeats,
    appliedAsiChoicesForClass,
    classAsiFeats,
    featModalFeats,
    featPickerInitialSelectedIds,
    featPickerOpen,
    setFeatPickerOpen,
    featPickerLevel,
    setFeatPickerLevel,
    asiPickerLevel,
    setAsiPickerLevel,
    asiModeByLevel,
    optionsPendingFeat,
    setOptionsPendingFeat,
    confirmFeat,
    clearFeatSelection,
    applyAsi,
    resetAsi,
    setAsiMode,
    clearAsiMode,
    commitFeatWithOptions: (
      feat: PendingFeat,
      selections: FeatOptionSelections,
      allSpells: Spell5e[],
    ) => {
      if (
        (feat.epicBoon &&
          (!isEpicBoonEditCurrent(feat.epicBoon) ||
            !epicBoonSlot?.feat ||
            getFeatSelectionKey(epicBoonSlot.feat) !== getFeatSelectionKey(feat))) ||
        JSON.stringify(currentOptions(feat) ?? {}) !== JSON.stringify(feat.initialOptions ?? {})
      ) {
        toast.info('This feat changed while setup was open. Reopen it to use the current choices.')
        return
      }
      editFeatWithOptions(feat, feat.initialOptions ?? {}, selections, allSpells)
    },
  }
}
