import { useEffect, useMemo, useState } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { isNormallySelectableFeat } from '@/lib/5etools/classData'
import { getEntityLookupKey } from '@/lib/5etools/lookups'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { getASILevelsFromClass } from '@/lib/calculations/gameRules'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { getClassFeatChoiceId } from '@/lib/character/classFeatChoices'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  applyClassAsiChoice,
  assignLegacyClassAsiFeats,
  isClassAsiFeatForSlot,
  resetClassAsiChoice,
} from '@/pages/build/class/model/asi'
import {
  buildFeatModalFeats,
  countTotalAsiAcrossClasses,
} from '@/pages/build/class/model/pageUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export interface ClassFeatPickerState {
  className: string
  classSource?: string
  progName: string
  categories: string[]
  total: number
  slotLevels: number[]
}

interface ClassAsiFeatControllerParams {
  character: Character | null
  viewingClass?: string
  viewingClassSource?: string
  classLookup: Record<string, Class5e | undefined>
  fallbackClassByName: Map<string, Class5e>
  feats: Feat5e[]
}

export function useClassAsiFeatController({
  character,
  viewingClass,
  viewingClassSource,
  classLookup,
  fallbackClassByName,
  feats,
}: ClassAsiFeatControllerParams) {
  const calculationContext = useCharacterCalculationContext(character)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const { replaceFeatSelections, replaceClassFeatSelections, commitFeatWithOptions } =
    useFeatProvenanceMutations()
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [featPickerLevel, setFeatPickerLevel] = useState<number | null>(null)
  const [classFeatPickerState, setClassFeatPickerState] = useState<ClassFeatPickerState | null>(
    null,
  )
  const [asiPickerLevel, setAsiPickerLevel] = useState<number | null>(null)
  const [asiModeByLevel, setAsiModeByLevel] = useState<Record<string, 'asi' | 'feat'>>({})
  const [optionsPendingFeat, setOptionsPendingFeat] = useState<
    (Feat5e & { classFeatChoiceId?: string }) | null
  >(null)
  const classProgression = getCharacterClassEntries(character)
  const earnedAsiSlots = useMemo(
    () =>
      classProgression.flatMap((entry) => {
        const classData =
          classLookup[getEntityLookupKey(entry.name, entry.source)] ??
          fallbackClassByName.get(entry.name)
        return getASILevelsFromClass(classData)
          .filter((level) => level <= entry.levels)
          .map((level) => ({ className: entry.name, classSource: entry.source, level }))
      }),
    [classProgression, classLookup, fallbackClassByName],
  )
  const effectiveFeats = useMemo(
    () =>
      assignLegacyClassAsiFeats(
        character?.feats ?? [],
        earnedAsiSlots,
        character?.asiChoices ?? [],
      ),
    [character?.feats, character?.asiChoices, earnedAsiSlots],
  )

  useEffect(() => {
    if (!character) return
    const metadataChanged = effectiveFeats.some((feat, index) => {
      const existing = character.feats[index]
      return (
        existing?.className !== feat.className ||
        existing?.classSource !== feat.classSource ||
        existing?.classLevel !== feat.classLevel
      )
    })
    if (metadataChanged) updateCharacter(character.id, { feats: effectiveFeats })
  }, [character, effectiveFeats, updateCharacter])

  const appliedAsiChoicesForClass = useMemo(
    () =>
      (character?.asiChoices ?? []).filter(
        (choice) =>
          choice.className === viewingClass &&
          (choice.classSource == null || (choice.classSource ?? '') === (viewingClassSource ?? '')),
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
        viewingClass,
        effectiveAbilityScores: calculationContext?.abilityScores.total,
      }),
    [character, calculationContext, classProgression, viewingClass],
  )
  const totalAsi = useMemo(
    () =>
      countTotalAsiAcrossClasses({
        classProgression,
        character,
        classLookup,
        fallbackClassByName,
      }),
    [classProgression, character, classLookup, fallbackClassByName],
  )
  const featModalFeats = useMemo(() => {
    const available = feats.filter(isNormallySelectableFeat)
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
        .map((feat) => `${feat.name}|${feat.source ?? ''}`),
    )
    return merged.filter((feat) => !assignedElsewhere.has(`${feat.name}|${feat.source ?? ''}`))
  }, [feats, effectiveFeats, featPickerLevel, viewingClass, viewingClassSource])
  const featPickerInitialSelectedIds = useMemo(
    () =>
      classAsiFeats
        .filter((feat) => feat.classLevel === featPickerLevel)
        .map((feat) => `${feat.name}|${feat.source ?? ''}`),
    [classAsiFeats, featPickerLevel],
  )

  const confirmFeat = (selectedFeats: Feat5e[]) => {
    if (!character || !viewingClass || featPickerLevel == null) return
    const previousNames = new Set(effectiveFeats.map((feat) => feat.name))
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
      (feat) => !previousNames.has(feat.name) && hasFeatOptions(feat),
    )
    if (newlyAdded) setOptionsPendingFeat(newlyAdded)
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
    if (!character || !viewingClass) return
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
    if (!character || !viewingClass) return
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

  const confirmClassFeatSelections = (selectedFeats: Feat5e[]) => {
    if (!classFeatPickerState) return
    const owner = {
      className: classFeatPickerState.className,
      classSource: classFeatPickerState.classSource,
      progressionName: classFeatPickerState.progName,
      categories: classFeatPickerState.categories,
      slotLevels: classFeatPickerState.slotLevels,
    }
    const choiceId = getClassFeatChoiceId(owner)
    const previousKeys = new Set(
      (character?.classFeatChoices?.find((choice) => choice.id === choiceId)?.feats ?? []).map(
        (feat) => `${feat.name}|${feat.source}`,
      ),
    )
    replaceClassFeatSelections(owner, selectedFeats)
    const newlyAdded = selectedFeats.find(
      (feat) => !previousKeys.has(`${feat.name}|${feat.source ?? ''}`) && hasFeatOptions(feat),
    )
    if (newlyAdded) setOptionsPendingFeat({ ...newlyAdded, classFeatChoiceId: choiceId })
    setClassFeatPickerState(null)
  }

  return {
    characterSnapshot,
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
    classFeatPickerState,
    setClassFeatPickerState,
    confirmClassFeatSelections,
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
      feat: Feat5e & { classFeatChoiceId?: string },
      selections: Parameters<typeof commitFeatWithOptions>[1],
      allSpells: Spell5e[],
    ) => commitFeatWithOptions(feat, selections, allSpells),
  }
}
