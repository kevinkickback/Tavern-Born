import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { isNormallySelectableFeat } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { deriveFeatOptionSteps, hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { buildFeatModalFeats } from '@/lib/calculations/featChoices'
import { buildPrerequisiteSnapshot, checkAllPrerequisites } from '@/lib/calculations/prerequisites'
import { getFeatOptionOwnerKey } from '@/lib/character/commands/featCommandIdentity'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  type FeatOptionTarget,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
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
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'
import type { Character, FeatOptionSelections } from '@/types/character'

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
  const [featPickerLevel, setFeatPickerLevel] = useState<number | null>(null)
  const [asiPickerLevel, setAsiPickerLevel] = useState<number | null>(null)
  const [asiModeByLevel, setAsiModeByLevel] = useState<Record<string, 'asi' | 'feat'>>({})
  const [optionsPendingFeat, setPendingFeat] = useState<
    (Feat5e & FeatOptionTarget & { initialOptions?: FeatOptionSelections }) | null
  >(null)
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
  const setOptionsPendingFeat = (target: (Feat5e & FeatOptionTarget) | null) =>
    setPendingFeat(target ? { ...target, initialOptions: currentOptions(target) } : null)
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
  const slot = useMemo(() => {
    const catalogs = calculationContext?.classChoices.catalogs
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
      otherFeats.length === character.feats.length
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
        ? getFeatSetupOwners(character, []).map((owner) => getFeatSelectionKey(owner.target))
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
        (current.has(key) ||
          !owned.has(key) ||
          (feat.repeatable === true &&
            !deriveFeatOptionSteps(feat).some((step) => step.kind === 'spellcastingClass'))) &&
        (isNormallySelectableFeat(feat) ||
          (slot.openFeatCategories && (feat.category === 'O' || feat.category === 'EB')))
      )
    })
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
  ])
  const featPickerInitialSelectedIds = useMemo(
    () =>
      classAsiFeats.filter((feat) => feat.classLevel === featPickerLevel).map(getFeatSelectionKey),
    [classAsiFeats, featPickerLevel],
  )

  const confirmFeat = (selectedFeats: Feat5e[]) => {
    if (!character || !viewingClass || !viewingClassSource || featPickerLevel == null) return
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
    replaceFeatSelections(
      effectiveFeats.filter(
        (feat) => !isClassAsiFeatForSlot(feat, viewingClass, viewingClassSource, level),
      ),
    )
  }
  const applyAsi = (level: number, abilityChanges: Record<string, 1 | 2>) => {
    if (!character || !viewingClass || !viewingClassSource) return
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
    revisedFeatSlot,
    totalAsi,
    usedAsi: character?.feats?.length ?? 0,
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
      feat: Feat5e & FeatOptionTarget & { initialOptions?: FeatOptionSelections },
      selections: FeatOptionSelections,
      allSpells: Spell5e[],
    ) => {
      if (
        JSON.stringify(currentOptions(feat) ?? {}) !== JSON.stringify(feat.initialOptions ?? {})
      ) {
        toast.info('This feat changed while setup was open. Reopen it to use the current choices.')
        return
      }
      editFeatWithOptions(feat, feat.initialOptions ?? {}, selections, allSpells)
    },
  }
}
