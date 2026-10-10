import { useMemo, useState } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { isNormallySelectableFeat } from '@/lib/5etools/classData'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { buildFeatModalFeats } from '@/lib/calculations/featChoices'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import type { FeatOptionTarget } from '@/lib/character/commands/featCommands'
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
import type { Character } from '@/types/character'

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
  const { replaceFeatSelections, commitFeatWithOptions } = useFeatProvenanceMutations()
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [featPickerLevel, setFeatPickerLevel] = useState<number | null>(null)
  const [asiPickerLevel, setAsiPickerLevel] = useState<number | null>(null)
  const [asiModeByLevel, setAsiModeByLevel] = useState<Record<string, 'asi' | 'feat'>>({})
  const [optionsPendingFeat, setOptionsPendingFeat] = useState<(Feat5e & FeatOptionTarget) | null>(
    null,
  )
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
        .map(getFeatSelectionKey),
    )
    return merged.filter((feat) => !assignedElsewhere.has(getFeatSelectionKey(feat)))
  }, [feats, effectiveFeats, featPickerLevel, viewingClass, viewingClassSource])
  const featPickerInitialSelectedIds = useMemo(
    () =>
      classAsiFeats.filter((feat) => feat.classLevel === featPickerLevel).map(getFeatSelectionKey),
    [classAsiFeats, featPickerLevel],
  )

  const confirmFeat = (selectedFeats: Feat5e[]) => {
    if (!character || !viewingClass || !viewingClassSource || featPickerLevel == null) return
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
      feat: Feat5e & FeatOptionTarget,
      selections: Parameters<typeof commitFeatWithOptions>[1],
      allSpells: Spell5e[],
    ) => commitFeatWithOptions(feat, selections, allSpells),
  }
}
